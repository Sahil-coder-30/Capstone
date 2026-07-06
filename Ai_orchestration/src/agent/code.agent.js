// agent.js
if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = function (ms) {
    if (ms === 30000) {
      return originalTimeout.call(this, 180000);
    }
    return originalTimeout.call(this, ms);
  };
}
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ChatMistralAI } from "@langchain/mistralai";

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
} from "./tool.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Concise guidelines to keep system prompt size minimal and optimize token costs
const codegenSkill = `
- **Read First**: Always read the existing codebase files (like App.jsx, package.json, index.html) using read_file to understand the setup before writing code.
- **Incremental Steps**: Implement features incrementally. Do not rewrite large chunks of code unless requested.
- **Syntax & Execution**: Run commands like npm run build or tests using execute_command to verify syntax and compilation before ending the task.
- **No Dev Server Run**: The Vite dev server is already running on port 5173 — never execute "npm run dev" or "vite".
`;

const frontendDesign = `
- **Premium Aesthetics**: Use modern typography (Google Fonts like Outfit, Inter, Roboto), vibrant custom color palettes (no default red/blue/green), smooth gradients, and glassmorphism.
- **Animations & Responsiveness**: Build interfaces that feel alive with responsive flexbox/grid layouts and subtle hover micro-animations.
- **No Placeholders**: Never write placeholder text or generic boxes. Use complete content.
`;

const toolInfoSkill = `
- **Read Before Write**: Always invoke read_file on a path before invoking update_file or patch_file on it to avoid conflicts.
- **Surgical Edits**: Prefer target edits rather than overwriting entire files to fix small issues.
- **Never Exec for File Read**: Do not use execute_command to run commands like "cat", "grep", or "ls" to inspect files/directories; use read_file and list_files instead.
`;

const planningSkill = `
- **Plan Before You Build**: For any non-trivial request (new feature, multi-file change, or a bug fix that needs investigation), your FIRST tool call must be submit_plan with 2-8 concrete ordered steps. Skip this only for genuinely trivial single-line edits.
- **The Plan Is Structural, Not Narration**: Steps should name real files/components/functions you intend to touch and in what order (e.g. "read Cart.jsx to see current state shape", "add removeItem handler to cartSlice.js", "wire button in CartItem.jsx"). This is not a summary for the user — it exists so you sequence your own execution correctly instead of improvising mid-task.
- **Write Tools Are Locked Until You Plan**: create_file, update_file, and patch_file will refuse to run until submit_plan has been called once for this task. If you get a "call submit_plan first" error, call submit_plan immediately, then retry the write.
- **Create todo.md Immediately**: Right after calling \`submit_plan\` and before modifying any codebase files, you MUST create a \`todo.md\` file in the workspace root (using \`create_file\`). This file must contain:
  1. A clear implementation plan describing the goal and design approach.
  2. A detailed checklist of tasks with markdown checkboxes (\`- [ ]\`).
- **Keep todo.md Synchronized**: As you work through the tasks, you must update \`todo.md\` (using \`patch_file\` or \`update_file\`) to mark completed items as checked (\`- [x]\`).
- **Revise If Needed**: If mid-task you discover the plan was wrong (e.g. a file doesn't exist, or the approach won't work), call submit_plan again with the corrected steps, and update \`todo.md\` accordingly before continuing to write.
`;

let appModelInstance = null;
let appModelInfo = null;

export const getAppModel = () => {
  const mistralApiKey = process.env.MISTRALAI_API_KEY?.trim();

  if (!appModelInstance) {
    if (!mistralApiKey) {
      const error = new Error("No AI provider key configured. Set MISTRALAI_API_KEY.");
      error.code = "AI_PROVIDER_NOT_CONFIGURED";
      throw error;
    }

    appModelInstance = applyModelSafety(new ChatMistralAI({
      model: "mistral-large-latest",
      apiKey: mistralApiKey,
      maxRetries: 0,
      timeout: 180_000, // 3 minutes
    }), "mistralLarge");
    appModelInfo = {
      id: "mistralLarge",
      modelId: "mistral-large-latest",
      label: "Mistral Large",
      provider: "mistral",
    };
  }

  return appModelInstance;
};

