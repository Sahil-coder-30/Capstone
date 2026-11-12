// Offline checks for chat sessions: every lookup is scoped to the verified
// user, ownership is checked before legacy rows are claimed, and projectId
// must match the sandbox. Models and HTTP are stubbed. No database.

import { test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import mongoose from "mongoose";

process.env.NVIDIA_API_KEY ||= "offline-test-key";

const { CHAT_STORES } = await import("../src/models/chatStores.js");
const chats = await import("../src/services/chatSession.service.js");
const { requireOwnedSandbox } = await import("../src/services/sandboxOwnership.service.js");
const { stubSessions } = await import("./helpers/fakeChatStore.js");

const orion = CHAT_STORES.codingAgent;
const clio = CHAT_STORES.copilot;
const sessions = stubSessions(orion.Session);
stubSessions(clio.Session);

// The Sandbox service says user "owner" owns project "p1" with sandbox "sbx-1".
let sandboxCalls = 0;
axios.defaults.adapter = async (config) => {
  sandboxCalls += 1;
  const owner = config.headers.Authorization === "Bearer owner-token";
  return { data: { projects: owner ? [{ _id: "p1", sandboxId: "sbx-1" }] : [] }, status: 200, headers: {}, config };
};

const record = (Model, name) => {
  const calls = [];
  Model[name] = async (...args) => {
    calls.push(args);
    return Model[`${name}Result`] ?? { modifiedCount: 1, deletedCount: 1 };
  };
  return calls;
};

test("a chat is only found for its own user", async () => {
  const mine = await orion.Session.create({ userId: "owner", projectId: "p1" });
  await assert.rejects(chats.getSessionMessages("codingAgent", { userId: "intruder", sessionId: String(mine._id) }), /Chat not found/);
  await assert.rejects(chats.getSessionMessages("codingAgent", { userId: "owner", sessionId: "not-an-id" }), /Chat not found/);
  await assert.rejects(chats.listSessions("nope", { userId: "owner", projectId: "p1" }), /agentType/);
});

test("message actions always filter by the verified user", async () => {
  const updates = record(orion.Message, "updateMany");
  const id = new mongoose.Types.ObjectId().toString();
  await chats.trashMessages("codingAgent", { userId: "owner", ids: [id, "bad-id", id] });
  assert.deepEqual(updates[0][0], { _id: { $in: [id] }, userId: "owner", deletionStatus: "active" });

  const deletes = record(orion.Message, "deleteOne");
  await chats.deleteMessageForever("codingAgent", { userId: "owner", messageId: id });
  assert.deepEqual(deletes[0][0], { _id: id, userId: "owner" });

  orion.Message.findOneAndUpdate = async (filter) => {
    assert.deepEqual(filter, { _id: id, userId: "owner" });
    return null; // not this user's message
  };
  await assert.rejects(chats.restoreMessage("codingAgent", { userId: "owner", messageId: id }), /Message not found/);
});

test("rename checks the title and locks it against the memory agent", async () => {
  const session = await orion.Session.create({ userId: "owner", projectId: "p1" });
  session.save = async () => {};
  await assert.rejects(chats.renameSession("codingAgent", { userId: "owner", sessionId: String(session._id), title: "   " }), /title/);
  await assert.rejects(chats.renameSession("codingAgent", { userId: "owner", sessionId: String(session._id), title: "x".repeat(81) }), /title/);
  const renamed = await chats.renameSession("codingAgent", { userId: "owner", sessionId: String(session._id), title: "  Login   page " });
  assert.equal(renamed.title, "Login page");
  assert.equal(session.titleLocked, true);
});

test("legacy rows without a user are claimed only by the verified owner", async () => {
  const claims = [];
  clio.Message.exists = async () => true;
  clio.Message.updateMany = async (filter, update) => claims.push({ filter, update });
  clio.Message.aggregate = async () => [];

  await chats.listSessions("copilot", { userId: "intruder", projectId: "p1", authToken: "intruder-token" });
  assert.equal(claims.length, 0, "a non-owner never claims rows");

  await chats.listSessions("copilot", { userId: "owner", projectId: "p1", authToken: "owner-token" });
  assert.equal(claims.length, 1);
  assert.deepEqual(claims[0].update, { $set: { userId: "owner" } });
  // Clio keyed old chats as `${projectId}:${file}`; the pattern is anchored and escaped.
  assert.deepEqual(claims[0].filter.projectId, { $regex: "^p1(:|$)" });

  const before = sandboxCalls;
  await chats.listSessions("copilot", { userId: "owner", projectId: "p1", authToken: "owner-token" });
  assert.equal(sandboxCalls, before, "a migrated project is not checked again");
});

test("legacy rows become one Earlier chat per file", async () => {
  const moved = [];
  const created = [];
  clio.Message.exists = async () => false;
  clio.Message.aggregate = async () => [
    { _id: "src/App.jsx", active: 3, last: new Date("2026-01-02") },
    { _id: "src/old.js", active: 0, last: new Date("2026-01-01") },
  ];
  clio.Message.updateMany = async (filter, update) => moved.push({ filter, update });
  const realCreate = clio.Session.create;
  clio.Session.create = async (doc) => {
    const session = await realCreate(doc);
    created.push(session);
    return session;
  };

  await chats.listSessions("copilot", { userId: "owner", projectId: "p2", authToken: "owner-token" });
  assert.deepEqual(created.map((s) => s.title), ["Earlier chat · App.jsx", "Earlier chat · old.js"]);
  assert.deepEqual(created.map((s) => s.deletionStatus), ["active", "trash"], "a chat with only deleted messages starts in the trash");
  assert.equal(moved[0].filter.userId, "owner");
  assert.equal(moved[0].filter.file, "src/App.jsx");
  assert.deepEqual(moved[0].update, { $set: { sessionId: created[0]._id, projectId: "p2" } });
});

test("history for the model keeps only final answers", async () => {
  const session = sessions[0];
  orion.Message.find = (filter) => {
    assert.equal(filter.userId, session.userId);
    assert.deepEqual(filter.status, { $ne: "error" });
    const rows = [
      { role: "assistant", content: "Error occurred during execution: boom" }, // legacy error row
      { role: "user", content: "fix it" },
      { role: "assistant", content: "<think>hidden</think>Done. Changed src/App.jsx." },
      { role: "user", content: "x".repeat(5_000) },
    ];
    const chain = { sort: () => chain, limit: () => chain, select: () => chain, lean: async () => rows };
    return chain;
  };
  const history = await chats.loadChatHistory(orion, session, 10);
  assert.deepEqual(history.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(history[1].content, "Done. Changed src/App.jsx.");
  assert.ok(history[0].content.length < 4_100, "long messages are truncated");
});

test("invoke routes use the verified projectId and reject a mismatch", async () => {
  const run = (body) => new Promise((resolve) => {
    const req = { body, authToken: "owner-token", user: { id: "owner-mw" } };
    requireOwnedSandbox(req, {}, (err) => resolve({ err, body: req.body }));
  });

  const ok = await run({ sandboxId: "sbx-1" });
  assert.equal(ok.err, undefined);
  assert.equal(ok.body.projectId, "p1", "projectId is filled from the sandbox");

  const bad = await run({ sandboxId: "sbx-1", projectId: "someone-elses" });
  assert.match(bad.err.message, /projectId does not match/);
});
