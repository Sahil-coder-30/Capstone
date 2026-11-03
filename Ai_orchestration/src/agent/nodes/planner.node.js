// planner.node.js
// Two phases:
//   1. Inspection: a read-only tool loop explores the project and writes a
//      short analysis (streamed to the user as thinking). It starts with the
//      real file list, so it does not have to guess paths.
//   2. Plan: a structured call turns task + analysis + file list into a
//      validated plan.
// No fake fallback plan: if planning fails the run ends with an honest report.

import * as z from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getMainModel } from "../llm/model.js";
import { invokeStructured } from "../llm/structured.js";
import { isFatalModelError } from "../llm/rateLimiter.js";
import { runToolLoop } from "../core/toolLoop.js";
import { formatChatHistory, lastAiText, truncate } from "../core/messages.js";
import { GROUNDING_RULES, PROJECT_CONTEXT } from "../core/prompts.js";
import { READ_ONLY_TOOLS } from "../tools/index.js";
import { listFiles } from "../tools/sandbox.client.js";
import { normalizePath } from "../tools/guards.js";
import { LIMITS } from "../graph/orion.state.js";

const INSPECTOR_PROMPT = `You are the Lead Architect on Orion's team. ${PROJECT_CONTEXT}

Your job now: understand the request and the existing code well enough to plan it. Do NOT change files.

1. Start from the file list you were given. Do not guess paths that are not in it.
2. read_file package.json and every file the change will touch or depend on (entry point, routing, the components involved, styles).
3. search_code for existing patterns: component names, state management, routing, styling, API calls.
4. Use search_internet only if the task needs a library you are unsure about.

Before each tool call write one short sentence on what you are checking.

When done, write your analysis in plain prose (no JSON):
- What the project already has that is relevant (exact paths, libraries, patterns).
- What must be created or changed, and where.
- Risks or open questions.

${GROUNDING_RULES}`;

const PLAN_PROMPT = `You turn an inspection analysis into an implementation plan for Orion's Coder.

Rules:
- 1 to ${LIMITS.maxPlanSteps} steps. Small tasks get 1 or 2 steps. No inspection-only, test-only or "verify" steps: checks run automatically after coding.
- Each step changes at most ${LIMITS.maxFilesPerStep} files and lists every one of them in activeFiles (workspace-relative, no leading slash).
- action: "create" when the step only adds files, "modify" when it edits existing files (it may also add new ones), "delete" when it removes files.
- A file in a "modify" step must be in EXISTING FILES or be created by an earlier step.
- acceptanceCriteria: 1-4 concrete, checkable statements about the code, e.g. "App.jsx renders <Navbar /> above <Routes>". Nothing vague like "works well".
- dependsOn: ids of earlier steps only.
- riskLevel "high" for auth, payments, secrets or database schema; "medium" for state/API logic; "low" for UI-only.
- Use the project's existing libraries and patterns. Add a dependency only if really needed and say so in the step description.`;

const PlanSchema = z.object({
  summary: z.string().describe("One sentence describing what the plan achieves"),
  steps: z.array(
    z.object({
      id: z.number().int().describe("1-based step number"),
      title: z.string().describe("Short action title"),
      action: z.enum(["create", "modify", "delete"]),
      description: z.string().describe("Exactly what to do in this step and why"),
      acceptanceCriteria: z.array(z.string()).describe("1-4 concrete, checkable statements"),
      activeFiles: z.array(z.string()).describe("Workspace-relative files this step creates, modifies or deletes"),
      riskLevel: z.enum(["low", "medium", "high"]),
      dependsOn: z.array(z.number().int()).describe("Ids of earlier steps this step needs"),
    }),
  ),
});

/** Renumbers steps and drops anything malformed the model returned. */
const normalizePlan = (raw) => {
  const steps = (raw?.steps || []).slice(0, LIMITS.maxPlanSteps).map((step, i) => ({
    id: i + 1,
    title: String(step.title || `Step ${i + 1}`).trim(),
    action: step.action,
    description: String(step.description || "").trim(),
    acceptanceCriteria: (step.acceptanceCriteria || []).map((c) => String(c).trim()).filter(Boolean).slice(0, 4),
    activeFiles: [...new Set((step.activeFiles || []).map(normalizePath).filter(Boolean))],
    riskLevel: step.riskLevel,
    dependsOn: (step.dependsOn || []).filter((d) => Number.isInteger(d) && d >= 1 && d <= i),
    status: "pending",
    attempts: 0,
  }));
  return { summary: String(raw?.summary || "").trim(), steps, totalSteps: steps.length };
};

const inspect = async (state, config, existingFiles) => {
  const history = formatChatHistory(state.messages, 3_000);
  const { messages } = await runToolLoop({
    model: getMainModel(),
    tools: READ_ONLY_TOOLS,
    system: INSPECTOR_PROMPT,
    prompt: [
      history ? `Conversation so far:\n${history}` : "",
      `Task (${state.taskSubType}):\n${state.task}`,
      `Project files (${existingFiles.length}):\n${existingFiles.slice(0, 300).join("\n") || "(empty workspace)"}`,
      "Inspect what you need, then write your analysis.",
    ].filter(Boolean).join("\n\n"),
    config,
    maxTurns: 15,
  });
  return lastAiText(messages);
};

const failed = (planError, analysis) => {
  console.warn(`[Planner] ${planError}`);
  return { plan: null, planError, planAnalysis: analysis, currentSituation: planError };
};

export async function plannerNode(state, config) {
  const existingFiles = await listFiles(config);
  if (existingFiles === null) {
    return failed("Could not read the project files. The sandbox may be stopped. Start it and try again.", "");
  }

  // The analysis is kept across re-plans; only the plan is rebuilt.
  let analysis = state.planAnalysis;
  if (!analysis) {
    try {
      analysis = await inspect(state, config, existingFiles);
    } catch (err) {
      if (config?.signal?.aborted || isFatalModelError(err)) throw err;
      console.warn("[Planner] Inspection failed:", err.message);
    }
  }

  const revision = [
    state.planFeedback && `The user rejected the previous plan with this feedback:\n${state.planFeedback}`,
    state.criticFeedback && `The plan validator found these problems in the previous plan:\n${state.criticFeedback}`,
  ].filter(Boolean).join("\n\n");

  let plan;
  try {
    const raw = await invokeStructured(
      getMainModel(),
      PlanSchema,
      "implementation_plan",
      [
        new SystemMessage(PLAN_PROMPT),
        new HumanMessage([
          `TASK (${state.taskSubType}):\n${state.task}`,
          `INSPECTION ANALYSIS:\n${truncate(analysis || "(inspection unavailable, rely on the file list)", 12_000)}`,
          `EXISTING FILES (${existingFiles.length}):\n${existingFiles.slice(0, 400).join("\n") || "(empty workspace)"}`,
          revision && `REVISION REQUEST:\n${revision}`,
        ].filter(Boolean).join("\n\n")),
      ],
      config,
    );
    plan = normalizePlan(raw);
  } catch (err) {
    if (config?.signal?.aborted || isFatalModelError(err)) throw err;
    return failed(`Planning failed: ${err.message}`, analysis);
  }

  if (!plan.steps.length) return failed("The planner returned an empty plan.", analysis);

  console.log(`[Planner] ${plan.totalSteps} step(s): "${plan.summary}"`);
  return {
    plan,
    planError: null,
    planAnalysis: analysis,
    planApproved: false,
    currentStep: 0,
    existingFiles,
    currentSituation: `${plan.totalSteps}-step plan ready. Validating it before review.`,
  };
}

export const plannerEdge = (state) => (state.plan ? "critic" : "finalizer");
