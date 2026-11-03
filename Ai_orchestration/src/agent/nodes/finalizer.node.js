// finalizer.node.js
// Writes the user-facing report of a coding run.
//
// The outcome (complete / partial / failed) is computed in code from facts:
// step statuses, files really changed, check results, acceptance review.
// The model only turns that fact sheet into readable Markdown. If the model
// call fails, a plain report is built from the same facts.

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getFastModel } from "../llm/model.js";
import { contentToText } from "../core/messages.js";

const SYSTEM_PROMPT = `You write Orion's final report to the user after a coding run in their React project.

Use ONLY the FACT SHEET. Do not add, guess or upgrade anything:
- Never say something works, is tested or is verified unless the fact sheet says so.
- Mention every failed or skipped step and every unresolved problem honestly.
- Name files exactly as listed.

Format (Markdown, concise, no greeting, no sign-off):
1. A one-line headline matching OUTCOME (e.g. "Added a dark-mode toggle to the navbar." or "Partly done: the navbar was added, but the build still fails.").
2. "### What changed": bullets per step (status + what was done).
3. "### Files": created, updated and deleted files.
4. "### Verification": build/test and review results.
5. Only if something is unresolved: "### Needs attention" with the concrete problems and a suggested next step.
Keep it under 250 words.`;

export const computeOutcome = (state) => {
  const steps = state.plan?.steps || [];
  const done = steps.filter((s) => s.status === "done").length;
  if (state.planError || done === 0 || state.filesTouched.length === 0) return "failed";
  const verified = state.testResults?.pass === true && state.review?.pass !== false;
  return done === steps.length && verified && !state.escalated ? "complete" : "partial";
};

const verificationLines = (state) => {
  const tr = state.testResults;
  const lines = [];
  if (!tr) lines.push("BUILD/TESTS: not run (no files were changed).");
  else if (tr.stage === "review") lines.push("BUILD/TESTS: passed before the acceptance review.");
  else lines.push(`BUILD/TESTS: ${tr.pass ? "passed" : "FAILED"}. ${tr.summary || ""}`);
  if (tr && !tr.pass && tr.errorLines?.length) {
    lines.push(`UNRESOLVED ERRORS:\n${tr.errorLines.slice(0, 8).map((l) => `  - ${l}`).join("\n")}`);
  }

  if (state.review?.skipped) lines.push("ACCEPTANCE REVIEW: unavailable.");
  else if (state.review?.pass) lines.push(`ACCEPTANCE REVIEW: all criteria met. ${state.review.notes || ""}`);
  else if (state.review) lines.push(`ACCEPTANCE REVIEW: ${state.review.unmet.length} criteria NOT met.`);
  else if (tr?.pass) lines.push("ACCEPTANCE REVIEW: not run.");
  return lines;
};

export const buildFactSheet = (state, outcome) => {
  const steps = state.plan?.steps || [];
  const reports = new Map(state.stepReports.map((r) => [r.stepId, r]));
  const deleted = new Set(state.stepReports.flatMap((r) => r.filesDeleted));
  const existing = new Set(state.existingFiles);
  const changed = state.filesTouched.filter((f) => !deleted.has(f));

  const lines = [`OUTCOME: ${outcome}`, `TASK: ${state.task}`];
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

  lines.push(`FILES CREATED OR UPDATED: ${changed.map((f) => `${f}${existing.has(f) ? "" : " (new)"}`).join(", ") || "none"}`);
  if (deleted.size) lines.push(`FILES DELETED: ${[...deleted].join(", ")}`);
  lines.push(...verificationLines(state));
  if (state.attemptedFixes.length) lines.push(`FIX ATTEMPTS: ${state.attemptedFixes.length}`);
  if (state.escalated && state.escalationReason) lines.push(`STOPPED BECAUSE: ${state.escalationReason}`);
  return lines.join("\n");
};

const HEADLINE = {
  complete: "Done. All plan steps were implemented and the checks passed.",
  partial: "Partly done. Some steps or checks did not pass.",
  failed: "I could not complete this task. No working change was made.",
};

export async function finalizerNode(state, config) {
  const outcome = computeOutcome(state);
  const factSheet = buildFactSheet(state, outcome);

  let report = "";
  try {
    const reply = await getFastModel().invoke(
      [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(`FACT SHEET:\n${factSheet}`)],
      { ...config, tags: ["orion_final_report"] },
    );
    report = contentToText(reply.content).trim();
  } catch (err) {
    if (config?.signal?.aborted) throw err;
    console.warn("[Finalizer] Report generation failed, using the plain report:", err.message);
  }

  const headline = state.planError ? "I could not finish planning this task." : HEADLINE[outcome];
  console.log(`[Finalizer] Outcome: ${outcome}`);
  return {
    finalAnswer: report || `${headline}\n\n\`\`\`\n${factSheet}\n\`\`\``,
    outcome,
    currentSituation: `Run ${outcome}.`,
  };
}
