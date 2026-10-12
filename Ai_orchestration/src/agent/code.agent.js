// code.agent.js
// Orion — Multi-agent LangGraph orchestrator for Taksha coding assistant.
//
// Graph flow (v2):
//   START → router
//     → general → [finalizer|planner]
//     → planner → interrupt (plan review) → critic → [coder|planner]
//     → coder (loops per step) → tester → [finalizer|debugger]
//     → debugger (loops, hash-checked) → tester
//     → compactor → (any node)
//     → finalizer → END
//
// Each node lives in ./nodes/<name>.node.js
// Shared model singleton in ./model.js

// Polyfill: extend short AbortSignal timeouts to avoid premature cancellation
if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = function (ms) {
    if (ms === 30000) return originalTimeout.call(this, 180000);
    return originalTimeout.call(this, ms);
  };
}

import path from "path";
import { fileURLToPath } from "url";
import { ChatOpenRouter } from "@langchain/openrouter";
import {
  StateGraph,
  Annotation,
  END,
  START,
  MemorySaver,
} from "@langchain/langgraph";
import dotenv from "dotenv";

// Model singleton — must be imported & initialised BEFORE node imports
import { initModelWithSafety, getAppModel, getAppModelInfo } from "./model.js";
export { getAppModel, getAppModelInfo };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ============================================================================
// MODEL SAFETY — Rate-limit backoff & timeout protection
// Must be defined BEFORE initModelWithSafety() is called below.
// ============================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorPayload = (error) =>
  error?.response?.data || error?.cause?.response?.data || null;

const getErrorStatus = (error) =>
  error?.status || error?.response?.status || error?.cause?.status || null;

const getRetryAfterMs = (error, fallbackMs) => {
  const headers = error?.response?.headers || error?.cause?.response?.headers || {};
  const retryAfter = headers["retry-after"] || headers["Retry-After"];
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.max(fallbackMs, retryAfterSeconds * 1000);
  }
  return fallbackMs;
};

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

const isModelTimeoutError = (error) =>
  error?.code === "MODEL_CALL_TIMEOUT" || error?.message === "MODEL_CALL_TIMEOUT";

const MAX_RATE_LIMIT_WAIT_MS = 30 * 60 * 1000;

const MODEL_SAFETY = {
  gpt6Luna: {
    baseIntervalMs: 1_200,
    maxIntervalMs: 20_000,
    maxRetryDelayMs: 90_000,
    callTimeoutMs: 110_000,
  },
  mistralLarge: {
    baseIntervalMs: 1_500,
    maxIntervalMs: 20_000,
    maxRetryDelayMs: 90_000,
    callTimeoutMs: 110_000,
  },
};

const modelSafetyState = new Map();
const wrappedRunnables = new WeakSet();

let rateLimitListener = null;
export const onRateLimitEvent = (listener) => {
  rateLimitListener = typeof listener === "function" ? listener : null;
};

const getSafetyState = (modelId) => {
  if (!modelSafetyState.has(modelId)) {
    const safety = MODEL_SAFETY[modelId] || MODEL_SAFETY.gpt6Luna;
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
    state.currentIntervalMs = Math.max(safety.baseIntervalMs, Math.floor(state.currentIntervalMs * 0.8));
    state.consecutiveSuccesses = 0;
  }
};

const recordRateLimit = (modelId, safety) => {
  const state = getSafetyState(modelId);
  state.consecutiveSuccesses = 0;
  state.currentIntervalMs = Math.min(safety.maxIntervalMs, Math.round(state.currentIntervalMs * 1.6));
};

const withModelCallTimeout = (modelId, timeoutMs, operation) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error("MODEL_CALL_TIMEOUT");
      error.code = "MODEL_CALL_TIMEOUT";
      error.modelId = modelId;
      error.timeoutMs = timeoutMs;
      reject(error);
    }, timeoutMs);
    operation().then(resolve, reject).finally(() => clearTimeout(timeoutId));
  });

const computeBackoffDelay = (error, attempt, safety) => {
  const exponential = Math.min(safety.maxRetryDelayMs, 1_000 * 2 ** Math.min(attempt, 10));
  const jitter = Math.floor(Math.random() * 1_000);
  return getRetryAfterMs(error, exponential + jitter);
};

