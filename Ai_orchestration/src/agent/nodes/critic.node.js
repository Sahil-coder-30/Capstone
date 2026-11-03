// critic.node.js
// Checks the plan in code (no model call) before the user sees it:
//   - paths that look hallucinated (a near miss of a real file)
//   - deleting files that do not exist
//   - steps that touch too many files or have no acceptance criteria
// A wrong risk label on a sensitive file is fixed in place.
// After LIMITS.maxPlanRevisions the plan goes to review with warnings.

import { normalizePath } from "../tools/guards.js";
import { LIMITS } from "../graph/orion.state.js";

const HIGH_RISK_FILE = /auth|payment|migration|schema|stripe|razorpay|jwt|password|credential|secret/i;

const stem = (p) => (p.split("/").pop() || "").replace(/\.[^.]+$/, "").toLowerCase();

const groupByStem = (paths) => {
  const groups = new Map();
  for (const p of paths) groups.set(stem(p), [...(groups.get(stem(p)) || []), p]);
  return groups;
};

export function criticNode(state) {
  const existing = (state.existingFiles || []).map(normalizePath);
  const known = new Set(existing.map((p) => p.toLowerCase()));
  const byStem = groupByStem(existing);
  const issues = [];

  const steps = state.plan.steps.map((step) => {
    const files = step.activeFiles || [];

    for (const file of files) {
      const lower = file.toLowerCase();
      const exists = known.has(lower);

      if (step.action === "delete" && !exists) {
        issues.push(`Step ${step.id}: cannot delete "${file}", it does not exist.`);
      }
      // A missing path that closely matches a real file is most likely a
      // hallucinated name (App.js vs App.jsx, wrong folder).
      if (!exists && step.action !== "create") {
        const nearMisses = (byStem.get(stem(file)) || []).filter((p) => p.toLowerCase() !== lower);
        if (nearMisses.length) {
          issues.push(`Step ${step.id}: "${file}" does not exist. Did you mean ${nearMisses.slice(0, 3).map((p) => `"${p}"`).join(" or ")}?`);
        }
      }
    }
    // Later steps may modify what this step creates.
    for (const file of files) known.add(file.toLowerCase());

    if (files.length > LIMITS.maxFilesPerStep) {
      issues.push(`Step ${step.id}: touches ${files.length} files, split it (max ${LIMITS.maxFilesPerStep} per step).`);
    }
    if (!step.acceptanceCriteria?.length) issues.push(`Step ${step.id}: has no acceptance criteria.`);

    const sensitive = files.some((f) => HIGH_RISK_FILE.test(f));
    return sensitive && step.riskLevel !== "high" ? { ...step, riskLevel: "high" } : step;
  });

  const plan = { ...state.plan, steps };
  const revisions = state.planRevisions || 0;

  if (issues.length === 0 || revisions >= LIMITS.maxPlanRevisions) {
    if (issues.length) console.warn(`[Critic] ${issues.length} issue(s) left after ${revisions} revisions, showing them as warnings`);
    return {
      plan,
      criticPass: true,
      criticFeedback: "",
      planWarnings: issues,
      currentSituation: issues.length
        ? `${issues.length} warning(s) remain after ${revisions} revisions. They are shown in the plan review.`
        : `Plan is valid (${plan.totalSteps} steps).`,
    };
  }

  console.warn(`[Critic] ${issues.length} issue(s), re-plan ${revisions + 1}/${LIMITS.maxPlanRevisions}`);
  return {
    plan: null,
    criticPass: false,
    criticFeedback: issues.join("\n"),
    planRevisions: revisions + 1,
    currentSituation: `Found ${issues.length} problem(s) in the plan. Re-planning (${revisions + 1}/${LIMITS.maxPlanRevisions}).`,
  };
}

export const criticEdge = (state) => (state.criticPass ? "plan_review" : "planner");
