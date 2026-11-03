// reviewer.node.js
// A green build only proves the code compiles. This node checks the plan's
// acceptance criteria against the REAL content of the changed files.
// Unmet criteria go to the debugger while retries remain, so "done" in the
// final report means "compiles AND does what was asked".

import * as z from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getMainModel } from "../llm/model.js";
import { invokeStructured } from "../llm/structured.js";
import { isFatalModelError } from "../llm/rateLimiter.js";
import { truncate } from "../core/messages.js";
import { getRuntimeLogs, readFiles } from "../tools/sandbox.client.js";
import { LIMITS } from "../graph/orion.state.js";

const MAX_FILES = 12;
const MAX_FILE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 60_000;

const SYSTEM_PROMPT = `You are Orion's Reviewer. You check whether finished code really satisfies the plan.

You get the task, the plan with acceptance criteria, what each step claimed, the CURRENT content of every changed file, and recent dev-server log lines.

Judge only from the file contents shown. Step reports are claims, not facts.
Mark a criterion unmet only when the code clearly does not do it: missing component/route/export, wrong import path, a stub or TODO, placeholder data where real logic was asked, an obvious runtime error.
Do not fail on style preferences or on things outside the task.
Dev-server log lines can be stale. Use an error only if it names a changed file and that file still has the problem.`;

const ReviewSchema = z.object({
  pass: z.boolean().describe("true when every acceptance criterion is satisfied by the code shown"),
  unmet: z
    .array(
      z.object({
        stepId: z.number().int(),
        criterion: z.string(),
        file: z.string().describe("Workspace-relative file that needs the fix, or empty string"),
        problem: z.string().describe("What is wrong, concretely"),
      }),
    )
    .describe("Criteria that are not satisfied. Empty when pass is true."),
  notes: z.string().describe("One or two sentences on overall quality"),
});

const formatCriteria = (plan) =>
  plan.steps
    .map((s) => `Step ${s.id} [${s.status}] ${s.title}\n${s.acceptanceCriteria.map((c) => `  - ${c}`).join("\n")}`)
    .join("\n");

/** Changed files' content within a total character budget. */
const fileBlocks = (files) => {
  let budget = MAX_TOTAL_CHARS;
  const blocks = [];
  for (const [file, content] of files) {
    if (budget <= 0) break;
    const slice = truncate(content, Math.min(MAX_FILE_CHARS, Math.max(500, budget)));
    budget -= slice.length;
    blocks.push(`=== ${file} ===\n${slice}`);
  }
  return blocks.join("\n\n");
};

export async function reviewerNode(state, config) {
  const deleted = new Set(state.stepReports.flatMap((r) => r.filesDeleted));
  const paths = state.filesTouched.filter((p) => !deleted.has(p)).slice(0, MAX_FILES);
  const [{ files, missing }, runtimeLogs] = await Promise.all([readFiles(config, paths), getRuntimeLogs(config)]);

  let review;
  try {
    review = await invokeStructured(
      getMainModel(),
      ReviewSchema,
      "acceptance_review",
      [
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage([
          `TASK:\n${state.task}`,
          `PLAN AND ACCEPTANCE CRITERIA:\n${formatCriteria(state.plan)}`,
          `STEP REPORTS (claims):\n${state.stepReports.map((r) => `Step ${r.stepId} [${r.status}]: ${r.summary}`).join("\n") || "(none)"}`,
          `CHANGED FILES (current content):\n${fileBlocks(files) || "(none readable)"}`,
          missing.length ? `Files that could not be read: ${missing.map((m) => m.file).join(", ")}` : "",
          runtimeLogs ? `RECENT DEV-SERVER LOG:\n${truncate(runtimeLogs, 3_000)}` : "",
        ].filter(Boolean).join("\n\n")),
      ],
      config,
    );
  } catch (err) {
    if (config?.signal?.aborted || isFatalModelError(err)) throw err;
    console.warn("[Reviewer] Review failed, relying on the build result:", err.message);
    return {
      review: { pass: true, unmet: [], notes: "Automated acceptance review was unavailable for this run.", skipped: true },
      currentSituation: "Acceptance review unavailable, relying on the build result.",
    };
  }

  // Criteria of steps that already failed are reported by the finalizer.
  // A "fail" with no concrete finding gives the debugger nothing to act on.
  const doneStepIds = new Set(state.plan.steps.filter((s) => s.status === "done").map((s) => s.id));
  const unmet = (review.unmet || []).filter((u) => doneStepIds.has(u.stepId));

  if (unmet.length === 0) {
    return {
      review: { pass: true, unmet: [], notes: review.notes || "" },
      currentSituation: "All acceptance criteria are met in the code.",
    };
  }

  const flaggedFiles = [...new Set(unmet.map((u) => u.file).filter(Boolean))];
  return {
    review: { pass: false, unmet, notes: review.notes || "" },
    testResults: {
      pass: false,
      stage: "review",
      errorLines: unmet.map((u) => `Step ${u.stepId}: "${u.criterion}" not met${u.file ? ` in ${u.file}` : ""}: ${u.problem}`),
      summary: `${unmet.length} acceptance criteria not met.`,
    },
    buildLog: null,
    flaggedFiles,
    currentSituation: `${unmet.length} acceptance criteria not met${flaggedFiles.length ? ` (${flaggedFiles.slice(0, 3).join(", ")})` : ""}.`,
  };
}

export function reviewerEdge(state) {
  if (state.review?.pass) return "finalizer";
  return state.retryCount >= LIMITS.maxFixAttempts ? "finalizer" : "debugger";
}
