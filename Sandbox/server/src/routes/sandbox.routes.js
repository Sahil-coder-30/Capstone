import { Router } from "express";
import { identifyUser } from "../middleware/auth.middleware.js";
import {
    createProjectController,
    listAllProjectsController,
    getProjectStatusController,
    startSandboxController,
    stopSandboxController,
    deleteProjectController,
    listTrashProjectsController,
    restoreProjectController,
    permanentlyDeleteProjectController
} from "../controllers/sandbox.controller.js";

const sandboxRouter = Router();

// Project management
sandboxRouter.post('/create-project', identifyUser, createProjectController);
sandboxRouter.get('/projects', identifyUser, listAllProjectsController);
sandboxRouter.get('/projects/trash', identifyUser, listTrashProjectsController);
sandboxRouter.get('/project/:projectId', identifyUser, getProjectStatusController);
sandboxRouter.delete('/project/:projectId', identifyUser, deleteProjectController);
sandboxRouter.patch('/project/:projectId/restore', identifyUser, restoreProjectController);
sandboxRouter.delete('/project/:projectId/permanent', identifyUser, permanentlyDeleteProjectController);

// Sandbox lifecycle (start / stop — project persists)
sandboxRouter.post('/start/:projectId', identifyUser, startSandboxController);
sandboxRouter.post('/stop/:projectId', identifyUser, stopSandboxController);

export default sandboxRouter;
