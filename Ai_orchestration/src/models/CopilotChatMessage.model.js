import mongoose from "mongoose";
import { buildMessageSchema } from "./chatSchemas.js";

// Clio (copilot) messages. Collection: copilotchatmessages.
// `file` is the editor file that was open when the message was sent.
const CopilotChatMessage = mongoose.model("CopilotChatMessage", buildMessageSchema({ file: { type: String, default: "" } }));
export default CopilotChatMessage;
