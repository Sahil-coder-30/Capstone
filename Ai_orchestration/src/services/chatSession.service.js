// chatSession.service.js
// Chat sessions for Orion and Clio: list, open, rename, trash, restore and
// the one-time move of pre-session messages into sessions.
//
// Every query starts with the verified userId. A session is never looked up
// by its id alone.

import { BadRequestError, NotFoundError } from "faultkit";
import { CHAT_STORES, getStore } from "../models/chatStores.js";
import { resolveOwnedSandbox } from "./sandboxOwnership.service.js";
import { truncate } from "../agent/index.js";

const PAGE_SIZE = 50;
const MAX_MESSAGES = 500;
const TITLE_MAX = 80;

const isObjectId = (id) => /^[a-f0-9]{24}$/i.test(String(id || ""));
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** First line of the first prompt, used until the memory agent names the chat. */
export const titleFromPrompt = (prompt) => {
  const line = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!line) return "New chat";
  return line.length > 60 ? `${line.slice(0, 57)}...` : line;
};

export const serializeSession = (s) => ({
  id: String(s._id),
  projectId: s.projectId,
  title: s.title,
  lastMessageAt: s.lastMessageAt,
  createdAt: s.createdAt,
});

export const serializeMessage = (m) => ({
  id: String(m._id),
  role: m.role,
  content: m.content,
  status: m.status || "ok",
  toolLogs: m.toolLogs || [],
  steps: m.steps || [],
  outcome: m.outcome || null,
  file: m.file || "",
  timestamp: m.timestamp,
});

// ── Legacy messages (saved before sessions existed) ─────────────────────────

// shortcut: remembered per process, so each replica re-checks once; fine while AI runs one replica.
const migrated = new Set();

/**
 * Moves a project's pre-session messages into "Earlier chat" sessions.
 * Rows without a userId are claimed only after the Sandbox service confirms
 * the caller owns the project.
 */
export async function migrateLegacyMessages(store, { userId, projectId, authToken }) {
  const key = `${store.agentType}:${userId}:${projectId}`;
  if (migrated.has(key)) return;
  const { Message, Session } = store;
  const isClio = store.agentType === "copilot";

  // Clio used to key chats as `${projectId}:${file}`.
  const legacy = {
    projectId: isClio ? { $regex: `^${escapeRegex(projectId)}(:|$)` } : projectId,
    sessionId: { $exists: false },
  };

  let done = true;
  if (await Message.exists({ ...legacy, userId: { $exists: false } })) {
    try {
      await resolveOwnedSandbox({ authToken, userId, projectId });
      await Message.updateMany({ ...legacy, userId: { $exists: false } }, { $set: { userId } });
    } catch (err) {
      done = false; // not the owner, or Sandbox is down: leave the rows alone and retry later
      console.warn(`[ChatSessions] Could not claim legacy ${store.agentType} messages for ${projectId}:`, err.message);
    }
  }

  const groups = await Message.aggregate([
    { $match: { ...legacy, userId } },
    {
      $group: {
        _id: isClio ? "$file" : null,
        active: { $sum: { $cond: [{ $eq: ["$deletionStatus", "trash"] }, 0, 1] } },
        first: { $min: "$timestamp" },
        last: { $max: "$timestamp" },
      },
    },
  ]);

  for (const group of groups) {
    const file = isClio && group._id ? String(group._id).split("/").pop() : "";
    const session = await Session.create({
      userId,
      projectId,
      title: file ? `Earlier chat · ${file}` : "Earlier chat",
      titleLocked: true,
      lastMessageAt: group.last || new Date(),
      // A chat whose messages were all deleted starts in the trash.
      deletionStatus: group.active > 0 ? "active" : "trash",
      deletedAt: group.active > 0 ? null : new Date(),
    });
    await Message.updateMany(
      { ...legacy, userId, ...(isClio && { file: group._id }) },
      { $set: { sessionId: session._id, projectId } },
    );
  }

  if (done) migrated.add(key);
}

// ── Sessions ────────────────────────────────────────────────────────────────

export async function findSession(store, { userId, sessionId, projectId, status = "active" }) {
  if (!isObjectId(sessionId)) throw new NotFoundError("Chat not found");
  const session = await store.Session.findOne({
    _id: sessionId,
    userId,
    ...(projectId && { projectId: String(projectId) }),
    deletionStatus: status,
  });
  if (!session) throw new NotFoundError("Chat not found");
  return session;
}

export async function listSessions(agentType, { userId, projectId, authToken, before }) {
  if (!projectId) throw new BadRequestError("projectId is required");
  const store = getStore(agentType);
  await migrateLegacyMessages(store, { userId, projectId: String(projectId), authToken });

  const filter = { userId, projectId: String(projectId), deletionStatus: "active" };
  if (before) {
    const cursor = new Date(before);
    if (Number.isNaN(cursor.getTime())) throw new BadRequestError("before must be a date");
    filter.lastMessageAt = { $lt: cursor };
  }
  const rows = await store.Session.find(filter).sort({ lastMessageAt: -1 }).limit(PAGE_SIZE + 1).lean();
  return { sessions: rows.slice(0, PAGE_SIZE).map(serializeSession), hasMore: rows.length > PAGE_SIZE };
}

