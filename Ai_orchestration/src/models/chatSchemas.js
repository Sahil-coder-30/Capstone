// chatSchemas.js
// Base schemas shared by Orion (coding agent) and Clio (copilot). Each agent
// builds its own models from these, so the shape is the same but the data
// lives in separate collections and never mixes.
//
// Ownership order on every document and every query:
//   1. userId    - only ever from the verified token
//   2. projectId - verified against the Sandbox service on writes
//   3. sessionId - always looked up together with userId

import mongoose from "mongoose";

const { Schema } = mongoose;

const DELETION_STATUSES = ["active", "trash", "deleted"];

const tokenUsage = {
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
};

/** One chat message. `extra` adds agent-specific fields (Clio: file). */
export const buildMessageSchema = (extra = {}) => {
  const schema = new Schema(
    {
      userId: { type: String, required: true },
      projectId: { type: String, required: true },
      sessionId: { type: Schema.Types.ObjectId, required: true },
      role: { type: String, enum: ["user", "assistant"], required: true },
      // For an assistant message this is only the final answer / execution
      // summary. Tool logs and steps are kept for the UI, never for context.
      content: { type: String, required: true },
      status: { type: String, enum: ["ok", "error", "stopped"], default: "ok" },
      toolLogs: { type: [String], default: [] },
      steps: { type: [Schema.Types.Mixed], default: [] },
      outcome: { type: String, default: null },
      tokenUsage,
      requestId: { type: String, default: null },
      timestamp: { type: Date, default: Date.now },
      deletionStatus: { type: String, enum: DELETION_STATUSES, default: "active" },
      deletedAt: { type: Date, default: null },
      ...extra,
    },
    { timestamps: true },
  );
  schema.index({ userId: 1, projectId: 1, sessionId: 1, timestamp: 1 });
  schema.index({ userId: 1, deletionStatus: 1, deletedAt: -1 });
  // Legacy rows (before sessions) are found by project to be migrated.
  schema.index({ projectId: 1, sessionId: 1 });
  return schema;
};

/** One chat session (a conversation in the sidebar). */
export const buildSessionSchema = () => {
  const schema = new Schema(
    {
      userId: { type: String, required: true },
      projectId: { type: String, required: true },
      title: { type: String, default: "New chat", maxlength: 120 },
      titleLocked: { type: Boolean, default: false }, // the user renamed it
      summary: { type: String, default: "" },         // running summary, kept by the memory agent
      summaryThrough: { type: Date, default: null },  // last message folded into the summary
      lastMessageAt: { type: Date, default: Date.now },
      deletionStatus: { type: String, enum: DELETION_STATUSES, default: "active" },
      deletedAt: { type: Date, default: null },
    },
    { timestamps: true },
  );
  schema.index({ userId: 1, projectId: 1, deletionStatus: 1, lastMessageAt: -1 });
  schema.index({ userId: 1, deletionStatus: 1, deletedAt: -1 });
  return schema;
};

/** Project notes one agent keeps for one user's project. */
export const buildProjectMemorySchema = () => {
  const schema = new Schema(
    {
      userId: { type: String, required: true },
      projectId: { type: String, required: true },
      content: { type: String, default: "" },
      version: { type: Number, default: 0 }, // optimistic lock for concurrent memory jobs
    },
    { timestamps: true },
  );
  schema.index({ userId: 1, projectId: 1 }, { unique: true });
  return schema;
};
