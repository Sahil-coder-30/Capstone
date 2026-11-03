// model.js
// The only place that knows which LLM the service uses: NVIDIA's hosted
// models (build.nvidia.com) through their OpenAI-compatible API.
//
//   getMainModel() - the working model for planning, coding and answers
//   getFastModel() - classification, structured extraction, reports
//
// Both are singletons wrapped by the rate limiter.

import { ChatOpenAI } from "@langchain/openai";
import { withRateLimit } from "./rateLimiter.js";

export const PROVIDER = "nvidia";
const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
// Both checked live on 2026-11-03: about 3-4s per call, tool calling and
// structured output work. Run `npm run list:models` to see what else exists.
const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
const DEFAULT_FAST_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

const env = (name) => process.env[name]?.trim() || "";
const apiKey = () => env("NVIDIA_API_KEY");
const mainModelId = () => env("NVIDIA_MODEL") || DEFAULT_MODEL;
const fastModelId = () => env("NVIDIA_FAST_MODEL") || DEFAULT_FAST_MODEL;

export const hasModelKey = () => Boolean(apiKey());

const notConfigured = () =>
  Object.assign(new Error("No AI provider key configured. Set NVIDIA_API_KEY."), { code: "AI_PROVIDER_NOT_CONFIGURED" });

const createModel = (modelId, temperature) => {
  if (!hasModelKey()) throw notConfigured();
  const model = new ChatOpenAI({
    model: modelId,
    apiKey: apiKey(),
    temperature,
    maxRetries: 0, // retries are handled by the rate limiter
    configuration: { baseURL: env("NVIDIA_BASE_URL") || DEFAULT_BASE_URL },
  });
  return withRateLimit(model, modelId);
};

let mainModel = null;
let fastModel = null;

export const getMainModel = () => (mainModel ??= createModel(mainModelId(), 0.1));
export const getFastModel = () => (fastModel ??= createModel(fastModelId(), 0));

/** Metadata sent to the UI and to Payments for billing. */
export const getModelInfo = () => ({
  provider: PROVIDER,
  modelId: mainModelId(),
  label: `${mainModelId()} (NVIDIA)`,
});

/** Test-only: replace both models with a scripted one. */
export const setModelsForTesting = (main, fast = main) => {
  mainModel = main;
  fastModel = fast;
};
