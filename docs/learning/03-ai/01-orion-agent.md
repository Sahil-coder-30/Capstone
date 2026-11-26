# AI 1: Orion, the coding agent (LangGraph, tool loop, SSE, tests)

> **Shipped:** first agent Jun 2026; rebuilt 2026-10-30 (`c8578dd`), split and moved to NVIDIA 2026-11-03 (`2e16c83`) · **Also:** `17267f0` (ownership) `61e71fb` (offline tests) `010a3a8` (frontend SSE) `c2ca344` `deeacb5` `9196d5a` (fixes) commit "fix(ai): close the P0 security gates" (security gates fail closed, 2026-11-26)
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

1. `POST /api/ai/code-agent/invoke` passes middleware in order: `identifyUser` → `requireOwnedSandbox` → `aiRateLimiter` → `creditLedger`. The rate limiter is a Redis token bucket in one Lua script (atomic read, refill, take), 20 requests/min on the free tier. Every gate fails closed: no sandbox named is 400, Redis or Payments down is 503 (see "Security pass" below).
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
| Every gate fails closed: ownership, rate limit, credit check (commit "fix(ai): close the P0 security gates") | Rate limit and credit check fail open (the design until 2026-11-26) | Each run spends paid model tokens. With fail open, one Payments or Redis outage meant unlimited free runs for everyone. A short 503 with a clear message is cheaper than an open door |
| Rate limiter returns 503 on a Redis error | In-process token bucket as a backup | Auth already checks the logout blacklist in Redis before the limiter runs, so when Redis is down the request fails there anyway. A backup bucket would be extra code for a path that almost never runs, and it breaks with more than one replica |
| Only `canQuery === true` from Payments lets a run start | `canQuery ?? true` | A reply with the field missing (bug, new version, proxy error page) was read as "yes, has credit". Only an explicit yes counts now |
| No HS256 fallback in AI auth | Keep `JWT_ACCESS_SECRET` for local tests | It checked no `algorithms`, `issuer` or `audience`. One env var set by mistake and anyone with that secret could sign tokens for any user. Tests use stubs instead |
| A skipped review is not approval | Count "review unavailable" as a pass | If the reviewer model failed and the project had no build or test script, nothing was checked, yet the run said `complete`. Now that is `partial` |
| 409 when the sandbox is not live (`9196d5a`) | Start the run anyway | Every tool call failed and the model guessed around it. Re-check without the 60 s cache first, since the user may have just started it |

## 4. Failure cases

| Case | Result |
|---|---|
| Provider 429 | Backoff with `Retry-After`; lasting limits end the run with a clear reason |
| Auth failure from the model provider | Run ends at once |
| Turn budget runs out | Loop returns `finished: false` with work kept; finalizer reports it |
| Browser disconnects | Run continues; re-attach replays events |
| Model edits `package.json` instead of `npm install` | Prompt forbids it, and the e2e build check now fails if new packages are missing from `node_modules` (`c2ca344`) |
| `PAYMENTS_SERVICE_URL` unset | Was a real bug: credit check went to the wrong host and, failing open, let every request through. Fixed to one URL in `credit.service.js` (`deeacb5`). Since commit "fix(ai): close the P0 security gates" a wrong host gives 503, not free runs |
| Payments down or times out (5 s) | 503 `CREDIT_CHECK_UNAVAILABLE`, run does not start |
| Payments replies without `canQuery` | 402, treated as "no credit" |
| Redis error in the rate limiter | 503 `RATE_LIMIT_UNAVAILABLE` |
| Invoke with no `projectId` and no `sandboxId` | 400 from `requireOwnedSandbox`, before any sandbox is touched |
| HS256 token, even signed with a known secret | 401 |
| Reviewer model fails and the build was skipped | Outcome `partial`, report says "ACCEPTANCE REVIEW: unavailable" |

### Security pass (2026-11-26, commit "fix(ai): close the P0 security gates")

Source: the drift report in `Ai_orchestration/fix.md`, section P0 (written 2026-10-26). Step one was to check every item again in today's code, because a month of work had passed. Three items were already fixed by earlier work, three were still open. Fixing a report blindly would have rewritten code that was already right.

