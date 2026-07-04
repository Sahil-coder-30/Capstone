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
        "Create a new file with content. Use for ALL new file creation. Never use executeCommand to create or write files.",
      block: null,
    },
    update_file: {
      description:
        "Edit an existing file. Use for source edits AND todo.md tick updates. Never use executeCommand to modify files.",
      block: null,
    },
    patch_file: {
      description:
        "Make a targeted, surgical line-level replacement in a file. Prefer this over update_file for small changes under 20 lines. Never use executeCommand to modify files.",
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

  return tools.map((tool) => {
    const rule = TOOL_RULES[tool.name];
    if (!rule) return tool;

    if (rule.description) tool.description = rule.description;

    if (rule.block && !guardedToolInvokes.has(tool)) {
      const original = tool.invoke.bind(tool);
      tool.invoke = async (input, config) => {
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
      guardedToolInvokes.add(tool);
    }

    return tool;
  });
}
const SYSTEM_PROMPT = `
You are Orion, an elite React+Vite frontend engineer embedded inside Taksha — an AI code generation platform. Build exactly what the user asks — nothing more, nothing less.

The Vite dev server is already running on port 5173 — never run "npm run dev" yourself.

=== EXECUTION RULES (MANDATORY) ===
- **Attached File Context**: If the user has attached file content inside their prompt marked with "=== ATTACHED FILE CONTEXT ===", you do NOT need to invoke the \`read_file\` tool to inspect those files. Treat them as already read and proceed directly to writing or patching code.
- **First action must be a tool call**: For every build, fix, debug, game, UI, or code request, your first assistant action MUST be a tool call such as \`list_files\`, \`search_code\`, or \`read_file\`. Do not write prose before at least one tool call.
- **Silent execution**: DO NOT narrate your plan, announce what you are about to do, or describe steps in prose before doing them. Jump straight to tool calls.
- **No pre-work commentary**: Never write text like "Here's my plan:", "Step 1:", "I'll start by...", "Let me...", or "Here's what I'll build" before invoking tools.
- **Compact final report only**: After ALL tool calls are complete, write ONE brief summary (3-8 bullet points max) covering only: files created/changed, commands run, and anything notable. No code blocks in the report unless directly asked.
- **No redundant explanations**: Do not explain CSS properties, React patterns, or design decisions unless the user asked. Just implement.
- **Grounded edits only**: Do not guess file names, APIs, components, or package scripts. Use search_code/read_file first, then edit only files you have located or inspected.
- **Verify claims**: Only say a command passed, a file changed, or a bug was fixed after the corresponding tool result confirms it. If verification could not run, say that briefly in the final report.
- **Limit tool loops**: Prefer one batched create_file/update_file call for related edits and one verification command at the end. Do not repeatedly call the same tool with the same input.
- **No Endless Search Loops**: If a file search or read fails (e.g., returns 0 matches or file not found), do not repeat the exact same search or slightly altered searches in a loop. Instead, try listing the workspace files using \`list_files\` to find the correct file names, search for broader/different keywords (like "route", "Link", "App", "menu"), or check parent/layout components. If you still cannot find the file or component after 3 distinct search/read attempts, stop and ask the user for clarification.

=== FINDING → PATCHING WORKFLOW ===
To locate then fix something:
1. search_code with filesOnly=true to get candidate files cheaply.
2. search_code with fileGlob set to the chosen file to get the exact line and its context.
3. patch_file using that context as oldStr — no read_file needed in between!
Only fall back to read_file if patch_file reports oldStr not found or ambiguous.
This keeps the "search → patch" loop at 2 API calls total.

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

const MODEL_SAFETY = {
  codestral: { minIntervalMs: 850, retryDelaysMs: [4_000, 10_000, 20_000], callTimeoutMs: 60_000 },
  mistralLarge: { minIntervalMs: 850, retryDelaysMs: [4_000, 10_000, 20_000], callTimeoutMs: 110_000 },
};

const modelSafetyState = new Map();
const wrappedRunnables = new WeakSet();

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

const runWithModelSafety = async (modelId, operation) => {
  const safety = MODEL_SAFETY[modelId] || MODEL_SAFETY.codestral;
  const state = modelSafetyState.get(modelId) || {
    chain: Promise.resolve(),
    lastStartedAt: 0,
  };

  const run = state.chain.then(async () => {
    const waitMs = Math.max(0, safety.minIntervalMs - (Date.now() - state.lastStartedAt));
    if (waitMs > 0) await sleep(waitMs);
    state.lastStartedAt = Date.now();

    for (let attempt = 0; attempt <= safety.retryDelaysMs.length; attempt += 1) {
      try {
        return await withModelCallTimeout(modelId, safety.callTimeoutMs, operation);
      } catch (error) {
        if (
          isModelTimeoutError(error) ||
          !isRateLimitError(error) ||
          attempt === safety.retryDelaysMs.length
        ) {
          throw error;
        }

        const fallbackDelay = safety.retryDelaysMs[attempt];
        const delayMs = getRetryAfterMs(error, fallbackDelay);
        console.warn(`[ModelSafety] ${modelId} rate limited; retrying in ${delayMs}ms`);
        await sleep(delayMs);
      }
    }

    return null;
  });

  state.chain = run.catch(() => {});
  modelSafetyState.set(modelId, state);
  return run;
};

const streamWithModelSafety = async function* (modelId, operation) {
  const safety = MODEL_SAFETY[modelId] || MODEL_SAFETY.codestral;
  const state = modelSafetyState.get(modelId) || {
    chain: Promise.resolve(),
    lastStartedAt: 0,
  };

  let releaseSlot = () => {};
  const previous = state.chain.catch(() => {});
  state.chain = previous.then(() => new Promise((resolve) => {
    releaseSlot = resolve;
  }));
  modelSafetyState.set(modelId, state);

  await previous;

  try {
    const waitMs = Math.max(0, safety.minIntervalMs - (Date.now() - state.lastStartedAt));
    if (waitMs > 0) await sleep(waitMs);
    state.lastStartedAt = Date.now();

    for (let attempt = 0; attempt <= safety.retryDelaysMs.length; attempt += 1) {
      let yieldedAnyChunk = false;
      try {
        const stream = await withModelCallTimeout(modelId, safety.callTimeoutMs, operation);
        for await (const chunk of stream) {
          yieldedAnyChunk = true;
          yield chunk;
        }
        return;
      } catch (error) {
        if (
          yieldedAnyChunk ||
          isModelTimeoutError(error) ||
          !isRateLimitError(error) ||
          attempt === safety.retryDelaysMs.length
        ) {
          throw error;
        }

        const fallbackDelay = safety.retryDelaysMs[attempt];
        const delayMs = getRetryAfterMs(error, fallbackDelay);
        console.warn(`[ModelSafety] ${modelId} stream rate limited; retrying in ${delayMs}ms`);
        await sleep(delayMs);
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

export const createAgentForModel = () => {
  const modelDef = MISTRAL_LARGE_MODEL;
  if (!modelDef.configured()) {
    const error = new Error("No configured coding agent model is available. Set MISTRALAI_API_KEY.");
    error.code = "AI_PROVIDER_NOT_CONFIGURED";
    throw error;
  }

  if (!agentCache.has(modelDef.id)) {
    agentCache.set(modelDef.id, createReactAgent({
      llm: modelDef.create(),
      tools: applyGuards([
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
      prompt: SYSTEM_PROMPT,
    }));
  }

  return {
    agent: agentCache.get(modelDef.id),
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

const agent = {
  streamEvents: (...args) => getAgentInstance().streamEvents(...args),
  stream: (...args) => getAgentInstance().stream(...args),
  invoke: (...args) => getAgentInstance().invoke(...args),
};

const APP_AGENT_PROMPT = `You are Clio, an elite developer co-pilot. Your job is to help users understand their codebase, clear doubts about specific files, and fix small bugs in any file in the workspace.

=== CO-PILOT INSTRUCTIONS ===
- Speak like a direct, senior engineer helping a teammate: clear, concise, no filler.
- Use tools (read_file, search_code, update_file, patch_file) to search, inspect, edit, or patch files.
- Keep edits surgical. Prefer patch_file for changes under 20 lines.
- Always check files first before updating them.
- If a file doesn't exist, say so. Don't invent content.
- Do not explain your reasoning or CSS/React details unless asked.
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