import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import agent, { getAgentInstance } from "../agent/code.agent.js";
import ChatMessage from "../models/ChatMessage.model.js";

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

  // Verify JWT on connection handshake
  io.use((socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      let token = null;
      if (cookieHeader) {
        const match = cookieHeader.match(/token=([^;]+)/);
        if (match) token = match[1];
      }
      
      if (!token) {
        token = socket.handshake.auth?.token || socket.handshake.query?.token;
      }

      if (!token) {
        console.warn(`[Socket Auth] Connection rejected for socket ${socket.id} - No token provided`);
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      console.warn(`[Socket Auth] Connection rejected for socket ${socket.id} - Invalid token: ${err.message}`);
      return next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`WebSocket client connected: ${socket.id}`);

    socket.on("agent:invoke", async ({ message, projectId, sandboxId, modelName, attachments }) => {
      console.log(`Received agent:invoke from ${socket.id} for project ${projectId} (sandboxId=${sandboxId}, modelName=${modelName}, attachmentsCount=${attachments ? attachments.length : 0})`);

      if(!message) {
        socket.emit("agent:error", { message: "Message is required" });
        return;
      }

      let assistantText = "";
      let toolLogs = [];
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;

      try {
        // 1. Save user message to database (using persistent MongoDB projectId)
        await ChatMessage.create({
          projectId,
          userId: socket.user?.id,
          agentType: "codingAgent",
          role: "user",
          content: message,
        });

        // 2. Retrieve last 5 messages for this project and agent type, with fallback for backward compatibility
        const history = await ChatMessage.find({
          projectId,
          agentType: "codingAgent",
          $or: [{ userId: socket.user?.id }, { userId: { $exists: false } }],
        })
          .sort({ timestamp: -1 })
          .limit(5);
        
        // Chronological order: older messages first
        history.reverse();
        
        // Map history to the model message format: send only content and timestamp to the agent to save tokens.
        const formattedHistory = history.map((h, index) => {
          const timestampStr = h.timestamp ? new Date(h.timestamp).toISOString() : new Date().toISOString();
          let content = `[${timestampStr}] ${h.content}`;

          // Append attachments context to the active (last) user message
          if (index === history.length - 1 && h.role === "user" && attachments && attachments.length > 0) {
            const contextText = attachments.map(att => 
              `=== ATTACHED FILE CONTEXT ===\nFile: ${att.path}\nContent:\n\`\`\`\n${att.content}\n\`\`\``
            ).join("\n\n");
            content += `\n\n${contextText}`;
          }

          return {
            role: h.role,
            content
          };
        });

        const agentInstance = typeof getAgentInstance === "function" ? getAgentInstance(modelName) : agent;
        const eventStream = await agentInstance.streamEvents(
          {
            messages: formattedHistory,
          },
          {
            version: "v2",
            configurable: { projectId: sandboxId || projectId }, // Use sandboxId (UUID) for K8s service routing
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
              assistantText += content;
              socket.emit("agent:thinking", content);
            }
          }

          // Accumulate token usage on chat model end
          else if (eventType === "on_chat_model_end") {
            const usage = event.data?.output?.usage_metadata || event.data?.output?.response_metadata?.tokenUsage || event.data?.output?.response_metadata?.usage;
            if (usage) {
              promptTokens += usage.input_tokens || usage.prompt_tokens || usage.promptTokens || 0;
              completionTokens += usage.output_tokens || usage.completion_tokens || usage.completionTokens || 0;
              totalTokens += usage.total_tokens || usage.totalTokens || 0;
            }
          }

          // 2. Stream Tool Execution Start
          else if (eventType === "on_tool_start") {
            const toolName = event.name;
            const input = event.data?.input;
            let inputStr = "";
            if (input) {
              try {
                inputStr = typeof input === 'string' ? input : JSON.stringify(input);
              } catch (_) {
                inputStr = String(input);
              }
            }
            if (inputStr.length > 150) inputStr = inputStr.substring(0, 150) + '...';
            toolLogs.push(`${toolName}: starting with input (${inputStr})`);

            socket.emit("agent:tool_start", {
              toolName,
              input,
            });
          }

          // 3. Stream Tool Execution End
          else if (eventType === "on_tool_end") {
            const toolName = event.name;
            const output = event.data?.output;
            let outputStr = "";
            if (output) {
              try {
                const parsed = typeof output === 'string' ? JSON.parse(output) : output;
                if (parsed && typeof parsed === 'object') {
                  outputStr = parsed.error || parsed.output || JSON.stringify(parsed);
                } else {
                  outputStr = String(output);
                }
              } catch (_) {
                outputStr = String(output);
              }
            }
            if (outputStr.length > 150) outputStr = outputStr.substring(0, 150) + '...';
            toolLogs.push(`${toolName}: finished (${outputStr})`);

            socket.emit("agent:tool_end", {
              toolName,
              output,
            });
          }
        }

        // 3. Save assistant message to database
        if (assistantText) {
          await ChatMessage.create({
            projectId,
            userId: socket.user?.id,
            agentType: "codingAgent",
            role: "assistant",
            content: assistantText,
            toolLogs,
            tokenUsage: {
              promptTokens,
              completionTokens,
              totalTokens: totalTokens || (promptTokens + completionTokens),
            },
          });
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

        // Save failed run / error to database
        try {
          await ChatMessage.create({
            projectId,
            userId: socket.user?.id,
            agentType: "codingAgent",
            role: "assistant",
            content: `Error occurred during execution: ${messageText}`,
            toolLogs: (toolLogs && toolLogs.length > 0) ? toolLogs : ["Error occurred during execution"],
            tokenUsage: {
              promptTokens,
              completionTokens,
              totalTokens: totalTokens || (promptTokens + completionTokens),
            },
          });
        } catch (dbErr) {
          console.error("Failed to save error response to database:", dbErr);
        }

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