| Item | Short name | State on 2026-11-26 |
|---|---|---|
| P0-1 | Clio reads any file on the AI pod | Already fixed earlier |
| P0-2 | Run on another user's sandbox through `sessionId` | Mostly fixed earlier; last gap closed now |
| P0-3 | Restore or delete any user's message | Already fixed earlier |
| P0-4 | Old messages without `userId` visible to all | Already fixed earlier |
| P0-5 | HS256 token fallback | Fixed now |
| P0-6 | Credit check, rate limiter, reviewer fail open | Fixed now |

#### P0-1. Clio could read any file on the AI pod (already fixed)

- **What was wrong:** the Clio endpoint took `workspacePath` and `activeFile` from the request body and read the file with `fs.readFileSync` on the AI pod. The only check was "the path starts with `workspacePath`", and the client chose `workspacePath` too.
- **Attack:** send `workspacePath: "/"` and `activeFile: "proc/self/environ"`. The check passes, and the AI pod's environment (model API key, Mongo URI, Redis URI) goes to the model and is saved in chat history, where the attacker can read it.
- **Root cause:** trusting a path from the client, and reading from the wrong machine. The user's files live in the sandbox pod, not on the AI pod. The AI pod has no reason to read its own disk for a user.
- **Fix (earlier commits):** the `fs` read was deleted. Clio gets the file text from the editor (`activeFileContent`) or reads it through the sandbox MCP tools, which only reach the caller's own verified sandbox.
- **Why this fix:** a better path check (block `..`, block `/`) would still leave a file read on the AI pod, which is one bug away from the same leak. Removing the read removes the whole class of bug.
- **Checked now:** no `fs` import is left in `Ai_orchestration/src`.

#### P0-2. Another user's sandbox through `sessionId` (gap closed now)

- **What was wrong:** `requireOwnedSandbox` checked only `projectId` and `sandboxId`. When both were missing it returned `null` and called `next()`. The controller then used `sessionId` as the sandbox id.
- **Attack:** user A sends `{ sessionId: "<B's sandboxId>" }` with no other ids. Ownership is never checked, and Clio's write tools edit B's code.
- **Root cause:** the guard "failed open" on missing input, and the controller had a fallback that turned an unchecked field into a sandbox id.
- **Earlier fix:** the controller requires both `projectId` and `sandboxId`, and uses only the ids the middleware rewrote after the ownership check. The `sessionId` fallback is gone (`sessionId` is now a chat id).
- **Fix now:** the middleware itself returns 400 `VALIDATION_ERROR` when neither id is sent.
- **Why fix it in the middleware too, when the controller already checks:** the middleware is the security guard; the controller check is a convenience. If a new route uses the middleware and forgets its own check, the hole would come back. A guard must be safe on its own (defence in depth).
- **Why 400 and not 403:** the request is incomplete, not forbidden. 400 tells the client to send the ids, and it says nothing about whether some sandbox exists.

#### P0-3. Restore or hard delete of any message (already fixed)

- **What was wrong:** restore and permanent delete used `findByIdAndUpdate` and `findByIdAndDelete` with only the message id.
- **Attack:** any signed-in user who learns or guesses a message id can restore or permanently delete someone else's message (an IDOR, insecure direct object reference).
- **Fix (earlier, chat sessions work):** `chatSession.service.js` uses `findOneAndUpdate({ _id, userId })` and `deleteOne({ _id, userId })`, checks the id format first, and returns 404 when nothing matched.
- **Why `userId` inside the query and not "load, then check owner":** one query is atomic, so there is no gap between the check and the write. It is also one database call instead of two.
- **Why 404 and not 403:** 403 would confirm that the message exists and belongs to someone else. 404 leaks nothing.

#### P0-4. Old messages without `userId` (already fixed)

- **What was wrong:** every chat query had `$or: [{ userId }, { userId: { $exists: false } }]`, so old messages with no owner were listed, trashed and restored by every user.
- **Fix (earlier):** queries filter only by the caller's `userId`. Old rows are "claimed" when the owner first opens the project's chats, and only after the Sandbox service confirms with the caller's token that the project is theirs (`migrateLegacyMessages`). If Sandbox is down, nothing is claimed and it retries later.
- **Why this and not the one-off backfill script the report suggested:** a script needs direct access to the Sandbox database to find project owners, which breaks "each service owns its data". The lazy claim asks the Sandbox API, needs no manual run, and fails closed.

