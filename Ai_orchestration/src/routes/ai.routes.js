import { Router } from "express";
import agent from "../agent/code.agent.js";

const aiRouter = Router();

const getErrorPayload = (error) => {
  return error?.response?.data || error?.cause?.response?.data || null;
};

const getErrorStatus = (error) => {
  return (
    error?.status || error?.response?.status || error?.cause?.status || null
  );
};

const getErrorCode = (error) => {
  const payload = getErrorPayload(error);
  return payload?.code || error?.lc_error_code || error?.code || null;
};

const getErrorMessage = (error, fallback = "Internal server error") => {
  const payload = getErrorPayload(error);
  if (payload?.message) return payload.message;
  if (error?.message) return error.message;
  return fallback;
};

const isRateLimitError = (error) => {
  const status = getErrorStatus(error);
  const payload = getErrorPayload(error);
  const message = getErrorMessage(error, "");

  return (
    status === 429 ||
    payload?.code === "1300" ||
    payload?.type === "rate_limited" ||
    /rate limit|rate_limited/i.test(message)
  );
};

aiRouter.post("/invoke", async (req, res) => {
  const { message, projectId } = req.body;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  if (!message) {
    // Can't send JSON after writeHead — send an SSE error event instead
    res.write(
      `event: error\ndata: ${JSON.stringify({ message: "message is required" })}\n\n`,
    );
    return res.end();
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

  // ── SSE heartbeat ─────────────────────────────────────────────────────────
  // Proxies (nginx, http-proxy-middleware) and browsers close "silent" SSE
  // connections even within the configured timeout window.
  // A comment line (": heartbeat") is invisible to EventSource listeners but
  // keeps the TCP connection alive through every proxy in the chain.
  const HEARTBEAT_INTERVAL_MS = 15_000; // 15 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch (_) {
      // Connection already closed — heartbeat will be cleared below
    }
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => clearInterval(heartbeat);

  try {
    // Accumulates the agent's final reply text (non-tool writer messages).
    const finalChunks = [];

    // ── Hard wall-clock deadline ───────────────────────────────────────────
    // recursionLimit caps tool-call count, but a single hung axios call
    // (e.g. npm install stalling, getViteRuntimeErrors on a dead pod)
    // can block the entire stream indefinitely.
    // Promise.race() enforces a real time limit regardless.
    const AGENT_TIMEOUT_MS = 4.5 * 60 * 1000; // 4.5 min — under nginx's 5 min
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("AGENT_TIMEOUT")),
        AGENT_TIMEOUT_MS,
      );
    });

    // agent.stream() returns a Promise — assign without awaiting so we can race it
    const agentStream = agent.stream(
      {
        messages: [{ role: "user", content: message }],
      },
      {
        configurable: { projectId },
        recursionLimit: 50,
        streamMode: "custom",
        writer: (msg) => {
          try {
            const data = typeof msg === "string" ? msg : JSON.stringify(msg);
            if (isToolLog(msg)) {
              res.write(`data: ${data}\n\n`);
              console.log("tool log:", data);
            } else {
              finalChunks.push(data);
              console.log("agent reply chunk:", data);
            }
          } catch (e) {
            console.error("writer error:", e);
          }
        },
      },
    );

    await Promise.race([agentStream, timeoutPromise]).finally(() =>
      clearTimeout(timeoutId),
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
      console.warn(
        "No final response captured from agent — writer received no non-tool messages.",
      );
    }

    // Clean SSE termination signal
    res.write(`event: done\ndata: [DONE]\n\n`);
    cleanup();
    res.end();
  } catch (error) {
    const isTimeout = error.message === "AGENT_TIMEOUT";
    const isRateLimited = isRateLimitError(error);
    const status = getErrorStatus(error);
    const code = isTimeout
      ? "AGENT_TIMEOUT"
      : isRateLimited
        ? getErrorCode(error) || "RATE_LIMIT"
        : getErrorCode(error);
    const message = isTimeout
      ? "Agent timed out after 4.5 minutes. The task may be too large — try breaking it into smaller steps."
      : isRateLimited
        ? "The AI provider is temporarily rate-limiting requests. Please wait a moment and try again."
        : getErrorMessage(error);

    console.error("agent invocation error:", {
      message: error.message,
      status,
      code,
      isRateLimited,
    });

    res.write(
      `event: error\ndata: ${JSON.stringify({
        message,
        code,
      })}\n\n`,
    );
    cleanup();
    res.end();
  }
});

export default aiRouter;
