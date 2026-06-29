import { appAgent, appModel } from "../agent/code.agent.js";
import ChatMessage from "../models/ChatMessage.model.js";
import fs from "fs";
import path from "path";

// POST /app-agent/invoke
export const appAgentInvoke = async (req, res) => {
  const { userPrompt, message, sessionId, projectId, sandboxId, workspacePath, agentStatus, activeFile, activeFileContent } = req.body;
  const prompt = userPrompt || message;
  const projId = projectId || sessionId;
  const containerId = sandboxId || projId;
  const userId = req.user?.id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  if (!prompt) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: "message or userPrompt is required" })}\n\n`);
    return res.end();
  }

  const HEARTBEAT_INTERVAL_MS = 15_000;
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch (_) {}
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => clearInterval(heartbeat);

  try {
    const finalChunks = [];
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

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
    const MAX_FILE_CHARS = 10000;
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
    await ChatMessage.create({
      projectId: projId,
      userId,
      agentType: "copilot",
      role: "user",
      content: prompt,
    });

    // 2. Retrieve last 5 messages for copilot (filtering by projectId and userId)
    const history = await ChatMessage.find({
      projectId: projId,
      agentType: "copilot",
      $or: [{ userId }, { userId: { $exists: false } }],
    })
      .sort({ timestamp: -1 })
      .limit(5);
    
    history.reverse();

    const formattedHistory = history.map(h => {
      if (h.role === "assistant" && h.toolLogs && h.toolLogs.length > 0) {
        const logsText = h.toolLogs.join("\n");
        return {
          role: h.role,
          content: `${h.content}\n\n[System Tool Executions]:\n${logsText}`
        };
      }
      return {
        role: h.role,
        content: h.content
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
      await ChatMessage.create({
        projectId: projId,
        userId,
        agentType: "copilot",
        role: "assistant",
        content: finalResponse,
        tokenUsage: {
          promptTokens,
          completionTokens,
          totalTokens: totalTokens || (promptTokens + completionTokens),
        },
      });

      res.write(`event: final\ndata: ${finalResponse}\n\n`);
    }

    res.write(`event: done\ndata: [DONE]\n\n`);
    cleanup();
    res.end();
  } catch (error) {
    console.error("appAgent invocation error:", error);
    try {
      await ChatMessage.create({
        projectId: projId,
        userId,
        agentType: "copilot",
        role: "assistant",
        content: `Error occurred during execution: ${error.message || "Error running app agent"}`,
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      });
    } catch (dbErr) {
      console.error("Failed to save copilot error response to database:", dbErr);
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || "Error running app agent" })}\n\n`);
    cleanup();
    res.end();
  }
};

// POST /app-agent/title
export const appAgentTitle = async (req, res) => {
  const { userPrompt, message } = req.body;
  const prompt = userPrompt || message;

  if (!prompt) {
    return res.status(400).json({ status: "error", message: "message or userPrompt is required" });
  }

  try {
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

    res.status(200).json(titleData);
  } catch (error) {
    console.error("appAgent title generation error:", error);
    res.status(500).json({ status: "error", message: error.message || "Failed to generate title" });
  }
};