export const getAppModelInfo = () => {
  getAppModel();
  return appModelInfo;
};

export const appModel = {
  invoke: (...args) => getAppModel().invoke(...args),
  stream: (...args) => getAppModel().stream(...args),
  streamEvents: (...args) => getAppModel().streamEvents(...args),
};

const guardedToolInvokes = new WeakSet();

/**
 * Creates a fresh submit_plan tool bound to a specific taskState object.
 * Calling it flips taskState.planSubmitted = true and records the steps,
 * which the write-tool guards below check before allowing any file mutation.
 */
function createSubmitPlanTool(taskState) {
  return tool(
    async ({ steps, revision }) => {
      taskState.planSubmitted = true;
      taskState.plan = steps;
      taskState.planRevisions = (taskState.planRevisions || 0) + (revision ? 1 : 0);
      return {
        ok: true,
        stepCount: steps.length,
        note: "Plan recorded. You may now use create_file/update_file/patch_file.",
      };
    },
    {
      name: "submit_plan",
      description:
        "MANDATORY first step for any non-trivial request (new feature, multi-file change, or a bug fix requiring investigation). Submit a short ordered list of concrete, file-level steps before writing any code. Skip only for single-line trivial edits. Call again with revision=true if you need to correct the plan mid-task.",
      schema: z.object({
        steps: z
          .array(z.string())
          .min(2)
          .max(8)
          .describe("Ordered, concrete, file-level steps (e.g. 'read Cart.jsx', 'add removeItem to cartSlice.js')."),
        revision: z
          .boolean()
          .optional()
          .describe("Set true if this replaces an earlier plan that turned out to be wrong."),
      }),
    }
  );
}

/**
 * Wraps write tools (create_file, update_file, patch_file) so they refuse to
 * run until taskState.planSubmitted is true. Read/search/list tools and
 * execute_command are untouched by this gate — only mutation is blocked.
 */
const WRITE_TOOL_NAMES = new Set(["create_file", "update_file", "patch_file"]);

function applyPlanGate(tools, taskState) {
  return tools.map((toolInstance) => {
    if (!WRITE_TOOL_NAMES.has(toolInstance.name)) return toolInstance;
    if (guardedToolInvokes.has(toolInstance)) return toolInstance;

    const original = toolInstance.invoke.bind(toolInstance);
    toolInstance.invoke = async (input, config) => {
      if (!taskState.planSubmitted) {
        return {
          error:
            "BLOCKED: call submit_plan first with your ordered, file-level steps, then retry this write.",
        };
      }
      return original(input, config);
    };
    guardedToolInvokes.add(toolInstance);
    return toolInstance;
  });
}

