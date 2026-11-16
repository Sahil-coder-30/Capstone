import axios from "axios";
import { ConflictError, ForbiddenError, ServiceUnavailableError } from "faultkit";

// The Sandbox service owns the Project → sandboxId mapping, so ownership is
// checked there with the caller's own token: it only ever returns the
// caller's projects.
const SANDBOX_SERVICE_URL = process.env.SANDBOX_SERVICE_URL || "http://sandbox-service";
const CACHE_TTL_MS = 60_000;

const cache = new Map(); // `${userId}` -> { projects, expiresAt }

async function listUserProjects({ authToken, userId, fresh = false }) {
  const cached = cache.get(userId);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.projects;

  let response;
  try {
    response = await axios.get(`${SANDBOX_SERVICE_URL}/api/sandbox/projects`, {
      headers: { Authorization: `Bearer ${authToken}` },
      timeout: 5_000,
    });
  } catch (err) {
    // Fail closed: without the ownership answer we must not touch a sandbox.
    throw new ServiceUnavailableError(`Could not verify sandbox ownership: ${err.message}`);
  }

  const body = response.data || {};
  const projects = body.projects || body.data?.projects || body.data || [];
  const list = Array.isArray(projects) ? projects : [];
  cache.set(userId, { projects: list, expiresAt: Date.now() + CACHE_TTL_MS });
  return list;
}

/**
 * Resolves the sandbox the caller is allowed to drive.
 * Returns null when the request names no sandbox or project at all.
 * Throws ForbiddenError when the named sandbox/project is not the caller's.
 */
export async function resolveOwnedSandbox({ authToken, userId, projectId, sandboxId, fresh = false }) {
  if (!sandboxId && !projectId) return null;

  const projects = await listUserProjects({ authToken, userId, fresh });
  const project = sandboxId
    ? projects.find((p) => p.sandboxId === sandboxId)
    : projects.find((p) => String(p._id) === String(projectId));

  if (!project) {
    throw new ForbiddenError("Forbidden: this sandbox does not belong to you");
  }
  // Chats and usage are filed under projectId, so it must be the sandbox's own project.
  if (projectId && String(project._id) !== String(projectId)) {
    throw new ForbiddenError("Forbidden: projectId does not match this sandbox");
  }
  return { projectId: String(project._id), sandboxId: project.sandboxId, status: project.status };
}

/**
 * Express middleware for agent invoke routes. Replaces the client-supplied
 * sandboxId with the verified one so downstream tools only ever target a
 * sandbox owned by req.user.
 */
export const requireOwnedSandbox = async (req, _res, next) => {
  try {
    const { projectId, sandboxId } = req.body || {};
    const ask = { authToken: req.authToken, userId: req.user?.id || req.user?.sub, projectId, sandboxId };
    let owned = await resolveOwnedSandbox(ask);
    // The cached list may predate a sandbox start, so check again before refusing.
    if (owned && owned.status !== "live") owned = await resolveOwnedSandbox({ ...ask, fresh: true });
    if (owned && owned.status !== "live") {
      // Every agent tool runs on the sandbox, so a run on a stopped one only fails tool by tool.
      throw new ConflictError(
        owned.status === "building"
          ? "Your sandbox is still starting. Wait until it is live, then send your message again."
          : "Your sandbox is not running. Start it, then send your message again.",
      );
    }
    if (owned) {
      req.body.sandboxId = owned.sandboxId;
      req.body.projectId = owned.projectId;
    }
    next();
  } catch (err) {
    next(err);
  }
};
