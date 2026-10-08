// clio.agent.js
if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = function (ms) {
    if (ms === 30000) {
      return originalTimeout.call(this, 180000);
    }
    return originalTimeout.call(this, ms);
  };
}
import path from "path";
import { fileURLToPath } from "url";
import { ChatMistralAI } from "@langchain/mistralai";
import { StateGraph, Annotation, END, START, MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import dotenv from "dotenv";

import {
  readFile,
  updateFile,
  patchFile,
  searchCode,
  searchInternetTool,
} from "./tool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

let appModelInstance = null;
let appModelInfo = null;

export const getAppModel = () => {
  const mistralApiKey = process.env.MISTRALAI_API_KEY?.trim();

  if (!appModelInstance) {
    if (!mistralApiKey) {
      const error = new Error("No AI provider key configured. Set MISTRALAI_API_KEY.");
      error.code = "AI_PROVIDER_NOT_CONFIGURED";
      throw error;
    }

    appModelInstance = new ChatMistralAI({
      model: "mistral-large-latest",
      apiKey: mistralApiKey,
      maxRetries: 0,
      timeout: 180_000, // 3 minutes
    });
    appModelInfo = {
      id: "mistralLarge",
      modelId: "mistral-large-latest",
      label: "Mistral Large",
      provider: "mistral",
    };
  }

  return appModelInstance;
};

export const getAppModelInfo = () => {
  getAppModel();
  return appModelInfo;
};

export const appModel = {
  invoke: (...args) => getAppModel().invoke(...args),
  stream: (...args) => getAppModel().stream(...args),
  streamEvents: (...args) => getAppModel().streamEvents(...args),
};

const CLIO_SYSTEM_PROMPT = `You are Clio, an elite developer co-pilot embedded inside Taksha.
Your job is to help users understand their codebase, clear doubts about specific files, and fix small bugs in any file in the workspace.

=== CO-PILOT INSTRUCTIONS ===
- Speak like a direct, senior engineer helping a teammate: clear, concise, no filler.
- Use tools (readFile, searchCode, updateFile, patchFile, searchInternet) surgically.
- Keep edits surgical. Prefer patch_file for changes under 20 lines.
- Always check files first before updating them.
- If a file doesn't exist, say so. Don't invent content.
- Do not explain your reasoning or CSS/React details unless asked.`;

// ============================================================================
// CLIO LANGGRAPH CONDITIONAL WORKFLOW AGENT
// ============================================================================

export const ClioStateAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => (y ? x.concat(y) : x),
    default: () => [],
  }),
  prompt: Annotation({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  activeFile: Annotation({
    reducer: (x, y) => y ?? x ?? "none",
    default: () => "none",
  }),
  intent: Annotation({
    reducer: (x, y) => y ?? x ?? "general",
    default: () => "general",
  }),
  inspectedFiles: Annotation({
    reducer: (x, y) => (y ? x.concat(y) : x),
    default: () => [],
  }),
  patchApplied: Annotation({
    reducer: (x, y) => y ?? x ?? false,
    default: () => false,
  }),
  taskStatus: Annotation({
    reducer: (x, y) => y ?? x ?? "analyzing",
    default: () => "analyzing",
  }),
});

// 1. ANALYZER NODE
async function analyzerNode(state, config) {
  const messages = state.messages || [];
  const userText = state.prompt || messages[messages.length - 1]?.content || "";
  const lower = String(userText).toLowerCase();

  let intent = "general";
  if (lower.includes("fix") || lower.includes("update") || lower.includes("change") || lower.includes("add") || lower.includes("remove") || lower.includes("patch")) {
    intent = "fix";
  } else if (lower.includes("search") || lower.includes("find") || lower.includes("where") || lower.includes("read") || lower.includes("inspect")) {
    intent = "search";
  } else if (lower.includes("explain") || lower.includes("what") || lower.includes("how") || lower.includes("why")) {
    intent = "explain";
  }

  return {
    intent,
    taskStatus: "analyzed",
  };
}

// 2. INSPECTOR NODE (Read Tools: readFile, searchCode, searchInternetTool)
async function inspectorNode(state, config) {
  const inspectorAgent = createReactAgent({
    llm: getAppModel(),
    tools: [readFile, searchCode, searchInternetTool],
    prompt: `${CLIO_SYSTEM_PROMPT}\n\nYou are in Inspector Mode. Search or read required files to collect facts for the user prompt.`,
  });

  const result = await inspectorAgent.invoke({
    messages: state.messages || [],
  }, config);

  return {
    messages: result.messages || [],
    taskStatus: "inspected",
  };
}

// 3. MODIFIER NODE (Write Tools: patchFile, updateFile)
async function modifierNode(state, config) {
  const modifierAgent = createReactAgent({
    llm: getAppModel(),
    tools: [readFile, patchFile, updateFile, searchCode],
    prompt: `${CLIO_SYSTEM_PROMPT}\n\nYou are in Surgical Modifier Mode. Apply requested code changes accurately and surgically.`,
  });

  const result = await modifierAgent.invoke({
    messages: state.messages || [],
  }, config);

  return {
    messages: result.messages || [],
    patchApplied: true,
    taskStatus: "modified",
  };
}

// 4. RESPONDER NODE (Synthesizes final answer)
async function responderNode(state, config) {
  const responderAgent = createReactAgent({
    llm: getAppModel(),
    tools: [readFile, updateFile, patchFile, searchCode, searchInternetTool],
    prompt: CLIO_SYSTEM_PROMPT,
  });

  const result = await responderAgent.invoke({
    messages: state.messages || [],
  }, config);

  return {
    messages: result.messages || [],
    taskStatus: "completed",
  };
}

// ROUTER EDGE FUNCTION
function shouldContinue(state) {
  const { intent, taskStatus, patchApplied } = state;

  if (taskStatus === "analyzed") {
    if (intent === "fix") return "modifier";
    if (intent === "search" || intent === "explain") return "inspector";
    return "responder";
  }

  if (taskStatus === "inspected") {
    if (intent === "fix" && !patchApplied) return "modifier";
    return "responder";
  }

  if (taskStatus === "modified") {
    return "responder";
  }

  return "end";
}

const memoryCheckpointer = new MemorySaver();

export const buildClioGraph = () => {
  const workflow = new StateGraph(ClioStateAnnotation)
    .addNode("analyzer", analyzerNode)
    .addNode("inspector", inspectorNode)
    .addNode("modifier", modifierNode)
    .addNode("responder", responderNode)
    .addEdge(START, "analyzer")
    .addConditionalEdges("analyzer", shouldContinue, {
      inspector: "inspector",
      modifier: "modifier",
      responder: "responder",
      end: END,
    })
    .addConditionalEdges("inspector", shouldContinue, {
      modifier: "modifier",
      responder: "responder",
      end: END,
    })
    .addConditionalEdges("modifier", shouldContinue, {
      responder: "responder",
      end: END,
    })
    .addEdge("responder", END);

  return workflow.compile({ checkpointer: memoryCheckpointer });
};

let compiledClioInstance = null;

export const getAppAgent = () => {
  if (!compiledClioInstance) {
    compiledClioInstance = buildClioGraph();
  }
  return compiledClioInstance;
};

export const appAgent = {
  streamEvents: (...args) => getAppAgent().streamEvents(...args),
  stream: (...args) => getAppAgent().stream(...args),
  invoke: (...args) => getAppAgent().invoke(...args),
};

export default appAgent;
