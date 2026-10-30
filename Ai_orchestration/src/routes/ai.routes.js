import { Router } from "express";
import { identifyUser } from "../middleware/auth.middleware.js";
import { aiRateLimiter } from "../middleware/rateLimit.middleware.js";
import { creditLedger } from "../middleware/creditLedger.middleware.js";
import { requireOwnedSandbox } from "../services/sandboxOwnership.service.js";
import * as aiController from "../controllers/ai.controller.js";
import * as chatController from "../controllers/chat.controller.js";

const aiRouter = Router();

// ── AI Model Orchestration Routes (Auth -> Sandbox Ownership -> Rate Limit -> Credit Ledger) ──
aiRouter.post("/app-agent/invoke", identifyUser, requireOwnedSandbox, aiRateLimiter, creditLedger, aiController.appAgentInvoke);
aiRouter.post("/app-agent/title", identifyUser, aiRateLimiter, creditLedger, aiController.appAgentTitle);
aiRouter.post("/code-agent/invoke", identifyUser, requireOwnedSandbox, aiRateLimiter, creditLedger, aiController.codeAgentInvoke);

// ── Agent Run Controls (runs are keyed by the caller's own user id) ──
aiRouter.post("/code-agent/stop", identifyUser, aiController.codeAgentStop);
aiRouter.post("/code-agent/plan-approve", identifyUser, aiController.codeAgentPlanApprove);
aiRouter.post("/code-agent/plan-reject", identifyUser, aiController.codeAgentPlanReject);

// ── Chat History Management ──
aiRouter.get("/chats/trash", identifyUser, chatController.getTrashChats);
aiRouter.get("/chats/:projectId/:agentType", identifyUser, chatController.getChats);
aiRouter.delete("/chats/:projectId/:agentType", identifyUser, chatController.deleteChats);
aiRouter.post("/chats/message/batch-delete", identifyUser, chatController.deleteSingleChatMessage);
aiRouter.delete("/chats/message/:messageId", identifyUser, chatController.deleteSingleChatMessage);
aiRouter.patch("/chats/message/:messageId/restore", identifyUser, chatController.restoreChatMessage);
aiRouter.delete("/chats/message/:messageId/permanent", identifyUser, chatController.permanentlyDeleteChatMessage);

export default aiRouter;