function applyGuards(tools) {
  const TOOL_RULES = {
    list_files: {
      description:
        "List all files in the project workspace. Use this to understand the project structure or find files when specific searches fail.",
      block: null,
    },
    read_file: {
      description:
        "Read ANY file content — package.json, source files, todo.md, everything. Never use executeCommand to read files.",
      block: null,
    },
    create_file: {
      description:
        "Create a new file with content. Use for ALL new file creation. Never use executeCommand to create or write files. Requires submit_plan to have been called first.",
      block: null,
    },
    update_file: {
      description:
        "Edit an existing file. Use for source edits AND todo.md tick updates. Never use executeCommand to modify files. Requires submit_plan to have been called first.",
      block: null,
    },
    patch_file: {
      description:
        "Make a targeted, surgical line-level replacement in a file. Prefer this over update_file for small changes under 20 lines. Never use executeCommand to modify files. Requires submit_plan to have been called first.",
      block: null,
    },
    execute_command: {
      description:
        "Shell only. Valid: 'npm install [pkg]', 'rm todo.md', 'mkdir [dir]', 'git [cmd]'. Never use executeCommand to read or create files. Use readFile/createFile/updateFile for file work.",
      block: {
        patterns: [
          /^\s*cat /,
          /^\s*head /,
          /^\s*tail /,
          /^\s*echo .+>/,
          /^\s*touch /,
          /^\s*cp /,
          /^\s*mv /,
          /^\s*sed /,
          /^\s*awk /,
          /^\s*grep /,
        ],
        message:
          "WRONG TOOL. Use readFile to read, createFile/updateFile to write. executeCommand is for npm/rm/mkdir/git only.",
      },
    },
    get_vite_runtime_errors: {
      description:
        "Fetch live Vite runtime errors. Call only after all files are written or when a bug is suspected. Not for file inspection.",
      block: null,
    },
    delete_file: {
      description:
        "Delete one or more files or directories in the workspace. Use ONLY if the user explicitly asks to delete files/directories.",
      block: null,
    },
    search_code: {
      description:
        "Search for a text pattern or regex across the entire codebase WITHOUT reading full files. Highly efficient.",
      block: null,
    },
  };

  return tools.map((toolInstance) => {
    const rule = TOOL_RULES[toolInstance.name];
    if (!rule) return toolInstance;

    if (rule.description) toolInstance.description = rule.description;

    if (rule.block && !guardedToolInvokes.has(toolInstance)) {
      const original = toolInstance.invoke.bind(toolInstance);
      toolInstance.invoke = async (input, config) => {
        const cmd =
          input?.command ?? input?.cmd ?? Object.values(input ?? {})[0] ?? "";
        // The block patterns are anchored to the start of a command
        // (e.g. /^\s*cat /), so a chained command like "ls && cat secret.txt"
        // would slip through if tested as one string. Split on shell
        // chaining/piping operators and check each segment individually.
        const segments = String(cmd).split(/&&|\|\||;|\|/);
        const blocked = segments.some((segment) =>
          rule.block.patterns.some((p) => p.test(segment)),
        );
        if (blocked) return { error: rule.block.message };
        return original(input, config);
      };
      guardedToolInvokes.add(toolInstance);
    }

    return toolInstance;
  });
}

const SYSTEM_PROMPT = `
You are Orion, an elite React+Vite frontend engineer embedded inside Taksha — an AI code generation platform. Build exactly what the user asks — nothing more, nothing less.

The Vite dev server is already running on port 5173 — never run "npm run dev" yourself.

=== EXECUTION RULES (MANDATORY) ===
- **Attached File Context**: If the user has attached file content inside their prompt marked with "=== ATTACHED FILE CONTEXT ===", you do NOT need to invoke the \`read_file\` tool to inspect those files. Treat them as already read and proceed directly to planning/writing code.
- **First action must be a tool call**: For every build, fix, debug, game, UI, or code request, your first assistant action MUST be a tool call — submit_plan for non-trivial work, or list_files/search_code/read_file for investigation. Do not write prose before at least one tool call.
- **Silent execution**: DO NOT narrate your plan in prose, announce what you are about to do, or describe steps outside of the submit_plan tool call. Jump straight to tool calls.
- **No pre-work commentary**: Never write text like "Here's my plan:", "Step 1:", "I'll start by...", "Let me...", or "Here's what I'll build" before invoking tools. The plan goes into submit_plan, not into chat text.
- **Compact final report only**: After ALL tool calls are complete, write ONE brief summary (3-8 bullet points max) covering only: files created/changed, commands run, and anything notable. No code blocks in the report unless directly asked.
- **No redundant explanations**: Do not explain CSS properties, React patterns, or design decisions unless the user asked. Just implement.
- **Grounded edits only**: Do not guess file names, APIs, components, or package scripts. Use search_code/read_file first, then edit only files you have located or inspected.
- **Verify claims**: Only say a command passed, a file changed, or a bug was fixed after the corresponding tool result confirms it. If verification could not run, say that briefly in the final report.
- **Limit tool loops**: Prefer one batched create_file/update_file call for related edits and one verification command at the end. Do not repeatedly call the same tool with the same input.
- **No Endless Search Loops**: If a file search or read fails (e.g., returns 0 matches or file not found), do not repeat the exact same search or slightly altered searches in a loop. Instead, try listing the workspace files using \`list_files\` to find the correct file names, search for broader/different keywords (like "route", "Link", "App", "menu"), or check parent/layout components. If you still cannot find the file or component after 3 distinct search/read attempts, stop and ask the user for clarification.

=== PLANNING (MANDATORY FOR NON-TRIVIAL TASKS) ===
${planningSkill}

=== FINDING → PATCHING WORKFLOW ===
To locate then fix something:
1. search_code with filesOnly=true to get candidate files cheaply.
2. search_code with fileGlob set to the chosen file to get the exact line and its context.
3. patch_file using that context as oldStr — no read_file needed in between!
Only fall back to read_file if patch_file reports oldStr not found or ambiguous.
This keeps the "search → patch" loop at 2 API calls total.
(For non-trivial tasks, submit_plan still comes first — the search → patch loop happens inside a planned step, not instead of one.)

=== WORKFLOW RULES ===
${codegenSkill}

=== DESIGN GUIDELINES ===
${frontendDesign}

=== TOOL USAGE GUIDELINES ===
${toolInfoSkill}
`;

