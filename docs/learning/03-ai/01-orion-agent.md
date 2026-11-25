# AI 1: Orion, the coding agent (LangGraph, tool loop, SSE, tests)

> **Shipped:** first agent Jun 2026; rebuilt 2026-10-30 (`c8578dd`), split and moved to NVIDIA 2026-11-03 (`2e16c83`) · **Also:** `17267f0` (ownership) `61e71fb` (offline tests) `010a3a8` (frontend SSE) `c2ca344` `deeacb5` `9196d5a` (fixes)
> **Code:** `Ai_orchestration/src/agent/` (`graph/`, `nodes/`, `core/toolLoop.js`, `llm/`, `tools/`), `src/services/agentRun.service.js`
> **One line:** a state machine that plans, waits for your approval, codes, tests and reviews, and only believes tool results, not the model's claims.

## 1. The graph

```
START → router ─┬─► general → END                      (questions, no code change)
                └─► planner ─┬─► critic ─┬─► planner     (auto re-plan)
                             │           └─► plan_review  ⏸ interrupt(): user approves/rejects
                             └─► finalizer (planning failed)
plan_review ─┬─► planner (rejected, with feedback)
             └─► coder ─┬─► coder (next plan step)
                        ├─► finalizer (no files touched)
                        └─► tester ─┬─► reviewer ─┬─► finalizer → END
                                    │             └─► debugger ─┬─► tester (re-verify)
                                    └─► debugger ───────────────┴─► finalizer (retries used up)
```

Clio (file copilot) is a separate one-node graph with one tool loop and no checkpointer.

## 2. How a run flows

1. `POST /api/ai/code-agent/invoke` passes middleware in order: `identifyUser` → `requireOwnedSandbox` → `aiRateLimiter` → `creditLedger`. The rate limiter is a Redis token bucket in one Lua script (atomic read, refill, take), 20 requests/min on the free tier.
2. `agentRun.service.js` creates a run that lives apart from the HTTP request, mints a 2-hour sandbox token, and attaches the response as an SSE subscriber.
3. Every tool-using node runs `core/toolLoop.js`, a small ReAct loop with a turn budget (for example planner 15, Clio 15).
4. Tools reach the sandbox only through `callSandboxTool` → router internal MCP path (see Sandbox 3).
5. At `plan_review` the graph calls `interrupt()`. The user's approve/reject resumes the same thread with `Command({ resume })`.
6. Status, test results and the outcome come from tool results and exit codes, not from what the model says.
7. After the run, usage goes to Payments `POST /credit/update` with a `requestId` per run (idempotent).

### SSE contract

Frames are `id: <seq>\nevent: <name>\ndata: <json>\n\n` (data is always JSON, so newlines cannot break framing). Events include `agent:run`, `agent:status`, `agent:thinking`, `agent:steps`, `agent:tool_start` / `tool_end`, `agent:plan_review`, `agent:final`, `agent:done`, `agent:error`. A `: ping` heartbeat every 15 s keeps proxies from closing the stream. `GET /code-agent/stream/:projectId?sessionId=` re-attaches after a reload: events after `Last-Event-ID` are replayed, or a snapshot is sent if they were trimmed. Limits: 60 min of work per segment, 30 min waiting for review, finished runs kept 2 min for late reconnects.

### Model layer

NVIDIA build.nvidia.com through `ChatOpenAI` (OpenAI-compatible API): `nemotron-3-ultra` main, `nemotron-3.5-lightning` fast. `llm/rateLimiter.js` wraps the model in place: pacing between calls, exponential backoff on 429 (honours `Retry-After`), and a per-call timeout. Structured output falls back to JSON parsing for models without forced tool choice. Provider history: Mistral → OpenRouter (Oct 12) → Mistral Codestral (Oct 30) → NVIDIA (Nov 3).

## 3. Decisions

| Decision | Rejected | Why |
|---|---|---|
| Explicit LangGraph state machine | One big ReAct agent | Plan approval, retries and testing are product rules; a graph makes them enforced paths, not prompt hopes |
| Own tool loop | LangGraph prebuilt agent | The prebuilt one threw away all finished work on the recursion limit. Ours keeps it, answers unknown tools and bad args with readable errors, and stops identical repeated calls (the usual way small models get stuck) |
| Human-in-the-loop plan review with `interrupt()` | Auto-execute | The user sees and edits the plan before files change |
| Facts from tools, not the model | Trust "tests passed" from the model | Models claim success. Exit codes do not lie |
| Coder step retried once with the failure reason | No retry / unlimited | One retry fixes most slips; unlimited burns credits |
| SSE (one direction) | Socket.IO | Server → client stream is all we need. SSE runs over plain HTTP, works through ingress, has built-in reconnect with `Last-Event-ID`, and dropped a dependency |
| Run independent of the request | Run tied to the HTTP connection | A reload or network blip must not kill a 20-minute run |
| Ownership check fails closed; rate limit and credit check fail open | All fail closed | Ownership is security. A Redis or Payments blip should not block every user; usage is still billed after the run |
| 409 when the sandbox is not live (`9196d5a`) | Start the run anyway | Every tool call failed and the model guessed around it. Re-check without the 60 s cache first, since the user may have just started it |

