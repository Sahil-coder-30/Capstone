import { Server } from "socket.io";
import agent from "../agent/code.agent.js";

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

export const initSocketIO = (server) => {
  const io = new Server(server, {
    path: "/api/ai/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`WebSocket client connected: ${socket.id}`);

    socket.on("agent:invoke", async ({ message, projectId }) => {
      console.log(`Received agent:invoke from ${socket.id} for project ${projectId}`);

      if(!message) {
        socket.emit("agent:error", { message: "Message is required" });
        return;
      }

      try {
        const eventStream = await agent.streamEvents(
          {
            messages: [{ role: "user", content: message }],
          },
          {
            version: "v2",
            configurable: { projectId },
            recursionLimit: 50,
            writer: (msg) => {
              console.log(`[Agent Project ${projectId}]: ${msg}`);
            },
          }
        );

        for await (const event of eventStream) {
          // If client disconnected, stop processing the stream immediately to save tokens
          if (!socket.connected) {
            console.log(`Client ${socket.id} disconnected. Aborting agent stream.`);
            break;
          }

          const eventType = event.event;

          // 1. Stream LLM thinking/tokens
          if (eventType === "on_chat_model_stream") {
            const content = event.data?.chunk?.content;
            if (content) {
              socket.emit("agent:thinking", content);
            }
          }

          // 2. Stream Tool Execution Start
          else if (eventType === "on_tool_start") {
            socket.emit("agent:tool_start", {
              toolName: event.name,
              input: event.data?.input,
            });
          }

          // 3. Stream Tool Execution End
          else if (eventType === "on_tool_end") {
            socket.emit("agent:tool_end", {
              toolName: event.name,
              output: event.data?.output,
            });
          }
        }

        // 4. Send completion done signal
        if (socket.connected) {
          socket.emit("agent:done");
        }
      } catch (error) {
        const isTimeout = error.message === "AGENT_TIMEOUT";
        const isRateLimited = isRateLimitError(error);
        const status = getErrorStatus(error);
        const code = isTimeout
          ? "AGENT_TIMEOUT"
          : isRateLimited
            ? getErrorCode(error) || "RATE_LIMIT"
            : getErrorCode(error);
        const messageText = isTimeout
          ? "Agent timed out. The task may be too large — try breaking it into smaller steps."
          : isRateLimited
            ? "The AI provider is temporarily rate-limiting requests. Please wait a moment and try again."
            : getErrorMessage(error);

        console.error("Agent socket error:", {
          message: error.message,
          status,
          code,
        });

        if (socket.connected) {
          socket.emit("agent:error", { message: messageText, code });
        }
      }
    });

    socket.on("disconnect", () => {
      console.log(`WebSocket client disconnected: ${socket.id}`);
    });
  });

  return io;
};
