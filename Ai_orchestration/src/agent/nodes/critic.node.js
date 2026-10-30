// critic.node.js
// Deterministic plan validator (no LLM call). Runs before the plan is shown
// to the user and catches the cheap-to-fix problems:
//   - paths that look hallucinated (a "near miss" of a real file)
//   - deleting files that do not exist
//   - steps touching too many files / with no acceptance criteria
// High-risk files with a low risk label are fixed in place, not re-planned.
// After MAX_REVISIONS the plan goes to review with the remaining warnings.

import { normalizePath } from "../guards.js";

const MAX_REVISIONS = 2;
const HIGH_RISK_FILE = /auth|payment|migration|schema|stripe|razorpay|jwt|password|credential|secret/i;

const stem = (p) => {
  const base = p.split("/").pop() || "";
  return base.replace(/\.[^.]+$/, "").toLowerCase();
};

export function criticNode(state) {
  const plan = state.plan;
  const existing = (state.existingFiles || []).map(normalizePath);
  const existingSet = new Set(existing.map((p) => p.toLowerCase()));
  const byStem = new Map();
  for (const p of existing) {
    const key = stem(p);
    if (!byStem.has(key)) byStem.set(key, []);
    byStem.get(key).push(p);
  }

  const issues = [];
  const createdSoFar = new Set();

  const steps = plan.steps.map((step) => {
    const files = step.activeFiles || [];

    for (const file of files) {
      const lower = file.toLowerCase();
      const exists = existingSet.has(lower) || createdSoFar.has(lower);

      if (step.action === "delete" && !exists) {
        issues.push(`Step ${step.id}: cannot delete "${file}", it does not exist.`);
      }

      // A path that does not exist but closely matches a real file is most
      // likely a hallucinated name (App.js vs App.jsx, wrong folder).
      if (!exists && step.action !== "create" && existing.length > 0) {
        const nearMisses = (byStem.get(stem(file)) || []).filter((p) => p.toLowerCase() !== lower);
        if (nearMisses.length > 0) {
          issues.push(`Step ${step.id}: "${file}" does not exist. Did you mean ${nearMisses.slice(0, 3).map((p) => `"${p}"`).join(" or ")}?`);
        }
      }
    }
    for (const file of files) createdSoFar.add(file.toLowerCase());

    if (files.length > 5) {
      issues.push(`Step ${step.id}: touches ${files.length} files, split it (max 5 per step).`);
    }
    if (!step.acceptanceCriteria?.length) {
      issues.push(`Step ${step.id}: has no acceptance criteria.`);
    }

    const touchesHighRisk = files.some((f) => HIGH_RISK_FILE.test(f));
    return touchesHighRisk && step.riskLevel !== "high" ? { ...step, riskLevel: "high" } : step;
  });

  const fixedPlan = { ...plan, steps };
  const revisions = state.planRevisions || 0;

  if (issues.length === 0) {
    return {
      plan: fixedPlan,
      criticPass: true,
      criticFeedback: "",
      planWarnings: [],
      lastNodeInvoked: "critic",
      taskStatus: "critic_passed",
      currentSituation: `Critic: plan structure is valid (${plan.totalSteps} steps).`,
    };
  }

  if (revisions >= MAX_REVISIONS) {
    console.warn(`[CriticNode] ${issues.length} issue(s) left after ${revisions} revisions, sending to review with warnings`);
    return {
      plan: fixedPlan,
      criticPass: true,
      criticFeedback: "",
      planWarnings: issues,
      lastNodeInvoked: "critic",
      taskStatus: "critic_passed",
      currentSituation: `Critic: ${issues.length} warning(s) remain after ${revisions} revisions. Showing them in the plan review.`,
    };
  }

  console.warn(`[CriticNode] ${issues.length} issue(s), revision ${revisions + 1}/${MAX_REVISIONS}`);
  return {
    plan: null,
    criticPass: false,
    criticFeedback: issues.join("\n"),
    planRevisions: revisions + 1,
    lastNodeInvoked: "critic",
    taskStatus: "critic_failed",
    currentSituation: `Critic: found ${issues.length} problem(s) in the plan. Re-planning (${revisions + 1}/${MAX_REVISIONS}).`,
  };
}

export function criticEdge(state) {
  return state.criticPass ? "plan_review" : "planner";
}