#### P0-5. HS256 fallback in AI auth (fixed now)

- **What was wrong:** when RS256 verification failed and `JWT_ACCESS_SECRET` was set, the code called `jwt.verify(token, secret)` with no `algorithms`, no `issuer` and no `audience`. It was there "for local tests".
- **Attack:** if that env var is ever set in a real cluster (copied `.env`, wrong secret file), anyone who knows the secret signs `{ sub: "<any user>" }` with HS256 and is accepted as that user. No `audience` check also means tokens meant for another system would pass.
- **Root cause:** a test-only path inside production auth code, switched on by config instead of by code. One wrong env var is all it takes.
- **Fix:** the fallback is deleted. Only RS256 tokens from the Auth JWKS with the fixed issuer and audience are accepted. Tests stub JWKS and Redis.
- **Why delete and not "allow it only when `NODE_ENV === test`":** `NODE_ENV` is also just an env var, and it was not even set in k8s. Code that can never run in production is safer than code that is "normally off". No test needed the fallback.

#### P0-6a. Credit check failed open (fixed now)

- **What was wrong:** if the call to Payments `GET /credit/check` failed (down, timeout, wrong URL), `creditLedger` used `{ hasCredit: true, fallback: true }` and let the run start. Also `canQuery ?? hasCredit ?? true` read a reply without those fields as "has credit".
- **Real damage seen:** a wrong default `PAYMENTS_SERVICE_URL` made the check fail on every request, so every run was free and nobody noticed (`deeacb5`). Fail open hides outages instead of showing them.
- **Why the "charge after the run" did not save us:** credits cannot go below zero, so a user with 0 credits can still run, and the charge afterwards only takes them to 0. The model tokens are already paid to the provider.
- **Fix:** Payments failure gives 503 with code `CREDIT_CHECK_UNAVAILABLE` and a clear message. Only `canQuery === true` (or `hasCredit === true`) lets a run start; anything else is 402.
- **Why this and not a small grace budget in Redis:** extra code and a new Redis key for a rare case, and it still gives runs away. A short 503 is honest and cheap.

#### P0-6b. Rate limiter failed open (fixed now)

- **What was wrong:** if the Redis token bucket call threw, `aiRateLimiter` logged and called `next()`, so there was no limit at all.
- **Risk:** during a Redis problem one client can send unlimited requests, each one starting a paid model run.
- **Fix:** 503 with code `RATE_LIMIT_UNAVAILABLE`.
- **Why not the in-process token bucket the report suggested:** `identifyUser` already checks the logout blacklist in Redis before the limiter runs. When Redis is down the request fails there first, so the backup bucket would almost never run. With more than one replica each pod would also count on its own, so the limit would be wrong. Less code, same safety.

#### P0-6c. Reviewer failure counted as approval (fixed now)

- **What was wrong:** when the reviewer model call failed, the node returned `pass: true, skipped: true`. `computeOutcome` only looked at `review.pass`, so the run could end as `complete`.
- **When it hurt:** the tester "passes" with stage `skipped` when the project has no build or test script. If the reviewer then also failed, nothing at all had verified the code, yet the user saw "Done".
- **Fix:** in `computeOutcome`, a skipped review counts only when the tester ran a real check (`testResults.stage !== "skipped"`). Otherwise the outcome is `partial`, and the report already says "ACCEPTANCE REVIEW: unavailable".
- **Why change the outcome and not the reviewer node:** the reviewer still returns `pass: true` so the graph goes to the finalizer and not to the debugger, which would have nothing concrete to fix. The decision "is this run verified?" belongs in one place, `computeOutcome`.

#### How the fixes were proven

- `tests/securityGates.test.js`, 5 offline tests: no ids gives 400; Payments down gives 503 and a reply without `canQuery` gives 402; Redis error gives 503; an HS256 token gives 401; skipped review plus skipped build gives `partial`.
- They were run on the old code first: 5 of 5 failed. On the new code: 5 of 5 pass. A test that passes on both versions proves nothing.
- Full `npm test`: 41 of 41 pass.

#### Trade-off accepted

