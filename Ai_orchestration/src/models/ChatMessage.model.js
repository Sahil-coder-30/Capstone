import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      index: true,
    },
    agentType: {
      type: String,
      enum: ["codingAgent"],
      default: "codingAgent",
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    toolLogs: {
      type: [String],
      default: [],
    },
    tokenUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    deletionStatus: {
      type: String,
      enum: ["active", "trash", "deleted"],
      default: "active",
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Add compound index for fast queries when fetching project chat history
chatMessageSchema.index({ projectId: 1, agentType: 1, timestamp: 1 });

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
export default ChatMessage;
