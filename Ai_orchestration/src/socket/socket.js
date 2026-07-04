import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { createAgentForModel } from "../agent/code.agent.js";
import ChatMessage from "../models/ChatMessage.model.js";
import { checkAiCredit, recordAiUsage } from "../services/credit.service.js";

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
  const payloadError = payload?.error || {};
  const code = payload?.code || payloadError?.code || error?.code || "";
  const statusText = payload?.status || payloadError?.status || "";
  const message = [
    getErrorMessage(error, ""),
    payloadError?.message,
    payload?.error,
    statusText,
    code,
  ].filter(Boolean).join(" ");

  return (
    status === 429 ||
    String(code) === "1300" ||
    String(statusText).toUpperCase() === "RESOURCE_EXHAUSTED" ||
    payload?.type === "rate_limited" ||
    /rate limit|rate_limited|too many requests|quota|resource exhausted|exceeded|insufficient quota|billing|credits/i.test(message)
  );
};

const isModelTimeoutError = (error) =>
  error?.code === "MODEL_CALL_TIMEOUT" ||
  error?.message === "MODEL_CALL_TIMEOUT";

const createProviderFallbackError = (model, reason) => {
  const providerLabel = model.provider
    ? `${model.provider[0].toUpperCase()}${model.provider.slice(1)}`
    : "The selected AI provider";
  const error = new Error(
    `${providerLabel} is not responding before the agent can start tools. ${reason === "rate_limit"
      ? "This usually means the provider API quota, billing, or rate limit has been reached."
      : "The model call timed out before returning a tool call or response."} Add another provider key, wait for the provider limit to reset, or select a different provider.`
  );
  error.code = reason === "rate_limit" ? "PROVIDER_RATE_LIMIT" : "PROVIDER_MODEL_TIMEOUT";
  error.company = model.provider;
  return error;
};

