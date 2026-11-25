// internalMcpProxy.js
// Cluster-internal MCP path for Taksha's own services (the AI service):
//
//   POST /internal/sandboxes/<sandboxId>/mcp
//     X-Internal-Token: <INTERNAL_SERVICE_TOKEN>
//     Authorization: Bearer <sandbox token>      (checked by the sidecar)
//
// Before 2026-11-25 the AI service called http://sandbox-service-<id>:3000/mcp
// directly, so an agent's tool calls never refreshed the sandbox idle key
// (sandbox:<id>) and a long run could lose its sandbox after 20 minutes with
// nobody in the editor. Going through the router makes every tool call keep
// the sandbox alive, the same way editor and preview traffic already does.
//
// The ingress sends every path of *.agent.* and *.preview.* hosts to the
// router, so a public request can reach this path too. It is refused when the
// Host is a sandbox host, and always needs the shared internal token.
// Only the sandbox token goes upstream; the sidecar still does its own check.

import crypto from "crypto";
import { createProxyMiddleware } from "http-proxy-middleware";

const SANDBOX_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

// Above the AI client's longest tool timeout (150 s for installs and builds).
const PROXY_TIMEOUT_MS = 180_000;

const jsonError = (res, status, message) => res.status(status).json({ status: "error", message });

const isSandboxHost = (host = "") => /^[^.]+\.(agent|preview)\./i.test(host);

const sameSecret = (given, expected) => {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * @param {object} deps
 * @param {Function} deps.refreshTTL  keeps the sandbox alive (EXPIRE, no-op on a missing key)
 * @param {object} [deps.env]         INTERNAL_SERVICE_TOKEN, SANDBOX_URL_TEMPLATE
 * @param {object} [deps.options]     { proxyTimeoutMs }
 */
export function createInternalMcpProxy({ refreshTTL, env = process.env, options = {} }) {
  const sidecarOrigin = (id) => (env.SANDBOX_URL_TEMPLATE || "http://sandbox-service-{sandboxId}:3000").replace("{sandboxId}", id);

  const proxy = createProxyMiddleware({
    changeOrigin: true,
    proxyTimeout: options.proxyTimeoutMs ?? PROXY_TIMEOUT_MS,
    router: (req) => sidecarOrigin(req.params.sandboxId),
    pathRewrite: () => "/mcp",
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.removeHeader("x-internal-token");
        proxyReq.removeHeader("cookie");
      },
      error: (err, req, res) => {
        console.error(`[Internal MCP] ${req?.params?.sandboxId}: ${err.message}`);
        if (res && !res.headersSent && typeof res.status === "function") jsonError(res, 502, `The sandbox did not answer: ${err.message}`);
      },
    },
  });

  return async function internalMcpProxy(req, res, next) {
    if (isSandboxHost(req.headers.host)) return jsonError(res, 404, "Not found");

    const expected = env.INTERNAL_SERVICE_TOKEN || "";
    if (!expected) return jsonError(res, 503, "Internal calls are not configured");
    if (!sameSecret(req.headers["x-internal-token"], expected)) return jsonError(res, 401, "Unauthorized internal call");

    const { sandboxId } = req.params;
    if (!SANDBOX_ID_PATTERN.test(sandboxId || "")) return jsonError(res, 404, "Unknown sandbox");

    // A Redis hiccup must not fail the tool call itself.
    try {
      await refreshTTL(sandboxId);
    } catch (err) {
      console.error(`[Internal MCP] TTL refresh failed for ${sandboxId}: ${err.message}`);
    }
    return proxy(req, res, next);
  };
}
