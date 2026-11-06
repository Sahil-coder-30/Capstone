// sandboxLifecycle.service.js
// Starting and stopping a project's sandbox. Used by the user-facing start
// route and by the router's wake call for external MCP agents.

import { createSandboxKey, deleteSandboxKey } from "../config/redis.js";
import { createPod, deletePod } from "../kubernetes/pod.js";
import { createService, deleteService } from "../kubernetes/service.js";
import Project from "../models/Project.model.js";

/** Deletes the pod, Service and idle key. Failures are ignored (resources may already be gone). */
export const tearDownSandbox = (sandboxId) =>
    Promise.allSettled([deletePod(sandboxId), deleteService(sandboxId), deleteSandboxKey(sandboxId)]);

/**
 * Starts (or force-restarts) a project's sandbox with the same sandboxId.
 * Transitions: not_started / down -> building -> live.
 */
export async function startProjectSandbox(project) {
    const { sandboxId } = project;

    // A "live" or "building" project whose pod died is restarted from scratch.
    if (project.status === "live" || project.status === "building") {
        await tearDownSandbox(sandboxId);
    }

    // Mark as building first so concurrent duplicate requests are rejected.
    await Project.findByIdAndUpdate(project._id, { status: "building" });
    try {
        await Promise.all([
            createPod(sandboxId, project._id.toString(), project.user),
            createService(sandboxId),
            createSandboxKey(sandboxId),
        ]);
    } catch (err) {
        await Project.findByIdAndUpdate(project._id, { status: "down" });
        throw err;
    }
    await Project.findByIdAndUpdate(project._id, { status: "live" });
    return { sandboxId };
}
