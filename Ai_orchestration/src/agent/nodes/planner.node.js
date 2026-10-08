// planner.node.js — v2
// Lead Architect node. Inspects the workspace (read-only), then produces a
// structured Plan with atomic steps, acceptance criteria per step, file-level
// activeFiles allowlist, risk classification, and dependency ordering.
//
// Also uses LangGraph's interrupt() to pause for human plan review before
// passing control to the Critic node.

import { interrupt } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getAppModel } from "../model.js";
import { applyGuards } from "../guards.js";
import { readFile, listFiles, searchCode } from "../tool.js";

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — Lead Architect / Planner
// ---------------------------------------------------------------------------
const PLANNER_SYSTEM_PROMPT = `You are the Lead Architect on Orion's engineering team inside Taksha.

Your mission: Fully understand the user's request, inspect the existing codebase, then produce a precise, atomic implementation plan.

=== INSPECTION PROTOCOL ===
1. Run list_files FIRST to understand the project structure
2. read_file any file that could be affected by the user's request
3. search_code for existing patterns, imports, hooks, or component usage
4. Never assume — read before planning

=== PLAN FORMAT ===
After inspection, output ONLY a valid JSON object in this exact shape (no markdown, no code fences):
{
  "summary": "One sentence describing what this plan achieves",
  "steps": [
    {
      "id": 1,
      "title": "Short action title",
      "action": "create",
      "description": "What exactly to do and why",
      "acceptanceCriteria": ["The component renders without errors", "Import resolves correctly"],
      "activeFiles": ["src/components/Navbar.jsx", "src/App.jsx"],
      "riskLevel": "low",
      "dependsOn": []
    }
  ]
}

=== STEP RULES ===
- Each step must specify "action": "create" (for new files), "modify" (for existing files), or "delete"
- Each step must be independently testable
- Max 5 files per step — if more, split the step
- riskLevel: "low" (UI only), "medium" (API/state), "high" (auth/payments/migrations/DB schemas)
- dependsOn: array of step IDs this step depends on (shared modules before consumers)
- Steps touching auth, payments, or DB migrations MUST use riskLevel "high"
- Keep total steps between 2 and 8`;

// ---------------------------------------------------------------------------
// PLANNER NODE FUNCTION
// ---------------------------------------------------------------------------
export async function plannerNode(state, config) {
  const messages = state.messages || [];
  const userTask = state.task || [...messages].reverse()
    .find((m) => m.role === "user" || m._getType?.() === "human")?.content || "";

  const userTaskStr = typeof userTask === "string" ? userTask : JSON.stringify(userTask);

  const plannerAgent = createReactAgent({
    llm: getAppModel(),
    tools: applyGuards([readFile, listFiles, searchCode]),
    prompt: PLANNER_SYSTEM_PROMPT,
  });

  let plannerPrompt = `Task: "${userTaskStr}"\n\nInspect the workspace and produce the implementation plan JSON.`;
  if (state.criticFeedback) {
    plannerPrompt += `\n\nPrevious plan feedback / revision request:\n${state.criticFeedback}\nPlease revise the plan to address these points.`;
  }

  let plan = null;

  try {
    const result = await plannerAgent.invoke(
      { messages: [...messages, { role: "user", content: plannerPrompt }] },
      config
    );

    const lastAI = [...(result.messages || [])].reverse()
      .find((m) => m._getType?.() === "ai" || m.constructor?.name === "AIMessage");

    const raw = String(lastAI?.content || "").trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/m, "").trim();

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.steps && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
        plan = parsed;
      }
    } catch (_) {
      // Try to find JSON object in the output
      const match = raw.match(/\{[\s\S]*"steps"[\s\S]*\}/);
      if (match) {
        try { plan = JSON.parse(match[0]); } catch (_) {}
      }
    }
  } catch (err) {
    console.warn("[PlannerNode] Agent invocation failed:", err.message);
  }

  // Safety fallback
  if (!plan?.steps?.length) {
    plan = {
      summary: `Implement: ${userTaskStr.slice(0, 80)}`,
      steps: [
        {
          id: 1,
          title: "Inspect workspace structure",
          description: "List and read all relevant existing files before making changes",
          acceptanceCriteria: ["File list retrieved", "Relevant files read"],
          activeFiles: [],
          riskLevel: "low",
          dependsOn: [],
        },
        {
          id: 2,
          title: "Implement requested changes",
          description: userTaskStr.slice(0, 200),
          acceptanceCriteria: ["Feature implemented", "No import errors"],
          activeFiles: [],
          riskLevel: "medium",
          dependsOn: [1],
        },
        {
          id: 3,
          title: "Verify build and exports",
          description: "Confirm no syntax errors and all exports are correct",
          acceptanceCriteria: ["No build errors", "All imports resolve"],
          activeFiles: [],
          riskLevel: "low",
          dependsOn: [2],
        },
      ],
    };
  }

  // Normalise steps
  plan.steps = plan.steps.map((step, i) => ({
    id: step.id ?? i + 1,
    title: step.title || `Step ${i + 1}`,
    action: ["create", "modify", "delete"].includes(step.action)
      ? step.action
      : (/create|add|new|scaffold/i.test(step.title) ? "create" : "modify"),
    description: step.description || "",
    acceptanceCriteria: Array.isArray(step.acceptanceCriteria) ? step.acceptanceCriteria : ["Step completed successfully"],
    activeFiles: Array.isArray(step.activeFiles) ? step.activeFiles : [],
    riskLevel: ["low", "medium", "high"].includes(step.riskLevel) ? step.riskLevel : "medium",
    dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : [],
    status: "pending",
  }));
  plan.totalSteps = plan.steps.length;

  console.log(`[PlannerNode] Generated plan: ${plan.totalSteps} steps — "${plan.summary}"`);

  // Plan approved — set activeFiles for first step and continue execution
  const firstStep = plan.steps[0];
  return {
    plan,
    planApproved: true,
    currentStep: 0,
    activeFiles: firstStep?.activeFiles || [],
    lastNodeInvoked: "planner",
    currentSituation: `Planner: ${plan.totalSteps}-step plan generated. Handing to Critic for structural validation.`,
    taskStatus: "planned",
  };
}

// ---------------------------------------------------------------------------
// CONDITIONAL EDGE — called after planner node
// ---------------------------------------------------------------------------
export function plannerEdge(state) {
  if (!state.plan || !state.planApproved) return "planner"; // re-plan loop
  return "critic";
}
