// mcpGateway.js
// Public MCP endpoint for external agents (Claude Code, Cursor, ...):
//
//   POST /api/mcp/<sandboxId>     Authorization: Bearer tks_mcp_...
//
// For every call the gateway:
//   1. checks the MCP token (Redis cache written by the Sandbox server,
//      internal lookup on a miss) and that it belongs to this sandbox,
//   2. rate-limits per token,
//   3. wakes a stopped sandbox and waits for its sidecar (max 45s),
//   4. swaps the MCP token for a short, scoped sandbox token from Auth,
//   5. proxies to http://sandbox-service-<id>:3000/mcp.
// The external agent never sees the sandbox token, and the sidecar's own
// owner check still applies (scoped tokens only reach /mcp).

import crypto from "crypto";
import { createProxyMiddleware } from "http-proxy-middleware";

const SANDBOX_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const TOKEN_PATTERN = /^tks_mcp_[A-Za-z0-9_-]{20,100}$/;

const DEFAULTS = {
  callsPerMinute: 120,
  wakeTimeoutMs: 45_000,
  readyPollMs: 1_500,
  readyCacheMs: 30_000,
  sandboxTokenTtlSeconds: 600,
  usedWriteEveryMs: 60_000,
  proxyTimeoutMs: 180_000,
};

