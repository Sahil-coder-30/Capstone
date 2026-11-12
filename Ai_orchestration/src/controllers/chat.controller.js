// chat.controller.js
// Chat history for Orion (codingAgent) and Clio (copilot).
// The user id always comes from the verified token, never from the request.

import { ConflictError } from "faultkit";
import * as chats from "../services/chatSession.service.js";
import { getRun, isSessionLive } from "../services/agentRun.service.js";

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, req.user.id);
  } catch (err) {
    next(err);
  }
};

const agentTypeOf = (req) => req.params.agentType || req.query.agentType || req.body?.agentType || "codingAgent";

// GET /chats/:agentType/sessions?projectId=&before=
export const listSessions = handle(async (req, res, userId) => {
  const { projectId, before } = req.query;
  const result = await chats.listSessions(req.params.agentType, { userId, projectId, before, authToken: req.authToken });
  // The chat an Orion run is working in, so the UI can open or mark it.
  const run = req.params.agentType === "codingAgent" ? getRun(userId, String(projectId)) : null;
  const liveSessionId = run && run.status !== "finished" ? run.sessionId : null;
  res.status(200).json({ status: "ok", ...result, liveSessionId });
});

// GET /chats/:agentType/sessions/:sessionId/messages
export const getSessionMessages = handle(async (req, res, userId) => {
  const result = await chats.getSessionMessages(req.params.agentType, { userId, sessionId: req.params.sessionId });
  res.status(200).json({ status: "ok", ...result });
});

// PATCH /chats/:agentType/sessions/:sessionId
export const renameSession = handle(async (req, res, userId) => {
  const session = await chats.renameSession(req.params.agentType, { userId, sessionId: req.params.sessionId, title: req.body?.title });
  res.status(200).json({ status: "ok", session });
});

// DELETE /chats/:agentType/sessions/:sessionId (to trash)
export const trashSession = handle(async (req, res, userId) => {
  if (req.params.agentType === "codingAgent" && isSessionLive(userId, req.params.sessionId)) {
    throw new ConflictError("Orion is still working in this chat. Stop it first.");
  }
  await chats.trashSession(req.params.agentType, { userId, sessionId: req.params.sessionId });
  res.status(200).json({ status: "ok", message: "Chat moved to trash" });
});

// PATCH /chats/:agentType/sessions/:sessionId/restore
export const restoreSession = handle(async (req, res, userId) => {
  const session = await chats.restoreSession(req.params.agentType, { userId, sessionId: req.params.sessionId });
  res.status(200).json({ status: "ok", session });
});

// DELETE /chats/:agentType/sessions/:sessionId/permanent
export const deleteSessionForever = handle(async (req, res, userId) => {
  await chats.deleteSessionForever(req.params.agentType, { userId, sessionId: req.params.sessionId });
  res.status(200).json({ status: "ok", message: "Chat permanently deleted" });
});

// GET /chats/trash
export const getTrash = handle(async (_req, res, userId) => {
  res.status(200).json({ status: "ok", ...(await chats.listTrash(userId)) });
});

// DELETE /chats/message/:messageId or POST /chats/message/batch-delete { ids, agentType }
export const trashMessages = handle(async (req, res, userId) => {
  const ids = req.params.messageId || req.body?.ids || req.body?.messageId;
  const count = await chats.trashMessages(agentTypeOf(req), { userId, ids });
  res.status(200).json({ status: "ok", message: `${count} message(s) moved to trash` });
});

// PATCH /chats/message/:messageId/restore { agentType }
export const restoreMessage = handle(async (req, res, userId) => {
  await chats.restoreMessage(agentTypeOf(req), { userId, messageId: req.params.messageId });
  res.status(200).json({ status: "ok", message: "Message restored" });
});

// DELETE /chats/message/:messageId/permanent?agentType=
export const deleteMessageForever = handle(async (req, res, userId) => {
  await chats.deleteMessageForever(agentTypeOf(req), { userId, messageId: req.params.messageId });
  res.status(200).json({ status: "ok", message: "Message permanently deleted" });
});
