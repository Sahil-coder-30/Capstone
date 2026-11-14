# Plan: tool call logging and analytics

Status: **plan only, nothing built.** Written 2026-11-13, checked against the code on 2026-11-14. This file is the source of truth. The Claude Doc "Taksha MCP tools: analysis and roadmap to a Claude Code level agent" (tab "Tool call analytics") holds the first draft, which was written without access to the code.

Plan index and ownership rules: [README.md](README.md).

## 1. Summary

Log every agent tool call to MongoDB from the AI service, and answer four questions from it: which tools are used most, which fail most, which are slow, and where the agent gets stuck. About 5 working days for one engineer (estimate).

| This plan owns | This plan does not touch |
|---|---|
| One logger module in `Ai_orchestration`, two collections in the Mongo `ai` database, a rollup job, report scripts | The sandbox sidecar, the router, the frontend, Payments |
| Run ids in the agent's `config.configurable` | The tool result shape (owned by [taksha-agent-tools-build-plan.md](taksha-agent-tools-build-plan.md)) |

**It stands alone.** It needs no other plan, and no other plan needs it. The build plan's gates read their numbers from the eval runner's own result files. When this plan is live, the same numbers can also be read from here.

**No broker.** The "queue" in this plan is a small array in the AI service's memory. It is not RabbitMQ and not Kafka, and it does not change when the Kafka plan is built.

**What it is not:** it does not store file contents, command output or secrets. It stores what was called, by which run, how long it took, and how it ended.

## 2. What the code looks like today (checked)

| Fact | Where | Effect on this plan |
|---|---|---|
| The model's tool calls all run through one loop | `Ai_orchestration/src/agent/core/toolLoop.js` `runToolLoop` | Hook 1. It sees every model call, also the ones a guard blocks, unknown tools, repeated calls and `search_internet` |
| Fixed checks by nodes (tester build, reviewer reads) skip the loop | `runCommand`, `readFiles`, `listFiles`, `getRuntimeLogs` in `tools/sandbox.client.js` | Hook 2, with `actor: system` |
| Every sandbox call already prints one log line with name, short args, outcome and time | `callSandboxTool` in `tools/sandbox.client.js` | The new record replaces nothing. The line stays |
| The run config only carries `thread_id`, `sandboxId`, `credentialKey` | `services/agentRun.service.js` (`configurable`) | Add `userId`, `projectId`, `sessionId`, `runId`, `agentType` |
| Each run already has a `requestId` (`orion:<runId>`) that Payments stores in `usage_events` | `agentRun.service.js`, Payments `usage_events` | Log the same id. Token cost per run then joins with no new work |
| Results are already cut at 24,000 characters | `tools/toolResult.js` | `truncated` is read from the result |
| A failed tool result carries `"error": true` | `tools/toolResult.js`, `core/toolActivity.js` `isToolErrorOutput` | Reuse `isToolErrorOutput` to set `status` |
| The AI service runs as one replica with in-process queues | `agentRun.service.js`, `memory.service.js` | An in-memory queue and an interval job fit the existing pattern |
| `npm test` in the AI service is offline (no network, no database) | `Ai_orchestration/tests/` | The logger takes its collection as a parameter, so tests pass a fake |
| The sidecar has no database, runs user code, and its pod cannot reach private addresses | `Sandbox/Agent`, `k8s/sandbox-networkpolicy.yml` | Never log from the sidecar. It must not hold database credentials |

## 3. Scope

| Caller | Version 1 | How |
|---|---|---|
| Orion and Clio (model calls) | Yes | Hook 1 |
| Orion nodes (fixed checks) | Yes | Hook 2 |
| External agents through the router gateway (`tks_mcp_...` tokens) | No | They already print `[MCP] tool=... (external agent)` in the sidecar log. The router has Redis only |
| The editor, file tree and logs panel in the frontend | No | These are user actions, not agent behaviour |

Later, if external agent numbers are needed: the gateway posts small batches to a new `/internal/tool-calls` route on the AI service (`INTERNAL_SERVICE_TOKEN`). Not part of this plan.

