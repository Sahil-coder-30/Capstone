// server.js
// MCP endpoint of the sandbox: POST /mcp on the sidecar's own port (3000).
//
// - Stateless Streamable HTTP: a fresh server and transport per request, no
//   session to lose when the pod restarts.
// - Auth is the app-wide requireOwner (auth/middleware.js); this file only
//   ever sees requests from the sandbox owner.
// - Only the certified tools (tools.js) are registered.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CERTIFIED_TOOLS } from "./tools.js";
import { invokeRoute } from "./invokeRoute.js";

const SERVER_INFO = { name: "taksha-sandbox", version: "1.0.0" };

const textResult = (data, isError) => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
  isError,
});

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

export function buildMcpServer(routes) {
  const server = new McpServer(SERVER_INFO);
  for (const tool of CERTIFIED_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations },
      async (args = {}) => {
        const { route, query, body, problem } = tool.call(args);
        if (problem) return textResult({ error: true, message: problem }, true);
        try {
          const result = await invokeRoute(routes[route], { query, body });
          return textResult(result.body, isFailure(result.status, result.body));
        } catch (err) {
          return textResult({ error: true, message: err.message }, true);
        }
      },
    );
  }
  return server;
}

export function mountMcpServer(app, routes, { hosts = allowedHosts() } = {}) {
  app.post("/mcp", async (req, res) => {
    const server = buildMcpServer(routes);
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
