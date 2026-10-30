# Ai_orchestration: fixes

Source: `docs/reviews/2026-10-26_DRIFT_REPORT.md`, re-checked against the working tree (including the uncommitted refactor) on 2026-10-26.

Legend: ✅ = re-verified in code for this plan. 📄 = taken from the drift report, not re-read line by line.
Severity: **P0** = security hole, fix before anything else. **P1** = correctness bug users will hit. **P2** = hardening / cleanup. **Docs** = doc drift only.

Recommended order: P0-1 → P0-2 → P0-3 → P0-4 → P1s → P2s → Docs.

---

## P0: Security

### P0-1. Clio can read any file inside the AI pod ✅
- **Where:** `src/controllers/ai.controller.js` lines ~111-123 (`appAgentInvoke`).
- **What happens:** `workspacePath` and `activeFile` come from the request body. The code resolves the path and checks only that it starts with the caller's own `workspacePath`. Sending `workspacePath: "/"` and `activeFile: "proc/self/environ"` reads the AI pod's environment (Mistral key, Mongo URI, Redis URI). The contents are sent to the LLM and stored in chat history.
- **Note:** this reads the **AI pod's** disk, not the sandbox. There is no legitimate reason for the AI pod to read a workspace from its own filesystem.
- **Fix:**
  1. Delete the `fs.readFileSync` branch entirely. Use `activeFileContent` from the body, or, if empty, fetch the file from the sandbox sidecar via `sandboxClient` (`GET /api/agent/read-file?files=`) using the verified `sandboxId`.
  2. Stop accepting `workspacePath` from the client. If a path is needed for prompts, derive it server side.
  3. Validate `activeFile` as a relative path (no `..`, no leading `/`, no NUL), max length ~512.
- **Verify:** request with `workspacePath:"/"`, `activeFile:"proc/self/environ"` must return no file content; add a unit test in `tests/`.