## 4. What gets logged

One document per tool call, written after the call ends.

| Field | Type | Example | Why |
|---|---|---|---|
| `time` | date | call start time | Time axis for every chart |
| `meta.tool` | string | `patch_file` | Group by tool |
| `meta.actor` | string | `agent`, `system`, `test` | `agent` is a model call, `system` is a node's fixed check, `test` is the eval runner or `e2e:live` |
| `meta.agent` | string | `codingAgent`, `copilot` | Orion and Clio apart |
| `meta.model` | string | model id, or `null` for `system` | Compare models |
| `meta.toolsVersion` | string | `1` | Constant `TOOLS_VERSION` in the AI service. Raised when the tool set changes, to compare before and after |
| `callId` | string | `tc_...` | Unique id |
| `userId`, `projectId`, `sessionId` | string | | Find one user's, project's or chat's calls |
| `runId` | string | `orion:<runId>` | One agent turn. Same value as `usage_events.request_id` in Payments |
| `status` | string | `ok`, `error`, `blocked`, `timeout` | Outcome |
| `errorCode` | string | `GUARD_BLOCKED` | Why it failed (table below) |
| `errorMessage` | string | first 300 chars, redacted | Debug without the full output |
| `durationMs` | number | 182 | Slow tools |
| `inputBytes`, `outputBytes` | number | 420, 96 | Token cost and oversized results |
| `truncated` | boolean | `false` | How often the 24,000 character cap is hit |
| `inputHash` | string | sha256 of the raw input | Detect repeats without storing the input |
| `input` | object | redacted summary | See the rules below |

Only fields with few distinct values go in `meta` (tool, actor, agent, model, version). Ids stay outside it, or the time-series buckets stop compressing well.

| `status` | `errorCode` | Set when |
|---|---|---|
| `blocked` | `GUARD_BLOCKED` | A guard in `tools/guards.js` refused the call (`WRONG TOOL`, `SCOPE_VIOLATION`) |
| `blocked` | `REPEAT_CALL` | The loop stopped a repeated identical call. This is the "stuck agent" signal |
| `error` | `UNKNOWN_TOOL`, `BAD_ARGS` | The model named a tool that does not exist, or sent arguments the schema rejects |
| `timeout` | `TIMEOUT` | The sandbox client returned `timedOut` |
| `error` | `SANDBOX_ERROR` | The sandbox client returned `ok: false` |
| `error` | `TOOL_ERROR` | The tool answered, and `isToolErrorOutput` says it failed (for example `oldStr` not found) |
| `error` | the tool's own code | Once the build plan ships its result envelope, `error.code` (`NO_MATCH`, `STALE_WRITE`, ...) replaces `TOOL_ERROR`. The logger reads `error.code` when it is present, so no change is needed here |

**Redaction rules for `input` (applied before anything is queued):**

1. **Keep short scalar params as they are:** paths, globs, flags, numbers, booleans.
2. **Replace long strings with a summary.** Any string over 200 characters becomes `{ bytes, lines, sha256, head }`, where `head` is the first 120 characters. This covers `content`, `oldStr` and `newStr`.
3. **Mask secrets everywhere,** including in `head`, commands and error messages: `tks_...`, `Bearer ...`, `sk-...`, `nvapi-...`, `ghp_...`, JWTs, and any `KEY=value` where the key contains `SECRET`, `TOKEN`, `PASSWORD` or `KEY`.
4. **Never log request headers, sandbox tokens or environment variables.**
5. **Commands:** keep the command text after masking, capped at 500 characters.
6. **Arrays of files** (`files`, `updates`): keep each path, and apply rule 2 to each `content`.

Output is never stored. Only its size, `status` and the error fields are.

## 5. How it works

