// logs.controller.js
// Dev server logs (vite-runtime-errors tool, MCP only) and browser error
// reports from the preview app (open REST route, see routes/agent.routes.js).

import { readViteLogTail } from "../workspace/logs.js";
import { cleanErrorReport, createReportLimiter } from "../workspace/errorReports.js";
import { emitToAll } from "../sockets/socket.js";

// Open route (the preview app posts without a token): input is cleaned and
// rate limited in workspace/errorReports.js.
const reportOverLimit = createReportLimiter();

export const reportError = (req, res) => {
  if (reportOverLimit()) {
    return res.status(429).json({ status: "error", message: "Too many error reports" });
  }
  const { type, message, source, line, col, stack } = cleanErrorReport(req.body);
  console.error(`[Browser Error] Type: ${type}`);
  console.error(`Message: ${message}`);
  if (source) console.error(`Source: ${source}:${line}:${col}`);
  if (stack) console.error(`Stack: ${stack}`);

  // Broadcast the formatted error to the connected terminal UI(s)
  let titleColor = '\x1b[1;31m'; // Bold red for general runtime errors
  if (type === 'promise') titleColor = '\x1b[1;33m'; // Bold yellow for unhandled rejections
  if (type === 'console') titleColor = '\x1b[1;35m'; // Bold magenta for console.error

  let formattedOutput = `\r\n${titleColor}✖ [Browser Error - ${type.toUpperCase()}]\x1b[0m ${message}\r\n`;
  if (source) {
    formattedOutput += `  \x1b[90mSource:\x1b[0m ${source}:${line}:${col}\r\n`;
  }
  if (stack) {
    // Split stack trace into individual lines and format them
    const cleanStack = stack
      .split('\n')
      .map(line => `    \x1b[90m${line.trim()}\x1b[0m`)
      .join('\r\n');
    formattedOutput += `  \x1b[90mStack Trace:\x1b[0m\r\n${cleanStack}\r\n`;
  }
  formattedOutput += '\r\n';

  emitToAll("terminal-output", formattedOutput);

  res.status(200).json({ status: "ok" });
};

// ─── Dev server logs ───────────────────────────────────────────────────────
// Read from the shared log file (workspace/logs.js). Same response shape as
// before, when the logs came from the Kubernetes API.

export const viteRuntimeErrors = async (req, res) => {
  const podName = process.env.HOSTNAME || null;
  const namespace = "default";
  try {
    res.status(200).json({ success: true, podName, namespace, logs: await readViteLogTail(50) });
  } catch (err) {
    const message = err.code === "ENOENT" ? "The dev server has not written any output yet." : err.message;
    console.error("Error in /api/agent/vite-runtime-errors:", message);
    res.status(err.code === "ENOENT" ? 200 : 500).json(
      err.code === "ENOENT"
        ? { success: true, podName, namespace, logs: "" }
        : { success: false, error: message, podName, namespace },
    );
  }
};
