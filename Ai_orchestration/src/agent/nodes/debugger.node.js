// debugger.node.js
// Fixes a failed build, failed tests or unmet acceptance criteria, then
// always hands back to the tester. It never marks its own fix as verified.
//
// It stops (escalates) when another loop can not help:
//   - it changed nothing, so the tester would see the same failure
//   - the same error came back after two fix attempts

import { createHash } from "crypto";
import { getMainModel } from "../llm/model.js";
import { isFatalModelError } from "../llm/rateLimiter.js";
import { runToolLoop } from "../core/toolLoop.js";
import { analyzeToolActivity } from "../core/toolActivity.js";
import { lastAiText, truncate } from "../core/messages.js";
import { GROUNDING_RULES, PROJECT_CONTEXT } from "../core/prompts.js";
import { DEBUGGER_TOOLS } from "../tools/index.js";
import { combineGuards, shellGuard, writeScopeGuard } from "../tools/guards.js";
import { LIMITS } from "../graph/orion.state.js";

const MAX_TURNS = 25;
const INSTALL_COMMAND = /\b(npm|pnpm|yarn)\s+(install|add|i)\b/;

const SYSTEM_PROMPT = `You are Orion's Debugger. You find the root cause of a failure and apply the smallest correct fix. ${PROJECT_CONTEXT}

1. Read the failure output first. Find the exact file, line and message.
2. read_file the failing file(s) and what they import that is involved. Use search_code to find where a symbol is defined or used.
3. Fix the root cause, not the symptom. Prefer patch_file with an exact oldStr copied from read_file. Use update_file only if most of the file must change.
4. Missing npm package (including one listed in package.json but not installed)? execute_command "npm install <pkg>". Never fix it by editing package.json.
5. Re-read the changed file to confirm the fix. Do not run the build yourself; the tester will.

Before each tool call write one short sentence on what you are checking or fixing.
Do not repeat a fix listed under PREVIOUS ATTEMPTS. If it did not work, the cause is somewhere else.
Only change files listed under ALLOWED FILES. If the real cause is elsewhere, explain it in your final message.

When finished reply with:
ROOT CAUSE: <one sentence>
FIX: <what you changed, file by file>

${GROUNDING_RULES}`;

const STAGE_LABEL = {
  review: "ACCEPTANCE REVIEW found unmet requirements",
  tests: "UNIT TESTS failed",
  build: "PRODUCTION BUILD failed",
};

const signatureOf = (testResults) =>
  createHash("sha256")
    .update((testResults?.errorLines || []).join("\n").replace(/\d+/g, "#"))
    .digest("hex")
    .slice(0, 16);

const escalate = (state, reason, attempt) => ({
  escalated: true,
  escalationReason: reason,
  retryCount: state.retryCount + 1,
  ...(attempt && { attemptedFixes: [attempt] }),
  currentSituation: `Stopping fixes: ${reason}`,
});

const buildPrompt = (state, allowed) => `${STAGE_LABEL[state.testResults?.stage] || STAGE_LABEL.build}. Attempt ${state.retryCount + 1} of ${LIMITS.maxFixAttempts}.

TASK THE CODE SHOULD IMPLEMENT:
${state.task}

FAILURE DETAILS:
${(state.testResults?.errorLines || []).map((l) => `- ${l}`).join("\n") || "- (no structured lines, see the log)"}
${state.buildLog ? `\nOUTPUT LOG:\n${truncate(state.buildLog, 4_000)}\n` : ""}
FILES IMPLICATED: ${state.flaggedFiles.join(", ") || "(none parsed, find them from the log)"}
FILES CHANGED IN THIS RUN: ${state.filesTouched.join(", ") || "(none)"}

ALLOWED FILES:
${allowed.map((f) => `  - ${f}`).join("\n")}

PREVIOUS ATTEMPTS:
${state.attemptedFixes.map((f) => `  ${f.attempt}. [${f.stage}] ${f.summary}`).join("\n") || "  (none)"}

Find the root cause and fix it now.`;

export async function debuggerNode(state, config) {
  const signature = signatureOf(state.testResults);
  if (state.attemptedFixes.filter((f) => f.signature === signature).length >= 2) {
    return escalate(state, "the same error came back after two different fix attempts.");
  }

  const allowed = [...new Set([
    ...state.flaggedFiles,
    ...state.filesTouched,
    ...state.plan.steps.flatMap((s) => s.activeFiles),
    "package.json",
  ])];

  let messages = [];
  let runError = null;
  try {
    ({ messages } = await runToolLoop({
      model: getMainModel(),
      tools: DEBUGGER_TOOLS,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(state, allowed),
      config,
      maxTurns: MAX_TURNS,
      guard: combineGuards(shellGuard, writeScopeGuard(allowed)),
    }));
  } catch (err) {
    if (config?.signal?.aborted || isFatalModelError(err)) throw err;
    runError = err.message;
    console.error("[Debugger] Failed:", err.message);
  }

  const activity = analyzeToolActivity(messages);
  const installed = activity.commands.some((c) => c.ok && INSTALL_COMMAND.test(c.command || ""));
  const attempt = {
    attempt: state.retryCount + 1,
    stage: state.testResults?.stage || "build",
    signature,
    summary: truncate(lastAiText(messages) || runError || "No explanation returned.", 600),
    filesWritten: activity.filesWritten,
  };

  if (activity.filesWritten.length === 0 && !installed) {
    return escalate(state, runError ? `the debugger failed: ${runError}` : "no safe fix was found and nothing was changed.", attempt);
  }

  return {
    attemptedFixes: [attempt],
    filesTouched: activity.filesWritten,
    retryCount: state.retryCount + 1,
    escalated: false,
    currentSituation: `Applied fix attempt ${state.retryCount + 1}/${LIMITS.maxFixAttempts} (${activity.filesWritten.length} file(s)). Re-running checks.`,
  };
}

export const debuggerEdge = (state) => (state.escalated ? "finalizer" : "tester");
