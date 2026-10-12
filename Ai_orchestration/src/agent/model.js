// model.js
// Singleton OpenRouter model for all Orion nodes.
// All nodes import getAppModel() from HERE — never from code.agent.js.
// code.agent.js calls initModelWithSafety() once on startup to inject
// the safety-wrapped instance.

import path from "path";
import { fileURLToPath } from "url";
import { ChatOpenRouter } from "@langchain/openrouter";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

let _instance = null;
let _info = null;

/**
 * Called once by code.agent.js after the safety wrapper is applied.
 * Subsequent calls to getAppModel() return the wrapped instance.
 */
export const initModelWithSafety = (wrappedInstance, info) => {
  _instance = wrappedInstance;
  _info = info;
};

/**
 * Returns the singleton model instance.
 * If not yet initialised by code.agent.js (e.g., in tests or direct node
 * calls), creates a raw (un-wrapped) instance as a fallback.
 */
export const getAppModel = () => {
  if (_instance) return _instance;

  const openRouterApiKey = (process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER)?.trim();
  if (!openRouterApiKey) {
    const error = new Error("No AI provider key configured. Set OPENROUTER_API_KEY.");
    error.code = "AI_PROVIDER_NOT_CONFIGURED";
    throw error;
  }

  _instance = new ChatOpenRouter({
    model: "openai/gpt-6-luna",
    apiKey: openRouterApiKey,
    temperature: 0.1,
    maxRetries: 0,
    timeout: 180_000,
  });

  _info = {
    id: "gpt6Luna",
    modelId: "openai/gpt-6-luna",
    label: "GPT-6 Luna (OpenRouter)",
    provider: "openrouter",
  };

  return _instance;
};

export const getAppModelInfo = () => {
  getAppModel();
  return _info;
};