const hasMistralKey = Boolean(process.env.MISTRALAI_API_KEY?.trim());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorPayload = (error) =>
  error?.response?.data || error?.cause?.response?.data || null;

const getErrorStatus = (error) =>
  error?.status || error?.response?.status || error?.cause?.status || null;

const isRateLimitError = (error) => {
  const payload = getErrorPayload(error);
  const payloadError = payload?.error || {};
  const code = payload?.code || payloadError?.code || error?.code || "";
  const statusText = payload?.status || payloadError?.status || "";
  const message = [
    error?.message,
    payload?.message,
    payloadError?.message,
    payload?.error,
    statusText,
    code,
  ].filter(Boolean).join(" ");

  return (
    getErrorStatus(error) === 429 ||
    String(code) === "1300" ||
    String(statusText).toUpperCase() === "RESOURCE_EXHAUSTED" ||
    payload?.type === "rate_limited" ||
    /rate limit|rate_limited|too many requests|quota|resource exhausted|exceeded|insufficient quota|billing|credits/i.test(message)
  );
};

const getRetryAfterMs = (error, fallbackMs) => {
  const headers = error?.response?.headers || error?.cause?.response?.headers || {};
  const retryAfter = headers["retry-after"] || headers["Retry-After"];
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.max(fallbackMs, retryAfterSeconds * 1000);
  }
  return fallbackMs;
};

const MAX_RATE_LIMIT_WAIT_MS = 30 * 60 * 1000; // 30 minutes of total backoff before giving up

const MODEL_SAFETY = {
  codestral: {
    baseIntervalMs: 1_500,
    maxIntervalMs: 20_000,
    maxRetryDelayMs: 90_000,
    callTimeoutMs: 60_000,
  },
  mistralLarge: {
    baseIntervalMs: 1_500,
    maxIntervalMs: 20_000,
    maxRetryDelayMs: 90_000,
    callTimeoutMs: 110_000,
  },
};

// Per-model adaptive state. currentIntervalMs grows every time we get rate
// limited (queue slows itself down automatically) and decays back toward
// baseIntervalMs after a run of clean successes.
const modelSafetyState = new Map();
const wrappedRunnables = new WeakSet();

let rateLimitListener = null;
// Lets the route handler subscribe to progress events instead of the
// request just silently taking longer with no feedback.
export const onRateLimitEvent = (listener) => {
  rateLimitListener = typeof listener === "function" ? listener : null;
};

const getSafetyState = (modelId) => {
  if (!modelSafetyState.has(modelId)) {
    const safety = MODEL_SAFETY[modelId] || MODEL_SAFETY.codestral;
    modelSafetyState.set(modelId, {
      chain: Promise.resolve(),
      lastStartedAt: 0,
      currentIntervalMs: safety.baseIntervalMs,
      consecutiveSuccesses: 0,
    });
  }
  return modelSafetyState.get(modelId);
};

