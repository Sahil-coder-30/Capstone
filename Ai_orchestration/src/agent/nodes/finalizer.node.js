// finalizer.node.js
// Writes the user-facing report for a coding run.
//
// The outcome (complete / partial / failed) is computed in code from facts:
// step statuses, files really changed, test/build result, acceptance review.
// The model only turns that fact sheet into readable Markdown and is told
// not to add claims. If the model call fails, a plain report is built from
// the same facts.

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getFastModel } from "../model.js";
import { contentToText } from "../agentUtils.js";

const FINALIZER_SYSTEM_PROMPT = `You write Orion's final report to the user after a coding run in their React project.

Use ONLY the FACT SHEET. Do not add, guess, or upgrade anything:
- Never say something works, is tested, or is verified unless the fact sheet says so.
- Mention every failed or skipped step and every unresolved problem honestly.
- Name files exactly as listed.

Format (Markdown, concise, no greeting, no sign-off):
1. One-line headline that matches OUTCOME (e.g. "Added a dark-mode toggle to the navbar." or "Partly done: the navbar was added, but the build still fails.").
2. "### What changed" with bullets per step (status + what was done).
3. "### Files" listing created/updated/deleted files.
4. "### Verification" with the build/test and review results.
5. Only if something is unresolved: "### Needs attention" with the concrete problems and a suggested next step.
Keep it under 250 words.`;

const computeOutcome = (state) => {
  const steps = state.plan?.steps || [];
  const done = steps.filter((s) => s.status === "done").length;
  const filesChanged = (state.filesTouched || []).length > 0;

  if (state.planError) return "failed";
  if (!filesChanged || done === 0) return "failed";
  const verified = state.testResults?.pass === true && state.review?.pass !== false;
  if (done === steps.length && verified && !state.escalated) return "complete";
  return "partial";
};

const buildFactSheet = (state, outcome) => {
  const steps = state.plan?.steps || [];
  const reports = new Map((state.stepReports || []).map((r) => [r.stepId, r]));
  const deleted = new Set((state.stepReports || []).flatMap((r) => r.filesDeleted || []));
  const created = new Set(
    steps.filter((s) => s.action === "create").flatMap((s) => s.activeFiles || []),
  );
  const changed = (state.filesTouched || []).filter((f) => !deleted.has(f));

  const lines = [
    `OUTCOME: ${outcome}`,
    `TASK: ${state.task}`,
  ];

  if (state.planError) lines.push(`PLANNING ERROR: ${state.planError}`);
  if (state.plan?.summary) lines.push(`PLAN: ${state.plan.summary}`);

  if (steps.length) {
    lines.push("STEPS:");
    for (const s of steps) {
      const r = reports.get(s.id);
      lines.push(`- Step ${s.id} "${s.title}": ${s.status}. ${r?.summary || ""}`.trim());
      if (r?.failures?.length) {
        lines.push(`  failed tool calls: ${r.failures.map((f) => `${f.name}: ${f.error}`).join(" | ").slice(0, 400)}`);
      }
    }
  }

  lines.push(`FILES CREATED OR UPDATED: ${changed.length ? changed.map((f) => `${f}${created.has(f) ? " (new)" : ""}`).join(", ") : "none"}`);
  if (deleted.size) lines.push(`FILES DELETED: ${[...deleted].join(", ")}`);

  const tr = state.testResults;
  if (!tr) lines.push("BUILD/TESTS: not run (no files were changed).");
  else if (tr.stage === "review") lines.push("BUILD/TESTS: passed before the acceptance review.");
  else lines.push(`BUILD/TESTS: ${tr.pass ? "passed" : "FAILED"}. ${tr.summary || ""}`);
  if (tr && !tr.pass && tr.errorLines?.length) {
    lines.push(`UNRESOLVED ERRORS:\n${tr.errorLines.slice(0, 8).map((l) => `  - ${l}`).join("\n")}`);
  }

  if (state.review) {
    if (state.review.skipped) lines.push("ACCEPTANCE REVIEW: unavailable.");
    else if (state.review.pass) lines.push(`ACCEPTANCE REVIEW: all criteria met. ${state.review.notes || ""}`);
    else lines.push(`ACCEPTANCE REVIEW: ${state.review.unmet.length} criteria NOT met.`);
  } else if (tr?.pass) {
    lines.push("ACCEPTANCE REVIEW: not run.");
  }

  if (state.attemptedFixes?.length) {
    lines.push(`FIX ATTEMPTS: ${state.attemptedFixes.length}`);
  }
  if (state.escalated && state.escalationReason) lines.push(`STOPPED BECAUSE: ${state.escalationReason}`);

  return lines.join("\n");
};

const fallbackReport = (state, outcome) => {
  const headline = outcome === "complete"
    ? "Done. All plan steps were implemented and the checks passed."
    : outcome === "partial"
      ? "Partly done. Some steps or checks did not pass."
      : state.planError
        ? "I could not finish planning this task."
        : "I could not complete this task. No working change was made.";
  return `${headline}\n\n\`\`\`\n${buildFactSheet(state, outcome)}\n\`\`\``;
};

export async function finalizerNode(state, config) {
  const outcome = computeOutcome(state);
  const factSheet = buildFactSheet(state, outcome);

  let report = "";
  try {
    const response = await getFastModel().invoke(
      [
        new SystemMessage(FINALIZER_SYSTEM_PROMPT),
        new HumanMessage(`FACT SHEET:\n${factSheet}`),
      ],
      { ...config, tags: ["orion_final_report"] },
    );
    report = contentToText(response?.content).trim();
  } catch (err) {
    if (config?.signal?.aborted) throw err;
    console.warn("[FinalizerNode] Report generation failed, using plain report:", err.message);
  }

  console.log(`[FinalizerNode] Outcome: ${outcome}`);
  return {
    finalAnswer: report || fallbackReport(state, outcome),
    outcome,
    lastNodeInvoked: "finalizer",
    taskStatus: outcome === "complete" ? "complete" : outcome,
    currentSituation: `Finalizer: run ${outcome}.`,
  };
}
