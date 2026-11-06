import mongoose from "mongoose";

// A token that lets an external MCP client (Claude Code, Cursor, ...) use one
// project's sandbox. Only the SHA-256 hash is stored; the token itself is
// shown to the user once.
const mcpTokenSchema = new mongoose.Schema(
    {
        user: { type: String, required: true, index: true },
        project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
        sandboxId: { type: String, required: true },
        name: { type: String, required: true, trim: true, maxlength: 60 },
        tokenHash: { type: String, required: true, unique: true },
        prefix: { type: String, required: true }, // first characters, to recognise a token in the list
        scopes: { type: [String], enum: ["read", "write", "exec"], required: true },
        expiresAt: { type: Date, required: true },
        revokedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

const McpToken = mongoose.model("McpToken", mcpTokenSchema);
export default McpToken;