const recordSuccess = (modelId, safety) => {
  const state = getSafetyState(modelId);
  state.consecutiveSuccesses += 1;
  if (state.consecutiveSuccesses >= 5 && state.currentIntervalMs > safety.baseIntervalMs) {
    state.currentIntervalMs = Math.max(
      safety.baseIntervalMs,
      Math.floor(state.currentIntervalMs * 0.8)
    );
    state.consecutiveSuccesses = 0;
  }
};

const recordRateLimit = (modelId, safety) => {
  const state = getSafetyState(modelId);
  state.consecutiveSuccesses = 0;
  state.currentIntervalMs = Math.min(
    safety.maxIntervalMs,
    Math.round(state.currentIntervalMs * 1.6)
  );
};

const isModelTimeoutError = (error) =>
  error?.code === "MODEL_CALL_TIMEOUT" ||
  error?.message === "MODEL_CALL_TIMEOUT";

const withModelCallTimeout = (modelId, timeoutMs, operation) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error("MODEL_CALL_TIMEOUT");
      error.code = "MODEL_CALL_TIMEOUT";
      error.modelId = modelId;
      error.timeoutMs = timeoutMs;
      reject(error);
    }, timeoutMs);

    operation()
      .then(resolve, reject)
      .finally(() => clearTimeout(timeoutId));
  });

// Exponential backoff with jitter, capped at safety.maxRetryDelayMs, honoring
// a Retry-After header if the provider sent one.
const computeBackoffDelay = (error, attempt, safety) => {
  const exponential = Math.min(
    safety.maxRetryDelayMs,
    1_000 * 2 ** Math.min(attempt, 10)
  );
  const jitter = Math.floor(Math.random() * 1_000);
  const fallback = exponential + jitter;
  return getRetryAfterMs(error, fallback);
};

const throwPersistentRateLimit = (modelId, waitedMs) => {
  const error = new Error(
    `Still being rate-limited by the AI provider after ${Math.round(waitedMs / 1000)}s of backoff. This is unusual — check your Mistral account for a billing/quota issue rather than a normal transient limit.`
  );
  error.code = "PERSISTENT_RATE_LIMIT";
  error.modelId = modelId;
  error.waitedMs = waitedMs;
  throw error;
};

const runWithModelSafety = async (modelId, operation) => {
  const safety = MODEL_SAFETY[modelId] || MODEL_SAFETY.codestral;
  const state = getSafetyState(modelId);

  const run = state.chain.then(async () => {
    const waitMs = Math.max(0, state.currentIntervalMs - (Date.now() - state.lastStartedAt));
    if (waitMs > 0) await sleep(waitMs);
    state.lastStartedAt = Date.now();

    let attempt = 0;
    let totalWaitedMs = 0;

    // No attempt cap — only a total-time cap. A rate limit is retried
    // forever (slowing down as it goes) until MAX_RATE_LIMIT_WAIT_MS.
    while (true) {
      try {
        const result = await withModelCallTimeout(modelId, safety.callTimeoutMs, operation);
        recordSuccess(modelId, safety);
        return result;
      } catch (error) {
        if (isModelTimeoutError(error) || !isRateLimitError(error)) {
          throw error; // real error — never retried here, surfaces immediately
        }

        recordRateLimit(modelId, safety);
        const delayMs = computeBackoffDelay(error, attempt, safety);

        if (totalWaitedMs + delayMs > MAX_RATE_LIMIT_WAIT_MS) {
          throwPersistentRateLimit(modelId, totalWaitedMs);
        }

        console.warn(
          `[ModelSafety] ${modelId} rate limited (attempt ${attempt + 1}); waiting ${delayMs}ms (interval now ${state.currentIntervalMs}ms)`
        );
        rateLimitListener?.({
          modelId,
          attempt: attempt + 1,
          waitedMs: totalWaitedMs,
          delayMs,
          willWaitUntilMs: Date.now() + delayMs,
        });

        await sleep(delayMs);
        totalWaitedMs += delayMs;
        attempt += 1;
      }
    }
  });

  state.chain = run.catch(() => {});
  return run;
};

