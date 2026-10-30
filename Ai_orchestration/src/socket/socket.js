import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { createAgentForModel, onRateLimitEvent } from "../agent/code.agent.js";

const STREAMABLE_NODES = new Set(["general", "coder", "debugger", "finalizer"]);

function extractChunkText(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return item.text || item.content || "";
        }
        return "";
      })
      .join("");
  }
  if (typeof content === "object") {
    return content.text || content.content || "";
  }
  return String(content);
}

function shouldStreamChunk(event) {
  if (
    event.tags?.includes("tool_summary_internal") ||
    event.metadata?.tags?.includes("tool_summary_internal") ||
    event.name?.includes("tool_summary_internal")
  ) {
    return false;
  }
  const nodeName = event.metadata?.langgraph_node;
  if (nodeName) {
    return STREAMABLE_NODES.has(nodeName);
  }
  const name = event.name || "";
  if (name.includes("Summary") || name.includes("tool") || name.includes("Tool")) return false;
  return true;
}

import ChatMessage from "../models/ChatMessage.model.js";
import { checkAiCredit, recordAiUsage } from "../services/credit.service.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { resolveOwnedSandbox } from "../services/sandboxOwnership.service.js";

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

  // Listen to rate limit events from code.agent.js and broadcast to all active runs
  onRateLimitEvent((event) => {
    console.warn(`[ModelSafety Global] Rate limited (attempt ${event.attempt}); waiting ${event.delayMs}ms`);
    for (const [runKey, run] of activeAgentRuns.entries()) {
      if (run.abortController && !run.abortController.signal.aborted) {
        emitToRun(runKey, "agent:status", {
          phase: "rate_limit",
          title: "Rate Limit Backoff",
          detail: `AI provider rate-limited. Retrying in ${Math.round(event.delayMs / 1000)}s (Attempt ${event.attempt}).`,
        });
      }
    }
  });

  const io = new Server(server, {
    path: "/api/ai/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Verify JWT on connection handshake
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      let token = null;
      if (cookieHeader) {
        const match = cookieHeader.match(/(?:accessToken|token)=([^;]+)/);
        if (match) token = match[1];
      }
      
      if (!token) {
        token = socket.handshake.auth?.token || socket.handshake.query?.token;
      }

      if (!token) {
        console.warn(`[Socket Auth] Connection rejected for socket ${socket.id} - No token provided`);
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = await verifyToken(token);
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

      // Only drive a sandbox the caller owns; the verified id replaces the
      // client-supplied one before it reaches any tool.
      try {
        const owned = await resolveOwnedSandbox({
          authToken: socket.authToken,
          userId: socket.user?.id,
          projectId,
          sandboxId,
        });
        if (owned) sandboxId = owned.sandboxId;
      } catch (err) {
        socket.emit("agent:error", { message: err.message, code: err.errorCode || "FORBIDDEN" });
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
        const userMsgDoc = await ChatMessage.create({
          projectId,
          userId: socket.user?.id,
          agentType: "codingAgent",
          role: "user",
          content: message,
        });
        emitToRun(runKey, "agent:msg_created", { role: "user", id: userMsgDoc._id.toString() });

        // 2. Retrieve last 3 active messages for this project and agent type, filtering out trashed messages
        const history = await ChatMessage.find({
          projectId,
          agentType: "codingAgent",
          deletionStatus: { $ne: "trash" },
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

        const isMeteredPlan = socket.user?.subscription === "pro" || socket.user?.subscription === "max";
        const creditCheck = isMeteredPlan
          ? { hasCredit: true, billable: true, subscription: socket.user.subscription }
          : await checkAiCredit({
              authToken: socket.authToken,
              company: "openrouter",
            });

        if (!creditCheck.hasCredit) {
          const error = new Error(`Insufficient credits. Free users receive 20 credits per model company. Please upgrade to Pro to continue.`);
          error.code = "INSUFFICIENT_CREDITS";
          error.company = "openrouter";
          throw error;
        }

        const initialPayload = {
          messages: formattedHistory,
          task: message,
          plan: null,
          planApproved: false,
          planRevisions: null,
          currentStep: 0,
          routingHistory: null,
          attemptedFixes: null,
          criticPass: false,
          criticFeedback: "",
          buildLog: null,
          testResults: null,
          flaggedFiles: [],
          retryCount: 0,
          escalated: false,
          diffSummary: null,
          taskStatus: "routing",
        };

        const threadId = `${sandboxId || projectId}:${Date.now()}`;
        activeRun.threadId = threadId;
        activeRun.planReviewPending = false;

        const runAgentWithModel = async (agentInstance, inputPayload = initialPayload) => {
          if (abortController.signal.aborted) {
            const error = new Error("AGENT_STOPPED");
            error.code = "AGENT_STOPPED";
            throw error;
          }

          const model = agentInstance.model;
          effectiveModelForUsage = model;
          activeRun.model = model;
          emitToRun(runKey, "agent:model", model);

          emitToRun(runKey, "agent:status", {
            phase: "model",
            title: "Model ready",
            detail: `${model.label} is starting the agent graph`,
          });
          console.log(`[CodingAgent] Effective model for project ${projectId}: ${model.label} (${model.id})`);

          if (statusHeartbeat) clearInterval(statusHeartbeat);
          statusHeartbeat = setInterval(() => {
            if (!abortController.signal.aborted) {
              const currentStatus = activeRun.status || {
                phase: "working",
                title: "Working",
                detail: "Waiting for model or tool results",
              };
              const title = currentStatus.title;
              const formattedTitle = title.toLowerCase().startsWith("still")
                ? title
                : `Still ${title.charAt(0).toLowerCase() + title.slice(1)}`;
              emitToRun(runKey, "agent:status", {
                ...currentStatus,
                title: formattedTitle,
              });
            }
          }, 8_000);

          const AGENT_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
          let timedOut = false;
          const timeoutId = setTimeout(() => {
            if (!abortController.signal.aborted) {
              timedOut = true;
              abortController.abort();
            }
          }, AGENT_TIMEOUT_MS);

          try {
            const eventStream = await agentInstance.streamEvents(
              inputPayload,
              {
                version: "v2",
                signal: abortController.signal,
                configurable: {
                  thread_id: activeRun.threadId,
                  projectId: sandboxId || projectId,
                },
                recursionLimit: 100,
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

              if (eventType === "on_chain_end") {
                const situation = event.data?.output?.currentSituation;
                const nodeName = event.name;
                const plan = event.data?.output?.plan;
                const outputMessages = event.data?.output?.messages;

                if (Array.isArray(outputMessages) && outputMessages.length > 0) {
                  const lastAiMsg = [...outputMessages].reverse().find(
                    (m) => m._getType?.() === "ai" || m.role === "assistant" || m.constructor?.name === "AIMessage"
                  );
                  if (lastAiMsg?.content && typeof lastAiMsg.content === "string") {
                    activeRun.lastAIMessageText = lastAiMsg.content;
                  }
                }

                if (plan && (nodeName === "planner" || !nodeName)) {
                  activeRun.planReviewPending = true;
                  activeRun.plan = plan;
                  emitToRun(runKey, "agent:plan_review", {
                    plan,
                    taskSubType: event.data?.output?.taskSubType,
                    threadId: activeRun.threadId,
                  });
                }

                if (situation) {
                  emitToRun(runKey, "agent:status", {
                    phase: nodeName || "working",
                    title: `Team Node: ${nodeName || "Manager"}`,
                    detail: situation,
                  });
                  emitToRun(runKey, "agent:situation_update", {
                    node: nodeName,
                    situation,
                  });
                }
              }

              else if (eventType === "on_interrupt") {
                const interruptData = event.data?.value;
                if (interruptData?.type === "plan_review") {
                  activeRun.planReviewPending = true;
                  emitToRun(runKey, "agent:plan_review", {
                    plan: interruptData.plan,
                    taskSubType: interruptData.taskSubType,
                    interruptId: event.run_id,
                    threadId: activeRun.threadId,
                  });
                  emitToRun(runKey, "agent:status", {
                    phase: "plan_review",
                    title: "Plan ready for review",
                    detail: `${interruptData.plan?.totalSteps || "?"} steps — approve or reject in the UI`,
                  });
                }
              }

              else if (eventType === "on_chat_model_start") {
                emitToRun(runKey, "agent:status", {
                  phase: "thinking",
                  title: "Thinking",
                  detail: "Orion is deciding the next action",
                });
              }

              // 1. Stream LLM thinking/tokens
              else if (eventType === "on_chat_model_stream") {
                if (shouldStreamChunk(event)) {
                  const rawChunk = event.data?.chunk?.content;
                  const textChunk = extractChunkText(rawChunk);
                  if (textChunk) {
                    assistantText += textChunk;
                    activeRun.assistantText = assistantText;
                    emitToRun(runKey, "agent:thinking", textChunk);
                  }
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

        const completeRun = async () => {
          let assistantMsgDoc = null;
          const effectiveAssistantText = activeRun.lastAIMessageText || assistantText || activeRun.status?.detail || "Task completed.";
          assistantMsgDoc = await ChatMessage.create({
            projectId,
            userId: socket.user?.id,
            agentType: "codingAgent",
            role: "assistant",
            content: effectiveAssistantText,
            toolLogs,
            tokenUsage: {
              promptTokens,
              completionTokens,
              totalTokens: totalTokens || (promptTokens + completionTokens),
            },
          });
          emitToRun(runKey, "agent:msg_created", { role: "assistant", id: assistantMsgDoc._id.toString() });

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

          emitToRun(runKey, "agent:status", {
            phase: "done",
            title: "Finishing",
            detail: "Saving final report",
          });
          emitToRun(runKey, "agent:done", { assistantMsgId: assistantMsgDoc?._id?.toString() });
        };

        const selectedAgent = createAgentForModel();
        activeRun.selectedAgent = selectedAgent;
        activeRun.runAgentWithModel = runAgentWithModel;
        activeRun.completeRun = completeRun;

        await runAgentWithModel(selectedAgent, initialPayload);

        if (activeRun.planReviewPending) {
          // Graph paused at plan review — DO NOT emit agent:done or delete activeRun
          emitToRun(runKey, "agent:status", {
            phase: "plan_review",
            title: "Plan Review Required",
            detail: "Review implementation steps before Orion begins execution",
            status: "paused",
          });
          return;
        }

        await completeRun();
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
          ? "Agent timed out after 60 minutes. The task may be too large or stuck in an infinite loop."
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
        if (!activeRun?.planReviewPending) {
          activeAgentRuns.delete(runKey);
          if (socket.data.activeAgentRunKey === runKey) {
            delete socket.data.activeAgentRunKey;
          }
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

    socket.on("agent:plan_approve", async ({ projectId, sandboxId } = {}) => {
      const runKey = socket.data.activeAgentRunKey || getRunKey(socket, projectId || sandboxId);
      const activeRun = activeAgentRuns.get(runKey);
      if (!activeRun || !activeRun.selectedAgent || !activeRun.runAgentWithModel) return;

      activeRun.planReviewPending = false;
      emitToRun(runKey, "agent:status", {
        phase: "coder",
        title: "Plan Approved",
        detail: "Executing plan steps",
        status: "running",
      });

      try {
        await activeRun.runAgentWithModel(activeRun.selectedAgent, null);
        if (activeRun.planReviewPending) return;

        if (activeRun.completeRun) {
          await activeRun.completeRun();
        }
      } catch (err) {
        console.error("[Socket PlanApprove] Execution failed:", err);
        emitToRun(runKey, "agent:error", { message: err.message });
      } finally {
        if (!activeRun.planReviewPending) {
          activeAgentRuns.delete(runKey);
          if (socket.data.activeAgentRunKey === runKey) {
            delete socket.data.activeAgentRunKey;
          }
        }
      }
    });

    socket.on("agent:plan_reject", async ({ projectId, sandboxId, feedback } = {}) => {
      const runKey = socket.data.activeAgentRunKey || getRunKey(socket, projectId || sandboxId);
      const activeRun = activeAgentRuns.get(runKey);
      if (!activeRun || !activeRun.selectedAgent || !activeRun.runAgentWithModel) return;

      activeRun.planReviewPending = false;
      emitToRun(runKey, "agent:status", {
        phase: "planner",
        title: "Revising Plan",
        detail: feedback ? `Revising with feedback: "${feedback}"` : "Revising implementation plan",
        status: "running",
      });

      try {
        await activeRun.runAgentWithModel(activeRun.selectedAgent, {
          criticFeedback: feedback || "User requested plan changes.",
          planApproved: false,
          plan: null,
        });
      } catch (err) {
        console.error("[Socket PlanReject] Revision failed:", err);
        emitToRun(runKey, "agent:error", { message: err.message });
      }
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
