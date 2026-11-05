// agent/index.js
// The one entry point to the agent layer. The rest of the service (run
// service, controllers) imports from here and nothing deeper.
//
//   llm/     NVIDIA model, rate limiter, structured output
//   tools/   sandbox client, tools, guards, tool sets per role
//   core/    tool loop, message helpers, tool-activity facts, prompts
//   nodes/   one file per graph node
//   graph/   Orion (coding agent) and Clio (copilot) graphs

export { getOrionGraph, releaseOrionThread } from "./graph/orion.graph.js";
export { getClioGraph } from "./graph/clio.graph.js";
export { getFastModel, getMainModel, getModelInfo, hasModelKey } from "./llm/model.js";
export { onRateLimitEvent } from "./llm/rateLimiter.js";
export { INTERNAL_TAGS } from "./llm/structured.js";
export { contentToText, truncate, usageOf } from "./core/messages.js";
export { isToolErrorOutput } from "./core/toolActivity.js";
export { isValidSandboxId, releaseSandbox } from "./tools/sandbox.client.js";
export { issueSandboxCredential } from "./tools/sandboxAuth.js";
