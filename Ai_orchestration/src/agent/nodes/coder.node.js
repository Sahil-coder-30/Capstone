// coder.node.js
// Implements ONE plan step per invocation with a fresh, small context:
// task + plan + this step + factual reports of earlier steps.
//
// Step status is decided from tool results, not from the model's own claim:
//   - a step that should change files but made no successful write is failed
//   - a step whose dependency failed is skipped
// Each step leaves a report (files written, failures, the model's summary)
// that later steps, the reviewer and the finalizer rely on.

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getAppModel } from "../model.js";
import { applyGuards } from "../guards.js";
import {
  listFiles,
  readFile,
  createFile,
  updateFile,
  patchFile,
  deleteFile,
  executeCommand,
  getViteRuntimeErrors,
  searchCode,
  searchInternetTool,
} from "../tool.js";
import {
  GROUNDING_RULES,
  analyzeToolActivity,
  formatChatHistory,
  formatPlan,
  lastAiText,
  truncate,
} from "../agentUtils.js";

// ~30 tool calls per step. Enough for real work, small enough to stop loops.
const STEP_RECURSION_LIMIT = 64;

const CODER_SYSTEM_PROMPT = `You are Orion's Coder, a senior React + Vite engineer. You implement EXACTLY ONE plan step in the user's project at /workspace. The Vite dev server already runs on port 5173 with hot reload.

Execution protocol:
1. Read before you write. read_file every file in this step's activeFiles that exists, plus anything they import that you need to understand. Use search_code to find existing patterns.
2. Implement the step completely. No placeholders, no TODOs, no "rest of the code here" comments. Every import must point to a file or package that really exists.
3. Edit with the right tool: patch_file for small targeted edits (copy oldStr exactly from read_file or search_code output), update_file for full rewrites, create_file for new files (parent folders are created automatically).
4. New npm package needed? Check package.json first, then execute_command "npm install <pkg>". Never run dev/start/preview servers.
5. Self-check: re-read each file you changed and confirm every acceptance criterion against the real content. Fix anything that is off.

Narrate briefly: before each tool call, write one short sentence about what you are doing and why (e.g. "Reading App.jsx to see where routes are defined.").

Coding standards:
- Match the existing style (indentation, quotes, naming, file structure, CSS approach).
- Function components and hooks. Keep components small and focused.
- Import paths are case-sensitive (Linux). Check them.
- No debug console.log.

When finished, reply with exactly this format:
STATUS: done | blocked
SUMMARY: <2-4 sentences: what you changed and how each acceptance criterion is met, or what blocked you>

${GROUNDING_RULES}`;

const buildTools = () =>
  applyGuards([
    listFiles,
    readFile,
    searchCode,
    searchInternetTool,
    executeCommand,
    getViteRuntimeErrors,
    createFile,
    updateFile,
    patchFile,
    deleteFile,
  ]);

const parseStatus = (text) => {
  const match = /STATUS:\s*(done|blocked)/i.exec(text || "");
  return match ? match[1].toLowerCase() : null;
};

const parseSummary = (text) => {
  const match = /SUMMARY:\s*([\s\S]+)/i.exec(text || "");
  return (match ? match[1] : text || "").trim();
};

const formatPreviousReports = (reports = []) => {
  if (!reports.length) return "(this is the first step)";
  return reports
    .map((r) => {
      const files = [...(r.filesWritten || []), ...(r.filesDeleted || []).map((f) => `${f} (deleted)`)];
      return `Step ${r.stepId} [${r.status}]: ${r.summary}\n  files: ${files.length ? files.join(", ") : "none"}`;
    })
    .join("\n");
};

const markStep = (plan, index, status) => ({
  ...plan,
  steps: plan.steps.map((s, i) => (i === index ? { ...s, status } : s)),
});

