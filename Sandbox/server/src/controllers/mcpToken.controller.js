import mongoose from "mongoose";
import Project from "../models/Project.model.js";
import { getAuthorizedProject } from "./sandbox.controller.js";
import {
    TokenInputError,
    createToken,
    listTokens,
    lookupActiveToken,
    revokeToken,
} from "../services/mcpTokens.service.js";
import { startProjectSandbox } from "../services/sandboxLifecycle.service.js";
import { sandboxKeyExists } from "../config/redis.js";

const SANDBOX_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

/** Public MCP URL of a project, e.g. http://localhost/api/mcp/<sandboxId> */
export const mcpUrlFor = (sandboxId) =>
    `${(process.env.PUBLIC_MCP_BASE_URL || "http://localhost/api/mcp").replace(/\/+$/, "")}/${sandboxId}`;

const isActiveProject = (project) => !["trash", "deleted"].includes(project.deletionStatus);

// ── For the signed-in owner (/api/sandbox/project/:projectId/mcp-tokens) ────

export const listMcpTokensController = async (req, res, next) => {
    try {
        const project = await getAuthorizedProject(req, res, req.params.projectId);
        if (!project) return;
        res.status(200).json({ status: "success", mcpUrl: mcpUrlFor(project.sandboxId), tokens: await listTokens(project._id) });
    } catch (err) {
        next(err);
    }
};

export const createMcpTokenController = async (req, res, next) => {
    try {
        const project = await getAuthorizedProject(req, res, req.params.projectId);
        if (!project) return;
        if (!isActiveProject(project)) {
            return res.status(400).json({ status: "error", message: "Restore the project from trash first." });
        }
        const { token, record } = await createToken({ userId: req.user.id, project, input: req.body });
        res.status(201).json({ status: "success", token, mcpUrl: mcpUrlFor(project.sandboxId), record });
    } catch (err) {
        if (err instanceof TokenInputError) return res.status(400).json({ status: "error", message: err.message });
        next(err);
    }
};

export const revokeMcpTokenController = async (req, res, next) => {
    try {
        const project = await getAuthorizedProject(req, res, req.params.projectId);
        if (!project) return;
        if (!mongoose.Types.ObjectId.isValid(req.params.tokenId)) {
            return res.status(400).json({ status: "error", message: "Invalid token id" });
        }
        const revoked = await revokeToken(project._id, req.params.tokenId);
        if (!revoked) return res.status(404).json({ status: "error", message: "No active token with this id" });
        res.status(200).json({ status: "success", message: "Token revoked" });
    } catch (err) {
        next(err);
    }
};

// ── For the sandbox router (/internal, shared internal token) ───────────────

/** GET /internal/mcp-tokens/:hash  - token record for a cache miss, or 404 */
export const lookupMcpTokenController = async (req, res, next) => {
    try {
        const record = await lookupActiveToken(req.params.hash);
        if (!record) return res.status(404).json({ status: "error", message: "Unknown or revoked token" });
        res.status(200).json({ status: "success", token: record });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /internal/sandboxes/:sandboxId/wake
 * Starts a stopped sandbox for an external agent. The router then waits for
 * the sidecar to become ready.
 */
export const wakeSandboxController = async (req, res, next) => {
    try {
        const { sandboxId } = req.params;
        if (!SANDBOX_ID_PATTERN.test(sandboxId)) {
            return res.status(400).json({ status: "error", message: "Invalid sandbox id" });
        }
        const project = await Project.findOne({ sandboxId });
        if (!project || !isActiveProject(project)) {
            return res.status(404).json({ status: "error", message: "No active project for this sandbox" });
        }
        if (project.status === "live" && (await sandboxKeyExists(sandboxId))) {
            return res.status(200).json({ status: "success", state: "live" });
        }
        if (project.status === "building") {
            return res.status(202).json({ status: "success", state: "starting" });
        }
        await startProjectSandbox(project);
        res.status(202).json({ status: "success", state: "starting" });
    } catch (err) {
        next(err);
    }
};
