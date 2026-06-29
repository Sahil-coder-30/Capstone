import mongoose from "mongoose";

const commandSummarySchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    command: {
      type: String,
      required: true,
    },
    subDir: {
      type: String,
      default: "",
    },
    output: {
      type: String,
      default: "",
    },
    summary: {
      type: String,
      required: true,
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
  },
  { timestamps: true }
);

const CommandSummary = mongoose.model("CommandSummary", commandSummarySchema);
export default CommandSummary;
