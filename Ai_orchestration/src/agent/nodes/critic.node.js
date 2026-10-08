// critic.node.js — v2 (NEW)
// Structural plan validator. Runs a cheap, no-execution check on the plan
// BEFORE Coder starts writing any files. Catches bad plans at the lowest
// possible cost — before a full Coder→Tester round-trip is spent.
//
// Checks:
//  1. Referenced activeFiles actually exist in the workspace
//  2. No single step touches > 5 files (too large to isolate on failure)
//  3. Dependency order is correct (dependsOn IDs always reference earlier steps)
//  4. At least one acceptance criterion per step
//  5. High-risk steps are explicitly flagged

import { getAppModel } from "../model.js";
import { listFiles, searchCode } from "../tool.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — Structural Plan Critic
// ---------------------------------------------------------------------------
const CRITIC_SYSTEM_PROMPT = `You are Orion's Critic — a plan quality auditor.

You receive an implementation plan (JSON) and a list of files that currently exist in the workspace.
Your job is to perform a structural validation ONLY — no execution, no code writing.

Check for these specific issues:
1. FILES_MISSING: Any file in "activeFiles" that does not exist AND is not being created in that step's title
2. STEP_TOO_LARGE: Any step with more than 5 files in activeFiles
3. DEPENDENCY_ORDER: Any step whose dependsOn includes an ID >= its own ID (circular or forward dependency)
4. MISSING_CRITERIA: Any step with an empty acceptanceCriteria array
5. RISK_NOT_FLAGGED: Any step that modifies auth, payment, or migration files but has riskLevel != "high"

Output ONLY a JSON object in this exact shape (no markdown, no code fences):
{
  "pass": true | false,
  "issues": [
    { "stepId": 1, "type": "FILES_MISSING", "detail": "src/missing.jsx does not exist" }
  ],
  "recommendation": "One sentence on how to fix if pass is false, or empty string if pass is true"
}`;

// ---------------------------------------------------------------------------
// CRITIC NODE FUNCTION
// ---------------------------------------------------------------------------
export async function criticNode(state, config) {
  const plan = state.plan;

  if (!plan?.steps?.length) {
    return {
      criticPass: false,
      criticFeedback: "No plan to validate — Planner must run first.",
      lastNodeInvoked: "critic",
      taskStatus: "critic_failed",
      currentSituation: "Critic: No plan found. Routing back to Planner.",
    };
  }

  // --- Collect existing workspace files ------------------------------------
  let workspaceFiles = [];
  try {
    const listResult = await listFiles.invoke({}, config);
    const rawList = typeof listResult === "string" ? listResult : JSON.stringify(listResult);
    // Extract file paths from the listing (handles both string lists and JSON arrays)
    workspaceFiles = rawList.match(/[\w./\\-]+\.[a-z]{1,6}/gi) || [];
  } catch (err) {
    console.warn("[CriticNode] Could not list workspace files:", err.message);
  }

  const workspaceFileSet = new Set(workspaceFiles.map((f) => f.toLowerCase().replace(/^\.\//, "")));

  // --- Run structural checks -----------------------------------------------
  const issues = [];

  for (const step of plan.steps) {
    // 1. Files missing check (skip if step is creating the file)
    const isCreationStep = step.action === "create" || /create|add|new|scaffold/i.test(step.title);
    if (!isCreationStep && step.activeFiles?.length > 0) {
      for (const file of step.activeFiles) {
        const normalized = file.toLowerCase().replace(/^\.\//, "").replace(/^\//, "");
        if (!workspaceFileSet.has(normalized)) {
          issues.push({ stepId: step.id, type: "FILES_MISSING", detail: `"${file}" does not exist in workspace` });
        }
      }
    }

    // 2. Step too large
    if ((step.activeFiles?.length || 0) > 5) {
      issues.push({ stepId: step.id, type: "STEP_TOO_LARGE", detail: `Step has ${step.activeFiles.length} files — max 5 for isolation` });
    }

    // 3. Dependency order
    for (const depId of (step.dependsOn || [])) {
      if (depId >= step.id) {
        issues.push({ stepId: step.id, type: "DEPENDENCY_ORDER", detail: `Depends on step ${depId} which doesn't come before step ${step.id}` });
      }
    }

    // 4. Missing criteria
    if (!step.acceptanceCriteria?.length) {
      issues.push({ stepId: step.id, type: "MISSING_CRITERIA", detail: "No acceptance criteria defined" });
    }

    // 5. High-risk not flagged
    const highRiskPatterns = /auth|payment|migration|schema|stripe|jwt|password|credential/i;
    const touchesHighRisk = step.activeFiles?.some((f) => highRiskPatterns.test(f));
    if (touchesHighRisk && step.riskLevel !== "high") {
      issues.push({ stepId: step.id, type: "RISK_NOT_FLAGGED", detail: `File touches auth/payment/migration but riskLevel="${step.riskLevel}"` });
    }
  }

  const pass = issues.length === 0;
  const currentRevisions = (state.planRevisions || 0);
  const nextRevisions = pass ? currentRevisions : currentRevisions + 1;

  // --- Optionally ask LLM for a deeper recommendation on failure -----------
  let recommendation = "";
  if (!pass) {
    try {
      const model = getAppModel();
      const issueList = issues.map((i) => `Step ${i.stepId} [${i.type}]: ${i.detail}`).join("\n");
      const response = await model.invoke([
        new SystemMessage(CRITIC_SYSTEM_PROMPT),
        new HumanMessage(`Plan:\n${JSON.stringify(plan, null, 2)}\n\nExisting files:\n${workspaceFiles.slice(0, 50).join(", ")}\n\nIssues found:\n${issueList}`),
      ]);
      const raw = String(response?.content || "").trim()
        .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/m, "").trim();
      try {
        const parsed = JSON.parse(raw);
        recommendation = parsed.recommendation || "";
      } catch (_) {
        recommendation = raw.slice(0, 300);
      }
    } catch (_) {}
  }

  if (pass) {
    console.log(`[CriticNode] ✓ Plan structural check passed (${plan.totalSteps} steps)`);
  } else {
    console.warn(`[CriticNode] ✗ Plan failed with ${issues.length} issue(s) (revision ${nextRevisions}/2)`);
  }

  return {
    criticPass: pass,
    planRevisions: nextRevisions,
    criticFeedback: pass ? "" : `${issues.length} issue(s): ${issues.map((i) => i.detail).join("; ")}. ${recommendation}`,
    lastNodeInvoked: "critic",
    taskStatus: pass ? "critic_passed" : "critic_failed",
    currentSituation: pass
      ? `Critic: Plan structure valid. ${plan.totalSteps} steps ready for Coder.`
      : `Critic: ${issues.length} structural issue(s) found (Revision ${nextRevisions}/2). Routing back to Planner for revision.`,
  };
}

// ---------------------------------------------------------------------------
// CONDITIONAL EDGE — called after critic node
// ---------------------------------------------------------------------------
export function criticEdge(state) {
  if (state.criticPass) return "coder";
  if ((state.planRevisions ?? 0) >= 2) {
    console.warn(`[CriticEdge] Plan reached maximum revisions (${state.planRevisions}) — escalating to finalizer`);
    return "finalizer";
  }
  return "planner"; // Re-plan with critic feedback in context
}
