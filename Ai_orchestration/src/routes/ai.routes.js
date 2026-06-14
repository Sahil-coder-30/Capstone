import { Router } from "express";
import agent from "../agent/code.agent.js";

const aiRouter = Router();

aiRouter.post("/invoke", async (req, res) => {
  const { message, projectId } = req.body;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  // Tool prefixes — messages starting with these are internal progress logs,
  // not the agent's final reply to the user.
  const TOOL_PREFIXES = [
    "listFiles:",
    "readFile:",
    "updateFile:",
    "createFile:",
    "patchFile:",
    "executeCommand:",
    "getViteRuntimeErrors:",
  ];

  const isToolLog = (msg) =>
    typeof msg === "string" && TOOL_PREFIXES.some((p) => msg.startsWith(p));

  try {
    // Accumulates the agent's final reply text (non-tool writer messages).
    const finalChunks = [];

    await agent.stream(
      {
        messages: [{ role: "user", content: message }],
      },
      {
        configurable: { projectId },
        recursionLimit: 200,
        streamMode: "custom",
        writer: (msg) => {
          try {
            const data = typeof msg === "string" ? msg : JSON.stringify(msg);

            if (isToolLog(msg)) {
              // Internal tool progress — stream as a plain `data:` event
              res.write(`data: ${data}\n\n`);
              console.log("tool log:", data);
            } else {
              // This is the agent's final reply to the user
              finalChunks.push(data);
              console.log("agent reply chunk:", data);
            }
          } catch (e) {
            console.error("writer error:", e);
          }
        },
      },
    );

    // With streamMode:"custom" the for-await loop yields nothing useful,
    // so the final response is assembled entirely from the writer captures above.
    const finalResponse = finalChunks.join("");

    if (finalResponse) {
      // Send the agent's reply as a distinct SSE event type so the client
      // can tell it apart from tool-log `data:` events.
      res.write(`event: final\ndata: ${finalResponse}\n\n`);
      console.log("final agent response sent:", finalResponse);
    } else {
      console.warn("No final response captured from agent — writer received no non-tool messages.");
    }

    // Clean SSE termination signal
    res.write(`event: done\ndata: [DONE]\n\n`);
    res.end();
  } catch (error) {
    console.error("agent invocation error:", error);
    res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || "Internal server error", code: error.lc_error_code || null })}\n\n`);
    res.end();
  }
});

export default aiRouter;