export async function getSessionMessages(agentType, { userId, sessionId }) {
  const store = getStore(agentType);
  const session = await findSession(store, { userId, sessionId });
  const rows = await store.Message.find({
    userId,
    projectId: session.projectId,
    sessionId: session._id,
    deletionStatus: "active",
  })
    .sort({ timestamp: -1 })
    .limit(MAX_MESSAGES)
    .lean();
  return { session: serializeSession(session), messages: rows.reverse().map(serializeMessage) };
}

export async function renameSession(agentType, { userId, sessionId, title }) {
  const clean = String(title ?? "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length > TITLE_MAX) throw new BadRequestError(`title must be 1 to ${TITLE_MAX} characters`);
  const session = await findSession(getStore(agentType), { userId, sessionId });
  session.title = clean;
  session.titleLocked = true;
  await session.save();
  return serializeSession(session);
}

export async function trashSession(agentType, { userId, sessionId }) {
  const session = await findSession(getStore(agentType), { userId, sessionId });
  session.deletionStatus = "trash";
  session.deletedAt = new Date();
  await session.save();
}

export async function restoreSession(agentType, { userId, sessionId }) {
  const session = await findSession(getStore(agentType), { userId, sessionId, status: "trash" });
  session.deletionStatus = "active";
  session.deletedAt = null;
  await session.save();
  return serializeSession(session);
}

export async function deleteSessionForever(agentType, { userId, sessionId }) {
  const store = getStore(agentType);
  const session = await findSession(store, { userId, sessionId, status: "trash" });
  await store.Message.deleteMany({ userId, sessionId: session._id });
  await store.Session.deleteOne({ _id: session._id, userId });
}

/** Finds the chat a new turn belongs to, or starts a new one. */
export async function openSessionForTurn(agentType, { userId, projectId, sessionId, prompt }) {
  const store = getStore(agentType);
  if (sessionId) {
    const session = await findSession(store, { userId, projectId, sessionId });
    return { session, isNew: false };
  }
  const session = await store.Session.create({ userId, projectId: String(projectId), title: titleFromPrompt(prompt) });
  return { session, isNew: true };
}

const THINK_BLOCK = /<think>[\s\S]*?(<\/think>|$)/gi;
const ERROR_REPLY = /^Error( occurred during execution)?:/;

/**
 * The chat turns a model sees: only what the user wrote and each final
 * answer (the execution summary). Tool logs, steps, thinking and error
 * replies never go into the context.
 */
export async function loadChatHistory(store, session, limit) {
  const rows = await store.Message.find({
    userId: session.userId,
    projectId: session.projectId,
    sessionId: session._id,
    deletionStatus: "active",
    status: { $ne: "error" },
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select("role content")
    .lean();
  return rows
    .reverse()
    .filter((m) => !(m.role === "assistant" && ERROR_REPLY.test(m.content))) // legacy rows have no status
    .map((m) => ({ role: m.role, content: truncate(String(m.content).replace(THINK_BLOCK, "").trim(), 4_000) }))
    .filter((m) => m.content);
}

export const touchSession = (store, session) =>
  store.Session.updateOne({ _id: session._id, userId: session.userId }, { $set: { lastMessageAt: new Date() } });

// ── Trash (both agents) ─────────────────────────────────────────────────────

export async function listTrash(userId) {
  const out = { trashSessions: [], trashMessages: [] };
  for (const store of Object.values(CHAT_STORES)) {
    const [sessions, messages] = await Promise.all([
      store.Session.find({ userId, deletionStatus: "trash" }).sort({ deletedAt: -1 }).limit(200).lean(),
      store.Message.find({ userId, deletionStatus: "trash" }).sort({ deletedAt: -1 }).limit(200).lean(),
    ]);
    out.trashSessions.push(...sessions.map((s) => ({ ...serializeSession(s), agentType: store.agentType, deletedAt: s.deletedAt })));
    out.trashMessages.push(...messages.map((m) => ({ ...serializeMessage(m), _id: String(m._id), agentType: store.agentType, deletedAt: m.deletedAt })));
  }
  return out;
}

// ── Single messages ─────────────────────────────────────────────────────────

const validIds = (ids) => [...new Set((Array.isArray(ids) ? ids : String(ids || "").split(",")).map((id) => String(id).trim()))].filter(isObjectId);

export async function trashMessages(agentType, { userId, ids }) {
  const valid = validIds(ids);
  if (valid.length === 0) return 0;
  const result = await getStore(agentType).Message.updateMany(
    { _id: { $in: valid }, userId, deletionStatus: "active" },
    { $set: { deletionStatus: "trash", deletedAt: new Date() } },
  );
  return result.modifiedCount;
}

export async function restoreMessage(agentType, { userId, messageId }) {
  if (!isObjectId(messageId)) throw new NotFoundError("Message not found");
  const store = getStore(agentType);
  const message = await store.Message.findOneAndUpdate(
    { _id: messageId, userId },
    { $set: { deletionStatus: "active", deletedAt: null } },
  );
  if (!message) throw new NotFoundError("Message not found");
  // A restored message is only visible inside an active chat.
  await store.Session.updateOne({ _id: message.sessionId, userId }, { $set: { deletionStatus: "active", deletedAt: null } });
}

export async function deleteMessageForever(agentType, { userId, messageId }) {
  if (!isObjectId(messageId)) throw new NotFoundError("Message not found");
  const result = await getStore(agentType).Message.deleteOne({ _id: messageId, userId });
  if (result.deletedCount === 0) throw new NotFoundError("Message not found");
}
