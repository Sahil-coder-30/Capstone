import { Router } from "express";
import { identifyUser } from "../middleware/auth.middleware.js";
import * as aiController from "../controllers/ai.controller.js";
import * as chatController from "../controllers/chat.controller.js";

const aiRouter = Router();

// Secure all AI endpoints with user identification middleware
aiRouter.use(identifyUser);

aiRouter.post("/app-agent/invoke", aiController.appAgentInvoke);
aiRouter.post("/app-agent/title", aiController.appAgentTitle);
aiRouter.get("/chats/:projectId/:agentType", chatController.getChats);
aiRouter.delete("/chats/:projectId/:agentType", chatController.deleteChats);

export default aiRouter;
