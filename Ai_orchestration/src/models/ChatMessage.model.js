import mongoose from "mongoose";
import { buildMessageSchema } from "./chatSchemas.js";

// Orion (coding agent) messages. Collection: chatmessages.
const ChatMessage = mongoose.model("ChatMessage", buildMessageSchema());
export default ChatMessage;
