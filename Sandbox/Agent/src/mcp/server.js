// server.js
// MCP endpoint of the sandbox: POST /mcp on the sidecar's own port (3000).
//
// - Stateless Streamable HTTP: a fresh server and transport per request, no
//   session to lose when the pod restarts.
// - Auth is the app-wide requireOwner (middleware/auth.middleware.js); this file only
//   ever sees requests from the sandbox owner.
// - Only the certified tools (tools.js) are registered, and for a scoped
//   token (external agent) only the tools in its scopes.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CERTIFIED_TOOLS } from "./tools.js";
import { invokeRoute } from "./invokeRoute.js";
import { scopesOf } from "../middleware/auth.middleware.js";

const SERVER_INFO = { name: "taksha-sandbox", version: "1.0.0" };

const textResult = (data, isError) => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
  isError,
});

// KEY=value, --token value, "Bearer x" and known token prefixes, masked before a command is logged.
const SECRET_IN_TEXT = /([\w-]*(?:key|token|secret|passw(?:or)?d)[\w-]*\s*[=:]\s*|--?[\w-]*(?:key|token|secret|password)[\w-]*\s+|bearer\s+|\b(?:tks_mcp_|nvapi-|sk-))\S+/gi;

/** File paths, pattern or command of a call, for the log line. Never file contents. */
export const argSummary = (args = {}) => {
  const files = args.files || args.updates;
  const text = files ? files.map((f) => f?.file ?? f).join(",") : (args.filePath ?? args.pattern ?? args.command ?? "");
  return String(text).replace(SECRET_IN_TEXT, "$1***").slice(0, 80);
};

const isFailure = (status, body) =>
  status >= 400 || body?.success === false || body?.status === "error" || body?.error === true;

/** Hosts the endpoint answers to: the in-cluster Service, the router host, and local calls. */
const allowedHosts = () => {
  const id = process.env.SANDBOX_ID;
  const extra = (process.env.MCP_ALLOWED_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);
  return [
    ...(id ? [`sandbox-service-${id}:3000`, `sandbox-service-${id}`, `${id}.agent.localhost`] : []),
    "localhost:3000",
    "127.0.0.1:3000",
    ...extra,
  ];
};

/**
 * @param {object} routes  REST handlers by name
 * @param {string[] | null} scopes  null = every certified tool; otherwise only
 *   tools whose scope is listed (tokens for external agents)
 */
export function buildMcpServer(routes, scopes = null) {
  const server = new McpServer(SERVER_INFO);
  for (const tool of CERTIFIED_TOOLS) {
    if (scopes && !scopes.includes(tool.scope)) continue;
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations },
      async (args = {}) => {
        const started = Date.now();
        const log = (outcome) =>
          console.log(`[MCP] tool=${tool.name} ${argSummary(args)} -> ${outcome} ${Date.now() - started}ms${scopes ? " (external agent)" : ""}`);
        const { route, query, body, problem } = tool.call(args);
        if (problem) {
          log(`rejected: ${problem}`);
          return textResult({ error: true, message: problem }, true);
        }
        try {
          const result = await invokeRoute(routes[route], { query, body });
          const failed = isFailure(result.status, result.body);
          log(!failed ? "ok" : result.status >= 400 ? `error HTTP ${result.status}` : "not done");
          return textResult(result.body, failed);
        } catch (err) {
          log(`error: ${err.message}`);
          return textResult({ error: true, message: err.message }, true);
        }
      },
    );
  }
  return server;
}

export function mountMcpServer(app, routes, { hosts = allowedHosts() } = {}) {
  app.post("/mcp", async (req, res) => {
    const server = buildMcpServer(routes, scopesOf(req.auth));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: hosts,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[MCP] request failed:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      }
    }
  });

  // Stateless: no SSE stream to resume and no session to delete.
  const notAllowed = (_req, res) =>
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);
}
