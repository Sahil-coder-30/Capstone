import mongoose from "mongoose";

const copilotChatMessageSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    file: {
      type: String,
      default: "",
      index: true,
    },
    userId: {
      type: String,
      index: true,
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

// Compound index for fast lookup of chat history using combined project:file identifier
copilotChatMessageSchema.index({ projectId: 1, timestamp: 1 });

const CopilotChatMessage = mongoose.model("CopilotChatMessage", copilotChatMessageSchema);
export default CopilotChatMessage;
