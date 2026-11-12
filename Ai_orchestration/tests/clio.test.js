// Offline check of a Clio (copilot) turn: streaming, tool use, history
// handling and the SSE framing. No network, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";

process.env.NVIDIA_API_KEY ||= "offline-test-key";
// These tests check the graph, so the sandbox is a fake REST sidecar.
// The MCP transport has its own test (mcp.client.test.js).
process.env.SANDBOX_TOOL_TRANSPORT = "rest";

const { setModelsForTesting } = await import("../src/agent/llm/model.js");
const CopilotChatMessage = (await import("../src/models/CopilotChatMessage.model.js")).default;
const { ClioChatSession } = await import("../src/models/chatStores.js");
const { findChain, stubSessions } = await import("./helpers/fakeChatStore.js");
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
  if (url.host === "auth-service") {
    return { data: { token: "clio-sandbox-token", expiresIn: 7200 }, status: 200, headers: {}, config };
  }
  assert.equal(config.headers.Authorization, "Bearer clio-sandbox-token");
  sandboxCalls.push(`${url.host} ${url.pathname}`);
  const files = (url.searchParams.get("files") || "").split(",");
  return { data: { status: "ok", files: files.map((file) => ({ file, content: "const a = 1;\n" })) }, status: 200, headers: {}, config };
};

const saved = [];
// Newest first, as the query returns them. Only final answers reach the model.
const history = [
  { role: "assistant", content: "Error: the model timed out" },
  { role: "user", content: "retry please" },
  { role: "assistant", content: "<think>private reasoning</think>earlier answer" },
  { role: "user", content: "earlier question" },
];
const historyFilters = [];
CopilotChatMessage.find = findChain((filter) => {
  historyFilters.push(filter);
  return history;
});
CopilotChatMessage.create = async (doc) => saved.push(doc);
const sessions = stubSessions(ClioChatSession);

test("Clio reads through the sandbox, streams text and uses history once", async () => {
  const model = new ScriptedModel([
    { content: "Reading the file.", toolCalls: [{ name: "read_file", args: { files: ["src/a.js"] } }] },
    { content: "It declares a = 1.\n\n```js\n  indented\n```" },
  ]);
  setModelsForTesting(model, model);

  const streamed = [];
  const announced = [];
  const answer = await runCopilot({
    user: { id: "u1" },
    authToken: "t",
    projectId: "p1",
    sandboxId: "sbx-9",
    prompt: "what does a.js do?",
    activeFile: "/src/a.js",
    onSession: (s) => announced.push(s),
    onText: (t) => streamed.push(t),
  });

  assert.match(answer, /declares a = 1/);
  assert.ok(streamed.join("").includes("Reading the file."));
  assert.deepEqual(sandboxCalls, ["sandbox-service-sbx-9:3000 /api/agent/read-file"]);

  // A new chat was opened for the user and announced before streaming.
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].userId, "u1");
  assert.equal(sessions[0].projectId, "p1");
  assert.equal(announced[0].id, String(sessions[0]._id));
  assert.equal(announced[0].isNew, true);

  // History is read only from this user's chat, never by project alone.
  assert.equal(historyFilters[0].userId, "u1");
  assert.equal(String(historyFilters[0].sessionId), String(sessions[0]._id));
  assert.deepEqual(historyFilters[0].status, { $ne: "error" });

  const firstCall = model.seen[0].map((m) => String(m.content));
  assert.equal(firstCall.filter((c) => c.includes("what does a.js do?")).length, 1, "the new prompt is in the context once");
  assert.ok(firstCall.includes("earlier question"), "history comes first");
  assert.ok(firstCall.includes("earlier answer"), "thinking is stripped from past answers");
  assert.ok(!firstCall.some((c) => c.includes("private reasoning")), "no thinking in the context");
  assert.ok(!firstCall.some((c) => c.includes("timed out")), "no error replies in the context");

  assert.deepEqual(saved.map((d) => d.role), ["user", "assistant"]);
  assert.equal(saved[0].projectId, "p1", "projectId stays plain");
  assert.equal(saved[0].file, "src/a.js");
  assert.equal(String(saved[0].sessionId), String(sessions[0]._id));
  assert.equal(saved[0].requestId, saved[1].requestId, "one request id per turn");
});

test("Clio refuses a chat that belongs to another user", async () => {
  const [mine] = sessions;
  await assert.rejects(
    runCopilot({ user: { id: "intruder" }, authToken: "t", projectId: "p1", sandboxId: "sbx-9", sessionId: String(mine._id), prompt: "hi", onText: () => {} }),
    /Chat not found/,
  );
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
  assert.ok(body.startsWith("retry: 3000\n\nevent: session\ndata: {"), "the chat id comes first");
  assert.equal(res.writableEnded, true);
});
