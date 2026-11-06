import { Router } from 'express';
import { requireInternalCaller } from '../middleware/internalAuth.middleware.js';
import { internalSandboxTokenController } from '../controllers/internalSandboxToken.controller.js';

// Service-to-service routes. Not under /api, so the ingress never exposes them.
const internalRouter = Router();

internalRouter.use(requireInternalCaller);
internalRouter.post('/sandbox-token', internalSandboxTokenController);

export default internalRouter;
