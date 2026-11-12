// copilot.service.js
// Runs Clio (the editor copilot) and the project-title helper.

import { randomUUID } from "crypto";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CHAT_STORES } from "../models/chatStores.js";
import { recordAiUsage } from "./credit.service.js";
import { loadChatHistory, openSessionForTurn, serializeSession, touchSession } from "./chatSession.service.js";
import { buildMemory, scheduleMemoryUpdate } from "./memory.service.js";
import {
  INTERNAL_TAGS,
  contentToText,
  getClioGraph,
  getFastModel,
  getModelInfo,
  issueSandboxCredential,
  releaseSandbox,
  truncate,
  usageOf,
} from "../agent/index.js";

const HISTORY_MESSAGES = 10;
const RUN_TIMEOUT_MS = 3 * 60 * 1000;
const clioStore = CHAT_STORES.copilot;

const addUsage = (total, output) => {
  const usage = usageOf(output);
  if (!usage) return;
  total.promptTokens += usage.promptTokens;
  total.completionTokens += usage.completionTokens;
  total.totalTokens += usage.totalTokens;
};

/**
 * Runs one Clio turn in a chat session. Streams text through onText and
 * returns the final answer. Chat history is loaded before the new message
 * is saved, so the prompt is never in the context twice. A failed turn is
 * saved as an error reply, which never goes back into the context.
 */
export async function runCopilot({ user, authToken, projectId, sandboxId, sessionId, prompt, activeFile, activeFileContent, onSession, onText }) {
  const file = String(activeFile || "").replace(/^\/+/, "");
  const { session, isNew } = await openSessionForTurn("copilot", { userId: user.id, projectId, sessionId, prompt });
  onSession?.({ ...serializeSession(session), isNew });

  const turnId = randomUUID();
  const message = (fields) => clioStore.Message.create({
    userId: user.id, projectId, sessionId: session._id, file, requestId: `clio:${turnId}`, ...fields,
  });

  const [history, memory] = await Promise.all([
    loadChatHistory(clioStore, session, HISTORY_MESSAGES),
    buildMemory(clioStore, session, { historyWindow: HISTORY_MESSAGES }),
  ]);
  await message({ role: "user", content: prompt });
  await touchSession(clioStore, session);

  try {
    const { answer, usage } = await streamClio({ user, authToken, projectId, sandboxId, session, turnId, prompt, history, memory, file, activeFileContent, onText });
    await message({ role: "assistant", content: answer, tokenUsage: usage });
    await touchSession(clioStore, session);
    scheduleMemoryUpdate({ agentType: "copilot", userId: user.id, projectId, sessionId: String(session._id), authToken });
    return answer;
  } catch (err) {
    await message({ role: "assistant", content: `Error: ${err.message}`, status: "error" })
      .catch((saveErr) => console.error("[Copilot] Failed to save error reply:", saveErr.message));
    throw err;
  }
}

async function streamClio({ user, authToken, projectId, sandboxId, session, turnId, prompt, history, memory, file, activeFileContent, onText }) {
  // One sandbox token per Clio turn, released when the turn ends.
  const credentialKey = `clio:${turnId}`;
  await issueSandboxCredential(credentialKey, { userToken: authToken, sandboxId });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error("Clio timed out after 3 minutes.")), RUN_TIMEOUT_MS);
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const model = getModelInfo();
  let answer = "";

  try {
    const events = getClioGraph().streamEvents(
      { prompt, history, memory, activeFile: file, activeFileContent: activeFileContent || "" },
      { version: "v2", signal: abort.signal, configurable: { sandboxId, credentialKey } },
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
    await releaseSandbox(credentialKey);
    if (usage.totalTokens > 0) {
      recordAiUsage({
        authToken, userId: user.id, company: model.provider, modelId: model.modelId, agentType: "copilot",
        projectId, chatId: String(session._id), requestId: `clio:${turnId}`, ...usage,
      }).catch((err) => console.error("[Copilot] Failed to record usage:", err.message));
    }
  }

  return { answer: answer || "I could not produce an answer. Please try again.", usage };
}

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
