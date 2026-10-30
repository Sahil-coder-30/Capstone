// debugger.node.js
// Fixes a failed build, failed tests, or unmet acceptance criteria.
// Always hands back to the tester; it never marks its own fix as verified.
//
// Escalates (stops retrying) when:
//   - the agent changed nothing, so another loop would see the same failure
//   - the same error signature has already been attempted twice

import { createHash } from "crypto";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getAppModel } from "../model.js";
import { applyGuards, scopeWriteTools } from "../guards.js";
import {
  listFiles,
  readFile,
  searchCode,
  patchFile,
  updateFile,
  createFile,
  executeCommand,
  getViteRuntimeErrors,
} from "../tool.js";
import { GROUNDING_RULES, analyzeToolActivity, lastAiText, truncate } from "../agentUtils.js";

const DEBUG_RECURSION_LIMIT = 50;

const DEBUGGER_SYSTEM_PROMPT = `You are Orion's Debugger. You find the root cause of a failure in a React + Vite project at /workspace and apply the smallest correct fix.

Protocol:
1. Read the failure output first. Find the exact file, line and message.
2. read_file the failing file(s) and anything they import that is involved. Use search_code to find where a symbol is defined or used.
3. Fix the root cause, not the symptom. Prefer patch_file with an exact oldStr copied from read_file. Use update_file only if most of the file must change.
4. Missing npm package? Check package.json, then execute_command "npm install <pkg>".
5. Re-read the changed file to confirm the fix is in place. Do not run the build yourself; the tester will.

Narrate briefly: before each tool call, write one short sentence about what you are checking or fixing.

Do not repeat a fix listed under PREVIOUS ATTEMPTS. If that fix did not work, find a different cause.
You may only change files listed under ALLOWED FILES. If the real cause is elsewhere, explain it in your final message.

When finished, reply with:
ROOT CAUSE: <one sentence>
FIX: <what you changed, file by file>

${GROUNDING_RULES}`;

const signatureOf = (testResults) =>
  createHash("sha256")
    .update((testResults?.errorLines || []).join("\n").replace(/\d+/g, "#"))
    .digest("hex")
    .slice(0, 16);

export async function debuggerNode(state, config) {
  const {
    testResults,
    buildLog,
    flaggedFiles = [],
    filesTouched = [],
    attemptedFixes = [],
    retryCount = 0,
    maxRetries = 3,
    plan,
  } = state;

  const signature = signatureOf(testResults);
  const repeats = attemptedFixes.filter((f) => f.signature === signature).length;
  if (repeats >= 2) {
    return {
      escalated: true,
      escalationReason: "The same error came back after two different fix attempts.",
      retryCount: retryCount + 1,
      lastNodeInvoked: "debugger",
      taskStatus: "escalated",
      currentSituation: "Debugger: the same failure persisted after two fixes. Stopping and reporting.",
    };
  }

  const allowed = [...new Set([
    ...flaggedFiles,
    ...filesTouched,
    ...(plan?.steps || []).flatMap((s) => s.activeFiles || []),
    "package.json",
  ])];

  const stageLabel = testResults?.stage === "review"
    ? "ACCEPTANCE REVIEW found unmet requirements"
    : testResults?.stage === "tests"
      ? "UNIT TESTS failed"
      : "PRODUCTION BUILD failed";

  const prompt = `${stageLabel}. Attempt ${retryCount + 1} of ${maxRetries}.

TASK THE CODE SHOULD IMPLEMENT:
${state.task}

FAILURE DETAILS:
${(testResults?.errorLines || []).map((l) => `- ${l}`).join("\n") || "- (no structured lines, see log)"}

${buildLog ? `OUTPUT LOG:\n${truncate(buildLog, 4_000)}\n` : ""}
FILES IMPLICATED: ${flaggedFiles.length ? flaggedFiles.join(", ") : "(none parsed, find them from the log)"}
FILES CHANGED IN THIS RUN: ${filesTouched.join(", ") || "(none)"}

ALLOWED FILES:
${allowed.map((f) => `  - ${f}`).join("\n")}

PREVIOUS ATTEMPTS:
${attemptedFixes.length ? attemptedFixes.map((f) => `  ${f.attempt}. [${f.stage}] ${f.summary}`).join("\n") : "  (none)"}

Find the root cause and fix it now.`;

  const tools = scopeWriteTools(
    applyGuards([listFiles, readFile, searchCode, getViteRuntimeErrors, executeCommand, patchFile, updateFile, createFile]),
    allowed,
  );
  const agent = createReactAgent({ llm: getAppModel(), tools, prompt: DEBUGGER_SYSTEM_PROMPT });

  let messages = [];
  let runError = null;
  try {
    const result = await agent.invoke(
      { messages: [{ role: "user", content: prompt }] },
      { ...config, recursionLimit: DEBUG_RECURSION_LIMIT },
    );
    messages = result.messages || [];
  } catch (err) {
    if (config?.signal?.aborted) throw err;
    runError = err.message;
    console.error("[DebuggerNode] Agent failed:", err.message);
  }

  const activity = analyzeToolActivity(messages);
  const installedSomething = activity.commands.some((c) => c.ok && /\b(npm|pnpm|yarn)\s+(install|add|i)\b/.test(c.command || ""));
  const changed = activity.filesWritten.length > 0 || installedSomething;
  const summary = truncate(lastAiText(messages) || runError || "No explanation returned.", 600);

  const attempt = {
    attempt: retryCount + 1,
    stage: testResults?.stage || "build",
    signature,
    summary,
    filesWritten: activity.filesWritten,
  };

  if (!changed) {
    return {
      escalated: true,
      escalationReason: runError
        ? `The debugger failed: ${runError}`
        : "The debugger could not find a safe fix and changed nothing.",
      attemptedFixes: [attempt],
      retryCount: retryCount + 1,
      lastNodeInvoked: "debugger",
      taskStatus: "escalated",
      currentSituation: "Debugger: could not apply a fix. Stopping and reporting.",
    };
  }

  return {
    attemptedFixes: [attempt],
    filesTouched: activity.filesWritten,
    retryCount: retryCount + 1,
    escalated: false,
    lastNodeInvoked: "debugger",
    taskStatus: "debugging",
    currentSituation: `Debugger: applied fix attempt ${retryCount + 1}/${maxRetries} (${activity.filesWritten.length} file(s)). Re-running checks.`,
  };
}

export function debuggerEdge(state) {
  return state.escalated ? "finalizer" : "tester";
}
