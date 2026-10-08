import { appAgent, appModel, getAppModelInfo } from "../agent/clio.agent.js";
import { createAgentForModel, onRateLimitEvent } from "../agent/code.agent.js";
import CopilotChatMessage from "../models/CopilotChatMessage.model.js";
import ChatMessage from "../models/ChatMessage.model.js";
import fs from "fs";
import path from "path";
import { checkAiCredit, recordAiUsage } from "../services/credit.service.js";

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


// POST /app-agent/invoke
export const appAgentInvoke = async (req, res) => {
  const { userPrompt, message, sessionId, projectId, sandboxId, workspacePath, agentStatus, activeFile, activeFileContent } = req.body;
  const prompt = userPrompt || message;
  const projId = projectId || sessionId;
  const containerId = sandboxId || projId;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ status: "error", message: "Unauthorized - Invalid user context" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  if (!prompt) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: "message or userPrompt is required" })}\n\n`);
    return res.end();
  }

  let modelInfo;
  try {
    modelInfo = getAppModelInfo();
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({
      message: error.message,
      code: error.code || "AI_PROVIDER_NOT_CONFIGURED",
    })}\n\n`);
    return res.end();
  }

  try {
    const creditCheck = await checkAiCredit({
      authToken: req.authToken,
      company: modelInfo.provider,
    });

    if (!creditCheck.hasCredit) {
      res.write(`event: error\ndata: ${JSON.stringify({
        message: `Insufficient ${modelInfo.provider} credits. Free users receive 20 credits per model company. Please upgrade to Pro to continue.`,
        code: "INSUFFICIENT_CREDITS",
        company: modelInfo.provider,
      })}\n\n`);
      return res.end();
    }
  } catch (err) {
    console.error("Failed to check credits in appAgentInvoke:", err.message);
    res.write(`event: error\ndata: ${JSON.stringify({
      message: "Unable to validate AI credits. Please try again.",
      code: "CREDIT_CHECK_FAILED",
    })}\n\n`);
    return res.end();
  }

  const HEARTBEAT_INTERVAL_MS = 15_000;
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch (_) {}
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => clearInterval(heartbeat);
  const fileClean = activeFile && activeFile !== "none" ? activeFile.replace(/^\/+/, "") : "";
  const chatSessionKey = fileClean ? `${projId}:${fileClean}` : projId;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  try {
    const finalChunks = [];

    let fileContent = activeFileContent || "";
    if (!fileContent && activeFile && activeFile !== "none") {
      try {
        const fullPath = path.resolve(workspacePath || "/workspace", activeFile.replace(/^\/+/, ""));
        if (fullPath.startsWith(workspacePath || "/workspace")) {
          if (fs.existsSync(fullPath)) {
            fileContent = fs.readFileSync(fullPath, "utf-8");
          }
        }
      } catch (err) {
        console.error("Error reading active file in app-agent:", err);
      }
    }

    let truncatedFileContent = fileContent;
    const MAX_FILE_CHARS = 3000;
    if (fileContent && fileContent.length > MAX_FILE_CHARS) {
      truncatedFileContent = fileContent.substring(0, MAX_FILE_CHARS) + "\n\n... [Active File Content Truncated to Save Token Costs] ...";
    }

    const context = `[CONTEXT]
- activeFile: ${activeFile || "none"}

[ACTIVE FILE CONTENT]
${truncatedFileContent || "(empty or new file)"}`;

    const formattedMessage = `${context}

[USER PROMPT]
${prompt}`;

    // 1. Save user message to database
    await CopilotChatMessage.create({
      projectId: chatSessionKey,
      userId,
      role: "user",
      content: prompt,
      file: activeFile || "",
    });

    // 2. Retrieve last 5 active messages for copilot (filtering by chatSessionKey, userId, and non-trashed status)
    const history = await CopilotChatMessage.find({
      projectId: chatSessionKey,
      deletionStatus: { $ne: "trash" },
      $or: [{ userId }, { userId: { $exists: false } }],
    })
      .sort({ timestamp: -1 })
      .limit(5);
    
    history.reverse();

    const formattedHistory = history.map(h => {
      const timestampStr = h.timestamp ? new Date(h.timestamp).toISOString() : new Date().toISOString();
      return {
        role: h.role,
        content: `[${timestampStr}] ${h.content}`
      };
    });

    formattedHistory.push({ role: "user", content: formattedMessage });

    const eventStream = await appAgent.streamEvents(
      {
        messages: formattedHistory,
      },
      {
        version: "v2",
        configurable: { 
          thread_id: chatSessionKey,
          projectId: containerId,
          activeFile: activeFile || "none"
        },
        recursionLimit: 50,
      }
    );

    const AGENT_TIMEOUT_MS = 3 * 60 * 1000;
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("AGENT_TIMEOUT")), AGENT_TIMEOUT_MS);
    });

    const streamWithTimeout = async () => {
      for await (const event of eventStream) {
        if (event.event === "on_chat_model_stream") {
          const rawChunk = event.data?.chunk?.content;
          const textChunk = extractChunkText(rawChunk);
          if (textChunk) {
            finalChunks.push(textChunk);
            res.write(`data: ${textChunk}\n\n`);
          }
        } else if (event.event === "on_chat_model_end") {
          const usage = event.data?.output?.usage_metadata || event.data?.output?.response_metadata?.tokenUsage || event.data?.output?.response_metadata?.usage;
          if (usage) {
            promptTokens += usage.input_tokens || usage.prompt_tokens || usage.promptTokens || 0;
            completionTokens += usage.output_tokens || usage.completion_tokens || usage.completionTokens || 0;
            totalTokens += usage.total_tokens || usage.totalTokens || 0;
          }
        }
      }
    };

    await Promise.race([streamWithTimeout(), timeoutPromise]).finally(() =>
      clearTimeout(timeoutId)
    );

    const finalResponse = finalChunks.join("");
    if (finalResponse) {
      await CopilotChatMessage.create({
        projectId: chatSessionKey,
        userId,
        role: "assistant",
        content: finalResponse,
        file: activeFile || "",
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: totalTokens || (promptTokens + completionTokens),
        },
      });

      res.write(`event: final\ndata: ${finalResponse}\n\n`);
    }

    // Deduct credits and update token counts on the auth service
    const totalTokensUsed = totalTokens || (promptTokens + completionTokens);
    if (totalTokensUsed > 0 && userId) {
      try {
        await recordAiUsage({
          authToken: req.authToken,
          userId,
          company: modelInfo.provider,
          modelId: modelInfo.modelId || modelInfo.id,
          agentType: "copilot",
          projectId: projId,
          promptTokens,
          completionTokens,
          totalTokens: totalTokensUsed,
        });
      } catch (err) {
        console.error("Failed to update credit usage on auth-service:", err.message);
      }
    }

    res.write(`event: done\ndata: [DONE]\n\n`);
    cleanup();
    res.end();
  } catch (error) {
    console.error("appAgent invocation error:", error);
    const isProviderConfigError = error.code === "AI_PROVIDER_NOT_CONFIGURED";
    const errorMessage = isProviderConfigError
      ? error.message
      : error.message || "Error running app agent";
    try {
      await CopilotChatMessage.create({
        projectId: chatSessionKey,
        userId,
        role: "assistant",
        content: `Error occurred during execution: ${errorMessage}`,
        file: activeFile || "",
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      });
    } catch (dbErr) {
      console.error("Failed to save copilot error response to database:", dbErr);
    }
    res.write(`event: error\ndata: ${JSON.stringify({
      message: errorMessage,
      code: isProviderConfigError ? "AI_PROVIDER_NOT_CONFIGURED" : undefined,
    })}\n\n`);
    cleanup();
    res.end();
  }
};