1. The hook notes the start time.
2. The tool runs exactly as today.
3. The hook calls `recordToolCall(config, { tool, args, output, status, errorCode, startedAt })`. The call is synchronous, never awaited and wrapped in `try`, so logging can never slow or break a tool.
4. The record goes into an in-memory array.
5. A writer drains the array every 2 seconds with one `insertMany`.
6. If MongoDB is down, the array holds up to 5,000 records, then drops the oldest and counts the drops.
7. On `SIGTERM`, the writer flushes once before the process exits.
8. A job every 5 minutes folds raw records into hourly rollups.

```js
// Ai_orchestration/src/services/toolLogger.service.js (design, not tested code)
const queue = [];
let dropped = 0;
const MAX_QUEUE = 5000;
const enabled = () => process.env.TOOL_LOGGING === 'on';

export function recordToolCall(config, { tool, args, output, status, errorCode, errorMessage, startedAt, actor, model }) {
  if (!enabled()) return;
  try {
    const run = config?.configurable ?? {};
    const raw = JSON.stringify(args ?? {});
    if (queue.length >= MAX_QUEUE) { queue.shift(); dropped += 1; }
    queue.push({
      time: new Date(startedAt),
      meta: { tool, actor: actor ?? 'agent', agent: run.agentType ?? null, model: model ?? null, toolsVersion: TOOLS_VERSION },
      callId: `tc_${crypto.randomUUID()}`,
      userId: run.userId, projectId: run.projectId, sessionId: run.sessionId, runId: run.runId,
      status, errorCode: errorCode ?? null, errorMessage: redactText(errorMessage)?.slice(0, 300) ?? null,
      durationMs: Date.now() - startedAt,
      inputBytes: Buffer.byteLength(raw), outputBytes: Buffer.byteLength(String(output ?? '')),
      truncated: String(output ?? '').startsWith('{"truncated":true'),
      inputHash: sha256(raw), input: redactInput(args),
    });
  } catch { /* logging must never break a tool */ }
}

export function startToolLogWriter(collection) {
  const flush = async () => {
    if (!queue.length) return;
    const batch = queue.splice(0, 500);
    try { await collection.insertMany(batch, { ordered: false }); }
    catch { queue.unshift(...batch.slice(0, MAX_QUEUE - queue.length)); } // retry next tick
  };
  const timer = setInterval(flush, 2000);
  timer.unref?.();
  process.on('SIGTERM', () => { clearInterval(timer); flush(); });
  return { flush, stats: () => ({ queued: queue.length, dropped }) };
}
```

**Where the two hooks go:**

| Hook | Place | Covers | Actor |
|---|---|---|---|
| 1 | `runToolLoop`, around its inner `runCall` function. `runCall` already holds every exit: unknown tool, guard block, repeat stop (`MAX_SAME_CALL`), invalid arguments, and the real call | Every model tool call, for Orion and Clio | `agent` |
| 2 | `callSandboxTool` gets an optional fourth argument `{ actor }`. `runCommand`, `readFiles`, `listFiles` and `getRuntimeLogs` pass `actor: 'system'`. Calls without it are not logged there, because hook 1 already logged them | Fixed checks by nodes | `system` |

A call is logged in exactly one hook, so nothing is counted twice.

## 6. Storage in MongoDB

Two collections in the existing `ai` database, through Mongoose like the other AI models. No new connection string and no new secret.

**1. `toolcalls` (raw, time-series, kept 30 days):** model file `Ai_orchestration/src/models/ToolCall.model.js`.

```js
new Schema({ time: Date, meta: Object /* + the fields from section 4 */ }, {
  timeseries: { timeField: 'time', metaField: 'meta', granularity: 'seconds' },
  expireAfterSeconds: 60 * 60 * 24 * 30,
  autoCreate: true,
});
// secondary indexes
{ 'meta.tool': 1, time: -1 }
{ projectId: 1, time: -1 }
{ runId: 1, time: 1 }
```

**2. `toolstatshourly` (rollup, normal collection, kept for good):** one document per hour, tool, actor and tools version. It holds no user, project or session id.

