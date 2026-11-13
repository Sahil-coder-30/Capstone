// A fake sandbox sidecar for tests: a real MCP server (stateless Streamable
// HTTP, like Sandbox/Agent) on 127.0.0.1 whose tools are plain functions.
// Points SANDBOX_URL_TEMPLATE at itself, so the AI service's MCP client talks
// to it exactly as it would to a sandbox pod.

import http from "node:http";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Loose input schemas: the fake only needs to receive the arguments.
const SCHEMAS = {
  list_files: {},
  read_file: { files: z.array(z.string()) },
  create_file: { files: z.array(z.object({ file: z.string(), content: z.string() })) },
  update_file: { updates: z.array(z.object({ file: z.string(), content: z.string() })) },
  patch_file: { filePath: z.string(), oldStr: z.string(), newStr: z.string() },
  delete_file: { files: z.array(z.string()) },
  search_code: { pattern: z.string() },
  execute_command: { command: z.string(), subDir: z.string().optional() },
  get_vite_runtime_errors: {},
};

/**
 * @param {Record<string, (args: object) => object>} handlers tool name -> JSON result
 * @returns {Promise<{ calls: Array<{ sandboxId, tool, args, auth }>, close: Function }>}
 */
export async function startFakeSandbox(handlers) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const sandboxId = req.url.split("/")[1];
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;

    const mcp = new McpServer({ name: "fake-sandbox", version: "1.0.0" });
    for (const [name, handler] of Object.entries(handlers)) {
      mcp.registerTool(name, { inputSchema: SCHEMAS[name] ?? {} }, async (args = {}) => {
        calls.push({ sandboxId, tool: name, args, auth: req.headers.authorization });
        const data = await handler(args);
        const isError = data?.status === "error" || data?.error === true || data?.success === false;
        return { content: [{ type: "text", text: JSON.stringify(data) }], isError };
      });
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.SANDBOX_URL_TEMPLATE = `http://127.0.0.1:${server.address().port}/{sandboxId}`;
  return { calls, close: () => server.close() };
}