// POST /app-agent/title
export const appAgentTitle = async (req, res) => {
  const { userPrompt, message } = req.body;
  const prompt = userPrompt || message;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ status: "error", message: "Unauthorized - Invalid user context" });
  }

  if (!prompt) {
    return res.status(400).json({ status: "error", message: "message or userPrompt is required" });
  }

  try {
    const modelInfo = getAppModelInfo();
    const creditCheck = await checkAiCredit({
      authToken: req.authToken,
      company: modelInfo.provider,
    });

    if (!creditCheck.hasCredit) {
      return res.status(402).json({
        status: "error",
        code: "INSUFFICIENT_CREDITS",
        message: `Insufficient ${modelInfo.provider} credits. Free users receive 20 credits per model company.`,
        company: modelInfo.provider,
      });
    }

    const response = await appModel.invoke([
      {
        role: "system",
        content: `When the user submits a prompt to start a new session, generate a concise project title from it. Output ONLY a JSON object — no prose, no markdown fences:

  {"title": "<title>"}

Rules for the title:
- 3–6 words maximum
- Title case
- Noun phrase, not a sentence ("Todo App with Auth", not "Build a todo app")
- Describe the output, not the action ("REST API — User Management", not "Create a REST API for user management")
- Never use words like "generate", "build", "create", "make"

If the prompt is vague (e.g. "something cool"), return:
  {"title": "Untitled Project"}`
      },
      { role: "user", content: prompt }
    ]);

    let titleData;
    try {
      const content = response.content?.trim();
      const cleanContent = content.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      titleData = JSON.parse(cleanContent);
    } catch (e) {
      console.error("Failed to parse title JSON response:", response.content);
      titleData = { title: "Untitled Project" };
    }

    const usage = response.usage_metadata || response.response_metadata?.tokenUsage || response.response_metadata?.usage || {};
    const promptTokens = usage.input_tokens || usage.prompt_tokens || usage.promptTokens || 0;
    const completionTokens = usage.output_tokens || usage.completion_tokens || usage.completionTokens || 0;
    const totalTokens = usage.total_tokens || usage.totalTokens || (promptTokens + completionTokens);
    if (totalTokens > 0) {
      recordAiUsage({
        authToken: req.authToken,
        userId,
        company: modelInfo.provider,
        modelId: modelInfo.modelId || modelInfo.id,
        agentType: "title",
        promptTokens,
        completionTokens,
        totalTokens,
      }).catch((err) => {
        console.error("Failed to record title credit usage:", err.message);
      });
    }

    res.status(200).json(titleData);
  } catch (error) {
    console.error("appAgent title generation error:", error);
    const isProviderConfigError = error.code === "AI_PROVIDER_NOT_CONFIGURED";
    res.status(isProviderConfigError ? 503 : 500).json({
      status: "error",
      code: isProviderConfigError ? "AI_PROVIDER_NOT_CONFIGURED" : undefined,
      message: isProviderConfigError ? error.message : error.message || "Failed to generate title",
    });
  }
};

