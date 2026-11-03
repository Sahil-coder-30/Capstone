// Offline check of a Clio (copilot) turn: streaming, tool use, history
// handling and the SSE framing. No network, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";

process.env.NVIDIA_API_KEY ||= "offline-test-key";

const { setModelsForTesting } = await import("../src/agent/llm/model.js");
const CopilotChatMessage = (await import("../src/models/CopilotChatMessage.model.js")).default;
const { runCopilot } = await import("../src/services/copilot.service.js");
const { appAgentInvoke } = await import("../src/controllers/ai.controller.js");

class ScriptedModel extends BaseChatModel {
  constructor(script) {
    super({});
    this.script = script;
    this.seen = [];
  }
  _llmType() {
    return "scripted";
  }
  bindTools() {
    return this;
  }
  async *_streamResponseChunks(messages, _options, runManager) {
    this.seen.push(messages);
    const item = this.script.shift();
    const message = new AIMessageChunk({
      content: item.content || "",
      tool_call_chunks: (item.toolCalls || []).map((tc, index) => ({ name: tc.name, args: JSON.stringify(tc.args), id: `c${index}`, index, type: "tool_call_chunk" })),
    });
    const chunk = new ChatGenerationChunk({ text: String(message.content), message });
    yield chunk;
    await runManager?.handleLLMNewToken(chunk.text, undefined, undefined, undefined, undefined, { chunk });
  }
  async _generate(messages, options, runManager) {
    let last;
    for await (const chunk of this._streamResponseChunks(messages, options, runManager)) last = chunk;
    return { generations: [last] };
  }
}

const sandboxCalls = [];
axios.defaults.adapter = async (config) => {
  const url = new URL(config.url);
  sandboxCalls.push(`${url.host} ${url.pathname}`);
  const files = (url.searchParams.get("files") || "").split(",");
  return { data: { status: "ok", files: files.map((file) => ({ file, content: "const a = 1;\n" })) }, status: 200, headers: {}, config };
};

const saved = [];
const history = [{ role: "user", content: "earlier question" }, { role: "assistant", content: "earlier answer" }];
CopilotChatMessage.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [...history].reverse() }) }) });
CopilotChatMessage.create = async (doc) => saved.push(doc);

test("Clio reads through the sandbox, streams text and uses history once", async () => {
  const model = new ScriptedModel([
    { content: "Reading the file.", toolCalls: [{ name: "read_file", args: { files: ["src/a.js"] } }] },
    { content: "It declares a = 1.\n\n```js\n  indented\n```" },
  ]);
  setModelsForTesting(model, model);

  const streamed = [];
  const answer = await runCopilot({
    user: { id: "u1" },
    authToken: "t",
    projectId: "p1",
    sandboxId: "sbx-9",
    prompt: "what does a.js do?",
    activeFile: "/src/a.js",
    onText: (t) => streamed.push(t),
  });

  assert.match(answer, /declares a = 1/);
  assert.ok(streamed.join("").includes("Reading the file."));
  assert.deepEqual(sandboxCalls, ["sandbox-service-sbx-9:3000 /api/agent/read-file"]);

  const firstCall = model.seen[0].map((m) => String(m.content));
  assert.equal(firstCall.filter((c) => c.includes("what does a.js do?")).length, 1, "the new prompt is in the context once");
  assert.ok(firstCall.includes("earlier question"), "history comes first");
  assert.deepEqual(saved.map((d) => d.role), ["user", "assistant"]);
  assert.equal(saved[0].projectId, "p1:src/a.js");
});

test("the copilot SSE endpoint keeps newlines and indentation inside data lines", async () => {
  const model = new ScriptedModel([{ content: "line one\n\n  indented line" }]);
  setModelsForTesting(model, model);

  let body = "";
  const res = {
    writableEnded: false,
    status() { return this; },
    set() {},
    flushHeaders() {},
    write(chunk) { body += chunk; },
    end() { this.writableEnded = true; },
  };
  await appAgentInvoke({ body: { message: "hi", projectId: "p1", sandboxId: "sbx-9" }, user: { id: "u1" }, authToken: "t" }, res);

  const finalFrame = body.split("\n\n").find((f) => f.startsWith("event: final"));
  assert.ok(body.includes("event: final\ndata: line one\ndata: \ndata:   indented line\n\n"), finalFrame);
  assert.ok(body.includes("event: done"));
  assert.equal(res.writableEnded, true);
});