When Payments or Redis is down, users get a clear 503 instead of a working agent. Availability is a bit lower, but nobody gets free paid model runs, nobody floods the model, and no forged token gets in. The rule I follow now: fail closed when the failure could cost security or money; fail open only where failing closed loses data (Payments still records usage after a run even if a check fails).

**Known limit (biggest in the system):** `MemorySaver` checkpoints, live runs and SSE subscribers are in process memory, so the AI service is single replica. A restart loses paused plan reviews. Model pacing is also per process. Plan: Foundations F1 (Mongo checkpointer, Redis leases, Redis streams, Redis token bucket per model). Not built.

## 5. Testing

- `npm test` is fully offline: a scripted fake model plus a real MCP server on a temp workspace (`tests/helpers/fakeSandbox.js`). Covers tool loop, guards, step retry, Orion flow, Clio, SSE framing, MCP client rules, chat sessions, memory. Grew 12 → 19 → 31 → 41 (the last 5 are the security gate tests).
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

**Q6. The credit check used to fail open. Why did you change it?**
A: The old idea was that the real charge happens after the run anyway, so a short outage only gives away a few requests. In practice it leaked: a wrong default URL made the check fail on every request, so every run was free and nothing showed it. Credits also cannot go below zero, so the charge after the run cannot take back what was already spent. Now Payments down means 503, and only an explicit `canQuery: true` starts a run. I chose losing some availability over giving away paid model tokens.

**Q7. Why 503 in the rate limiter and not a local in-memory limiter as a backup?**
A: Auth checks the logout blacklist in Redis before the limiter runs. If Redis is down, the request already fails there, so a backup limiter would almost never run. It would also be wrong with more than one replica, because each replica would have its own count. The simplest correct choice is to fail closed with a clear message.

**Q8. You had an HS256 fallback "only for tests". What was wrong with it?**
A: It called `jwt.verify` with just the secret: no fixed algorithm, no issuer, no audience. If `JWT_ACCESS_SECRET` was ever set in production, anyone who knew it could sign a token as any user. Test-only code paths in auth are dangerous because one env var turns them on. I deleted it; tests stub JWKS and Redis instead.

**Q9. How do you know a security test actually tests the bug?**
A: Run it on the old code first and watch it fail, then on the fix and watch it pass. All 5 gate tests failed on the old code. A test that passes on both versions proves nothing.

**Q10. What is an IDOR, and where did you have one?**
A: Insecure direct object reference: the server acts on an id from the client without checking that the object belongs to the caller. Restore and permanent delete of chat messages used only the message id, so any user could delete anyone's message. The fix puts `userId` from the verified token inside the same query (`{ _id, userId }`), which is atomic, and returns 404 when nothing matches so it does not reveal that the message exists.

**Q11. Your AI service could read `/proc/self/environ`. How did that happen and how did you fix it?**
A: The copilot read a file from its own disk using a path from the request, and the only check was that the path started with a base folder that the client also chose. Sending `/` as the base and `proc/self/environ` as the file leaked the service's API keys into the chat. Path filters can be bypassed, so I removed the file read completely. The user's files live in the sandbox pod, so the copilot now uses the editor's content or the sandbox tools, which only reach the caller's own verified sandbox.

**Q12. You got a month-old security report. How did you work through it?**
A: I checked every item again in the current code before changing anything. Three of six were already fixed by later work, so changing them again would only add risk. For the open ones I fixed the root cause, not the symptom: delete the dangerous path where possible, fail closed where a failure costs money or security. Then I wrote tests that fail on the old code and pass on the new, and updated the report and the project docs with the real status.

## 7. Revise in 60 seconds

- Nodes: router, general, planner, critic, plan_review (interrupt), coder, tester, reviewer, debugger, finalizer.
- Own ReAct loop: keeps work on budget end, readable tool errors, blocks repeat calls.
- SSE with seq ids, replay on `Last-Event-ID`, 15 s heartbeat; runs outlive requests.
- NVIDIA Nemotron via ChatOpenAI; pacing, 429 backoff, timeout.
- Single replica today (MemorySaver); F1 is the fix.
- All gates fail closed since commit "fix(ai): close the P0 security gates": no ids 400, Payments or Redis down 503, no HS256, skipped review is not approval.
