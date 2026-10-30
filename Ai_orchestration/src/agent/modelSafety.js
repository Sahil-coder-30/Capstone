// modelSafety.js
// Rate-limit backoff, per-model call pacing and call timeouts for every
// model instance Orion uses. Moved out of code.agent.js so model.js can wrap
// its instances without a circular import.

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

export const isRateLimitError = (error) => {
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
    /rate limit|rate_limited|too many requests|quota|resource exhausted|insufficient quota/i.test(message)
  );
};

const isAuthError = (error) =>
  getErrorStatus(error) === 401 || /user not found|invalid api key|unauthorized/i.test(error?.message || "");

const toProviderKeyError = (error) => {
  const wrapped = new Error("AI provider key is invalid or expired. Check MISTRALAI_API_KEY.");
  wrapped.code = "AI_PROVIDER_AUTH_FAILED";
  wrapped.cause = error;
  return wrapped;
};

const isModelTimeoutError = (error) =>
  error?.code === "MODEL_CALL_TIMEOUT" || error?.message === "MODEL_CALL_TIMEOUT";

const MAX_RATE_LIMIT_WAIT_MS = 30 * 60 * 1000;

const DEFAULT_SAFETY = {
  baseIntervalMs: 1_200,
  maxIntervalMs: 20_000,
  maxRetryDelayMs: 90_000,
  // Reasoning models can think for a while before the first token.
  callTimeoutMs: 180_000,
};

const modelSafetyState = new Map();
const wrappedRunnables = new WeakSet();
const rateLimitListeners = new Set();

/** Subscribe to rate-limit backoff events. Returns an unsubscribe function. */
export const onRateLimitEvent = (listener) => {
  if (typeof listener !== "function") return () => {};
  rateLimitListeners.add(listener);
  return () => rateLimitListeners.delete(listener);
};

const emitRateLimit = (event) => {
  for (const listener of rateLimitListeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[ModelSafety] rate limit listener failed:", err.message);
    }
  }
};

const getSafetyState = (modelId) => {
  if (!modelSafetyState.has(modelId)) {
    modelSafetyState.set(modelId, {
      chain: Promise.resolve(),
      lastStartedAt: 0,
      currentIntervalMs: DEFAULT_SAFETY.baseIntervalMs,
      consecutiveSuccesses: 0,
    });
  }
  return modelSafetyState.get(modelId);
};

const recordSuccess = (modelId) => {
  const state = getSafetyState(modelId);
  state.consecutiveSuccesses += 1;
  if (state.consecutiveSuccesses >= 5 && state.currentIntervalMs > DEFAULT_SAFETY.baseIntervalMs) {
    state.currentIntervalMs = Math.max(DEFAULT_SAFETY.baseIntervalMs, Math.floor(state.currentIntervalMs * 0.8));
    state.consecutiveSuccesses = 0;
  }
};

const recordRateLimit = (modelId) => {
  const state = getSafetyState(modelId);
  state.consecutiveSuccesses = 0;
  state.currentIntervalMs = Math.min(DEFAULT_SAFETY.maxIntervalMs, Math.round(state.currentIntervalMs * 1.6));
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

const computeBackoffDelay = (error, attempt) => {
  const exponential = Math.min(DEFAULT_SAFETY.maxRetryDelayMs, 1_000 * 2 ** Math.min(attempt, 10));
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

const waitForSlot = async (state) => {
  const waitMs = Math.max(0, state.currentIntervalMs - (Date.now() - state.lastStartedAt));
  if (waitMs > 0) await sleep(waitMs);
  state.lastStartedAt = Date.now();
};

const runWithModelSafety = async (modelId, operation) => {
  const state = getSafetyState(modelId);

  // Only the pacing wait is serialized. Holding the chain for the whole call
  // would make parallel runs from different users wait on each other.
  const slot = state.chain.then(() => waitForSlot(state));
  state.chain = slot.catch(() => {});
  await slot;

  let attempt = 0;
  let totalWaitedMs = 0;
  while (true) {
    try {
      const result = await withModelCallTimeout(modelId, DEFAULT_SAFETY.callTimeoutMs, operation);
      recordSuccess(modelId);
      return result;
    } catch (error) {
      if (isAuthError(error)) throw toProviderKeyError(error);
      if (isModelTimeoutError(error) || !isRateLimitError(error)) throw error;
      recordRateLimit(modelId);
      const delayMs = computeBackoffDelay(error, attempt);
      if (totalWaitedMs + delayMs > MAX_RATE_LIMIT_WAIT_MS) throwPersistentRateLimit(modelId, totalWaitedMs);
      console.warn(`[ModelSafety] ${modelId} rate limited (attempt ${attempt + 1}); waiting ${delayMs}ms`);
      emitRateLimit({ modelId, attempt: attempt + 1, waitedMs: totalWaitedMs, delayMs });
      await sleep(delayMs);
      totalWaitedMs += delayMs;
      attempt += 1;
    }
  }
};

const streamWithModelSafety = async function* (modelId, operation) {
  const state = getSafetyState(modelId);
  const slot = state.chain.then(() => waitForSlot(state));
  state.chain = slot.catch(() => {});
  await slot;

  let attempt = 0;
  let totalWaitedMs = 0;
  while (true) {
    let yieldedAnyChunk = false;
    try {
      const stream = await withModelCallTimeout(modelId, DEFAULT_SAFETY.callTimeoutMs, operation);
      for await (const chunk of stream) {
        yieldedAnyChunk = true;
        yield chunk;
      }
      recordSuccess(modelId);
      return;
    } catch (error) {
      if (yieldedAnyChunk || isModelTimeoutError(error) || !isRateLimitError(error)) throw error;
      recordRateLimit(modelId);
      const delayMs = computeBackoffDelay(error, attempt);
      if (totalWaitedMs + delayMs > MAX_RATE_LIMIT_WAIT_MS) throwPersistentRateLimit(modelId, totalWaitedMs);
      emitRateLimit({ modelId, attempt: attempt + 1, waitedMs: totalWaitedMs, delayMs });
      await sleep(delayMs);
      totalWaitedMs += delayMs;
      attempt += 1;
    }
  }
};

/**
 * Wraps a chat model instance in place so invoke/stream calls get pacing,
 * rate-limit backoff and a per-call timeout. Bound runnables created later
 * (bindTools, withStructuredOutput) call back into these wrapped methods.
 */
export const applyModelSafety = (model, modelId) => {
  if (!model || wrappedRunnables.has(model)) return model;

  if (typeof model.invoke === "function") {
    const originalInvoke = model.invoke.bind(model);
    model.invoke = (...args) => runWithModelSafety(modelId, () => originalInvoke(...args));
  }

  if (typeof model.stream === "function") {
    const originalStream = model.stream.bind(model);
    model.stream = (...args) => streamWithModelSafety(modelId, () => originalStream(...args));
  }

  wrappedRunnables.add(model);
  return model;
};
