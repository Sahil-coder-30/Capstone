// coder.node.js
// Implements ONE plan step per pass with a small, fresh prompt:
// task + plan + this step + factual reports of earlier steps.
//
// Step status comes from tool results, not from the model's claim:
//   - a step that changed nothing (no file write, no package install) failed
//   - a failed step gets one more attempt with the reason it failed
//   - a step whose dependency did not finish is skipped

import { getMainModel } from "../llm/model.js";
import { isFatalModelError } from "../llm/rateLimiter.js";
import { runToolLoop } from "../core/toolLoop.js";
import { analyzeToolActivity } from "../core/toolActivity.js";
import { formatChatHistory, lastAiText, truncate } from "../core/messages.js";
import { GROUNDING_RULES, PROJECT_CONTEXT } from "../core/prompts.js";
import { CODER_TOOLS } from "../tools/index.js";
import { shellGuard } from "../tools/guards.js";
import { LIMITS } from "../graph/orion.state.js";

const MAX_TURNS = 30;
const INSTALL_COMMAND = /\b(npm|pnpm|yarn)\s+(install|add|i)\b/;

const SYSTEM_PROMPT = `You are Orion's Coder, a senior React + Vite engineer. You implement EXACTLY ONE plan step. ${PROJECT_CONTEXT}

How to work:
1. Read before you write. read_file every file of this step that exists, plus what they import that you need. Use search_code to find existing patterns.
2. Implement the step completely. No placeholders, no TODOs, no "rest of code here". Every import must point to a file or package that really exists.
3. Pick the right tool: patch_file for small edits (copy oldStr exactly from read_file output), update_file for full rewrites, create_file for new files.
4. Need an npm package? Check package.json first, then execute_command "npm install <pkg>". Never add a dependency by editing package.json: that does not install it, and the build fails. Never start dev/preview servers.
5. Re-read each file you changed and check every acceptance criterion against the real content. Fix anything that is off.

Before each tool call write one short sentence on what you are doing.

Coding standards: match the existing style (indentation, quotes, naming, CSS approach); function components and hooks; import paths are case-sensitive; no debug console.log.

When finished reply in exactly this format:
STATUS: done | blocked
SUMMARY: <2-4 sentences: what you changed and how each acceptance criterion is met, or what blocked you>

${GROUNDING_RULES}`;

const parseStatus = (text) => /STATUS:\s*(done|blocked)/i.exec(text)?.[1]?.toLowerCase() ?? null;
const parseSummary = (text) => (/SUMMARY:\s*([\s\S]+)/i.exec(text)?.[1] ?? text).trim();

const formatPlan = (plan, activeIndex) =>
  plan.steps
    .map((s, i) => `${i === activeIndex ? "-> ACTIVE " : `[${s.status}] `}Step ${s.id} (${s.action}): ${s.title}${s.activeFiles.length ? ` [${s.activeFiles.join(", ")}]` : ""}`)
    .join("\n");

const formatReports = (reports) =>
  reports.length
    ? reports
      .map((r) => {
        const files = [...r.filesWritten, ...r.filesDeleted.map((f) => `${f} (deleted)`)];
        return `Step ${r.stepId} [${r.status}]: ${r.summary}\n  files: ${files.join(", ") || "none"}`;
      })
      .join("\n")
    : "(this is the first step)";

const buildPrompt = (state, step, index) => `TASK FROM THE USER:
${state.task}

${state.messages.length ? `CONVERSATION CONTEXT:\n${formatChatHistory(state.messages, 2_000)}\n\n` : ""}PROJECT ANALYSIS (from inspection; verify before relying on it):
${truncate(state.planAnalysis || "(none)", 4_000)}

FULL PLAN:
${formatPlan(state.plan, index)}

EARLIER STEPS (facts from tool results):
${formatReports(state.stepReports)}

YOUR STEP: ${step.id}/${state.plan.totalSteps} - ${step.title} (${step.action})
${step.description}

Files for this step:
${step.activeFiles.map((f) => `  - ${f}`).join("\n") || "  (not listed, decide from the code)"}

Acceptance criteria (all must be true when you finish):
${step.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}
${step.lastFailure ? `\nYOUR PREVIOUS ATTEMPT AT THIS STEP FAILED:\n${step.lastFailure}\nFix that this time. Check the current file contents first, the earlier attempt may have changed some of them.\n` : ""}
Implement this step now.`;

