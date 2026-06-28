import mongoose from "mongoose";
import { v7 as uuid } from "uuid";
import { createSandboxKey, deleteSandboxKey } from "../config/redis.js";
import { createPod, deletePod } from "../kubernetes/pod.js";
import { createService, deleteService } from "../kubernetes/service.js";
import Project from "../models/Project.model.js";

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: shared auth + ownership guard (DRY)
// Returns the project document if checks pass, otherwise sends the error response.
// ─────────────────────────────────────────────────────────────────────────────
async function getAuthorizedProject(req, res, projectId) {
    if (!req.user || !req.user.id) {
        res.status(401).json({ status: "error", message: "Unauthorized: User identification missing" });
        return null;
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        res.status(400).json({ status: "error", message: "Invalid project ID format" });
        return null;
    }

    const project = await Project.findById(projectId);
    if (!project) {
        res.status(404).json({ status: "error", message: "Project not found" });
        return null;
    }

    if (project.user.toString() !== req.user.id.toString()) {
        res.status(403).json({ status: "error", message: "You are not authorized to perform this action" });
        return null;
    }

    return project;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE PROJECT
//    Allocates a sandboxId (UUID) and stores the project with status "not_started".
//    Does NOT spin up any K8s resources yet.
// ─────────────────────────────────────────────────────────────────────────────
export const createProjectController = async (req, res, next) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ status: "error", message: "Unauthorized: User identification missing" });
        }

        const { title } = req.body;
        const userId = req.user.id;

        if (!title || typeof title !== "string" || !title.trim()) {
            return res.status(400).json({ status: "error", message: "Project title is required and must be a non-empty string" });
        }

        const existingProjects = await Project.find({ user: userId });
        if (existingProjects.length >= 5) {
            return res.status(400).json({ status: "error", message: "You can only create up to 5 projects" });
        }

        const sandboxId = uuid();

        const project = await Project.create({
            user: userId,
            title: title.trim(),
            sandboxId,
            status: "not_started"
        });

        res.status(201).json({
            status: "success",
            message: "Project created successfully",
            project: project._id,
            sandboxId: project.sandboxId
        });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. LIST ALL PROJECTS
//    Returns all projects belonging to the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────
export const listAllProjectsController = async (req, res, next) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ status: "error", message: "Unauthorized: User identification missing" });
        }

        const projects = await Project.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json({ status: "success", projects });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. START SANDBOX
//    Uses the SAME sandboxId that was allocated when the project was created.
//    Creates: K8s Pod + K8s Service + Redis key (for TTL-based auto-shutdown).
//    Transitions: not_started / down  →  building  →  live
// ─────────────────────────────────────────────────────────────────────────────
export const startSandboxController = async (req, res, next) => {
    try {
        const project = await getAuthorizedProject(req, res, req.params.projectId);
        if (!project) return;

        if (project.status === "live") {
            return res.status(400).json({ status: "error", message: "Sandbox is already running" });
        }

        if (project.status === "building") {
            return res.status(400).json({ status: "error", message: "Sandbox is currently building, please wait" });
        }

        // Mark as building immediately so duplicate requests are rejected
        await Project.findByIdAndUpdate(project._id, { status: "building" });

        const { sandboxId } = project;

        try {
            await Promise.all([
                createPod(sandboxId),
                createService(sandboxId),
                createSandboxKey(sandboxId)
            ]);
        } catch (resourceError) {
            // Roll back to previous status on K8s / Redis failure
            await Project.findByIdAndUpdate(project._id, { status: project.status });
            throw resourceError;
        }

        await Project.findByIdAndUpdate(project._id, { status: "live" });

        res.status(200).json({
            status: "success",
            message: `Sandbox ${sandboxId} started successfully`,
            previewUrl: `http://${sandboxId}.preview.localhost`
        });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. STOP SANDBOX  (soft-stop — project is preserved)
//    Tears down: K8s Pod + K8s Service + Redis key.
//    Transitions: live  →  down
//    The project record and its sandboxId are KEPT so it can be restarted later.
// ─────────────────────────────────────────────────────────────────────────────
export const stopSandboxController = async (req, res, next) => {
    try {
        const project = await getAuthorizedProject(req, res, req.params.projectId);
        if (!project) return;

        if (project.status !== "live") {
            return res.status(400).json({
                status: "error",
                message: `Sandbox is not running (current status: ${project.status})`
            });
        }

        const { sandboxId } = project;

        // Tear down K8s resources and Redis key in parallel
        await Promise.allSettled([
            deletePod(sandboxId),
            deleteService(sandboxId),
            deleteSandboxKey(sandboxId)
        ]);

        // Update project status to "down" — sandboxId is preserved for future restarts
        await Project.findByIdAndUpdate(project._id, { status: "down" });

        res.status(200).json({
            status: "success",
            message: "Sandbox stopped successfully. You can restart it at any time."
        });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. DELETE PROJECT  (hard delete — everything is removed permanently)
//    If sandbox is live/building, tears down K8s resources and Redis key first.
//    Then permanently deletes the Project document from MongoDB.
// ─────────────────────────────────────────────────────────────────────────────
export const deleteProjectController = async (req, res, next) => {
    try {
        const project = await getAuthorizedProject(req, res, req.params.projectId);
        if (!project) return;

        const { sandboxId } = project;

        // If K8s resources are live or were being built, clean them up first
        if (project.status === "live" || project.status === "building") {
            await Promise.allSettled([
                deletePod(sandboxId),
                deleteService(sandboxId),
                deleteSandboxKey(sandboxId)
            ]);
        }

        // Permanently remove the project record from the database
        await Project.findByIdAndDelete(project._id);

        res.status(200).json({
            status: "success",
            message: "Project and all associated resources deleted permanently"
        });
    } catch (err) {
        next(err);
    }
};
