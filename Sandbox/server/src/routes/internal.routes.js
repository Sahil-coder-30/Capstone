import { Router } from "express";
import { requireInternalCaller } from "../middleware/internalAuth.middleware.js";
import { lookupMcpTokenController, wakeSandboxController } from "../controllers/mcpToken.controller.js";

// Service-to-service routes for the sandbox router. Not under /api, so the
// ingress never exposes them; they also need the shared internal token.
const internalRouter = Router();

internalRouter.use(requireInternalCaller);
internalRouter.get("/mcp-tokens/:hash", lookupMcpTokenController);
internalRouter.post("/sandboxes/:sandboxId/wake", wakeSandboxController);

export default internalRouter;