const truncateForPrompt = (value, maxLength) => {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n[truncated ${text.length - maxLength} characters]`;
};

const parseToolWriterMessage = (message) => {
  const text = String(message || "");
  const [rawToolName] = text.split(":");
  const toolName = rawToolName?.trim() || "tool";
  const lower = text.toLowerCase();
  const level = lower.includes("error") || lower.includes("failed")
    ? "error"
    : lower.includes("success") || lower.includes("finished")
      ? "success"
      : "info";

  return { toolName, level, message: text };
};

export const initSocketIO = (server) => {
  const activeAgentRuns = new Map();

  const getRunKey = (socket, projectId) =>
    `${socket.user?.id || "anonymous"}:${projectId}`;

  const serializeRun = (run) => ({
    projectId: run.projectId,
    sandboxId: run.sandboxId,
    message: run.message,
    model: run.model || null,
    status: run.status || null,
    assistantText: run.assistantText || "",
    toolLogs: run.toolLogs || [],
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
  });

  const emitToRun = (runKey, eventName, payload = {}) => {
    const run = activeAgentRuns.get(runKey);
    if (!run) return;

    run.updatedAt = new Date().toISOString();
    if (eventName === "agent:status") run.status = payload;
    if (eventName === "agent:model") run.model = payload;

    for (const socketId of [...run.sockets]) {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (!targetSocket?.connected) {
        run.sockets.delete(socketId);
        continue;
      }
      targetSocket.emit(eventName, payload);
    }
  };

  const attachSocketToRun = (socket, runKey) => {
    const run = activeAgentRuns.get(runKey);
    if (!run) return null;
    run.sockets.add(socket.id);
    socket.data.activeAgentRunKey = runKey;
    return run;
  };

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
      socket.authToken = token;
      next();
    } catch (err) {
      console.warn(`[Socket Auth] Connection rejected for socket ${socket.id} - Invalid token: ${err.message}`);
      return next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`WebSocket client connected: ${socket.id}`);

    socket.on("agent:subscribe", ({ projectId } = {}) => {
      if (!projectId) {
        socket.emit("agent:active_run", { active: false });
        return;
      }

      const runKey = getRunKey(socket, projectId);
      const run = attachSocketToRun(socket, runKey);
      if (!run) {
        socket.emit("agent:active_run", { active: false, projectId });
        return;
      }

      socket.emit("agent:active_run", {
        active: true,
        run: serializeRun(run),
      });

      if (run.status) socket.emit("agent:status", run.status);
      if (run.model) socket.emit("agent:model", run.model);
    });

    socket.on("agent:invoke", async ({ message, projectId, sandboxId, modelName, attachments }) => {
      console.log(`Received agent:invoke from ${socket.id} for project ${projectId} (sandboxId=${sandboxId}, modelName=${modelName}, attachmentsCount=${attachments ? attachments.length : 0})`);

      if(!message) {
        socket.emit("agent:error", { message: "Message is required" });
        return;
      }

      const runKey = getRunKey(socket, projectId);
      if (activeAgentRuns.has(runKey)) {
        const run = attachSocketToRun(socket, runKey);
        socket.emit("agent:active_run", {
          active: true,
          run: serializeRun(run),
        });
        socket.emit("agent:error", {
          message: "Orion is already running a task for this project. Please wait for it to finish before starting another.",
          code: "AGENT_RUN_IN_PROGRESS",
        });
        return;
      }

      const abortController = new AbortController();
      activeAgentRuns.set(runKey, {
        abortController,
        sockets: new Set([socket.id]),
        projectId,
        sandboxId: sandboxId || projectId,
        userId: socket.user?.id,
        message,
        assistantText: "",
        toolLogs: [],
        status: null,
        model: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const activeRun = activeAgentRuns.get(runKey);
      socket.data.activeAgentRunKey = runKey;

      let assistantText = "";
      let toolLogs = [];
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let hasToolStarted = false;
      let statusHeartbeat = null;
      let effectiveModelForUsage = null;

      try {
        emitToRun(runKey, "agent:status", {
          phase: "queued",
          title: "Preparing run",
          detail: "Loading project context",
        });

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
          .limit(3);
        
        // Chronological order: older messages first
        history.reverse();
        
        // Map history to the model message format: send only content and timestamp to the agent to save tokens.
        const formattedHistory = history.map((h, index) => {
          const timestampStr = h.timestamp ? new Date(h.timestamp).toISOString() : new Date().toISOString();
          let content = `[${timestampStr}] ${truncateForPrompt(h.content, 4_000)}`;

          // Append attachments context to the active (last) user message
          if (index === history.length - 1 && h.role === "user" && attachments && attachments.length > 0) {
            const contextText = attachments.map(att => 
              `=== ATTACHED FILE CONTEXT ===\nFile: ${att.path}\nContent:\n\`\`\`\n${truncateForPrompt(att.content, 12_000)}\n\`\`\``
            ).join("\n\n");
            content += `\n\n${contextText}`;
          }

          return {
            role: h.role,
            content
          };
        });

        const runAgentWithModel = async ({ agent: agentInstance, model }, retryOf = null, retryReason = null) => {
          if (abortController.signal.aborted) {
            const error = new Error("AGENT_STOPPED");
            error.code = "AGENT_STOPPED";
            throw error;
          }

          const isMeteredPlan = socket.user?.subscription === "pro" || socket.user?.subscription === "max";
          const creditCheck = isMeteredPlan
            ? { hasCredit: true, billable: true, subscription: socket.user.subscription }
            : await checkAiCredit({
                authToken: socket.authToken,
                company: model.provider,
              });

          if (!creditCheck.hasCredit) {
            const error = new Error(`Insufficient ${model.provider} credits. Free users receive 20 credits per model company. Please upgrade to Pro to continue.`);
            error.code = "INSUFFICIENT_CREDITS";
            error.company = model.provider;
            throw error;
          }

          effectiveModelForUsage = model;

          const modelEvent = {
            requestedModel: "mistralLarge",
            modelId: model.id,
            label: model.label,
            provider: model.provider,
            fallback: false,
            fallbackFrom: null,
          };

          const modelLog = `model: using ${model.label} (${model.provider})`;
          toolLogs.push(modelLog);
          activeRun.toolLogs = toolLogs;
          emitToRun(runKey, "agent:model", modelEvent);
          emitToRun(runKey, "agent:status", {
            phase: "model",
            title: "Model ready",
            detail: `${model.label} is starting the agent graph`,
          });
          console.log(`[CodingAgent] Effective model for project ${projectId}: ${model.label} (${model.id})`);

          if (statusHeartbeat) clearInterval(statusHeartbeat);
          statusHeartbeat = setInterval(() => {
            if (!abortController.signal.aborted) {
              emitToRun(runKey, "agent:status", {
                phase: "working",
                title: "Still working",
                detail: "Waiting for model or tool results",
              });
            }
          }, 8_000);

          const AGENT_TIMEOUT_MS = 3 * 60 * 1000;
          let timedOut = false;
          const timeoutId = setTimeout(() => {
            if (!abortController.signal.aborted) {
              timedOut = true;
              abortController.abort();
            }
          }, AGENT_TIMEOUT_MS);

          try {
            const eventStream = await agentInstance.streamEvents(
              {
                messages: formattedHistory,
              },
              {
                version: "v2",
                signal: abortController.signal,
                configurable: { projectId: sandboxId || projectId }, // Use sandboxId (UUID) for K8s service routing
                recursionLimit: 35,
                writer: (msg) => {
                  console.log(`[Agent Project ${projectId}]: ${msg}`);
                  const parsedLog = parseToolWriterMessage(msg);
                  toolLogs.push(parsedLog.message);
                  activeRun.toolLogs = toolLogs;
                  hasToolStarted = true;
                  emitToRun(runKey, "agent:tool_log", parsedLog);
                },
              }
            );

            for await (const event of eventStream) {
              if (abortController.signal.aborted) {
                const error = new Error(timedOut ? "AGENT_TIMEOUT" : "AGENT_STOPPED");
                error.code = timedOut ? "AGENT_TIMEOUT" : "AGENT_STOPPED";
                throw error;
              }

              const eventType = event.event;

              if (eventType === "on_chat_model_start") {
                emitToRun(runKey, "agent:status", {
                  phase: "thinking",
                  title: "Thinking",
                  detail: "Orion is deciding the next action",
                });
              }

              // 1. Stream LLM thinking/tokens
              else if (eventType === "on_chat_model_stream") {
                const content = event.data?.chunk?.content;
                if (content) {
                  assistantText += content;
                  activeRun.assistantText = assistantText;
                  emitToRun(runKey, "agent:thinking", content);
                }
              }

              // Accumulate token usage on chat model end
              else if (eventType === "on_chat_model_end") {
                emitToRun(runKey, "agent:status", {
                  phase: "model",
                  title: "Model step complete",
                  detail: "Processing next agent action",
                });

                const usage = event.data?.output?.usage_metadata || event.data?.output?.response_metadata?.tokenUsage || event.data?.output?.response_metadata?.usage;
                if (usage) {
                  promptTokens += usage.input_tokens || usage.prompt_tokens || usage.promptTokens || 0;
                  completionTokens += usage.output_tokens || usage.completion_tokens || usage.completionTokens || 0;
                  totalTokens += usage.total_tokens || usage.totalTokens || 0;
                }
              }

              // 2. Stream Tool Execution Start
              else if (eventType === "on_tool_start") {
                hasToolStarted = true;
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
                activeRun.toolLogs = toolLogs;
                emitToRun(runKey, "agent:status", {
                  phase: "tool",
                  title: `Running ${toolName}`,
                  detail: inputStr || "Executing tool",
                });

                emitToRun(runKey, "agent:tool_start", {
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
                activeRun.toolLogs = toolLogs;
                emitToRun(runKey, "agent:status", {
                  phase: "tool",
                  title: `${toolName} finished`,
                  detail: outputStr || "Tool completed",
                });

                emitToRun(runKey, "agent:tool_end", {
                  toolName,
                  output,
                });
              }
            }
          } catch (streamError) {
            if (abortController.signal.aborted) {
              const error = new Error(timedOut ? "AGENT_TIMEOUT" : "AGENT_STOPPED");
              error.code = timedOut ? "AGENT_TIMEOUT" : "AGENT_STOPPED";
              throw error;
            }
            throw streamError;
          } finally {
            clearTimeout(timeoutId);
          }
        };

        const selectedAgent = createAgentForModel();
        await runAgentWithModel(selectedAgent);

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

        const totalTokensUsed = totalTokens || (promptTokens + completionTokens);
        if (totalTokensUsed > 0 && effectiveModelForUsage) {
          try {
            await recordAiUsage({
              authToken: socket.authToken,
              userId: socket.user?.id,
              company: effectiveModelForUsage.provider,
              modelId: effectiveModelForUsage.id,
              agentType: "codingAgent",
              projectId,
              promptTokens,
              completionTokens,
              totalTokens: totalTokensUsed,
            });
          } catch (usageErr) {
            console.error("Failed to record coding agent credit usage:", usageErr.message);
          }
        }

        // 4. Send completion done signal
        emitToRun(runKey, "agent:status", {
          phase: "done",
          title: "Finishing",
          detail: "Saving final report",
        });
        emitToRun(runKey, "agent:done");
      } catch (error) {
        if (error.code === "AGENT_STOPPED" || error.message === "AGENT_STOPPED") {
          const stoppedText = assistantText || "Stopped by user before completion.";
          toolLogs = [...toolLogs, "agent: stopped by user"];

          try {
            await ChatMessage.create({
              projectId,
              userId: socket.user?.id,
              agentType: "codingAgent",
              role: "assistant",
              content: stoppedText,
              toolLogs,
              tokenUsage: {
                promptTokens,
                completionTokens,
                totalTokens: totalTokens || (promptTokens + completionTokens),
              },
            });
          } catch (dbErr) {
            console.error("Failed to save stopped response to database:", dbErr);
          }

          const totalTokensUsed = totalTokens || (promptTokens + completionTokens);
          if (totalTokensUsed > 0 && effectiveModelForUsage) {
            try {
              await recordAiUsage({
                authToken: socket.authToken,
                userId: socket.user?.id,
                company: effectiveModelForUsage.provider,
                modelId: effectiveModelForUsage.id,
                agentType: "codingAgent",
                projectId,
                promptTokens,
                completionTokens,
                totalTokens: totalTokensUsed,
              });
            } catch (usageErr) {
              console.error("Failed to record stopped coding agent credit usage:", usageErr.message);
            }
          }

          activeRun.assistantText = stoppedText;
          activeRun.toolLogs = toolLogs;
          emitToRun(runKey, "agent:stopped", {
            message: "Orion stopped the current task.",
            text: stoppedText,
          });
          return;
        }

        const isTimeout = error.message === "AGENT_TIMEOUT";
        const isProviderRateLimited = error.code === "PROVIDER_RATE_LIMIT";
        const isProviderModelTimeout = error.code === "PROVIDER_MODEL_TIMEOUT";
        const isModelTimeout = isModelTimeoutError(error);
        const isRateLimited = isRateLimitError(error);
        const status = getErrorStatus(error);
        const code = isTimeout
          ? "AGENT_TIMEOUT"
          : isProviderRateLimited
            ? "PROVIDER_RATE_LIMIT"
          : isProviderModelTimeout
            ? "PROVIDER_MODEL_TIMEOUT"
          : isModelTimeout
            ? "MODEL_CALL_TIMEOUT"
          : error.code === "INSUFFICIENT_CREDITS"
            ? "INSUFFICIENT_CREDITS"
          : isRateLimited
            ? getErrorCode(error) || "RATE_LIMIT"
            : getErrorCode(error);
        const messageText = isTimeout
          ? "Agent timed out. The task may be too large — try breaking it into smaller steps."
          : isProviderRateLimited || isProviderModelTimeout
            ? error.message
          : isModelTimeout
            ? "The selected AI model did not respond in time. Try another model or retry the request."
          : error.code === "INSUFFICIENT_CREDITS"
            ? error.message
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

        const totalTokensUsed = totalTokens || (promptTokens + completionTokens);
        if (totalTokensUsed > 0 && effectiveModelForUsage) {
          try {
            await recordAiUsage({
              authToken: socket.authToken,
              userId: socket.user?.id,
              company: effectiveModelForUsage.provider,
              modelId: effectiveModelForUsage.id,
              agentType: "codingAgent",
              projectId,
              promptTokens,
              completionTokens,
              totalTokens: totalTokensUsed,
            });
          } catch (usageErr) {
            console.error("Failed to record failed coding agent credit usage:", usageErr.message);
          }
        }

        emitToRun(runKey, "agent:error", { message: messageText, code, company: error.company });
      } finally {
        if (statusHeartbeat) clearInterval(statusHeartbeat);
        activeAgentRuns.delete(runKey);
        if (socket.data.activeAgentRunKey === runKey) {
          delete socket.data.activeAgentRunKey;
        }
      }
    });

    socket.on("agent:stop", ({ projectId } = {}) => {
      const runKey = socket.data.activeAgentRunKey || getRunKey(socket, projectId);
      const activeRun = activeAgentRuns.get(runKey);

      if (!activeRun) {
        socket.emit("agent:status", {
          phase: "stop",
          title: "No active run",
          detail: "There is no Orion task to stop",
        });
        return;
      }

      emitToRun(runKey, "agent:status", {
        phase: "stop",
        title: "Stopping Orion",
        detail: "Cancelling the active agent stream",
      });
      activeRun.abortController.abort();
    });

    socket.on("disconnect", () => {
      const runKey = socket.data.activeAgentRunKey;
      const activeRun = runKey ? activeAgentRuns.get(runKey) : null;
      if (activeRun) {
        activeRun.sockets.delete(socket.id);
      }
      console.log(`WebSocket client disconnected: ${socket.id}`);
    });
  });

  return io;
};
