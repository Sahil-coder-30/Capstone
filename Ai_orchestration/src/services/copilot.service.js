// copilot.service.js
// Runs Clio (the editor copilot) and the project-title helper.

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import CopilotChatMessage from "../models/CopilotChatMessage.model.js";
import { recordAiUsage } from "./credit.service.js";
import {
  INTERNAL_TAGS,
  contentToText,
  getClioGraph,
  getFastModel,
  getModelInfo,
  truncate,
  usageOf,
} from "../agent/index.js";

const HISTORY_MESSAGES = 6;
const RUN_TIMEOUT_MS = 3 * 60 * 1000;

const addUsage = (total, output) => {
  const usage = usageOf(output);
  if (!usage) return;
  total.promptTokens += usage.promptTokens;
  total.completionTokens += usage.completionTokens;
  total.totalTokens += usage.totalTokens;
};

const loadHistory = async (chatKey, userId) => {
  const docs = await CopilotChatMessage.find({
    projectId: chatKey,
    deletionStatus: { $ne: "trash" },
    $or: [{ userId }, { userId: { $exists: false } }],
  })
    .sort({ timestamp: -1 })
    .limit(HISTORY_MESSAGES)
    .lean();
  return docs.reverse().map((d) => ({ role: d.role, content: truncate(d.content, 3_000) }));
};

/**
 * Runs one Clio turn. Streams text through onText and returns the final
 * answer. Chat history is loaded before the new message is saved, so the
 * prompt is never in the context twice.
 */
export async function runCopilot({ user, authToken, projectId, sandboxId, prompt, activeFile, activeFileContent, onText }) {
  const file = String(activeFile || "").replace(/^\/+/, "");
  const chatKey = file ? `${projectId}:${file}` : projectId;

  const history = await loadHistory(chatKey, user.id);
  await CopilotChatMessage.create({ projectId: chatKey, userId: user.id, role: "user", content: prompt, file });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error("Clio timed out after 3 minutes.")), RUN_TIMEOUT_MS);
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const model = getModelInfo();
  let answer = "";

  try {
    const events = getClioGraph().streamEvents(
      { prompt, history, activeFile: file, activeFileContent: activeFileContent || "" },
      { version: "v2", signal: abort.signal, configurable: { sandboxId } },
    );
    for await (const event of events) {
      if (event.event === "on_chat_model_stream" && !(event.tags || []).some((t) => INTERNAL_TAGS.includes(t))) {
        const text = contentToText(event.data?.chunk?.content);
        if (text) onText(text);
      } else if (event.event === "on_chat_model_end") {
        addUsage(usage, event.data?.output);
      } else if (event.event === "on_chain_end" && event.name === "clio") {
        answer = event.data?.output?.answer || "";
      }
    }
  } catch (err) {
    throw abort.signal.aborted ? abort.signal.reason : err;
  } finally {
    clearTimeout(timer);
    if (usage.totalTokens > 0) {
      recordAiUsage({ authToken, userId: user.id, company: model.provider, modelId: model.modelId, agentType: "copilot", projectId, ...usage })
        .catch((err) => console.error("[Copilot] Failed to record usage:", err.message));
    }
  }

  answer ||= "I could not produce an answer. Please try again.";
  await CopilotChatMessage.create({ projectId: chatKey, userId: user.id, role: "assistant", content: answer, file, tokenUsage: usage });
  return answer;
}

/** Saves an error reply so the chat history shows what happened. */
export const saveCopilotError = ({ user, projectId, activeFile, message }) => {
  const file = String(activeFile || "").replace(/^\/+/, "");
  return CopilotChatMessage.create({
    projectId: file ? `${projectId}:${file}` : projectId,
    userId: user.id,
    role: "assistant",
    content: `Error: ${message}`,
    file,
  }).catch((err) => console.error("[Copilot] Failed to save error reply:", err.message));
};

const TITLE_PROMPT = `Generate a concise project title from the user's prompt. Output ONLY a JSON object: {"title": "<title>"}

Rules: 3-6 words, Title Case, a noun phrase that describes the result ("Todo App with Auth", not "Build a todo app"). Never use "generate", "build", "create" or "make".
If the prompt is vague, return {"title": "Untitled Project"}.`;

/** Short project title for a new project's first prompt. */
export async function generateTitle({ user, authToken, prompt }) {
  const reply = await getFastModel().invoke([new SystemMessage(TITLE_PROMPT), new HumanMessage(truncate(prompt, 2_000))]);

  const usage = usageOf(reply);
  if (usage?.totalTokens) {
    const model = getModelInfo();
    recordAiUsage({ authToken, userId: user.id, company: model.provider, modelId: model.modelId, agentType: "title", ...usage })
      .catch((err) => console.error("[Title] Failed to record usage:", err.message));
  }

  try {
    const text = contentToText(reply.content);
    const title = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).title;
    return typeof title === "string" && title.trim() ? title.trim().slice(0, 80) : "Untitled Project";
  } catch {
    return "Untitled Project";
  }
}
