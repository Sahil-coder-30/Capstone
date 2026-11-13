import express from "express";
import morgan from "morgan";
import { corsForEditor, requireOwner } from "../middleware/auth.middleware.js";
import { toolHandlers } from "../controllers/index.js";
import agentRouter from "../routes/agent.routes.js";
import { mountMcpServer } from "../mcp/server.js";

const app = express();
app.use(morgan("combined"));
// Auth runs before body parsing, so unauthenticated requests are rejected
// without reading their bodies. See middleware/auth.middleware.js for the open routes.
app.use(corsForEditor);
app.use(requireOwner);
// 5 MB: whole files are written through create-file / update-file and MCP.
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Health and readiness: Kubernetes probes and the router's MCP gateway (open routes).
app.get("/api/agent/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Agent API is working fine",
  });
});

app.get("/api/agent/ready", (req, res) => {
  res.status(200).json({
    status: "ready",
    message: "Agent API is ready to accept traffic",
  });
});

app.use("/api/agent", agentRouter);

// POST /mcp exposes the certified tools (mcp/tools.js) over the controller
// handlers. Protected by requireOwner like every other route.
mountMcpServer(app, toolHandlers);

export default app;