const streamWithModelSafety = async function* (modelId, operation) {
  const safety = MODEL_SAFETY[modelId] || MODEL_SAFETY.codestral;
  const state = getSafetyState(modelId);

  let releaseSlot = () => {};
  const previous = state.chain.catch(() => {});
  state.chain = previous.then(() => new Promise((resolve) => {
    releaseSlot = resolve;
  }));

  await previous;

  try {
    const waitMs = Math.max(0, state.currentIntervalMs - (Date.now() - state.lastStartedAt));
    if (waitMs > 0) await sleep(waitMs);
    state.lastStartedAt = Date.now();

    let attempt = 0;
    let totalWaitedMs = 0;

    while (true) {
      let yieldedAnyChunk = false;
      try {
        const stream = await withModelCallTimeout(modelId, safety.callTimeoutMs, operation);
        for await (const chunk of stream) {
          yieldedAnyChunk = true;
          yield chunk;
        }
        recordSuccess(modelId, safety);
        return;
      } catch (error) {
        // If output already started streaming, this isn't a clean
        // "hadn't started" rate limit — retrying could duplicate/garble
        // partial output, so surface it instead of retrying.
        if (yieldedAnyChunk || isModelTimeoutError(error) || !isRateLimitError(error)) {
          throw error;
        }

        recordRateLimit(modelId, safety);
        const delayMs = computeBackoffDelay(error, attempt, safety);

        if (totalWaitedMs + delayMs > MAX_RATE_LIMIT_WAIT_MS) {
          throwPersistentRateLimit(modelId, totalWaitedMs);
        }

        console.warn(
          `[ModelSafety] ${modelId} stream rate limited (attempt ${attempt + 1}); waiting ${delayMs}ms (interval now ${state.currentIntervalMs}ms)`
        );
        rateLimitListener?.({
          modelId,
          attempt: attempt + 1,
          waitedMs: totalWaitedMs,
          delayMs,
          willWaitUntilMs: Date.now() + delayMs,
        });

        await sleep(delayMs);
        totalWaitedMs += delayMs;
        attempt += 1;
      }
    }
  } finally {
    releaseSlot();
  }
};

const applyModelSafety = (model, modelId) => {
  if (!model || wrappedRunnables.has(model)) return model;

  if (typeof model.invoke === "function") {
    const originalInvoke = model.invoke.bind(model);
    model.invoke = (...args) =>
      runWithModelSafety(modelId, () => originalInvoke(...args));
  }

  for (const methodName of ["stream", "streamEvents"]) {
    if (typeof model[methodName] !== "function") continue;
    const originalStream = model[methodName].bind(model);
    model[methodName] = (...args) =>
      streamWithModelSafety(modelId, () => originalStream(...args));
  }

  wrappedRunnables.add(model);
  return model;
};

// Mistral Large (via Mistral) is the ONLY supported model for the main coding
// agent. There used to be a whole fallback chain across Mistral/Google/Cohere
// variants; that's gone now — one model, one code path, no silent fallback
// to a weaker/different provider mid-task.
const MISTRAL_LARGE_MODEL = {
  id: "mistralLarge",
  provider: "mistral",
  label: "Mistral Large",
  configured: () => hasMistralKey,
  create: () => applyModelSafety(new ChatMistralAI({
    model: "mistral-large-latest",
    apiKey: process.env.MISTRALAI_API_KEY?.trim(),
    maxRetries: 0,
    timeout: 180_000,
  }), "mistralLarge"),
};

const agentCache = new Map();
// Per-agent-instance task state, keyed the same way as agentCache. Each
// entry's planSubmitted flag is reset right before every invoke/stream call
// so a fresh task always has to plan again, but tool closures (bound once at
// agent-creation time) keep working off the same live object reference.
const taskStateCache = new Map();

