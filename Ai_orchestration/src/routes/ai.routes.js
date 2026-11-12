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
aiRouter.get("/code-agent/stream/:projectId", identifyUser, aiController.codeAgentStream);
aiRouter.post("/code-agent/stop", identifyUser, aiController.codeAgentStop);
aiRouter.post("/code-agent/plan-approve", identifyUser, aiController.codeAgentPlanApprove);
aiRouter.post("/code-agent/plan-reject", identifyUser, aiController.codeAgentPlanReject);

// ── Chat History (sessions per agent; :agentType is codingAgent or copilot) ──
aiRouter.get("/chats/trash", identifyUser, chatController.getTrash);
aiRouter.post("/chats/message/batch-delete", identifyUser, chatController.trashMessages);
aiRouter.delete("/chats/message/:messageId", identifyUser, chatController.trashMessages);
aiRouter.patch("/chats/message/:messageId/restore", identifyUser, chatController.restoreMessage);
aiRouter.delete("/chats/message/:messageId/permanent", identifyUser, chatController.deleteMessageForever);
aiRouter.get("/chats/:agentType/sessions", identifyUser, chatController.listSessions);
aiRouter.get("/chats/:agentType/sessions/:sessionId/messages", identifyUser, chatController.getSessionMessages);
aiRouter.patch("/chats/:agentType/sessions/:sessionId", identifyUser, chatController.renameSession);
aiRouter.delete("/chats/:agentType/sessions/:sessionId", identifyUser, chatController.trashSession);
aiRouter.patch("/chats/:agentType/sessions/:sessionId/restore", identifyUser, chatController.restoreSession);
aiRouter.delete("/chats/:agentType/sessions/:sessionId/permanent", identifyUser, chatController.deleteSessionForever);

export default aiRouter;
