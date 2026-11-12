// memory.service.js
// The memory each agent (Orion, Clio) keeps per user and project:
//   - project notes, shared by all chats of that agent in the project
//   - agent memory: summaries of its last 20 other chats in the project
//   - the running summary of the current chat (context compaction)
//
// buildMemory() turns these into background notes for a new turn.
// scheduleMemoryUpdate() runs the memory agent after a turn, in the
// background, one job at a time per agent, user and project.

import { CHAT_STORES } from "../models/chatStores.js";
import { recordAiUsage } from "./credit.service.js";
import { contextText, isContextMessage } from "./chatSession.service.js";
import { getModelInfo, runMemoryAgent, truncate } from "../agent/index.js";

const AGENT_NAMES = { codingAgent: "Orion", copilot: "Clio" };
const AGENT_MEMORY_CHATS = 20;
const MAX_TURNS_PER_JOB = 20;
const LIMITS = { notes: 2_500, chats: 4_000, perChat: 400, summary: 1_500 };

const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : "");

/**
 * Background notes for a turn in `session`. The chat summary is added only
 * when the chat has more messages than the history window, so turns the
 * model already sees are not repeated.
 */
export async function buildMemory(store, session, { historyWindow }) {
  const owner = { userId: session.userId, projectId: session.projectId };
  const [notes, others, messageCount] = await Promise.all([
    store.Memory.findOne(owner),
    store.Session.find({ ...owner, deletionStatus: "active", _id: { $ne: session._id }, summary: { $ne: "" } })
      .sort({ lastMessageAt: -1 })
      .limit(AGENT_MEMORY_CHATS)
      .select("title summary lastMessageAt")
      .lean(),
    session.summary ? store.Message.countDocuments({ ...owner, sessionId: session._id, deletionStatus: "active" }) : 0,
  ]);

  const parts = [];
  if (notes?.content) parts.push(`Project notes:\n${truncate(notes.content, LIMITS.notes)}`);
  if (others.length) {
    const perChat = Math.min(LIMITS.perChat, Math.floor(LIMITS.chats / others.length));
    const lines = others.map((s) => `- ${s.title} (${day(s.lastMessageAt)}): ${truncate(s.summary.replace(/\s+/g, " "), perChat)}`);
    parts.push(`Your earlier chats in this project, newest first:\n${lines.join("\n")}`);
  }
  if (session.summary && messageCount > historyWindow) {
    parts.push(`This chat so far (summary of turns older than the recent messages):\n${truncate(session.summary, LIMITS.summary)}`);
  }
  return parts.join("\n\n");
}

/** One memory job: fold the chat's new turns into its summary, title and the project notes. */
export async function updateMemory({ agentType, userId, projectId, sessionId, authToken }) {
  const store = CHAT_STORES[agentType];
  const session = await store.Session.findOne({ _id: sessionId, userId, projectId });
  if (!session) return;

  // Self-healing: a missed job is picked up here, since this reads every turn after summaryThrough.
  const turns = (await store.Message.find({
    userId,
    projectId,
    sessionId: session._id,
    deletionStatus: "active",
    status: { $ne: "error" },
    ...(session.summaryThrough && { timestamp: { $gt: session.summaryThrough } }),
  })
    .sort({ timestamp: 1 })
    .limit(MAX_TURNS_PER_JOB)
    .select("role content status timestamp")
    .lean()).filter(isContextMessage);
  if (turns.length === 0) return;

  const notes = await store.Memory.findOne({ userId, projectId });
  const { update, usage } = await runMemoryAgent({
    agentName: AGENT_NAMES[agentType],
    oldSummary: session.summary,
    oldNotes: notes?.content || "",
    turns: turns.map((t) => ({ role: t.role, content: contextText(t.content) })),
  });
  const through = turns.at(-1).timestamp;

  // The first summary also names the chat, unless the user renamed it meanwhile.
  const isFirst = !session.summaryThrough;
  const set = { summary: { $literal: update.sessionSummary }, summaryThrough: { $literal: through } };
  if (isFirst && update.title) set.title = { $cond: ["$titleLocked", "$title", { $literal: update.title }] };
  await store.Session.updateOne(
    { _id: session._id, userId, summaryThrough: session.summaryThrough ?? null }, // skip if another job got here first
    [{ $set: set }],
  );

  if (update.projectNotes) {
    try {
      await store.Memory.updateOne(
        { userId, projectId, version: notes?.version ?? 0 },
        { $set: { content: update.projectNotes }, $inc: { version: 1 } },
        { upsert: !notes },
      );
    } catch (err) {
      if (err?.code !== 11000) throw err; // another job created the notes first; the next job merges
    }
  }

  if (usage.totalTokens > 0) {
    const model = getModelInfo();
    await recordAiUsage({
      authToken,
      userId,
      company: model.provider,
      modelId: model.fastModelId,
      agentType: "memory",
      projectId,
      chatId: String(session._id),
      requestId: `memory:${agentType}:${session._id}:${new Date(through).getTime()}`,
      ...usage,
    });
  }
}

// shortcut: in-process queue, lost on restart. The next turn of the chat picks up
// the missed turns (summaryThrough). Move to a durable queue when AI runs more than one replica.
const queues = new Map();

/** Runs a memory job in the background. Jobs for one agent, user and project run one at a time. */
export function scheduleMemoryUpdate(job) {
  const key = `${job.agentType}:${job.userId}:${job.projectId}`;
  const next = (queues.get(key) || Promise.resolve())
    .then(() => updateMemory(job))
    .catch((err) => console.error(`[Memory] Job for ${key} failed:`, err.message))
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    });
  queues.set(key, next);
  return next;
}

/** Waits for every queued memory job (tests, graceful shutdown). */
export const waitForMemoryJobs = () => Promise.all([...queues.values()]);