export const createAgentForModel = () => {
  const modelDef = MISTRAL_LARGE_MODEL;
  if (!modelDef.configured()) {
    const error = new Error("No configured coding agent model is available. Set MISTRALAI_API_KEY.");
    error.code = "AI_PROVIDER_NOT_CONFIGURED";
    throw error;
  }

  if (!agentCache.has(modelDef.id)) {
    const taskState = { planSubmitted: false, plan: null, planRevisions: 0 };
    taskStateCache.set(modelDef.id, taskState);

    const guardedTools = applyPlanGate(
      applyGuards([
        listFiles,
        readFile,
        createFile,
        updateFile,
        patchFile,
        deleteFile,
        executeCommand,
        getViteRuntimeErrors,
        searchCode,
      ]),
      taskState
    );

    agentCache.set(modelDef.id, createReactAgent({
      llm: modelDef.create(),
      tools: [createSubmitPlanTool(taskState), ...guardedTools],
      prompt: SYSTEM_PROMPT,
    }));
  }

  return {
    agent: agentCache.get(modelDef.id),
    taskState: taskStateCache.get(modelDef.id),
    model: {
      id: modelDef.id,
      label: modelDef.label,
      provider: modelDef.provider,
      requestedModelId: null,
      fallback: false,
    },
  };
};

export const getAgentInstance = () => createAgentForModel().agent;

// Reset the plan gate at the start of every new task so each run has to plan
// again — otherwise a plan submitted on a previous task would silently
// authorize writes on an unrelated later task.
const resetTaskState = () => {
  const { taskState } = createAgentForModel();
  taskState.planSubmitted = false;
  taskState.plan = null;
  taskState.planRevisions = 0;
};

const agent = {
  streamEvents: (...args) => {
    resetTaskState();
    return getAgentInstance().streamEvents(...args);
  },
  stream: (...args) => {
    resetTaskState();
    return getAgentInstance().stream(...args);
  },
  invoke: (...args) => {
    resetTaskState();
    return getAgentInstance().invoke(...args);
  },
};

const APP_AGENT_PROMPT = `You are Clio, an elite developer co-pilot. Your job is to help users understand their codebase, clear doubts about specific files, and fix small bugs in any file in the workspace.

=== CO-PILOT INSTRUCTIONS ===
- Speak like a direct, senior engineer helping a teammate: clear, concise, no filler.
- Use tools (read_file, search_code, update_file, patch_file) to search, inspect, edit, or patch files.
- Keep edits surgical. Prefer patch_file for changes under 20 lines.
- Always check files first before updating them.
- If a file doesn't exist, say so. Don't invent content.
- Do not explain your reasoning or CSS/React details unless asked.
- **For multi-file or multi-step fixes**: think through the file-level order of changes before touching anything (which file first, what depends on what) — you don't need a formal plan tool for this, just don't start editing before you know the full shape of the change.
- **No Endless Loops**: If a file search or read fails (e.g., returns 0 matches or file not found), do not repeat the search in a loop. Try listing files or searching for broader/different keywords (like "route", "Link", "App", "menu") to locate them. If you cannot find the files after 3 distinct search/read attempts, stop and ask the user for clarification.

=== FINDING → PATCHING WORKFLOW ===
To locate then fix something:
1. Call search_code with filesOnly=true to get candidate files cheaply.
2. Call search_code with fileGlob set to the chosen file to get the exact line and its context.
3. Call patch_file using that context as oldStr — no read_file needed in between!
Only fall back to read_file if patch_file reports oldStr not found or ambiguous.`;

let appAgentInstance = null;

export const getAppAgent = () => {
  if (!appAgentInstance) {
    appAgentInstance = createReactAgent({
      llm: getAppModel(),
      tools: applyGuards([
        readFile,
        updateFile,
        patchFile,
        searchCode,
      ]),
      prompt: APP_AGENT_PROMPT,
    });
  }

  return appAgentInstance;
};

export const appAgent = {
  streamEvents: (...args) => getAppAgent().streamEvents(...args),
  stream: (...args) => getAppAgent().stream(...args),
  invoke: (...args) => getAppAgent().invoke(...args),
};

export default agent;