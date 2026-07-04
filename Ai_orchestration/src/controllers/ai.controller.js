import { appAgent, appModel, getAppModelInfo } from "../agent/code.agent.js";
import CopilotChatMessage from "../models/CopilotChatMessage.model.js";
import fs from "fs";
import path from "path";
import { checkAiCredit, recordAiUsage } from "../services/credit.service.js";

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
    const isMeteredPlan = req.user?.subscription === "pro" || req.user?.subscription === "max";
    const creditCheck = isMeteredPlan
      ? { hasCredit: true, billable: true, subscription: req.user.subscription }
      : await checkAiCredit({
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

    // 2. Retrieve last 5 messages for copilot (filtering by chatSessionKey and userId)
    const history = await CopilotChatMessage.find({
      projectId: chatSessionKey,
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

    const agentStream = appAgent.stream(
      {
        messages: formattedHistory,
      },
      {
        configurable: { 
          projectId: containerId,
          activeFile: activeFile || "none"
        },
        recursionLimit: 50,
        streamMode: "messages",
      }
    );

    const AGENT_TIMEOUT_MS = 3 * 60 * 1000;
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("AGENT_TIMEOUT")), AGENT_TIMEOUT_MS);
    });

    const streamWithTimeout = async () => {
      for await (const [chunk] of await agentStream) {
        if (chunk?.usage_metadata) {
          promptTokens = chunk.usage_metadata.input_tokens || 0;
          completionTokens = chunk.usage_metadata.output_tokens || 0;
          totalTokens = chunk.usage_metadata.total_tokens || 0;
        } else if (chunk?.response_metadata?.tokenUsage || chunk?.response_metadata?.usage) {
          const usage = chunk.response_metadata.tokenUsage || chunk.response_metadata.usage;
          promptTokens = usage.prompt_tokens || usage.promptTokens || 0;
          completionTokens = usage.completion_tokens || usage.completionTokens || 0;
          totalTokens = usage.total_tokens || usage.totalTokens || 0;
        }

        if (
          chunk?.constructor?.name === "AIMessageChunk" &&
          typeof chunk.content === "string" &&
          chunk.content
        ) {
          finalChunks.push(chunk.content);
          res.write(`data: ${chunk.content}\n\n`);
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
    const isMeteredPlan = req.user?.subscription === "pro" || req.user?.subscription === "max";
    const creditCheck = isMeteredPlan
      ? { hasCredit: true, billable: true, subscription: req.user.subscription }
      : await checkAiCredit({
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