const activeCodeAgentRuns = new Map();

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

// Global rate limit listener for active SSE streams
onRateLimitEvent((event) => {
  console.warn(`[ModelSafety SSE] Rate limited (attempt ${event.attempt}); waiting ${event.delayMs}ms`);
  for (const [runKey, run] of activeCodeAgentRuns.entries()) {
    if (run.res && !run.res.writableEnded && run.abortController && !run.abortController.signal.aborted) {
      try {
        run.res.write(`event: agent:status\ndata: ${JSON.stringify({
          phase: "rate_limit",
          title: "Rate Limit Backoff",
          detail: `AI provider rate-limited. Retrying in ${Math.round(event.delayMs / 1000)}s (Attempt ${event.attempt}).`,
        })}\n\n`);
      } catch (_) {}
    }
  }
});

// POST /code-agent/invoke (SSE)
export const codeAgentInvoke = async (req, res) => {
  const { userPrompt, message, projectId, sandboxId, modelName, attachments } = req.body;
  const prompt = userPrompt || message;
  const projId = projectId || sandboxId;
  const containerId = sandboxId || projId;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ status: "error", message: "Unauthorized - Invalid user context" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendEvent = (event, data) => {
    if (res.writableEnded) return;
    try {
      res.write(`event: ${event}\ndata: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
    } catch (_) {}
  };

  if (!prompt) {
    sendEvent("agent:error", { message: "Message is required" });
    return res.end();
  }

  const runKey = `${userId}:${projId}`;
  if (activeCodeAgentRuns.has(runKey)) {
    sendEvent("agent:error", {
      message: "Orion is already running a task for this project. Please wait for it to finish before starting another.",
      code: "AGENT_RUN_IN_PROGRESS",
    });
    return res.end();
  }

  const abortController = new AbortController();
  activeCodeAgentRuns.set(runKey, {
    abortController,
    res,
    projectId: projId,
    sandboxId: containerId,
    userId,
  });

  const HEARTBEAT_INTERVAL_MS = 15_000;
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      try {
        res.write(": heartbeat\n\n");
      } catch (_) {}
    }
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    activeCodeAgentRuns.delete(runKey);
  };

  let assistantText = "";
  let toolLogs = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  try {
    sendEvent("agent:status", {
      phase: "queued",
      title: "Preparing run",
      detail: "Loading project context",
    });

    // 1. Save user message to database
    const userMsgDoc = await ChatMessage.create({
      projectId: projId,
      userId,
      agentType: "codingAgent",
      role: "user",
      content: prompt,
    });
    sendEvent("agent:msg_created", { role: "user", id: userMsgDoc._id.toString() });

    // 2. Retrieve history (last 3 messages)
    const history = await ChatMessage.find({
      projectId: projId,
      agentType: "codingAgent",
      deletionStatus: { $ne: "trash" },
      $or: [{ userId }, { userId: { $exists: false } }],
    })
      .sort({ timestamp: -1 })
      .limit(3);

    history.reverse();

    const formattedHistory = history.map((h, index) => {
      const timestampStr = h.timestamp ? new Date(h.timestamp).toISOString() : new Date().toISOString();
      let content = `[${timestampStr}] ${truncateForPrompt(h.content, 4_000)}`;

      if (index === history.length - 1 && h.role === "user" && attachments && attachments.length > 0) {
        const contextText = attachments.map(att =>
          `=== ATTACHED FILE CONTEXT ===\nFile: ${att.path}\nContent:\n\`\`\`\n${truncateForPrompt(att.content, 12_000)}\n\`\`\``
        ).join("\n\n");
        content += `\n\n${contextText}`;
      }

      return {
        role: h.role,
        content,
      };
    });

    const { agent: agentInstance, model } = createAgentForModel();

    // Check credits for metered/free plans
    const isMeteredPlan = req.user?.subscription === "pro" || req.user?.subscription === "max";
    const creditCheck = isMeteredPlan
      ? { hasCredit: true, billable: true }
      : await checkAiCredit({ authToken: req.authToken, company: model?.provider || "mistral" });

    if (!creditCheck.hasCredit) {
      const error = new Error("Insufficient AI credits. Please upgrade to Pro to continue.");
      error.code = "INSUFFICIENT_CREDITS";
      throw error;
    }

    sendEvent("agent:model", {
      requestedModel: "mistralLarge",
      modelId: model?.id || "mistral-large-latest",
      label: model?.label || "Mistral Large",
      provider: model?.provider || "mistral",
      fallback: false,
    });

    sendEvent("agent:status", {
      phase: "model",
      title: "Model ready",
      detail: `${model?.label || "Mistral Large"} is starting the agent graph`,
    });

    const threadId = `${containerId || projId}:${Date.now()}`;
    const activeRun = activeCodeAgentRuns.get(runKey);
    if (activeRun) {
      activeRun.threadId = threadId;
      activeRun.agentInstance = agentInstance;
      activeRun.planReviewPending = false;
      activeRun.sendEvent = sendEvent;
      activeRun.projId = projId;
      activeRun.userId = userId;
    }

    const eventStream = await agentInstance.streamEvents(
      {
        messages: formattedHistory,
        task: prompt,              // v2: pass raw task text for nodes that need it
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
      },
      {
        version: "v2",
        signal: abortController.signal,
        configurable: {
          thread_id: threadId,
          projectId: containerId,
        },
        recursionLimit: 150,
        writer: (msg) => {
          const parsedLog = parseToolWriterMessage(msg);
          toolLogs.push(parsedLog.message);
          sendEvent("agent:tool_log", parsedLog);
        },
      }
    );

    for await (const event of eventStream) {
      if (abortController.signal.aborted) {
        const error = new Error("AGENT_STOPPED");
        error.code = "AGENT_STOPPED";
        throw error;
      }

      const eventType = event.event;

      // ── Plan review interrupt ─────────────────────────────────────────────
      if (eventType === "on_interrupt") {
        const interruptData = event.data?.value;
        if (interruptData?.type === "plan_review") {
          if (activeRun) activeRun.planReviewPending = true;
          sendEvent("agent:plan_review", {
            plan: interruptData.plan,
            taskSubType: interruptData.taskSubType,
            interruptId: event.run_id,
            threadId,
          });
          sendEvent("agent:status", {
            phase: "plan_review",
            title: "Plan ready for review",
            detail: `${interruptData.plan?.totalSteps || "?"} steps — approve or reject in the UI`,
          });
        }
        continue;
      }

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
            if (activeRun) activeRun.lastAIMessageText = lastAiMsg.content;
          }
        }

        if (plan && (nodeName === "planner" || !nodeName)) {
          if (activeRun) activeRun.planReviewPending = true;
          sendEvent("agent:plan_review", {
            plan,
            taskSubType: event.data?.output?.taskSubType,
            threadId,
          });
        }

        if (situation) {
          sendEvent("agent:status", {
            phase: nodeName || "working",
            title: `Team Node: ${nodeName || "Manager"}`,
            detail: situation,
          });
          sendEvent("agent:situation_update", {
            node: nodeName,
            situation,
          });
        }
      } else if (eventType === "on_chat_model_start") {
        sendEvent("agent:status", {
          phase: "thinking",
          title: "Thinking",
          detail: "Orion is deciding the next action",
        });
      } else if (eventType === "on_chat_model_stream") {
        if (shouldStreamChunk(event)) {
          const rawChunk = event.data?.chunk?.content;
          const textChunk = extractChunkText(rawChunk);
          if (textChunk) {
            assistantText += textChunk;
            sendEvent("agent:thinking", textChunk);
          }
        }
      } else if (eventType === "on_chat_model_end") {
        sendEvent("agent:status", {
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
      } else if (eventType === "on_tool_start") {
        const toolName = event.name;
        const input = event.data?.input;
        let inputStr = "";
        if (input) {
          try {
            inputStr = typeof input === "string" ? input : JSON.stringify(input);
          } catch (_) {
            inputStr = String(input);
          }
        }
        if (inputStr.length > 150) inputStr = inputStr.substring(0, 150) + "...";
        toolLogs.push(`${toolName}: starting with input (${inputStr})`);
        sendEvent("agent:status", {
          phase: "tool",
          title: `Running ${toolName}`,
          detail: inputStr || "Executing tool",
        });
        sendEvent("agent:tool_start", { toolName, input });
      } else if (eventType === "on_tool_end") {
        const toolName = event.name;
        const output = event.data?.output;
        let outputStr = "";
        if (output) {
          try {
            const parsed = typeof output === "string" ? JSON.parse(output) : output;
            if (parsed && typeof parsed === "object") {
              outputStr = parsed.error || parsed.output || JSON.stringify(parsed);
            } else {
              outputStr = String(output);
            }
          } catch (_) {
            outputStr = String(output);
          }
        }
        if (outputStr.length > 150) outputStr = outputStr.substring(0, 150) + "...";
        toolLogs.push(`${toolName}: finished (${outputStr})`);
        sendEvent("agent:status", {
          phase: "tool",
          title: `${toolName} finished`,
          detail: outputStr || "Tool completed",
        });
        sendEvent("agent:tool_end", { toolName, output });
      }
    }

    if (activeRun?.planReviewPending) {
      activeRun.interruptResumeNeeded = true;
      activeRun.toolLogs = toolLogs;
      activeRun.promptTokens = promptTokens;
      activeRun.completionTokens = completionTokens;
      activeRun.totalTokens = totalTokens;
      activeRun.assistantText = assistantText;
      sendEvent("agent:status", {
        phase: "plan_review",
        title: "Plan Review Required",
        detail: "Review implementation steps before Orion begins execution",
        status: "paused",
      });
      return;
    }

    // Save assistant message to database
    let assistantMsgDoc = null;
    const effectiveAssistantText = activeRun?.lastAIMessageText || assistantText || "Task completed.";
    assistantMsgDoc = await ChatMessage.create({
      projectId: projId,
      userId,
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
    sendEvent("agent:msg_created", { role: "assistant", id: assistantMsgDoc._id.toString() });

    const totalTokensUsed = totalTokens || (promptTokens + completionTokens);
    if (totalTokensUsed > 0) {
      try {
        await recordAiUsage({
          authToken: req.authToken,
          userId,
          company: "mistral",
          modelId: "mistral-large-latest",
          agentType: "codingAgent",
          projectId: projId,
          promptTokens,
          completionTokens,
          totalTokens: totalTokensUsed,
        });
      } catch (usageErr) {
        console.error("Failed to record coding agent credit usage:", usageErr.message);
      }
    }

    sendEvent("agent:status", {
      phase: "done",
      title: "Finishing",
      detail: "Saving final report",
    });
    sendEvent("agent:done", { assistantMsgId: assistantMsgDoc?._id?.toString() });
  } catch (error) {
    if (error.code === "AGENT_STOPPED" || error.message === "AGENT_STOPPED") {
      const stoppedText = assistantText || "Stopped by user before completion.";
      toolLogs = [...toolLogs, "agent: stopped by user"];

      try {
        await ChatMessage.create({
          projectId: projId,
          userId,
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

      sendEvent("agent:stopped", {
        message: "Orion stopped the current task.",
        text: stoppedText,
      });
    } else {
      console.error("Agent SSE error:", error);
      const messageText = error.message || "Error running coding agent";
      try {
        await ChatMessage.create({
          projectId: projId,
          userId,
          agentType: "codingAgent",
          role: "assistant",
          content: `Error occurred during execution: ${messageText}`,
          toolLogs: (toolLogs && toolLogs.length > 0) ? toolLogs : ["Error occurred during execution"],
          tokenUsage: { promptTokens, completionTokens, totalTokens },
        });
      } catch (dbErr) {
        console.error("Failed to save error response to database:", dbErr);
      }

      sendEvent("agent:error", { message: messageText, code: error.code || "AGENT_ERROR" });
    }
  } finally {
    cleanup();
    res.end();
  }
};

// POST /code-agent/stop
export const codeAgentStop = async (req, res) => {
  const { projectId, sandboxId } = req.body;
  const projId = projectId || sandboxId;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  const runKey = `${userId}:${projId}`;
  const activeRun = activeCodeAgentRuns.get(runKey);

  if (!activeRun) {
    return res.status(200).json({ status: "ok", message: "No active agent run found to stop" });
  }

  try {
    activeRun.abortController.abort();
    return res.status(200).json({ status: "ok", message: "Agent run stopped successfully" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// POST /code-agent/plan-approve
// Resumes a graph interrupted at the plan review gate with approval.
export const codeAgentPlanApprove = async (req, res) => {
  const { projectId, sandboxId } = req.body;
  const projId = projectId || sandboxId;
  const userId = req.user?.id;

  if (!userId) return res.status(401).json({ status: "error", message: "Unauthorized" });

  const runKey = `${userId}:${projId}`;
  const activeRun = activeCodeAgentRuns.get(runKey);

  if (!activeRun?.interruptResumeNeeded || !activeRun?.agentInstance) {
    return res.status(400).json({ status: "error", message: "No plan review interrupt pending for this run" });
  }

  try {
    activeRun.interruptResumeNeeded = false;
    activeRun.planReviewPending = false;

    activeRun.sendEvent?.("agent:status", {
      phase: "coder",
      title: "Plan Approved",
      detail: "Executing plan steps",
      status: "running",
    });

    const eventStream = await activeRun.agentInstance.streamEvents(null, {
      version: "v2",
      configurable: {
        thread_id: activeRun.threadId,
        projectId: activeRun.projId,
      },
      recursionLimit: 150,
      writer: (msg) => {
        const parsedLog = parseToolWriterMessage(msg);
        activeRun.toolLogs?.push(parsedLog.message);
        activeRun.sendEvent?.("agent:tool_log", parsedLog);
      },
    });

    for await (const event of eventStream) {
      const eventType = event.event;
      if (eventType === "on_chain_end") {
        const situation = event.data?.output?.currentSituation;
        const nodeName = event.name;
        const outputMessages = event.data?.output?.messages;

        if (Array.isArray(outputMessages) && outputMessages.length > 0) {
          const lastAiMsg = [...outputMessages].reverse().find(
            (m) => m._getType?.() === "ai" || m.role === "assistant" || m.constructor?.name === "AIMessage"
          );
          if (lastAiMsg?.content && typeof lastAiMsg.content === "string") {
            activeRun.lastAIMessageText = lastAiMsg.content;
          }
        }

        if (situation) {
          activeRun.sendEvent?.("agent:status", {
            phase: nodeName || "working",
            title: `Team Node: ${nodeName || "Manager"}`,
            detail: situation,
          });
        }
      } else if (eventType === "on_chat_model_stream") {
        if (shouldStreamChunk(event)) {
          const rawChunk = event.data?.chunk?.content;
          const textChunk = extractChunkText(rawChunk);
          if (textChunk) {
            activeRun.assistantText = (activeRun.assistantText || "") + textChunk;
            activeRun.sendEvent?.("agent:thinking", textChunk);
          }
        }
      } else if (eventType === "on_tool_start") {
        activeRun.sendEvent?.("agent:tool_start", { toolName: event.name, input: event.data?.input });
      } else if (eventType === "on_tool_end") {
        activeRun.sendEvent?.("agent:tool_end", { toolName: event.name, output: event.data?.output });
      }
    }

    const assistantMsgDoc = await ChatMessage.create({
      projectId: activeRun.projId,
      userId: activeRun.userId,
      agentType: "codingAgent",
      role: "assistant",
      content: activeRun.lastAIMessageText || activeRun.assistantText || "Task completed.",
      toolLogs: activeRun.toolLogs,
    });
    activeRun.sendEvent?.("agent:msg_created", { role: "assistant", id: assistantMsgDoc._id.toString() });
    activeRun.sendEvent?.("agent:status", { phase: "done", title: "Finishing", detail: "Saving final report" });
    activeRun.sendEvent?.("agent:done", { assistantMsgId: assistantMsgDoc._id.toString() });
    activeRun.res?.end();
    activeCodeAgentRuns.delete(runKey);

    return res.status(200).json({ status: "ok", message: "Plan approved — execution completed" });
  } catch (err) {
    console.error("[PlanApprove] Continuation failed:", err.message);
    activeRun.sendEvent?.("agent:error", { message: err.message });
    activeRun.res?.end();
    activeCodeAgentRuns.delete(runKey);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// POST /code-agent/plan-reject
// Resumes a graph interrupted at the plan review gate with rejection (re-plan).
export const codeAgentPlanReject = async (req, res) => {
  const { projectId, sandboxId, feedback } = req.body;
  const projId = projectId || sandboxId;
  const userId = req.user?.id;

  if (!userId) return res.status(401).json({ status: "error", message: "Unauthorized" });

  const runKey = `${userId}:${projId}`;
  const activeRun = activeCodeAgentRuns.get(runKey);

  if (!activeRun?.interruptResumeNeeded || !activeRun?.agentInstance) {
    return res.status(400).json({ status: "error", message: "No plan review interrupt pending for this run" });
  }

  try {
    activeRun.interruptResumeNeeded = false;
    activeRun.planReviewPending = false;

    activeRun.sendEvent?.("agent:status", {
      phase: "planner",
      title: "Revising Plan",
      detail: feedback ? `Revising with feedback: "${feedback}"` : "Revising implementation plan",
      status: "running",
    });

    const eventStream = await activeRun.agentInstance.streamEvents({
      criticFeedback: feedback || "User requested plan revision.",
      planApproved: false,
      plan: null,
    }, {
      version: "v2",
      configurable: {
        thread_id: activeRun.threadId,
        projectId: activeRun.projId,
      },
      recursionLimit: 150,
      writer: (msg) => {
        const parsedLog = parseToolWriterMessage(msg);
        activeRun.toolLogs?.push(parsedLog.message);
        activeRun.sendEvent?.("agent:tool_log", parsedLog);
      },
    });

    for await (const event of eventStream) {
      const eventType = event.event;
      if (eventType === "on_chain_end") {
        const plan = event.data?.output?.plan;
        const nodeName = event.name;
        if (plan && (nodeName === "planner" || !nodeName)) {
          activeRun.planReviewPending = true;
          activeRun.interruptResumeNeeded = true;
          sendEvent("agent:plan_review", {
            plan,
            taskSubType: event.data?.output?.taskSubType,
            threadId: activeRun.threadId,
          });
          sendEvent("agent:status", {
            phase: "plan_review",
            title: "Plan Review Required",
            detail: `${plan.totalSteps || (plan.steps || []).length} steps — approve or request changes`,
            status: "paused",
          });
        }
      }
    }

    return res.status(200).json({ status: "ok", message: "Plan revision generated" });
  } catch (err) {
    console.error("[PlanReject] Revision failed:", err.message);
    activeRun.sendEvent?.("agent:error", { message: err.message });
    return res.status(500).json({ status: "error", message: err.message });
  }
};
