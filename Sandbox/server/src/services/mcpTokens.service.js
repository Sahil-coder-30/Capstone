// mcpTokens.service.js
// MCP tokens for external agents: create, list, revoke, and the lookup the
// router uses on every call.
//
// Mongo is the source of truth. Redis holds `mcptoken:<hash>` for every
// active token, so the router can check a token without calling this
// service; a revoke deletes the key at once. The router records use in
// `mcptoken-used:<id>`.

import crypto from "crypto";
import McpToken from "../models/McpToken.model.js";
import Project from "../models/Project.model.js";
import { redis } from "../config/redis.js";

export const TOKEN_PREFIX = "tks_mcp_";
export const SCOPES = ["read", "write", "exec"];
export const MAX_ACTIVE_PER_PROJECT = 10;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const cacheKey = (hash) => `mcptoken:${hash}`;
const usedKey = (id) => `mcptoken-used:${id}`;

export class TokenInputError extends Error {}

/** Validates create input. `read` is always included; `exec` must be asked for. */
export function normalizeTokenInput({ name, scopes, expiresInDays = DEFAULT_DAYS } = {}) {
    const cleanName = String(name ?? "").trim();
    if (!cleanName || cleanName.length > 60) throw new TokenInputError("name must be 1-60 characters");

    const requested = Array.isArray(scopes) ? scopes : [];
    if (!requested.every((s) => SCOPES.includes(s))) throw new TokenInputError("scopes may only be read, write, exec");
    const finalScopes = SCOPES.filter((s) => s === "read" || requested.includes(s));

    const days = Number(expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new TokenInputError(`expiresInDays must be 1-${MAX_DAYS}`);

    return { name: cleanName, scopes: finalScopes, expiresAt: new Date(Date.now() + days * 86_400_000) };
}

const cacheRecord = (doc) => ({
    id: String(doc._id),
    userId: doc.user,
    projectId: String(doc.project),
    sandboxId: doc.sandboxId,
    scopes: doc.scopes,
    expiresAt: doc.expiresAt.toISOString(),
});

const writeCache = async (hash, doc) => {
    try {
        await redis.set(cacheKey(hash), JSON.stringify(cacheRecord(doc)), "PXAT", doc.expiresAt.getTime());
    } catch (err) {
        console.warn("[mcpTokens] Could not cache token:", err.message);
    }
};

export const publicView = (doc, lastUsedAt = null) => ({
    id: String(doc._id),
    name: doc.name,
    prefix: doc.prefix,
    scopes: doc.scopes,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    lastUsedAt,
});

const activeFilter = (projectId) => ({ project: projectId, revokedAt: null, expiresAt: { $gt: new Date() } });

/** Creates a token for a project. Returns the token once, plus its public view. */
export async function createToken({ userId, project, input }) {
    const { name, scopes, expiresAt } = normalizeTokenInput(input);
    const active = await McpToken.countDocuments(activeFilter(project._id));
    if (active >= MAX_ACTIVE_PER_PROJECT) {
        throw new TokenInputError(`A project can have at most ${MAX_ACTIVE_PER_PROJECT} active tokens. Revoke one first.`);
    }

    const token = `${TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
    const tokenHash = hashToken(token);
    const doc = await McpToken.create({
        user: String(userId),
        project: project._id,
        sandboxId: project.sandboxId,
        name,
        tokenHash,
        prefix: token.slice(0, TOKEN_PREFIX.length + 6),
        scopes,
        expiresAt,
    });
    await writeCache(tokenHash, doc);
    return { token, record: publicView(doc) };
}

/** Active tokens of a project, newest first, with last-use time from the router. */
export async function listTokens(projectId) {
    const docs = await McpToken.find(activeFilter(projectId)).sort({ createdAt: -1 }).lean();
    let used = [];
    try {
        used = docs.length ? await redis.mget(docs.map((d) => usedKey(d._id))) : [];
    } catch {
        used = [];
    }
    return docs.map((doc, i) => publicView(doc, used[i] ? new Date(Number(used[i])) : null));
}

/** Revokes one token of a project. Returns false when there is no such active token. */
export async function revokeToken(projectId, tokenId) {
    const doc = await McpToken.findOneAndUpdate(
        { _id: tokenId, project: projectId, revokedAt: null },
        { revokedAt: new Date() },
    );
    if (!doc) return false;
    await redis.del(cacheKey(doc.tokenHash), usedKey(doc._id)).catch(() => {});
    return true;
}

/** Revokes every token of a project (project trashed or deleted). */
export async function revokeProjectTokens(projectId) {
    const docs = await McpToken.find({ project: projectId, revokedAt: null }).lean();
    if (!docs.length) return 0;
    await McpToken.updateMany({ project: projectId, revokedAt: null }, { revokedAt: new Date() });
    await redis.del(...docs.flatMap((d) => [cacheKey(d.tokenHash), usedKey(d._id)])).catch(() => {});
    return docs.length;
}

/**
 * Router lookup on a cache miss (e.g. Redis was flushed). Returns the cache
 * record for an active token of an active project, re-caching it, or null.
 */
export async function lookupActiveToken(hash) {
    if (!/^[a-f0-9]{64}$/.test(String(hash))) return null;
    const doc = await McpToken.findOne({ tokenHash: hash, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
    if (!doc) return null;
    const project = await Project.findOne({ _id: doc.project, deletionStatus: { $nin: ["trash", "deleted"] } }).lean();
    if (!project || project.sandboxId !== doc.sandboxId) return null;
    await writeCache(hash, doc);
    return cacheRecord(doc);
}
