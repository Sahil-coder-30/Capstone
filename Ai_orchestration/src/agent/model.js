// model.js
// Model singletons for all Orion nodes.
//
//   getAppModel()  — main working model. Reasoning is enabled so the UI can
//                    stream the model's thinking.
//   getFastModel() — same provider, reasoning off. Used for classification,
//                    structured extraction and other internal calls where
//                    thinking tokens only add latency and cost.
//
// Both are wrapped with modelSafety (pacing, rate-limit backoff, timeouts).

import path from "path";
import { fileURLToPath } from "url";
import { ChatMistralAI } from "@langchain/mistralai";
import dotenv from "dotenv";
import { applyModelSafety } from "./modelSafety.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Codestral works on the Mistral free tier. mistral-large needs a paid plan.
export const DEFAULT_MODEL = "codestral-latest";

/** Mistral key from env. Returns "" when missing. */
export const readApiKey = () =>
  (process.env.MISTRALAI_API_KEY || process.env.MISTRAL_API_KEY)?.trim() || "";

export const getApiKey = () => {
  const key = readApiKey();
  if (!key) {
    const error = new Error("No AI provider key configured. Set MISTRALAI_API_KEY.");
    error.code = "AI_PROVIDER_NOT_CONFIGURED";
    throw error;
  }
  return key;
};

const getModelId = () => process.env.ORION_MODEL?.trim() || DEFAULT_MODEL;
const getFastModelId = () => process.env.ORION_FAST_MODEL?.trim() || getModelId();

let appModel = null;
let fastModel = null;

// Call timeouts are enforced by applyModelSafety (ChatMistralAI has no timeout option).
export const getAppModel = () => {
  if (appModel) return appModel;
  const raw = new ChatMistralAI({
    model: getModelId(),
    apiKey: getApiKey(),
    temperature: 0.1,
    maxRetries: 0,
  });
  appModel = applyModelSafety(raw, "orion-main");
  return appModel;
};

export const getFastModel = () => {
  if (fastModel) return fastModel;
  const raw = new ChatMistralAI({
    model: getFastModelId(),
    apiKey: getApiKey(),
    temperature: 0,
    maxRetries: 0,
  });
  fastModel = applyModelSafety(raw, "orion-fast");
  return fastModel;
};

/** Test-only: replace both model singletons (offline tests use a scripted model). */
export const setModelsForTesting = (app, fast = app) => {
  appModel = app;
  fastModel = fast;
};

export const getAppModelInfo = () => ({
  id: getModelId(),
  modelId: getModelId(),
  label: `${getModelId()} (Mistral)`,
  provider: "mistral",
});

export const hasModelKey = () => Boolean(readApiKey());
