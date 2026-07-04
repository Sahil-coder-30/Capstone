import { Router } from "express";
import { identifyUser } from "../middleware/auth.middleware.js";
import * as aiController from "../controllers/ai.controller.js";
import * as chatController from "../controllers/chat.controller.js";

const aiRouter = Router();

aiRouter.post("/app-agent/invoke", identifyUser, aiController.appAgentInvoke);
aiRouter.post("/app-agent/title", identifyUser, aiController.appAgentTitle);
aiRouter.get("/chats/:projectId/:agentType", identifyUser, chatController.getChats);
aiRouter.delete("/chats/:projectId/:agentType", identifyUser, chatController.deleteChats);

export default aiRouter;
