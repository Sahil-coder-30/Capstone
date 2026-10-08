// model.js
// Singleton Mistral model for all Orion nodes.
// All nodes import getAppModel() from HERE — never from code.agent.js.
// code.agent.js calls initModelWithSafety() once on startup to inject
// the safety-wrapped instance.

import path from "path";
import { fileURLToPath } from "url";
import { ChatMistralAI } from "@langchain/mistralai";
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

  const mistralApiKey = process.env.MISTRALAI_API_KEY?.trim();
  if (!mistralApiKey) {
    const error = new Error("No AI provider key configured. Set MISTRALAI_API_KEY.");
    error.code = "AI_PROVIDER_NOT_CONFIGURED";
    throw error;
  }

  _instance = new ChatMistralAI({
    model: "mistral-large-latest",
    apiKey: mistralApiKey,
    maxRetries: 0,
    timeout: 180_000,
  });

  _info = {
    id: "mistralLarge",
    modelId: "mistral-large-latest",
    label: "Mistral Large",
    provider: "mistral",
  };

  return _instance;
};

export const getAppModelInfo = () => {
  getAppModel();
  return _info;
};