### P0-2. Clio can act on another user's sandbox via `sessionId` ✅
- **Where:** `src/services/sandboxOwnership.service.js:58-72` (`requireOwnedSandbox`) and `ai.controller.js:39-42`.
- **What happens:** the middleware checks only `body.projectId` / `body.sandboxId`. If both are missing it returns `null` and calls `next()`. The controller then falls back to `sessionId` for both `projId` and `containerId`, so `{ sessionId: "<victim sandboxId>" }` passes and Clio's write tools hit the victim's pod.
- **Live caller:** `Frontend/src/features/chat/Hooks/chat.hooks.js:175` still sends only `sessionId` (the copilot hook sends `projectId` + `sandboxId`).
- **Fix:**
  1. In `requireOwnedSandbox`, treat a missing `projectId` **and** `sandboxId` as `400 VALIDATION_ERROR` on the invoke routes (fail closed). Also check `sessionId` if present.
  2. In `appAgentInvoke`, remove the `sessionId` fallback; use only the `req.body.sandboxId` / `projectId` that the middleware rewrote. Consider setting `req.ownedSandbox = owned` and reading from that instead of `req.body`.
  3. Same audit for `code-agent/invoke` (it requires both ids, good) and for `/code-agent/stream|stop|plan-approve|plan-reject` (keyed by user id; confirm they never accept another user's `projectId`).
- **Verify:** test with user A's token and user B's sandboxId as `sessionId` only → 400/403.

### P0-3. Chat restore and permanent delete have no ownership check ✅
- **Where:** `src/controllers/chat.controller.js:153-193`.
- **What happens:** `restoreChatMessage` and `permanentlyDeleteChatMessage` call `findByIdAndUpdate` / `findByIdAndDelete` with `messageId` only. Any signed-in user can restore or hard-delete any user's message.
- **Fix:** use `findOneAndUpdate({ _id: messageId, userId: req.user.id }, ...)` and `findOneAndDelete({ _id, userId })`; return 404 when nothing matched (the openapi spec promises 403/404). Validate `messageId` with `mongoose.Types.ObjectId.isValid`.
- **Verify:** user A cannot restore/delete user B's message id.

### P0-4. Legacy messages with no `userId` are visible to everyone ✅
- **Where:** every query in `chat.controller.js` uses `$or: [{ userId }, { userId: { $exists: false } }]` (lines 24, 31, 59, 64, 98, 130, 135).
- **What happens:** old messages without `userId` are listed, trashed and restorable by every user. Batch-delete also uses this filter, so any user can trash them.
- **Fix:** write a one-off backfill (developer runs it, with approval) that sets `userId` on legacy messages from the project owner (look up `projectId` → Sandbox project `user`), or marks orphans as trash. Then remove the `$exists: false` branch everywhere.

### P0-5. HS256 fallback with no issuer/audience/algorithm check ✅
- **Where:** `src/middleware/auth.middleware.js:105-117`.
- **What happens:** if `JWT_ACCESS_SECRET` is ever set, any HS256 token signed with it is accepted, with no `algorithms`, `issuer` or `audience`. Dormant in k8s today but one env var away from a bypass.
- **Fix:** delete the fallback. For local tests, sign test tokens with a test RSA key and point `AUTH_JWKS_URI` at a stub, or gate it behind `NODE_ENV === "test"` **and** pass `{ algorithms: ["HS256"], issuer, audience }`.

### P0-6. Fail-open gates 📄 (code re-checked ✅)
- **Credit check** `src/services/credit.service.js:24-27`: if Payments is unreachable it returns `{ hasCredit: true, fallback: true }`. **Fix:** return `hasCredit: false` with a `CREDIT_CHECK_UNAVAILABLE` code (503), or allow a small, Redis-counted grace budget per user instead of unlimited.
- **Rate limiter** `src/middleware/rateLimit.middleware.js:120-124`: Redis error → `next()`. **Fix:** fall back to an in-process token bucket per user (single replica today) rather than allowing everything; log and count with a metric.
- **Reviewer node** `src/agent/nodes/reviewer.node.js:120-131`: LLM error → `pass: true`. **Fix:** return `pass: true, skipped: true` only if the build/test stage passed, and surface "review skipped" in the final report (already partly done). Never let a reviewer failure count as approval in telemetry.

---

## P1: Correctness

### P1-1. `patch_file` can edit the wrong occurrence ✅
- **Where:** `src/agent/tool.js:570-630`.
- **What happens:** when the sidecar rejects an ambiguous match (more than 1 occurrence), the orchestrator re-reads the file and calls `currentContent.replace(oldStr, newStr)`, which edits the **first** occurrence. The trimmed retry has the same problem.
- **Fix:** count occurrences before rewriting. If `count !== 1`, return an error to the agent ("oldStr matches N places, add more context"). Only auto-rewrite when there is exactly one match.

### P1-2. Agent-only sandboxes expire mid-run ✅
- **Where:** `Sandbox/server/src/config/redis.js:6-9` sets a 120 s TTL; only the router refreshes it (`Sandbox/router/src/config/redis.js:14`). Orion calls `http://sandbox-service-<id>:3000` directly (`tool.js:27`).
- **Fix (AI side):** in `sandboxClient.js`, refresh the TTL while a run is active: either a heartbeat every ~60 s during a run (`EXPIRE sandbox:<id> 1200` against the shared Redis), or call a new Sandbox server endpoint `POST /api/sandbox/keepalive/:projectId`. Prefer the endpoint so AI does not own Sandbox's key format. See `Sandbox/server/fix.md`.

### P1-3. Subscription tier is always `free` ✅
- **Where:** `auth.middleware.js` sets `subscription: decoded.subscription || "free"`, and Auth never puts `subscription` in the JWT. `rateLimit.middleware.js:94` therefore always uses the free tier, and pro/max bypasses never apply.
- **Fix:** do not rely on a JWT claim (tier changes after a payment would be stale for 15 min). Read the tier from Payments (`GET /api/payments/credit` already returns it) and cache it in Redis for ~60 s per user. Use it in the rate limiter and credit ledger.

### P1-4. Debugger scope is wider than designed 📄
- **Where:** `src/agent/nodes/debugger.node.js:78-83,111-114`.
- **What happens:** the allowlist adds every touched file, every plan `activeFiles` entry and `package.json`; tools include `updateFile`, `createFile`, `executeCommand`.
- **Fix (decide first):** either narrow it (flagged files + `package.json`, `patchFile` only, `executeCommand` only for installs) or keep it and update the docs. Pick one and make code and docs agree.

### P1-5. `execute_command` has no destructive-command guard 📄
- **Where:** `src/agent/guards.js:16-31,61-70` blocks only file-manipulation commands and dev-server starts. `rm -rf /`, `curl … | sh`, etc. pass.
- **Fix:** add a deny-list (recursive deletes outside `node_modules`/`dist`, `curl|wget … | sh`, `chmod 777`, writes to `/etc`, `kill -9 1`, fork bombs) and an allow-list mode for the Debugger (npm install/test/build, ls, cat). The sidecar must enforce its own limits too (see `Sandbox/Agent/fix.md`).

### P1-6. Clio write tools have no guards; `AbortSignal.timeout` patched process-wide 📄 (✅ patch exists at `clio.agent.js:2-4`)
- **Fix:** wrap Clio's tools with the same `applyGuards` / scope guard as Orion. Replace the global monkey patch with a per-call `AbortController` passed through LangChain's `signal` option.

### P1-7. Orphaned `socket.js` and unused compactor 📄 (✅ `initSocketIO` is never called)
- **Fix:** delete `src/socket/socket.js` (developer approves the delete) or move it to `docs/proposals`. Either register `compactor.node.js` in the graph with a real `tokenCount` field or remove it.

### P1-8. SSE backpressure ignored 📄
- `res.write()` return value is ignored, and `X-Accel-Buffering: no` is set only on code-agent streams.
- **Fix:** set `X-Accel-Buffering: no` on the app-agent stream too; when `write()` returns false, wait for `drain` (or drop non-essential events from the replay buffer).

### P1-9. Extra LLM call on every `execute_command` 📄
- Every command output triggers a Mistral summary call (the comment still says Gemini). Costs credits and latency.
- **Fix:** summarise only when output exceeds a threshold (e.g. 4 KB), and bill it to the run. Fix the comment.

---

## P2: Hardening and config

- **Single replica + in-memory state ✅:** `MemorySaver` (`code.agent.js:113`, `clio.agent.js:209`) and the `runs` Map (`agentRun.service.js:50`) mean `replicas: 1` is mandatory today. Document this as a hard constraint in the deployment and README until Mongo checkpointing exists (see featureTobeBuild.md).
- **`TAVILY_API_KEY` not injected in k8s ✅:** `.env.example` has it, `k8s/ai-deployment.yml` does not. Add it to the `ai-secret` secret and deployment (see `k8s/fix.md`).
- **No CORS config, server timeout 0 📄:** set an explicit CORS origin list (both frontends) and a sane `server.headersTimeout`/`requestTimeout` (SSE routes can opt out).
- **`PAYMENTS_SERVICE_URL` default differs between modules 📄:** centralise in one `config/env.js` with one default.
- **No `NODE_ENV` in k8s ✅:** stack traces are logged in the cluster. Fixed in `k8s/fix.md`.
- **Dead env vars 📄:** `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `COHERE_API_KEY` are documented and in the example secret but never read. Remove them (or build multi-provider, see featureTobeBuild.md).

---

## Docs (no code change)

Files: `readme.md`, `docs/architecture/01-ai-agent-orchestration.md`, `docs/deep-dives/orion-v3-*.md`, `docs/deep-dives/ai-orchestration-pipeline-middleware.md`, `docs/api/post-code-agent-invoke.md`.

- Auth is RS256 via `AUTH_JWKS_URI` + Redis blacklist, not `JWT_ACCESS_SECRET`. Document `AUTH_JWKS_URI`, `PAYMENTS_SERVICE_URL`, `SANDBOX_SERVICE_URL`, `ORION_MODEL`, `ORION_FAST_MODEL`, `NODE_ENV`.
- Credits go to **Payments** (`/api/payments/credit/check|update`), not Auth.
- Clio is `app-agent/invoke` over **SSE**; Orion is `code-agent/invoke`; Socket.IO is not used by AI.
- Model: Mistral `codestral-latest` only.
- Graph: **10 nodes** (router, general, planner, critic, plan_review, coder, tester, reviewer, debugger, finalizer), 8 conditional edges, compactor not registered, `recursionLimit: 120`.
- Real state fields: `task`, `plan`, `currentStep`, `testResults`, `buildLog`, `flaggedFiles`, `review`, `finalAnswer`, `outcome`.
- Plan pause is `interrupt()` in `plan_review` for **every** plan unless `autoApprovePlan` is sent.
- Middleware chain: `identifyUser → requireOwnedSandbox → aiRateLimiter → creditLedger`. No edgeSecurity/contentGuard. Free tier is 20/min.
- Debugger escalates on the 2nd repeat of an error signature; no 16-hop breaker.
- Run limits: 60-min segment, 30-min plan-review expiry, 4,000-event replay buffer, one run per user+project. Planner: 1-8 steps, ≤5 files/step, ≤2 critic re-plans.
- Mark MCP, Jev/RLCD, gRPC, multi-provider failover, Mongo checkpoint, HPA, telemetry queue, tri-layer tester as **Proposed, not implemented**, and flip their `[x]` to `[ ]`.