```js
{
  _id: { hour: ISODate('2026-11-13T19:00:00Z'), tool: 'patch_file', toolsVersion: '1', actor: 'agent' },
  calls: 412, ok: 371, error: 35, blocked: 4, timeout: 2,
  errorCodes: { TOOL_ERROR: 29, REPEAT_CALL: 6 },
  durationMsSum: 61200, durationMsMax: 4100, p50: 96, p95: 610,
  inputBytesSum: 180400, outputBytesSum: 92000, truncated: 3
}
```

The rollup job runs every 5 minutes inside the AI service, recomputes the current and the previous hour from `toolcalls`, and upserts with `$merge`. Recomputing two hours makes the job safe to re-run and catches late records.

| Check before day 2 | Why |
|---|---|
| MongoDB version of the cluster (`db.version()`) is 5.0 or newer | Time-series collections |
| Version is 7.0 or newer | `p50` and `p95` use `$percentile`. On an older version, leave both out of the rollup and compute them from raw records in the report script |
| The AI service's database user may create collections in `ai` | `autoCreate` |

**Size check (estimate):** a record is about 0.5 to 1 KB before compression. At 100,000 calls a day that is under 100 MB a day raw, and less once time-series compression applies.

**Admin portal:** the admin plan's read-only `ai` database user can read both collections with no new credential. A tool analytics page in the portal belongs to `Admin/PLAN.md` (P4 analytics), not to this plan.

## 7. Analytics

| Question | Metric | What to do with it |
|---|---|---|
| Which tools are used most? | Calls per tool per day | Spend improvement time on the top five |
| Which tools are never used? | Tools with 0 calls in 14 days | Fix the tool description, or remove the tool |
| Which fail most? | `error / calls` per tool | Anything over 10% gets a ticket |
| Why do they fail? | Count per `errorCode` per tool | High `TOOL_ERROR` on `patch_file` means a better hint. High `GUARD_BLOCKED` means a guard is too strict |
| Which are slow? | p50 and p95 `durationMs` | p95 over 5 s gets a look |
| Where is the agent stuck? | `REPEAT_CALL` count, and runs with 3 or more failures on the same `tool + inputHash` | Read those runs, then fix the error hint |
| Which results are too big? | `truncated` rate and `outputBytes` p95 | Add filters or paging to that tool |
| Did a release help? | Error rate by `toolsVersion`, a week before and after | Keep or roll back the change |

Saved as scripts in `Ai_orchestration/scripts/tool-stats/` and run with `npm run tools:report`.

**Failure rate per tool, last 7 days (from the rollup):**

```js
db.toolstatshourly.aggregate([
  { $match: { '_id.hour': { $gte: new Date(Date.now() - 7 * 864e5) }, '_id.actor': { $ne: 'test' } } },
  { $group: { _id: '$_id.tool', calls: { $sum: '$calls' }, error: { $sum: '$error' },
              blocked: { $sum: '$blocked' }, ms: { $sum: '$durationMsSum' } } },
  { $project: { calls: 1, failRate: { $divide: ['$error', '$calls'] },
                blockRate: { $divide: ['$blocked', '$calls'] }, avgMs: { $divide: ['$ms', '$calls'] } } },
  { $sort: { failRate: -1 } },
]);
```

**Stuck runs, last 24 hours (from raw calls):**

```js
db.toolcalls.aggregate([
  { $match: { time: { $gte: new Date(Date.now() - 864e5) }, status: { $ne: 'ok' } } },
  { $group: { _id: { runId: '$runId', tool: '$meta.tool', inputHash: '$inputHash' },
              fails: { $sum: 1 }, code: { $last: '$errorCode' } } },
  { $match: { fails: { $gte: 3 } } },
  { $sort: { fails: -1 } },
]);
```

**One run, in order (for debugging a report from a user):**

```js
db.toolcalls.find({ runId: 'orion:...' }).sort({ time: 1 });
```

**Warnings.** The project has no team chat hook and no Alertmanager today, so version 1 has no push alerts. The rollup job prints one `console.warn` line, and `npm run tools:report` lists the same four conditions:

- A tool's error rate over the last hour is above 25%, with at least 20 calls.
- A tool's p95 doubles against its 7-day average.
- The writer's `dropped` count goes above 0, or the queue stays above 1,000.
- No records at all for 15 minutes while runs are active.