## 4. Failure cases

| Case | Result |
|---|---|
| Provider 429 | Backoff with `Retry-After`; lasting limits end the run with a clear reason |
| Auth failure from the model provider | Run ends at once |
| Turn budget runs out | Loop returns `finished: false` with work kept; finalizer reports it |
| Browser disconnects | Run continues; re-attach replays events |
| Model edits `package.json` instead of `npm install` | Prompt forbids it, and the e2e build check now fails if new packages are missing from `node_modules` (`c2ca344`) |
| `PAYMENTS_SERVICE_URL` unset | Was a real bug: credit check went to the wrong host and, failing open, let every request through. Fixed to one URL in `credit.service.js` (`deeacb5`) |

**Known limit (biggest in the system):** `MemorySaver` checkpoints, live runs and SSE subscribers are in process memory, so the AI service is single replica. A restart loses paused plan reviews. Model pacing is also per process. Plan: Foundations F1 (Mongo checkpointer, Redis leases, Redis streams, Redis token bucket per model). Not built.

## 5. Testing

- `npm test` is fully offline: a scripted fake model plus a real MCP server on a temp workspace (`tests/helpers/fakeSandbox.js`). Covers tool loop, guards, step retry, Orion flow, Clio, SSE framing, MCP client rules, chat sessions, memory. Grew 12 → 19 → 31.
- `npm run e2e:live` runs Orion with the real model against the real sidecar app (owner auth + MCP) with a throwaway key as Auth. It costs model credits, so it is run on purpose only.
- A bug the fake caught only after it was made strict: Mongoose 9 rejects pipeline updates without `updatePipeline`, so every memory job failed (`b5d1aff`). Lesson: fakes must enforce the same rules as the real store.

## 6. Interview questions

**Q1. Why a graph instead of letting one agent loop until done?**
A: Some steps must always happen in order: plan, human approval, code, test, review. A single loop can skip testing or claim success. In a graph each node has one job and the edges decide what comes next from real results, so "tests failed" always routes to the debugger.

**Q2. How do you reduce hallucinated success?**
A: Status comes from tool facts: exit codes, files actually changed, test output. The reviewer checks acceptance criteria and unmet ones go to the debugger while retries remain. Failed writes are not listed as changed files.

**Q3. How does plan approval work technically?**
A: The `plan_review` node calls LangGraph `interrupt()`, which saves the thread state in the checkpointer and stops. The UI shows the plan. Approve or reject calls an endpoint that resumes the same thread id with `Command({ resume: decision })`. Today the checkpointer is in memory, which is why the service is single replica.

**Q4. Why SSE and not WebSockets?**
A: Traffic is server to client; user actions (stop, approve) are normal POSTs. SSE is plain HTTP, passes through the ingress without upgrade handling, and the browser reconnects with `Last-Event-ID`, which I use to replay missed events from a per-run buffer.

**Q5. How would you scale the AI service to many replicas?**
A: Move state out of the process. A Mongo checkpointer so any replica can resume a thread; a Redis lease so exactly one replica executes a run; Redis streams for events so any replica can serve the SSE stream and replay; a Redis token bucket per model so N replicas share the provider limit. Then sticky sessions are not needed.

**Q6. The credit check fails open. Isn't that a money leak?**
A: Briefly, yes, by design. The pre-check is only a gate. The real charge happens after the run with an idempotent `requestId`, and credits cannot go below zero in the DB. A short Payments outage costs a few free requests; failing closed would block every user. I did find a real leak: a wrong default URL made the check always fail open, which is why there is now one configured URL.

## 7. Revise in 60 seconds

- Nodes: router, general, planner, critic, plan_review (interrupt), coder, tester, reviewer, debugger, finalizer.
- Own ReAct loop: keeps work on budget end, readable tool errors, blocks repeat calls.
- SSE with seq ids, replay on `Last-Event-ID`, 15 s heartbeat; runs outlive requests.
- NVIDIA Nemotron via ChatOpenAI; pacing, 429 backoff, timeout.
- Single replica today (MemorySaver); F1 is the fix.
