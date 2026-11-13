import { Router } from "express";
import { reportError } from "../controllers/logs.controller.js";

const router = Router();

// Open route (PUBLIC_PATHS in middleware/auth.middleware.js): the preview app posts browser errors.
router.post("/report-error", reportError);

export default router;