Push alerts come later through Alertmanager, once the monitoring stack exists (owner: `Admin/PLAN.md` P5).

**Dashboard:** MongoDB Atlas Charts on `toolstatshourly`, if the database is on Atlas. Otherwise the report script is enough for now.

## 8. Build steps

Five days, each ending in something that can be checked. One local commit per day, after `cd Ai_orchestration && npm test` passes.

**Day 1: run context and redaction**

- [ ] Add `userId`, `projectId`, `sessionId`, `runId`, `agentType` to `config.configurable` for Orion (`services/agentRun.service.js`) and Clio (`services/copilot.service.js`)
- [ ] Write `redactInput` and `redactText`, with unit tests
- [ ] Tests must prove: a `tks_...` token, a `Bearer` header and a 5,000 character `content` never appear in a record

**Day 2: logger, writer and hooks**

- [ ] Write `toolLogger.service.js` (`recordToolCall`, `startToolLogWriter`) and `ToolCall.model.js`
- [ ] Add hook 1 in `runToolLoop` and hook 2 in `callSandboxTool`
- [ ] Start the writer in `server.js` after the Mongo connection, only when `TOOL_LOGGING=on`
- [ ] Add `TOOL_LOGGING` to `Ai_orchestration/.env.example` and `k8s/ai-deployment.yml` (default off)
- [ ] Tests: a tool that throws still returns its error and is logged once. A writer whose `insertMany` always fails does not slow or fail a tool. With the flag off, nothing is queued

**Day 3: rollups and queries**

- [ ] Write the 5-minute rollup job with `$merge`
- [ ] Save the three queries above as scripts, and add `npm run tools:report`
- [ ] Add `queued` and `dropped` to the existing `GET /api/ai/healthz` response

**Day 4: warnings and charts**

- [ ] Print the four warning conditions from the rollup job and the report script
- [ ] Atlas Charts page on `toolstatshourly`: calls per tool, failure rate per tool, p95 per tool, top error codes

**Day 5: rollout**

- [ ] Turn the flag on locally and run `npm run e2e:live` (it must log with `actor: test`)
- [ ] Read 50 raw records by hand and check that nothing sensitive got through
- [ ] Measure the overhead: p95 tool time with the flag on and off
- [ ] Turn it on in the cluster, and add a line about usage logging to the terms

**Done when:** every tool call of a test run appears in MongoDB within 5 seconds, a planted secret does not appear anywhere, the added latency is under 2 ms per call, and the report shows the failure rate per tool.

**Rollback:** set `TOOL_LOGGING` to off. The hooks then return at once. Dropping both collections removes all data.

## 9. Privacy and risks

- Store ids, not names or emails.
- Raw records expire after 30 days through the TTL. Rollups hold no user ids, so they can stay.
- The rule from `CLAUDE.md` still holds: `userId` comes from the verified token (`run.userId`), never from a request body.
- Say in the terms that tool usage is logged to improve the product.

| Risk | What goes wrong | How to limit it |
|---|---|---|
| A secret slips through redaction | A token sits in the database for 30 days | Unit tests with planted secrets, the day 5 manual read, and a scan of `toolcalls` for known token patterns in the report script |
| Logging slows tools | Every call pays for a database write | The queue and batch writer. Nothing is awaited on the tool path |
| Lost records on a crash | Up to 2 seconds of calls vanish | Accept it. This is analytics, not billing. Billing stays in Payments `usage_events` |
| Paths reveal private info | A file path contains a client name | Paths are kept on purpose, because they are needed to debug. Covered by the 30-day expiry and database access rules |
| Numbers mislead | A test run inflates the counts | `actor: test`, filtered out of every report |
| A second AI replica appears | Two rollup jobs run | Harmless: the rollup recomputes and upserts the same documents |

**Open questions:**

- [ ] Who should see the charts?
- [ ] Should Clio's inline edits count in the same failure-rate targets as Orion?
