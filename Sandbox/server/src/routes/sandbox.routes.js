import { Router } from "express";
import { identifyUser } from "../middleware/auth.middleware.js";
import {
    createProjectController,
    listAllProjectsController,
    startSandboxController,
    stopSandboxController,
    deleteProjectController,
} from "../controllers/sandbox.controller.js";

const sandboxRouter = Router();

// Project management
sandboxRouter.post('/create-project', identifyUser, createProjectController);
sandboxRouter.get('/projects', identifyUser, listAllProjectsController);
sandboxRouter.delete('/project/:projectId', identifyUser, deleteProjectController);

// Sandbox lifecycle (start / stop — project persists)
sandboxRouter.post('/start/:projectId', identifyUser, startSandboxController);
sandboxRouter.post('/stop/:projectId', identifyUser, stopSandboxController);

export default sandboxRouter;
