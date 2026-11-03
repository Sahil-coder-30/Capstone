// rateLimiter.js
// Protects every model call:
//   - pacing: calls to the same model start at least `intervalMs` apart
//   - backoff: a 429 from the provider is retried with exponential delay
//     (honours Retry-After) for up to MAX_TOTAL_WAIT_MS
//   - timeout: a single call can not hang longer than CALL_TIMEOUT_MS
//
// The model instance is wrapped in place, so runnables built from it later
// (bindTools, withStructuredOutput) go through the same protection.

const BASE_INTERVAL_MS = 500;
const MAX_INTERVAL_MS = 15_000;
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_TOTAL_WAIT_MS = 10 * 60 * 1000;
const CALL_TIMEOUT_MS = 180_000;

const listeners = new Set();
const pacing = new Map(); // modelId -> { chain, lastStartedAt, intervalMs, successes }
const wrapped = new WeakSet();

/** Subscribe to backoff events (used to tell the user why a run is waiting). */
export const onRateLimitEvent = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const emit = (event) => {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[RateLimiter] listener failed:", err.message);
    }
  }
};

const codedError = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

// Errors where retrying a node can not help. They end the whole run.
const FATAL_CODES = new Set(["AI_PROVIDER_AUTH_FAILED", "AI_PROVIDER_NOT_CONFIGURED", "PERSISTENT_RATE_LIMIT"]);
export const isFatalModelError = (error) => FATAL_CODES.has(error?.code);

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    }, { once: true });
  });

const statusOf = (error) => error?.status ?? error?.response?.status ?? error?.cause?.status ?? null;

const isRateLimit = (error) =>
  statusOf(error) === 429 || /rate.?limit|too many requests|resource exhausted/i.test(error?.message || "");

const isAuthFailure = (error) =>
  statusOf(error) === 401 || statusOf(error) === 403 || /invalid api key|unauthorized|authentication/i.test(error?.message || "");

const retryDelay = (error, attempt) => {
  const headers = error?.headers ?? error?.response?.headers ?? {};
  const retryAfterSec = Number(typeof headers.get === "function" ? headers.get("retry-after") : headers["retry-after"]);
  const exponential = Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** attempt) + Math.floor(Math.random() * 1_000);
  return Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? Math.max(exponential, retryAfterSec * 1_000) : exponential;
};

const stateFor = (modelId) => {
  if (!pacing.has(modelId)) {
    pacing.set(modelId, { chain: Promise.resolve(), lastStartedAt: 0, intervalMs: BASE_INTERVAL_MS, successes: 0 });
  }
  return pacing.get(modelId);
};

/** Waits for this model's next free start slot. Only the wait is serialized, not the call. */
const waitForSlot = async (state, signal) => {
  const slot = state.chain.then(async () => {
    const waitMs = Math.max(0, state.intervalMs - (Date.now() - state.lastStartedAt));
    if (waitMs > 0) await sleep(waitMs, signal);
    state.lastStartedAt = Date.now();
  });
  state.chain = slot.catch(() => {});
  await slot;
};

const onSuccess = (state) => {
  state.successes += 1;
  if (state.successes >= 5) {
    state.intervalMs = Math.max(BASE_INTERVAL_MS, Math.floor(state.intervalMs * 0.8));
    state.successes = 0;
  }
};

const onRateLimited = (state) => {
  state.successes = 0;
  state.intervalMs = Math.min(MAX_INTERVAL_MS, Math.round(state.intervalMs * 1.6));
};

const withTimeout = (operation) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(codedError("MODEL_CALL_TIMEOUT", "The AI model did not respond in time.")),
      CALL_TIMEOUT_MS,
    );
    operation().then(resolve, reject).finally(() => clearTimeout(timer));
  });

/** Runs one model call with pacing, timeout and rate-limit retries. */
const protectedCall = async (modelId, signal, operation) => {
  const state = stateFor(modelId);
  await waitForSlot(state, signal);

  let waitedMs = 0;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await withTimeout(operation);
      onSuccess(state);
      return result;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (isAuthFailure(error)) {
        throw codedError("AI_PROVIDER_AUTH_FAILED", "The NVIDIA API key is invalid or expired. Check NVIDIA_API_KEY.", { cause: error });
      }
      if (!isRateLimit(error)) throw error;

      onRateLimited(state);
      const delayMs = retryDelay(error, attempt);
      if (waitedMs + delayMs > MAX_TOTAL_WAIT_MS) {
        throw codedError("PERSISTENT_RATE_LIMIT", `Still rate-limited after ${Math.round(waitedMs / 1000)}s of backoff.`);
      }
      console.warn(`[RateLimiter] ${modelId} rate limited (attempt ${attempt + 1}), waiting ${delayMs}ms`);
      emit({ modelId, attempt: attempt + 1, delayMs });
      await sleep(delayMs, signal);
      waitedMs += delayMs;
    }
  }
};

/** Wraps `model.invoke` in place with pacing, timeout and backoff. */
export const withRateLimit = (model, modelId) => {
  if (wrapped.has(model)) return model;
  const invoke = model.invoke.bind(model);
  model.invoke = (input, options) => protectedCall(modelId, options?.signal, () => invoke(input, options));
  wrapped.add(model);
  return model;
};