export async function coderNode(state, config) {
  const plan = state.plan;
  const index = state.currentStep || 0;
  const step = plan.steps[index];

  // Skip steps whose dependencies did not complete.
  const failedDeps = (step.dependsOn || []).filter((id) => {
    const dep = plan.steps.find((s) => s.id === id);
    return dep && dep.status !== "done";
  });
  if (failedDeps.length > 0) {
    const report = {
      stepId: step.id,
      title: step.title,
      status: "skipped",
      summary: `Skipped because step ${failedDeps.join(", ")} did not complete.`,
      filesWritten: [],
      filesDeleted: [],
      failures: [],
    };
    return {
      plan: markStep(plan, index, "skipped"),
      currentStep: index + 1,
      stepReports: [report],
      lastNodeInvoked: "coder",
      taskStatus: "coding",
      currentSituation: `Coder: step ${step.id} skipped, dependency step ${failedDeps.join(", ")} did not complete.`,
    };
  }

  const taskPrompt = `TASK FROM THE USER:
${state.task}

${state.messages?.length ? `CONVERSATION CONTEXT:\n${formatChatHistory(state.messages, 2_000)}\n\n` : ""}PROJECT ANALYSIS (from the planner's inspection, verify before relying on it):
${truncate(state.planAnalysis || "(none)", 4_000)}

FULL PLAN:
${formatPlan(plan, index)}

EARLIER STEPS (facts from tool results):
${formatPreviousReports(state.stepReports)}

YOUR STEP: ${step.id}/${plan.totalSteps} - ${step.title} (${step.action})
${step.description}

Files for this step:
${step.activeFiles.length ? step.activeFiles.map((f) => `  - ${f}`).join("\n") : "  (not listed, decide from the code)"}

Acceptance criteria (all must be true when you finish):
${step.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}

Implement this step now.`;

  const agent = createReactAgent({
    llm: getAppModel(),
    tools: buildTools(),
    prompt: CODER_SYSTEM_PROMPT,
  });

  let messages = [];
  let runError = null;
  try {
    const result = await agent.invoke(
      { messages: [{ role: "user", content: taskPrompt }] },
      { ...config, recursionLimit: STEP_RECURSION_LIMIT },
    );
    messages = result.messages || [];
  } catch (err) {
    if (config?.signal?.aborted) throw err;
    runError = /recursion/i.test(err.message)
      ? "Ran out of tool-call budget for this step before finishing."
      : err.message;
    console.error(`[CoderNode] Step ${step.id} failed:`, err.message);
  }

  const activity = analyzeToolActivity(messages);
  const finalText = lastAiText(messages);
  const claimed = parseStatus(finalText);
  const changedSomething = activity.filesWritten.length + activity.filesDeleted.length > 0;
  const planned = new Set(plan.steps.flatMap((s) => s.activeFiles));
  const outOfPlan = activity.filesWritten.filter((f) => !planned.has(f));

  let status = "done";
  let summary = parseSummary(finalText) || "No summary returned.";
  if (runError) {
    status = "failed";
    summary = runError;
  } else if (claimed === "blocked") {
    status = "failed";
  } else if (!changedSomething) {
    status = "failed";
    summary = `No file was changed in this step. ${summary}`;
  }

  const report = {
    stepId: step.id,
    title: step.title,
    status,
    summary: truncate(summary, 800),
    filesWritten: activity.filesWritten,
    filesDeleted: activity.filesDeleted,
    failures: activity.failures.slice(-5),
    outOfPlan,
  };

  console.log(`[CoderNode] Step ${step.id} ${status} (${activity.filesWritten.length} written, ${activity.failures.length} failed calls)`);

  const next = index + 1;
  return {
    plan: markStep(plan, index, status),
    currentStep: next,
    stepReports: [report],
    filesTouched: [...activity.filesWritten, ...activity.filesDeleted],
    lastNodeInvoked: "coder",
    taskStatus: next < plan.steps.length ? "coding" : "coding_complete",
    currentSituation: status === "done"
      ? `Coder: step ${step.id} done (${activity.filesWritten.length} file(s) changed).`
      : `Coder: step ${step.id} failed. ${truncate(summary, 160)}`,
  };
}

export function coderEdge(state) {
  const plan = state.plan;
  if (plan?.steps && (state.currentStep || 0) < plan.steps.length) return "coder";
  // Nothing changed means nothing to verify; report honestly instead.
  if (!(state.filesTouched || []).length) return "finalizer";
  return "tester";
}