const updateStep = (plan, index, changes) => ({
  ...plan,
  steps: plan.steps.map((s, i) => (i === index ? { ...s, ...changes } : s)),
});

const skipStep = (state, step, index, failedDeps) => ({
  plan: updateStep(state.plan, index, { status: "skipped" }),
  currentStep: index + 1,
  stepReports: [{
    stepId: step.id,
    title: step.title,
    status: "skipped",
    summary: `Skipped because step ${failedDeps.join(", ")} did not complete.`,
    filesWritten: [],
    filesDeleted: [],
    failures: [],
  }],
  currentSituation: `Step ${step.id} skipped, step ${failedDeps.join(", ")} did not complete.`,
});

export async function coderNode(state, config) {
  const index = state.currentStep;
  const step = state.plan.steps[index];

  const failedDeps = step.dependsOn.filter((id) => state.plan.steps.find((s) => s.id === id)?.status !== "done");
  if (failedDeps.length) return skipStep(state, step, index, failedDeps);

  let messages = [];
  let finished = true;
  let runError = null;
  try {
    ({ messages, finished } = await runToolLoop({
      model: getMainModel(),
      tools: CODER_TOOLS,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(state, step, index),
      config,
      maxTurns: MAX_TURNS,
      guard: shellGuard,
    }));
  } catch (err) {
    if (config?.signal?.aborted || isFatalModelError(err)) throw err;
    runError = err.message;
    console.error(`[Coder] Step ${step.id} failed:`, err.message);
  }

  const activity = analyzeToolActivity(messages);
  const installed = activity.commands.some((c) => c.ok && INSTALL_COMMAND.test(c.command || ""));
  const filesWritten = installed ? [...new Set([...activity.filesWritten, "package.json"])] : activity.filesWritten;
  const changedSomething = filesWritten.length + activity.filesDeleted.length > 0;
  const finalText = lastAiText(messages);

  let status = "done";
  let summary = parseSummary(finalText) || "No summary returned.";
  if (runError) {
    status = "failed";
    summary = `The model call failed: ${runError}`;
  } else if (parseStatus(finalText) === "blocked") {
    status = "failed";
  } else if (!changedSomething) {
    status = "failed";
    summary = `No file was changed in this step. ${summary}`;
  } else if (!finished) {
    summary = `Ran out of tool calls before finishing. ${summary}`;
  }

  // One more attempt for a failed step, with the reason it failed.
  const attempts = (step.attempts || 0) + 1;
  if (status === "failed" && attempts < LIMITS.maxStepAttempts) {
    console.log(`[Coder] Step ${step.id} failed, retrying (${attempts}/${LIMITS.maxStepAttempts})`);
    const failures = activity.failures.slice(-3).map((f) => `${f.name}: ${f.error}`).join("\n");
    return {
      plan: updateStep(state.plan, index, { attempts, lastFailure: truncate(`${summary}${failures ? `\nFailed tool calls:\n${failures}` : ""}`, 1_500) }),
      filesTouched: [...filesWritten, ...activity.filesDeleted],
      currentSituation: `Step ${step.id} did not finish. Retrying it.`,
    };
  }

  const planned = new Set(state.plan.steps.flatMap((s) => s.activeFiles));
  const report = {
    stepId: step.id,
    title: step.title,
    status,
    summary: truncate(summary, 800),
    filesWritten,
    filesDeleted: activity.filesDeleted,
    failures: activity.failures.slice(-5),
    outOfPlan: filesWritten.filter((f) => !planned.has(f) && f !== "package.json"),
  };
  console.log(`[Coder] Step ${step.id} ${status} (${filesWritten.length} written, ${activity.failures.length} failed calls)`);

  return {
    plan: updateStep(state.plan, index, { status, attempts }),
    currentStep: index + 1,
    stepReports: [report],
    filesTouched: [...filesWritten, ...activity.filesDeleted],
    currentSituation: status === "done"
      ? `Step ${step.id} done (${filesWritten.length} file(s) changed).`
      : `Step ${step.id} failed. ${truncate(summary, 160)}`,
  };
}

export function coderEdge(state) {
  if (state.currentStep < state.plan.steps.length) return "coder";
  // Nothing changed means nothing to verify. Report honestly instead.
  return state.filesTouched.length ? "tester" : "finalizer";
}
