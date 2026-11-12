// chatStores.js
// The models of each agent. Orion and Clio share the schema shapes but
// never a collection.

import mongoose from "mongoose";
import { BadRequestError } from "faultkit";
import ChatMessage from "./ChatMessage.model.js";
import CopilotChatMessage from "./CopilotChatMessage.model.js";
import { buildProjectMemorySchema, buildSessionSchema } from "./chatSchemas.js";

export const OrionChatSession = mongoose.model("OrionChatSession", buildSessionSchema());
export const ClioChatSession = mongoose.model("ClioChatSession", buildSessionSchema());
export const OrionProjectMemory = mongoose.model("OrionProjectMemory", buildProjectMemorySchema());
export const ClioProjectMemory = mongoose.model("ClioProjectMemory", buildProjectMemorySchema());

export const CHAT_STORES = {
  codingAgent: { agentType: "codingAgent", Message: ChatMessage, Session: OrionChatSession, Memory: OrionProjectMemory },
  copilot: { agentType: "copilot", Message: CopilotChatMessage, Session: ClioChatSession, Memory: ClioProjectMemory },
};

export const getStore = (agentType) => {
  const store = CHAT_STORES[agentType];
  if (!store) throw new BadRequestError("agentType must be codingAgent or copilot");
  return store;
};