const jsonRpcError = (res, status, message, headers = {}) => {
  res.set(headers);
  res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * @param {object} deps
 * @param {object} deps.redis      ioredis client (get, set, incr, expire, exists)
 * @param {Function} deps.refreshTTL  keeps the sandbox alive while it is used
 * @param {Function} [deps.fetch]  for internal calls (tests pass a fake)
 * @param {object} [deps.env]      AUTH_SERVICE_URL, SANDBOX_SERVICE_URL, INTERNAL_SERVICE_TOKEN, SANDBOX_URL_TEMPLATE
 * @param {object} [deps.options]  overrides of DEFAULTS
 */
export function createMcpGateway({ redis, refreshTTL, fetch: fetchImpl = fetch, env = process.env, options = {} }) {
  const opts = { ...DEFAULTS, ...options };
  const authUrl = (env.AUTH_SERVICE_URL || "http://auth-service").replace(/\/+$/, "");
  const sandboxApiUrl = (env.SANDBOX_SERVICE_URL || "http://sandbox-service").replace(/\/+$/, "");
  const sidecarOrigin = (id) => (env.SANDBOX_URL_TEMPLATE || "http://sandbox-service-{sandboxId}:3000").replace("{sandboxId}", id);
  const internalHeaders = { "X-Internal-Token": env.INTERNAL_SERVICE_TOKEN || "", "Content-Type": "application/json" };

  const readyUntil = new Map(); // sandboxId -> timestamp
  const sandboxTokens = new Map(); // MCP token id -> { token, expiresAt }
  const lastUsedWrite = new Map(); // MCP token id -> timestamp

  /** Token record for a raw MCP token, or null. */
  async function resolveToken(rawToken) {
    if (!TOKEN_PATTERN.test(rawToken)) return null;
    const hash = hashToken(rawToken);
    const cached = await redis.get(`mcptoken:${hash}`).catch(() => null);
    if (cached) return JSON.parse(cached);
    const res = await fetchImpl(`${sandboxApiUrl}/internal/mcp-tokens/${hash}`, { headers: internalHeaders });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`token lookup failed (HTTP ${res.status})`);
    return (await res.json()).token;
  }

  /** Fixed one-minute window per token. Fails open if Redis is down. */
  async function overRateLimit(tokenId) {
    try {
      const key = `mcp-rate:${tokenId}:${Math.floor(Date.now() / 60_000)}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 60);
      return count > opts.callsPerMinute;
    } catch {
      return false;
    }
  }

  const sidecarReady = async (sandboxId) => {
    try {
      const res = await fetchImpl(`${sidecarOrigin(sandboxId)}/api/agent/ready`, { signal: AbortSignal.timeout(3_000) });
      return res.ok;
    } catch {
      return false;
    }
  };

  /** Wakes a stopped sandbox and waits for its sidecar. Returns false on timeout. */
  async function ensureRunning(sandboxId) {
    if ((readyUntil.get(sandboxId) || 0) > Date.now()) return true;

    const alive = (await redis.exists(`sandbox:${sandboxId}`).catch(() => 0)) === 1;
    if (!alive) {
      const res = await fetchImpl(`${sandboxApiUrl}/internal/sandboxes/${sandboxId}/wake`, { method: "POST", headers: internalHeaders });
      if (!res.ok) throw new Error(`wake failed (HTTP ${res.status})`);
    }

    const deadline = Date.now() + opts.wakeTimeoutMs;
    for (;;) {
      if (await sidecarReady(sandboxId)) {
        readyUntil.set(sandboxId, Date.now() + opts.readyCacheMs);
        return true;
      }
      if (Date.now() >= deadline) return false;
      await sleep(opts.readyPollMs);
    }
  }

  /** Short sandbox token with the MCP token's scopes, cached until 60s before expiry. */
  async function sandboxTokenFor(record) {
    const cached = sandboxTokens.get(record.id);
    if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    const res = await fetchImpl(`${authUrl}/internal/sandbox-token`, {
      method: "POST",
      headers: internalHeaders,
      body: JSON.stringify({
        userId: record.userId,
        sandboxId: record.sandboxId,
        scopes: record.scopes,
        ttlSeconds: opts.sandboxTokenTtlSeconds,
      }),
    });
    if (!res.ok) throw new Error(`sandbox token failed (HTTP ${res.status})`);
    const { token, expiresIn } = await res.json();
    sandboxTokens.set(record.id, { token, expiresAt: Date.now() + expiresIn * 1000 });
    return token;
  }

  const recordUse = (tokenId) => {
    if ((lastUsedWrite.get(tokenId) || 0) + opts.usedWriteEveryMs > Date.now()) return;
    lastUsedWrite.set(tokenId, Date.now());
    redis.set(`mcptoken-used:${tokenId}`, String(Date.now()), "EX", 90 * 86_400).catch(() => {});
  };

  const proxy = createProxyMiddleware({
    changeOrigin: true,
    proxyTimeout: opts.proxyTimeoutMs,
    router: (req) => sidecarOrigin(req.mcp.sandboxId),
    pathRewrite: () => "/mcp",
    on: {
      proxyReq: (proxyReq, req) => {
        // Only the sandbox token goes upstream, never the user's MCP token or cookies.
        proxyReq.setHeader("Authorization", `Bearer ${req.mcp.sandboxToken}`);
        proxyReq.removeHeader("cookie");
        proxyReq.removeHeader("x-internal-token");
      },
      error: (err, _req, res) => {
        if (!res.headersSent) jsonRpcError(res, 502, `The sandbox did not answer: ${err.message}`);
      },
    },
  });

  return async function mcpGateway(req, res, next) {
    if (req.method !== "POST") {
      return jsonRpcError(res, 405, "Use POST. This MCP endpoint is stateless.", { Allow: "POST" });
    }
    const { sandboxId } = req.params;
    if (!SANDBOX_ID_PATTERN.test(sandboxId || "")) return jsonRpcError(res, 404, "Unknown sandbox.");

    const [scheme, rawToken] = String(req.headers.authorization || "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !rawToken) {
      return jsonRpcError(res, 401, "Missing MCP token. Create one in Taksha: project, Connect your own agent.", { "WWW-Authenticate": "Bearer" });
    }

    try {
      const record = await resolveToken(rawToken);
      if (!record || Date.parse(record.expiresAt) <= Date.now()) {
        return jsonRpcError(res, 401, "This MCP token is invalid, expired or revoked.", { "WWW-Authenticate": "Bearer" });
      }
      if (record.sandboxId !== sandboxId) return jsonRpcError(res, 403, "This MCP token is for a different project.");
      if (await overRateLimit(record.id)) {
        return jsonRpcError(res, 429, "Too many MCP calls. Wait a minute.", { "Retry-After": "60" });
      }
      if (!(await ensureRunning(sandboxId))) {
        return jsonRpcError(res, 503, "The sandbox is starting. Try again in a few seconds.", { "Retry-After": "15" });
      }

      req.mcp = { sandboxId, sandboxToken: await sandboxTokenFor(record) };
      await refreshTTL(sandboxId);
      recordUse(record.id);
      return proxy(req, res, next);
    } catch (err) {
      console.error(`[MCP gateway] ${sandboxId}:`, err.message);
      return jsonRpcError(res, 502, "The MCP gateway could not reach the sandbox services.");
    }
  };
}
