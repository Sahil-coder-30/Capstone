// Live check of the configured NVIDIA model: plain reply + tool calling.
// Usage: npm run check:model   (reads NVIDIA_API_KEY / NVIDIA_MODEL from .env)
// The key itself is never printed.

import "dotenv/config";
import * as z from "zod";
import { tool } from "@langchain/core/tools";
import { getMainModel, getModelInfo, hasModelKey } from "../src/agent/index.js";

if (!hasModelKey()) {
  console.error("NVIDIA_API_KEY is not set. Add it to .env (see .env.example).");
  process.exit(1);
}

const { modelId } = getModelInfo();
console.log(`Model: ${modelId}`);

const model = getMainModel();
const started = Date.now();
const reply = await model.invoke("Reply with exactly: OK");
console.log(`Plain reply (${Date.now() - started}ms): ${String(reply.content).slice(0, 80)}`);

const readFile = tool(async () => "{}", {
  name: "read_file",
  description: "Read files from the project",
  schema: z.object({ files: z.array(z.string()) }),
});
const toolReply = await model.bindTools([readFile]).invoke("Read the file src/App.jsx using the read_file tool.");
const call = toolReply.tool_calls?.[0];
if (call?.name === "read_file") {
  console.log(`Tool calling works: ${JSON.stringify(call.args)}`);
} else {
  console.error("The model did not call the tool. Pick a model with tool calling support (NVIDIA_MODEL).");
  process.exit(1);
}