const throwPersistentRateLimit = (modelId, waitedMs) => {
  const error = new Error(
    `Still being rate-limited by AI provider after ${Math.round(waitedMs / 1000)}s of backoff.`
  );
  error.code = "PERSISTENT_RATE_LIMIT";
  error.modelId = modelId;
  error.waitedMs = waitedMs;
  throw error;
};

const runWithModelSafety = async (modelId, operation) => {
  const safety = MODEL_SAFETY[modelId] || MODEL_SAFETY.gpt6Luna;
  const state = getSafetyState(modelId);

  const run = state.chain.then(async () => {
    const waitMs = Math.max(0, state.currentIntervalMs - (Date.now() - state.lastStartedAt));
    if (waitMs > 0) await sleep(waitMs);
    state.lastStartedAt = Date.now();

    let attempt = 0;
    let totalWaitedMs = 0;

    while (true) {
      try {
        const result = await withModelCallTimeout(modelId, safety.callTimeoutMs, operation);
        recordSuccess(modelId, safety);
        return result;
      } catch (error) {
        if (isModelTimeoutError(error) || !isRateLimitError(error)) throw error;
        recordRateLimit(modelId, safety);
        const delayMs = computeBackoffDelay(error, attempt, safety);
        if (totalWaitedMs + delayMs > MAX_RATE_LIMIT_WAIT_MS) throwPersistentRateLimit(modelId, totalWaitedMs);
        console.warn(`[ModelSafety] ${modelId} rate limited (attempt ${attempt + 1}); waiting ${delayMs}ms`);
        rateLimitListener?.({ modelId, attempt: attempt + 1, waitedMs: totalWaitedMs, delayMs, willWaitUntilMs: Date.now() + delayMs });
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
  const safety = MODEL_SAFETY[modelId] || MODEL_SAFETY.gpt6Luna;
  const state = getSafetyState(modelId);

  let releaseSlot = () => {};
  const previous = state.chain.catch(() => {});
  state.chain = previous.then(() => new Promise((resolve) => { releaseSlot = resolve; }));

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
        if (yieldedAnyChunk || isModelTimeoutError(error) || !isRateLimitError(error)) throw error;
        recordRateLimit(modelId, safety);
        const delayMs = computeBackoffDelay(error, attempt, safety);
        if (totalWaitedMs + delayMs > MAX_RATE_LIMIT_WAIT_MS) throwPersistentRateLimit(modelId, totalWaitedMs);
        await sleep(delayMs);
        totalWaitedMs += delayMs;
        attempt += 1;
      }
    }
  } finally {
    releaseSlot();
  }
};

export const applyModelSafety = (model, modelId) => {
  if (!model || wrappedRunnables.has(model)) return model;

  if (typeof model.invoke === "function") {
    const originalInvoke = model.invoke.bind(model);
    model.invoke = (...args) => runWithModelSafety(modelId, () => originalInvoke(...args));
  }

  for (const methodName of ["stream", "streamEvents"]) {
    if (typeof model[methodName] !== "function") continue;
    const originalStream = model[methodName].bind(model);
    model[methodName] = (...args) => streamWithModelSafety(modelId, () => originalStream(...args));
  }

  wrappedRunnables.add(model);
  return model;
};

// ============================================================================
// INITIALISE MODEL — wrap with safety and push to model.js singleton
// This runs at module load time, before any node file uses getAppModel().
// ============================================================================
{
  const openRouterApiKey = (process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER)?.trim();
  if (openRouterApiKey) {
    try {
      const rawModel = new ChatOpenRouter({
        model: "openai/gpt-6-luna",
        apiKey: openRouterApiKey,
        temperature: 0.1,
        maxRetries: 0,
        timeout: 180_000,
      });
      const wrappedModel = applyModelSafety(rawModel, "gpt6Luna");
      initModelWithSafety(wrappedModel, {
        id: "gpt6Luna",
        modelId: "openai/gpt-6-luna",
        label: "GPT-6 Luna (OpenRouter)",
        provider: "openrouter",
      });
    } catch (e) {
      console.warn("[ModelInit] Failed to initialise model at startup:", e.message);
    }
  }
}

// Node imports — AFTER model is initialised above
import { routerNode, routerEdge } from "./nodes/router.node.js";
import { generalNode, generalEdge } from "./nodes/general.node.js";
import { plannerNode, plannerEdge } from "./nodes/planner.node.js";
import { criticNode, criticEdge } from "./nodes/critic.node.js";
import { coderNode, coderEdge } from "./nodes/coder.node.js";
import { testerNode, testerEdge } from "./nodes/tester.node.js";
import { debuggerNode, debuggerEdge } from "./nodes/debugger.node.js";
import { compactorNode, compactorEdge } from "./nodes/compactor.node.js";
import { finalizerNode } from "./nodes/finalizer.node.js";


// ============================================================================
// STATE ANNOTATION — v2
// ============================================================================

export const AgentStateAnnotation = Annotation.Root({
  // ── Core task ─────────────────────────────────────────────────────────────
  messages: Annotation({
    reducer: (x, y) => (y ? x.concat(y) : x),
    default: () => [],
  }),
  task: Annotation({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),

  // ── Router ────────────────────────────────────────────────────────────────
  intent: Annotation({
    reducer: (x, y) => y ?? x ?? "coding",
    default: () => "coding",
  }),
  taskSubType: Annotation({
    reducer: (x, y) => y ?? x ?? "new_feature",
    default: () => "new_feature",
  }),
  routingHistory: Annotation({
    reducer: (x, y) => (y === null ? [] : y ? [...(x || []), ...(Array.isArray(y) ? y : [y])] : x),
    default: () => [],
  }),

  // ── Plan (Planner output) ────────────────────────────────────────────────
  plan: Annotation({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),
  planApproved: Annotation({
    reducer: (x, y) => y ?? x ?? false,
    default: () => false,
  }),
  planRevisions: Annotation({
    reducer: (x, y) => (y === null ? 0 : y ?? (x || 0)),
    default: () => 0,
  }),
  currentStep: Annotation({
    reducer: (x, y) => y ?? x ?? 0,
    default: () => 0,
  }),
  activeFiles: Annotation({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
  }),

  // ── Critic ────────────────────────────────────────────────────────────────
  criticPass: Annotation({
    reducer: (x, y) => y ?? x ?? false,
    default: () => false,
  }),
  criticFeedback: Annotation({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),

  // ── Tester ────────────────────────────────────────────────────────────────
  buildLog: Annotation({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),
  testResults: Annotation({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),
  flaggedFiles: Annotation({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
  }),

  // ── Debugger ─────────────────────────────────────────────────────────────
  attemptedFixes: Annotation({
    reducer: (x, y) => (y === null ? [] : y ? [...(x || []), ...(Array.isArray(y) ? y : [y])] : x),
    default: () => [],
  }),
  retryCount: Annotation({
    reducer: (x, y) => y ?? x ?? 0,
    default: () => 0,
  }),
  maxRetries: Annotation({
    reducer: (x, y) => y ?? x ?? 3,
    default: () => 3,
  }),

  // ── Compactor ─────────────────────────────────────────────────────────────
  tokenCount: Annotation({
    reducer: (x, y) => y ?? x ?? 0,
    default: () => 0,
  }),
  returnToNode: Annotation({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),

  // ── Finalizer ────────────────────────────────────────────────────────────
  diffSummary: Annotation({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),

  // ── Shared metadata (preserved for socket.js compatibility) ───────────────
  escalated: Annotation({
    reducer: (x, y) => y ?? x ?? false,
    default: () => false,
  }),
  currentSituation: Annotation({
    reducer: (x, y) => y ?? x ?? "Graph initialized.",
    default: () => "Graph initialized.",
  }),
  lastNodeInvoked: Annotation({
    reducer: (x, y) => y ?? x ?? "start",
    default: () => "start",
  }),
  taskStatus: Annotation({
    reducer: (x, y) => y ?? x ?? "routing",
    default: () => "routing",
  }),
});

// ============================================================================
// GRAPH CONSTRUCTION — v2 (9 nodes)
// ============================================================================

const memoryCheckpointer = new MemorySaver();

export const buildAgentGraph = () => {
  const workflow = new StateGraph(AgentStateAnnotation)
    // ── Nodes ──────────────────────────────────────────────────────────────
    .addNode("router", routerNode)
    .addNode("general", generalNode)
    .addNode("planner", plannerNode)
    .addNode("critic", criticNode)
    .addNode("coder", coderNode)
    .addNode("tester", testerNode)
    .addNode("debugger", debuggerNode)
    .addNode("compactor", compactorNode)
    .addNode("finalizer", finalizerNode)

    // ── Entry ─────────────────────────────────────────────────────────────
    .addEdge(START, "router")

    // ── Router: general | planner | finalizer | compactor ─────────────────
    .addConditionalEdges("router", routerEdge, {
      general: "general",
      planner: "planner",
      finalizer: "finalizer",
      compactor: "compactor",
    })

    // ── General: reply done → END | coding pivot → planner ─────────────────
    .addConditionalEdges("general", generalEdge, {
      [END]: END,
      planner: "planner",
      compactor: "compactor",
    })

    // ── Planner: re-plan loop until plan approved ──────────────────────────
    .addConditionalEdges("planner", plannerEdge, {
      critic: "critic",
      planner: "planner",
      compactor: "compactor",
    })

    // ── Critic: pass → coder | fail → planner ─────────────────────────────
    .addConditionalEdges("critic", criticEdge, {
      coder: "coder",
      planner: "planner",
      compactor: "compactor",
    })

    // ── Coder: loop per step → coder | all done → tester ──────────────────
    .addConditionalEdges("coder", coderEdge, {
      coder: "coder",
      tester: "tester",
      compactor: "compactor",
    })

    // ── Tester: pass → finalizer | fail+retries → debugger | escalate → finalizer
    .addConditionalEdges("tester", testerEdge, {
      finalizer: "finalizer",
      debugger: "debugger",
      compactor: "compactor",
    })

    // ── Debugger: fix → tester | escalate → finalizer ─────────────────────
    .addConditionalEdges("debugger", debuggerEdge, {
      tester: "tester",
      finalizer: "finalizer",
      compactor: "compactor",
    })

    // ── Compactor: routes back to returnToNode ─────────────────────────────
    .addConditionalEdges("compactor", compactorEdge, {
      router: "router",
      planner: "planner",
      critic: "critic",
      coder: "coder",
      tester: "tester",
      debugger: "debugger",
      finalizer: "finalizer",
    })

    // ── Finalizer: always end ─────────────────────────────────────────────
    .addEdge("finalizer", END);

  return workflow.compile({
    checkpointer: memoryCheckpointer,
    interruptBefore: ["critic"],
  });
};


// ============================================================================
// AGENT FACTORY
// ============================================================================

const hasOpenRouterKey = Boolean((process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER)?.trim());
let compiledGraphInstance = null;

export const createAgentForModel = () => {
  if (!hasOpenRouterKey) {
    const error = new Error("No configured coding agent model available. Set OPENROUTER_API_KEY.");
    error.code = "AI_PROVIDER_NOT_CONFIGURED";
    throw error;
  }

  const compiledGraphInstance = buildAgentGraph();

  const ensureConfig = (config = {}) => ({
    ...config,
    configurable: {
      thread_id:
        config?.configurable?.thread_id ||
        config?.configurable?.projectId ||
        "default-thread",
      ...(config?.configurable || {}),
    },
  });

  return {
    agent: compiledGraphInstance,
    streamEvents: (input, config) => compiledGraphInstance.streamEvents(input, ensureConfig(config)),
    stream: (input, config) => compiledGraphInstance.stream(input, ensureConfig(config)),
    invoke: (input, config) => compiledGraphInstance.invoke(input, ensureConfig(config)),
    taskState: { planSubmitted: true, plan: null, planRevisions: 0 },
    model: {
      id: "gpt6Luna",
      label: "GPT-6 Luna (OpenRouter)",
      provider: "openrouter",
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

export default agent;