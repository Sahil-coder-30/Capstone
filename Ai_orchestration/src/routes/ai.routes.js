import { Router } from "express";
import { identifyUser } from "../middleware/auth.middleware.js";
import * as aiController from "../controllers/ai.controller.js";
import * as chatController from "../controllers/chat.controller.js";

const aiRouter = Router();

aiRouter.post("/app-agent/invoke", identifyUser, aiController.appAgentInvoke);
aiRouter.post("/app-agent/title", identifyUser, aiController.appAgentTitle);
aiRouter.get("/chats/trash", identifyUser, chatController.getTrashChats);
aiRouter.get("/chats/:projectId/:agentType", identifyUser, chatController.getChats);
aiRouter.delete("/chats/:projectId/:agentType", identifyUser, chatController.deleteChats);
aiRouter.delete("/chats/message/:messageId", identifyUser, chatController.deleteSingleChatMessage);
aiRouter.patch("/chats/message/:messageId/restore", identifyUser, chatController.restoreChatMessage);
aiRouter.delete("/chats/message/:messageId/permanent", identifyUser, chatController.permanentlyDeleteChatMessage);

export default aiRouter;
