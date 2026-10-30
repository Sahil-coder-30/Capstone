// planner.node.js
// Lead Architect node. Two phases:
//   1. Inspection: a read-only ReAct agent explores the project and writes a
//      short analysis (streamed to the user as thinking).
//   2. Plan: a structured-output call turns the task + analysis + real file
//      list into a validated plan.
// No fake fallback plan: if planning fails, the run ends with an honest
// "could not plan" report instead of guessing.

import * as z from "zod";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getAppModel } from "../model.js";
import { readFile, listFiles, searchCode, searchInternetTool } from "../tool.js";
import { listSandboxFiles } from "../sandboxClient.js";
import { normalizePath } from "../guards.js";
import {
  GROUNDING_RULES,
  formatChatHistory,
  invokeStructured,
  lastAiText,
  truncate,
} from "../agentUtils.js";

const INSPECTOR_SYSTEM_PROMPT = `You are the Lead Architect on Orion's team inside Taksha, a cloud IDE for React + Vite apps. The user's project lives in /workspace and the Vite dev server already runs on port 5173.

Your job right now: understand the request and the existing code well enough to plan it. Do NOT write code or change files.

Inspection protocol:
1. list_files to see the structure.
2. read_file package.json and every file the change will touch or depend on (entry points, routing, the components involved, styles, config).
3. search_code for existing patterns: component names, hooks, state management, routing, styling approach, API calls.
4. Use search_internet only if the task needs a library you are unsure about.

Before each tool call, write one short sentence saying what you are checking and why.

When you are done, write your analysis in plain prose (no JSON):
- What the project already has that is relevant (exact file paths, libraries, patterns).
- What must be created or changed, and where.
- Risks or open questions.

${GROUNDING_RULES}`;

const PLAN_SYSTEM_PROMPT = `You turn an inspection analysis into an implementation plan for Orion's Coder.

Rules:
- 1 to 8 steps. Small tasks get 1 or 2 steps. Do not add inspection-only, testing-only or "verify" steps; verification runs automatically after coding.
- Each step changes at most 5 files and lists every file it will create, modify or delete in activeFiles (workspace-relative, e.g. "src/components/Navbar.jsx", no leading slash).
- action: "create" when the step only adds new files, "modify" when it edits existing files (it may also add new ones), "delete" when it removes files.
- A file listed in a "modify" step must exist in the EXISTING FILES list, or be created by an earlier step.
- acceptanceCriteria: 1-4 concrete, checkable statements about the code (e.g. "Navbar.jsx exports a default Navbar component", "App.jsx renders <Navbar /> above <Routes>"). No vague criteria like "works well".
- dependsOn: ids of earlier steps only.
- riskLevel "high" for auth, payments, secrets, database schema or migrations; "medium" for state/API logic; "low" for UI-only.
- Use the project's existing libraries and patterns from the analysis. Only add a dependency if the task really needs it, and say so in the step description (the Coder will npm install it).`;

const PlanSchema = z.object({
  summary: z.string().describe("One sentence describing what the plan achieves"),
  steps: z
    .array(
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
    )
    .describe("Ordered implementation steps"),
});

const normalizePlan = (raw) => {
  const steps = (raw?.steps || []).slice(0, 8).map((step, i) => ({
    id: i + 1,
    title: String(step.title || `Step ${i + 1}`).trim(),
    action: ["create", "modify", "delete"].includes(step.action) ? step.action : "modify",
    description: String(step.description || "").trim(),
    acceptanceCriteria: (Array.isArray(step.acceptanceCriteria) ? step.acceptanceCriteria : [])
      .map((c) => String(c).trim())
      .filter(Boolean)
      .slice(0, 4),
    activeFiles: [...new Set((Array.isArray(step.activeFiles) ? step.activeFiles : []).map(normalizePath).filter(Boolean))],
    riskLevel: ["low", "medium", "high"].includes(step.riskLevel) ? step.riskLevel : "medium",
    dependsOn: (Array.isArray(step.dependsOn) ? step.dependsOn : []).filter((d) => Number.isInteger(d) && d < i + 1),
    status: "pending",
  }));
  return {
    summary: String(raw?.summary || "").trim(),
    steps,
    totalSteps: steps.length,
  };
};

export async function plannerNode(state, config) {
  const task = String(state.task || "").trim();
  const history = formatChatHistory(state.messages || [], 3_000);
  const feedback = [
    state.planFeedback ? `The user rejected the previous plan with this feedback:\n${state.planFeedback}` : "",
    state.criticFeedback ? `The plan validator found these problems in the previous plan:\n${state.criticFeedback}` : "",
  ].filter(Boolean).join("\n\n");

  // ── Phase 1: inspection ──────────────────────────────────────────────────
  let analysis = state.planAnalysis || "";
  if (!analysis) {
    const inspector = createReactAgent({
      llm: getAppModel(),
      tools: [listFiles, readFile, searchCode, searchInternetTool],
      prompt: INSPECTOR_SYSTEM_PROMPT,
    });
    try {
      const result = await inspector.invoke(
        {
          messages: [
            {
              role: "user",
              content: `${history ? `Conversation so far:\n${history}\n\n` : ""}Task (${state.taskSubType || "new_feature"}):\n${task}\n\nInspect the project, then write your analysis.`,
            },
          ],
        },
        { ...config, recursionLimit: 40 },
      );
      analysis = lastAiText(result.messages);
    } catch (err) {
      if (config?.signal?.aborted) throw err;
      console.warn("[PlannerNode] Inspection failed:", err.message);
    }
  }

  // ── Phase 2: structured plan ─────────────────────────────────────────────
  const existingFiles = (await listSandboxFiles(config)) || [];
  let plan = null;
  let planError = null;

  try {
    const raw = await invokeStructured(
      getAppModel(),
      PlanSchema,
      "implementation_plan",
      [
        new SystemMessage(PLAN_SYSTEM_PROMPT),
        new HumanMessage(
          [
            `TASK (${state.taskSubType || "new_feature"}):\n${task}`,
            `INSPECTION ANALYSIS:\n${truncate(analysis || "(inspection unavailable, rely on the file list)", 12_000)}`,
            `EXISTING FILES (${existingFiles.length}):\n${existingFiles.slice(0, 400).join("\n") || "(empty workspace or listing failed)"}`,
            feedback ? `REVISION REQUEST:\n${feedback}` : "",
          ].filter(Boolean).join("\n\n"),
        ),
      ],
      config,
    );
    plan = normalizePlan(raw);
    if (!plan.steps.length) {
      plan = null;
      planError = "The planner returned an empty plan.";
    }
  } catch (err) {
    if (config?.signal?.aborted) throw err;
    planError = `Planning failed: ${err.message}`;
  }

  if (!plan) {
    console.warn(`[PlannerNode] ${planError}`);
    return {
      plan: null,
      planError,
      planAnalysis: analysis,
      lastNodeInvoked: "planner",
      taskStatus: "failed",
      currentSituation: `Planner: ${planError}`,
    };
  }

  console.log(`[PlannerNode] Plan: ${plan.totalSteps} steps - "${plan.summary}"`);
  return {
    plan,
    planError: null,
    planAnalysis: analysis,
    planApproved: false,
    currentStep: 0,
    existingFiles,
    lastNodeInvoked: "planner",
    taskStatus: "planned",
    currentSituation: `Planner: ${plan.totalSteps}-step plan ready. Validating it before review.`,
  };
}

export function plannerEdge(state) {
  return state.plan ? "critic" : "finalizer";
}
