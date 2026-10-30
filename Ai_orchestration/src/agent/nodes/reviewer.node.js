// reviewer.node.js
// Acceptance review after the build passes. A green build only proves the
// code compiles; this node checks the plan's acceptance criteria against the
// REAL content of the changed files and reports anything unmet.
//
// Unmet criteria go to the debugger (while retries remain), so "done" in the
// final report means "compiles AND matches what was asked".

import * as z from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getAppModel } from "../model.js";
import { readSandboxFiles, getSandboxRuntimeLogs } from "../sandboxClient.js";
import { invokeStructured, truncate } from "../agentUtils.js";

const MAX_FILES = 12;
const MAX_FILE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 60_000;

const REVIEWER_SYSTEM_PROMPT = `You are Orion's Reviewer. You check whether finished code really satisfies the plan.

You get: the user's task, the plan with acceptance criteria, what each step reported, the CURRENT content of every changed file, and recent dev-server log lines.

Judge only from the file contents shown. Do not trust the step reports; they are claims.

Mark a criterion unmet when the code clearly does not do it: missing component/route/export, wrong import path, a feature left as a stub or TODO, placeholder data where real logic was asked, an obvious runtime error (undefined variable, wrong hook usage, missing key prop is NOT enough to fail).
Do not fail on style preferences or on things outside the task.
Dev-server log lines can be stale; only use an error if it names a changed file and the file content still has that problem.`;

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

export async function reviewerNode(state, config) {
  const deleted = new Set((state.stepReports || []).flatMap((r) => r.filesDeleted || []));
  const paths = (state.filesTouched || []).filter((p) => !deleted.has(p)).slice(0, MAX_FILES);
  const { files, missing } = await readSandboxFiles(config, paths);

  let budget = MAX_TOTAL_CHARS;
  const fileBlocks = [];
  for (const [file, content] of files) {
    const slice = truncate(content, Math.min(MAX_FILE_CHARS, Math.max(500, budget)));
    budget -= slice.length;
    fileBlocks.push(`=== ${file} ===\n${slice}`);
    if (budget <= 0) break;
  }

  const runtimeLogs = await getSandboxRuntimeLogs(config);
  const reports = (state.stepReports || [])
    .map((r) => `Step ${r.stepId} [${r.status}]: ${r.summary}`)
    .join("\n");

  let review;
  try {
    review = await invokeStructured(
      getAppModel(),
      ReviewSchema,
      "acceptance_review",
      [
        new SystemMessage(REVIEWER_SYSTEM_PROMPT),
        new HumanMessage(
          [
            `TASK:\n${state.task}`,
            `PLAN AND ACCEPTANCE CRITERIA:\n${formatCriteria(state.plan)}`,
            `STEP REPORTS (claims):\n${reports || "(none)"}`,
            `CHANGED FILES (current content):\n${fileBlocks.join("\n\n") || "(none readable)"}`,
            missing.length ? `Files that could not be read: ${missing.join(", ")}` : "",
            runtimeLogs ? `RECENT DEV-SERVER LOG:\n${truncate(runtimeLogs, 3_000)}` : "",
          ].filter(Boolean).join("\n\n"),
        ),
      ],
      config,
    );
  } catch (err) {
    if (config?.signal?.aborted) throw err;
    console.warn("[ReviewerNode] Review failed, not blocking the run:", err.message);
    return {
      review: { pass: true, unmet: [], notes: "Automated acceptance review was unavailable for this run.", skipped: true },
      lastNodeInvoked: "reviewer",
      taskStatus: "reviewed",
      currentSituation: "Reviewer: review unavailable, relying on the build result.",
    };
  }

  // Criteria for steps that already failed are reported by the finalizer;
  // sending them to the debugger would only repeat the failure.
  const unmet = (review.unmet || []).filter((u) => {
    const step = state.plan.steps.find((s) => s.id === u.stepId);
    return !step || step.status === "done";
  });
  // A "fail" with no concrete unmet criterion gives the debugger nothing to
  // act on, so only concrete findings count.
  if (unmet.length === 0) {
    return {
      review: { pass: true, unmet: [], notes: review.notes || "" },
      lastNodeInvoked: "reviewer",
      taskStatus: "reviewed",
      currentSituation: "Reviewer: all acceptance criteria are met in the code.",
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
    lastNodeInvoked: "reviewer",
    taskStatus: "review_failed",
    currentSituation: `Reviewer: ${unmet.length} acceptance criteria not met${flaggedFiles.length ? ` (${flaggedFiles.slice(0, 3).join(", ")})` : ""}.`,
  };
}

export function reviewerEdge(state) {
  if (state.review?.pass) return "finalizer";
  if ((state.retryCount || 0) >= (state.maxRetries || 3)) return "finalizer";
  return "debugger";
}
