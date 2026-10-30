# Taksha CodeSpace: EGM drift report (2026-10-26)

Method: the Elephant-Goldfish Model (`google/elephant-goldfish-model`) `egm-drift-report` skill. Six zero-context "Goldfish" reviewers each read one group of docs and the live working tree (including the uncommitted refactor) and reported only where the docs and the code disagree. Everything was read-only. No `.env`, `*.pem` contents or `k8s/secrets.yml` were opened.

Scope: all 21 docs under `docs/` (excluding diagrams and design-token HTML), the root `README.md`, and every service README.

Severity: **Blocker** = a security or correctness claim the code does not meet, or a reader would build or deploy wrongly. **Major** = a feature or contract that is materially different. **Nit** = a stale detail.

---

## Part 1: What to fix first

The drift review turned up real security bugs as a side effect. I re-read the code for the ones marked "verified".

### Security bugs in the code (not just the docs)

1. **Any pod file is readable through Clio (verified).** `appAgentInvoke` takes `workspacePath` and `activeFile` from the request body and checks the resolved path only against the caller's own `workspacePath`. Sending `workspacePath: "/"` with `activeFile: "proc/self/environ"` reads the AI pod's environment (API keys, DB URIs). The contents go to the LLM and are saved in chat history. `Ai_orchestration/src/controllers/ai.controller.js:111-123`
2. **Clio can drive another user's sandbox (verified).** `requireOwnedSandbox` checks only `body.projectId` and `body.sandboxId`. `appAgentInvoke` falls back to `sessionId` for both. A request carrying only `sessionId=<someone else's sandbox>` passes the ownership check, and Clio's write tools then act on that sandbox. `Ai_orchestration/src/services/sandboxOwnership.service.js:58-72`, `ai.controller.js:39-42`
3. **Chat restore and hard delete have no ownership check (verified).** `restoreChatMessage` and `permanentlyDeleteChatMessage` act on `messageId` alone, so any signed-in user can restore or permanently delete any message. `Ai_orchestration/src/controllers/chat.controller.js:153-193`
4. **The sandbox sidecar has no authentication.** `/api/agent/exec` (runs any shell string), the file write and delete endpoints, and one global PTY shell over Socket.IO with CORS `*` are all reachable through `*.agent.localhost` → router, with no token check. All clients share the same PTY and see each other's output. The sandbox service account can also list pods and read `pods/log` across the namespace, so a user can read other tenants' logs. `Sandbox/Agent/src/app.js:180-258,1246-1320`, `Sandbox/router/src/app.js:117-170`, `k8s/rabc.yml:36-45`
5. **The RSA private key is built into the Auth image (verified).** `Auth/.dockerignore` lists only `node_modules` and `.env`, and the dockerfile runs `COPY . .`, so `certs/private.pem` ends up in the image.
6. **Any expiring Redis key deletes a pod (verified in code; impact depends on whether Auth and Sandbox share a Redis db).** The sandbox server subscribes to every key-expiry event in db0 and calls `deletePod(key.split(':')[1])` with no prefix check. Auth's `blacklist:<token>` keys expire in the same way. If they share the db, each expiry triggers a failing `deletePod`, and the throw is unhandled. `Sandbox/server/src/config/redis.js:20-42`, `Auth/src/config/redis.js:18`
7. **Sandboxes can be torn down mid-run.** A new sandbox key has a 120 s TTL, and only traffic through the router extends it. Orion calls `sandbox-service-<id>:3000` directly, so a sandbox used only by the agent can expire during a run. `Sandbox/server/src/config/redis.js:6-9`, `Ai_orchestration/src/agent/tool.js:27`
8. **`.env` files are synced to S3.** The PRD says they are excluded, but the sync agent's ignore list has no `.env` rule. `Sandbox/sync-agent/sync.js:160-172`
9. **Several checks fail open.** These pass requests through when a dependency is down: the AI credit check (Payments unreachable → `hasCredit: true`) and the AI rate limiter (Redis error → allow). Payments' token-blacklist check uses a lazy Redis client that is never connected, so revoked tokens are accepted. The Reviewer node returns `pass: true` when its LLM call errors. `Ai_orchestration/src/services/credit.service.js:24-27`, `middleware/rateLimit.middleware.js:120-124`, `Payments/config/redis.js:5-10,27-29`, `nodes/reviewer.node.js:120-131`
10. **The AI service has an HS256 fallback.** Whenever `JWT_ACCESS_SECRET` is set, AI accepts HS256 tokens with no algorithm, issuer or audience check. It is unset in k8s today, so the path is dormant. `Ai_orchestration/src/middleware/auth.middleware.js:105-117`
11. **Logout does not revoke the refresh token.** The refresh cookie is scoped to `Path=/api/auth/refresh`, so `/logout` never receives it. Logout also requires a valid access token, so a user whose access token has expired cannot log out. `Auth/src/utils/generateTokens.js:94`, `Auth/src/controllers/auth.controller.js:76-96`

### Correctness bugs that matter

- **Zero Day-Waste does not hold.** Queued slots keep their original `validUntil` while they wait, so a Pro plan with 15 days left, upgraded to Max, comes back with 0 days. `Payments/services/subscription.service.js:216-270,432-436`
- **Admin routes cannot be reached.** The Auth `User` schema has no `role` field, so every token says `role: 'user'` and `/api/payments/admin/*` is unreachable. The JWT also carries no `subscription` claim, so Pro and Max users are always treated as free in AI.
- **Production redirects and cookies are wrong.** `CLIENT_URL` and `NODE_ENV` are not set in k8s, so login redirects to `localhost:5173`, the refresh cookie is not `Secure`, and stack traces are logged.
- **A fresh cluster cannot start from the example secrets.** `k8s/secrets.yml.example` does not match what the deployments read: `REDIS_URL` vs `REDIS_URI`, `aws` vs `aws-secret`, and `RSA_PRIVATE_KEY` and `GMAIL_APP_PASSWORD` are missing. `TAVILY_API_KEY` is never injected into the AI pod, so `search_internet` cannot work in the cluster.
- **`patch_file` can edit the wrong text.** When the sidecar rejects an ambiguous match, the orchestrator falls back to `String.replace`, which changes the first occurrence. `Ai_orchestration/src/agent/tool.js:593-615`
- **Failed emails are dropped silently.** Notification `nack`s failures with no dead-letter queue. The payment receipt email shows ₹0.00 because the template reads `amount` while Payments sends `amountPaise`.
- **Users can be charged without being activated.** The payments frontend falls back to an orderless Razorpay checkout with a hard-coded test key, and `/verify` then rejects that payment.
- **The settings page fakes success.** Settings services return fake success on any error, and "API key" creation makes up an `sk_test_…` key with `Math.random` for a backend route that does not exist.

### Docs that describe features that do not exist

These are written as built (often with `[x]` checklists), but no code exists for them:

- MCP / JSON-RPC `/mcp`
- `ALLOWED_TOOLS_BY_ROLE`
- the Jev / RLCD router
- gRPC
- the 16-hop circuit breaker
- MongoDB checkpointing and the HPA
- multi-provider LLM failover
- the content-guard and edge-security middleware
- the browser extension (doc 08)
- Prometheus, Loki and Alloy manifests
- `/metrics` outside Auth
- the Admin service (README only, labelled "Production v1.0.0")
- Yjs sync
- OpenAPI codegen, Spectral and Prism
- tier-based pod quotas

The real system is REST with axios, a single Mistral `codestral-latest` model, an in-memory `MemorySaver` with one replica, and a 10-node graph (the docs say 9). For a capstone review this is the biggest credibility risk: a reviewer who runs the README's `curl … /mcp` check gets a 404.

**Fix pattern:** for each aspirational doc, either move it to `docs/proposals/` or add a status header ("Proposed, not implemented"), and switch the `[x]` items back to `[ ]`. Replace absolute `file:///Users/...` links with repo-relative links.

---

## Part 2: Per-document drift (Goldfish reports)

### AI orchestration

#### docs/architecture/01-ai-agent-orchestration.md
- [Blocker] `patch_file` "Occurrences == 1 or halt": the sidecar rejects 0 or more than 1 matches, but the orchestrator then falls back to `String.replace` (first match) and retries with a trimmed oldStr. (§7.2, §1.4; `Ai_orchestration/src/agent/tool.js:593,615`)
- [Blocker] Surgical Scope: the Debugger is supposed to be limited to `patch_file` on `flaggedFiles`. In code it also has `updateFile`, `createFile` and `executeCommand`, and its allowlist adds every touched file, every plan activeFile and `package.json`. (§3.2.4; `nodes/debugger.node.js:78-83,111-114`)
- [Blocker] Circuit breaker (abort on the first duplicate signature or at 16 transitions): not implemented. The Debugger escalates on the third occurrence of a signature, there is no transition counter, the graph `recursionLimit` is 120, and `retryCount` counts for the whole run, not per file. (§2, §3.2.3, §11; `debugger.node.js:65-75`, `agentRun.service.js:362`)
- [Major] JEV_DECIDE / Jev Guard / System 1: not found. Routing is a Mistral LLM call plus a greeting regex, followed by 8 `*Edge` functions. (`nodes/router.node.js:25,45`, `code.agent.js:128-139`)
- [Major] The state schema does not match. `runId`, `userMessage`, `fileTree`, `currentTodoIndex`, `activeFiles`, `verificationReport`, `errorSignatureHistory`, `totalTransitions`, `diffSummary` and `finalResponse` do not exist. The real state has `task`, `plan`, `currentStep`, `testResults`, `buildLog`, `flaggedFiles`, `review`, `finalAnswer` and `outcome`. (`code.agent.js:62-109`)
- [Major] The Reviewer (an LLM node) can override a passing build and fails open on error. (`nodes/reviewer.node.js:93,120-131`)
- [Major] Tri-layer tester: the Tester runs only unit tests and `npm run build`. It never calls vite-runtime-errors, and no Chrome extension layer exists. When there is no build script, it returns `pass: true, stage: "skipped"` instead of falling back to ESLint. (`tester.node.js:99-149`)
- [Major] Critic risk gate: every plan pauses in `plan_review` via `interrupt()` unless `autoApprovePlan` is sent, whatever the risk. (`critic.node.js:13,64`, `planReview.node.js:13,22`)
- [Major] The doc claims Mongo checkpointing, stateless pods and an HPA at 70% CPU. Code uses an in-process `MemorySaver` and `runs` Map, and the deployment has `replicas: 1` with no HPA. (`code.agent.js:113`, `agentRun.service.js:50`, `k8s/ai-deployment.yml:8`)
- [Major] Telemetry over the `ai_telemetry_queue` RabbitMQ queue: not found. Usage is an HTTP POST to Payments `/credit/update`. (`credit.service.js:47`)
- [Major] Multi-provider failover: not found. The service is Mistral only, default `codestral-latest`. (`agent/model.js:14,23`)
- [Major] The compactor exists but is not wired into the graph, and it keys on a `tokenCount` field that is not in the state. Prompt prefix caching: not found. (`code.agent.js:117-139`, `nodes/compactor.node.js:14`)
- [Nit] Thread id is `${sandboxId}:${Date.now()}`, not `${projectId}:...`. `STREAMABLE_NODES` exists only in the dead `socket.js`; the live path uses `ANSWER_NODES`. The server is HTTP/1.1, not HTTP/2. `/api/agent/command` is really `/api/agent/exec`. The tool scope guard applies only to the Debugger.

#### docs/deep-dives/orion-v3-production-graph-deep-dive.md
- [Major] The header says 572 lines and 9 nodes including compactor. The file is 161 lines with 10 nodes, and compactor is not registered. (`code.agent.js:117-126`)
- [Major] The doc says there is no error-signature fingerprinting. That is stale: the Debugger hashes normalized error lines with SHA-256 and escalates on a repeat or when it changed nothing. (`debugger.node.js:47-51,65-75,144-155`)
- [Major] `interruptBefore: ["critic"]` does not exist. The pause is `interrupt()` in `plan_review`, and `autoApprovePlan` skips it.
- [Nit] Line references are stale (`:308`, `:432`, router L88-127 are past the end of the file). The doc says 6 edges; there are 8. The compactor threshold is 100k, not 55k. The model is codestral, not Mistral Large. Reviewer and plan_review are not covered.

#### docs/deep-dives/ai-orchestration-pipeline-middleware.md
- [Blocker] The checklist marks middleware 1 and 2, the controller refactor and MCP as done. `edgeSecurity.middleware.js` and `contentGuard.middleware.js` do not exist. The real chain is identifyUser → requireOwnedSandbox → aiRateLimiter → creditLedger. There is no injection filter, PII redaction or 25k-character cap. (`routes/ai.routes.js:12-14`)
- [Blocker] The quota gate is described as CP with atomic Redis `DECR`. It is actually an HTTP check to Payments that fails open, and the rate limiter fails open on Redis errors. (`creditLedger.middleware.js:62-72`, `credit.service.js:24-27`, `rateLimit.middleware.js:120-124`)
- [Major] MCP over JSON-RPC: not found. The controller is 479 lines, not under 100. `X-Sandbox-ID` is not used; the id comes from the body. `MemorySaver` is in-process only. `req.intent` pre-classification: not found.
- [Nit] Free tier is 20/min, not 15. The error body is FaultKit `{success:false,error:{...}}`. Line counts and the route `/api/invoke/agent` are stale (the real route is `/api/ai/code-agent/invoke`).

#### docs/deep-dives/orion-v3-benchmarks-world-comparison.md
- [Major] The matrix lists Jev Guard, JEV_DECIDE, tri-layer Vite HMR, high-risk-only `interrupt()` and "patch_file, NOT full rewrite" as features. None is implemented; Coder and Debugger both have `update_file`.
- [Major] The v2 descriptions are stale. `testerEdge` is deterministic, the interrupt is in plan_review, and the finalizer emits an escalation reason. `applyGuards` is in `guards.js` and guards only `execute_command`.
- [Nit] Scenario 5 (compactor) and Scenario 3 (Vite catch) describe code that does not exist. The model is codestral.

#### Ai_orchestration/readme.md
- [Blocker] AuthN is described as `JWT_ACCESS_SECRET` with no call to Auth. Code fetches RS256 keys from `AUTH_JWKS_URI` (24 h cache) and checks the Redis blacklist. The HS fallback has no issuer or audience check, and `AUTH_JWKS_URI` is not documented. (`middleware/auth.middleware.js:23,34,86,106-108`)
- [Major] Credits are described as calls to Auth `/api/auth/credit/*`. They are calls to Payments via `PAYMENTS_SERVICE_URL`, which is not documented.
- [Major] `app-agent/invoke` is said to stream over Socket.io. It is Clio over SSE; Orion is `code-agent/invoke`. `socket.js` is dead code (`initSocketIO` is never called).
- [Major] Multi-provider routing: only Mistral is used. `GOOGLE_API_KEY`, `OPENAI_API_KEY` and `COHERE_API_KEY` are listed as required but nothing reads them. `ORION_MODEL`, `ORION_FAST_MODEL`, `SANDBOX_SERVICE_URL` and `NODE_ENV` are missing from the env table.
- [Major] Production readiness is stale. Health probes exist (`/api/ai/healthz` and `/api/ai/readyz`, httpGet) and so does the rate limiter. The server timeout is 0, not 10 minutes. CORS is not configured. Tool calls do have axios timeouts (15–150 s), and sandboxId comes from the request body, not the JWT.
- [Nit] Soft delete uses a `deletionStatus` enum, not `deletedAt`. The folder tree is stale. `TAVILY_API_KEY` is not injected in k8s. The route and tool lists are incomplete.

**Undocumented (AI):** the file-read and `sessionId` bugs (Part 1, items 1 and 2) and the HS256 fallback. Also:
- every `execute_command` makes an extra Mistral summary call (the comment says Gemini)
- `clio.agent.js` monkey-patches `AbortSignal.timeout` for the whole process, and Clio's write tools have no guards
- run limits are not documented: 60-minute segment, 30-minute plan-review expiry, 4,000-event replay buffer, one run per user and project
- planner limits are not documented: 1–8 steps, at most 5 files per step, at most 2 Critic re-plans

### Sandbox

#### docs/architecture/02-mcp-sandbox-sidecar.md
- [Blocker] There is no MCP server, no `POST /mcp` and no JSON-RPC. The sidecar is plain Express REST under `/api/agent/*`. (`Sandbox/Agent/src/app.js:79-1327`)
- [Blocker] `ALLOWED_TOOLS_BY_ROLE` and `getToolsForRole()` do not exist. Each node hand-picks its tools. (`Ai_orchestration/src/agent/tool.js:107-748`)
- [Blocker] There is no command whitelist and no block on destructive commands. `guards.js` blocks only file-manipulation commands and dev-server starts, so `rm -rf /` passes. The sidecar `exec` runs any string. (`guards.js:16-31,61-70`, `Sandbox/Agent/src/app.js:1246-1320`)
- [Major] `tools/list` discovery, the LRU cache and `TEMPLATE_TYPE`: not found. Role toolsets differ from the matrix: the coder gets all 10 tools, and the debugger gets `update_file`, `create_file` and `execute_command`, which §10.3 forbids. The coder's `activeFiles` bound is not checked before tool execution.
- [Nit] There is no keep-alive agent and no 2 MB read cap. `get_file_tree` does not exist. There are 10 tools plus `search_internet`, not 15. The snippets are TypeScript; the repo is JS.

#### docs/infrastructure/sandbox-reverse-proxy-router.md
- [Major] The snippets leave out the sandbox-id validation in `parseSandboxHost`. Someone copying the doc's `host.split('.')` version would reintroduce a Host-header SSRF. (`Sandbox/router/src/app.js:27-35,124-127,154-159`)
- [Nit] The router listens on 3000, not 80. The source link is a stale absolute path. The health routes are not documented.

#### Sandbox/Agent/README.md
- [Blocker] It says the shell is never exposed to the internet. An unauthenticated PTY (Socket.io CORS `*`) and `POST /api/agent/exec` are both reachable through the public `*.agent.localhost` ingress. (`app.js:180-258,1246`, `k8s/ingress.yml:61-70`)
- [Major] Endpoint paths are wrong: the real ones are `list-files`, `read-file?files=` and `exec`. Six endpoints are missing from the doc. The watcher emits `workspace-change`, not `file-change`. Yjs is never imported. There is one global PTY broadcast via `io.emit`, not one PTY per client. AI calls the service DNS name directly, not through the router.
- [Nit] No k8s probe is set on `agent-container`. `WORKSPACE_DIR` is never read. `@kubernetes/client-node` is used to read pod logs.

#### Sandbox/router/README.md
- [Major] The preview target is `sandbox-service-<id>:80`, not `:5173`. AI tool calls bypass the router, so they never refresh the TTL.
- [Nit] The id is now validated, but any valid id is proxied with no auth. `.env.example` exists. There is no `/healthz` alias.

#### Sandbox/server/README.md
- [Major] JWT verification is RS256 via `AUTH_JWKS_URI`, not `JWT_ACCESS_SECRET`.
- [Major] `create-project` only inserts a Mongo record; `start/:projectId` provisions the pod and service.
- [Major] The router does not check the Redis key before proxying. Key expiry drives auto-teardown instead.
- [Major] Soft delete uses the `deletionStatus` enum. There is no readiness loop: status is set to `live` as soon as the create calls return.
- [Nit] HTTP probes exist. There is no CORS. `cookie-parser` is unused. There is no service layer. The pod AWS secret is `aws-secret`. `.env.example` uses PORT 4000.

#### Sandbox/sync-agent/README.md
- [Major] Restore runs in a separate init container (`--restore-only`), then runs `npm install`. The secret is `aws-secret`, not `aws`.
- [Nit] Restore applies no ignore rules and runs in parallel (p-limit 8). Only `PROJECT_ID` and `AWS_BUCKET_NAME` are fail-fast. `unlinkDir` does an S3 delete by prefix.

#### Sandbox/template/README.md
- [Major] The image is not init-only: it is also the long-running Vite container, and it ships `node_modules`. `vite.config.js` injects an error reporter that POSTs browser errors, proxies `/api/agent` and `/api/terminal-proxy` (the second route does not exist on the agent), auto-restarts on `package.json` changes, and sets `allowedHosts: true`.
- [Nit] `PORT` is ignored (hard-coded 5173).

**Undocumented (Sandbox):**
- Redis expiry teardown, the 120 s TTL and namespace-wide `pods/log` access (Part 1).
- The legacy `POST /api/sandbox/start` creates a pod with no project record and no limit.
- Trashed projects count toward the 5-project cap and can still be started.
- `vite-runtime-errors` can fall back to another tenant's pod when `HOSTNAME` is unset.
- The `exec` `timedOut` flag is probably never true.
- The template skills say "exactly 8 tools", but there are 10.

### Auth, Payments, Notification, Admin

#### docs/architecture/03-auth-and-security.md
- [Blocker] The blacklist matrix is reversed. AI checks the blacklist (and fails closed if Redis is down). Payments' check is effectively disabled by a lazy Redis client that is never connected. (`Ai_orchestration/src/middleware/auth.middleware.js:86`, `Payments/config/redis.js:5-10,27-29`)
- [Major] Login awaits the RabbitMQ publish, with no reconnect, so a closed channel breaks the OAuth callback. (`Auth/src/controllers/auth.controller.js:26-32`)
- [Major] There is no `role` field in the User schema. The cookie is not Secure in k8s because `NODE_ENV` is unset. `private.pem` is baked into the image.
- [Major] The HS256 fallback exists in AI. `CLIENT_URL` is unset in k8s, so login redirects to localhost. Payments `verifyToken` (admin routes) uses `keys[0]`, ignores `kid`, and skips the blacklist.
- [Nit] The port is 3000, not 5000, while downstream services default `AUTH_JWKS_URI` to `:5000`. Path and index names are stale. Replay revocation kills one session family, not all devices.

#### docs/architecture/auth-architecture-reference.md
- [Blocker] The same reversed blacklist facts as doc 03.
- [Major] The doc says every service's middleware is kid-aware, which is false for Payments `verifyToken`. Notification has no `/api/notification/*` routes. AI and Auth do fall back to cookies. `CLIENT_URL` is unset.
- [Major] Auth signs with the `RSA_PRIVATE_KEY` env var but verifies `/getMe` and `/logout` against the baked-in `certs/public.pem`. If the two keys differ, those routes reject every token.
- [Major] Two concurrent refreshes from two apps or tabs trigger family revocation and log the user out. The check-then-save is not atomic. (`auth.controller.js:125-150`)
- [Nit] The table of contents says port 5000. The ingress diagram is missing details.

#### docs/architecture/07-payments-and-subscriptions.md
- [Blocker] Zero Day-Waste: see Part 1. (`subscription.service.js:216-270,432-436`)
- [Major] The doc says there is no webhook. `POST /api/payments/webhook` exists and activates subscriptions from order notes.
- [Major] Port and limiter details are wrong. Payments runs on 5051 in k8s. `rate-limit.middleware.js` imports a function that does not exist, so it would crash at load time; nothing mounts it.
- [Major] Tier limits are wrong. The daily and monthly token caps are not enforced; the real gate is a 5-hour credit window. Only 3 packages exist, so Pro early access cannot be bought, and Max is priced inconsistently (₹999 vs ₹1499).
- [Major] Data-integrity claims are false. There is no CORS or helmet. `/credit/update` makes 4 non-atomic writes. `syncCreditTier` swallows errors. `is_active` is never read.
- [Major] The receipt email has no PDF and shows ₹0.00 because of a field mismatch.
- [Nit] `SUBSCRIPTION_EXTENSION` is not mentioned. There are 6 providers. The collection is `referrals`, not `refrals`. Response shapes and links are stale.

#### Auth/README.md
- [Blocker] The README says tokens are verified with a shared `JWT_ACCESS_SECRET`. Auth signs RS256, and the refresh token is opaque hex, 30 days, `SameSite=Lax`. `RSA_PRIVATE_KEY` and `CLIENT_URL` are not documented.
- [Major] The credit routes are never mounted. No logout event is published. `getMe` returns the user plus their token. Health, readiness and metrics routes exist even though the README says they don't.
- [Nit] Only the refresh cookie is set. There is no PKCE. `config/passport.js` and the services layer do not exist.

#### Payments/README.md
- [Blocker] The README says `identifyUser` uses a shared secret and accepts cookies. It uses RS256 via JWKS with Bearer headers only.
- [Major] There is no `checkout-session` endpoint. The real route is `PATCH /credit/subscription`, and it is admin-only for paid tiers. There is no `payment.credit.topup` event.
- [Nit] The readiness route is `/readyz`, which always returns 200. There is no annual pricing. Payments runs on 5051 in k8s. The webhook and admin routes are not documented.

#### Notification/README.md
- [Major] `verifyToken` and `AUTH_JWKS_URI` exist but are unused. Top-level-await MQ retries crash the process before `listen`, and there is no reconnect.
- [Nit] It uses an app password or OAuth, not both. `EMAIL_PASS` is undocumented. The readiness route is `/readyz`.

#### Admin/README.md
- [Blocker] The README describes "Production v1.0.0", but no code exists; the folder has only the README.
- [Major] The real admin features live in Payments, cannot be reached (no admin role), and write no audit log.
- [Nit] Ports and service names are wrong.

**Undocumented (Auth/Payments):**
- Synthetic payment bypass flags (`ALLOW_SYNTHETIC_PAYMENTS`) and the orderless checkout fallback.
- `ensureAccount` reads a JWT claim that Auth never sets.
- `syncCreditTier` adds INR paise into a USD-cents field.
- The `payment.failed` webhook drops `errorReason`.
- Dead credit code remains in Auth.
- The Referral model and cron exist with no routes.

### API contracts and transports

#### docs/architecture/04-distributed-transports-streaming.md
- [Blocker] The doc says credit calls use gRPC. There are no `.proto` files and no gRPC code; it is REST with axios. The credit check also fails open.
- [Major] Orchestrator to sandbox is REST, not gRPC/MCP. `/api/ai/agent/invoke` does not exist. The event names and payloads are wrong: code uses `agent:*` events with `id: <seq>`.
- [Major] `X-Accel-Buffering` is set only on code-agent streams. There is no backpressure handling (`write()`'s return value is ignored).
- [Major] Infrastructure claims are wrong: the ingress is NGINX, not ALB; there is no headless service; there is no dead-letter exchange.
- [Nit] The heartbeat is `: ping`. MQ retries happen only at startup. All ports and file paths are stale. Socket.IO is still used for the terminal.

#### docs/architecture/06-api-contracts-and-specifications.md
- [Major] The `ErrorResponse` schema is not in `openapi.yaml`. Runtime error shapes differ per service, and Auth returns Express's default HTML 500. `packages/faultkit` does not exist.
- [Major] None of the contract tooling exists: openapi-typescript, generated types, Spectral, Prism, request validators. Gateway 422 validation does not exist. Notification has no paths.
- [Blocker] `CookieAuth` is defined two different ways in the two docs, and neither works on protected routes.
- [Nit] Ports are wrong. The doc contradicts itself about whether it supersedes openapi.yaml.

#### docs/openapi.yaml
- [Blocker] Chat restore and permanent delete promise 403, but there is no ownership check (Part 1, item 3).
- [Blocker] Logout "purges the refresh family", which cannot happen because of the cookie path scope.
- [Major] The health and JWKS paths are wrong under `/api`. About 25 routes are missing from the spec: AI stream, batch-delete and health; the Payments webhook, aliases, admin and analytics routes; Sandbox trash, restore and permanent delete; the agent health and patch-file routes; the router health routes; Auth `/metrics`.
- [Major] Refresh never returns `TOKEN_REUSE_DETECTED`, and Auth never returns `TOKEN_EXPIRED`.
- [Major] Response shapes and enums are wrong for credit check and update, packages, summary, analytics, dashboard, tiers (`free|pro|max`), providers and package ids.
- [Major] The SSE contracts for app-agent and code-agent differ from the code, as do the stop, approve and reject status codes and the sandbox quota and status enums.
- [Nit] Status code details, transaction status casing, the `providerCredits` array and the admin user query params are stale.

#### docs/api/post-code-agent-invoke.md
- [Major] It describes the superseded socket.js implementation. Runs now live in `agentRun.service.js`. Plan review is a `plan_review` node with `autoApprovePlan`.
- [Major] The rate limiter, 402 and 403 gates exist even though the doc says they don't. The model is codestral. The pro/max bypass never applies because there is no subscription claim. The credit check fails open.
- [Major] Companion endpoint codes are wrong (404 `NO_ACTIVE_RUN`, 409 `NO_PLAN_PENDING`, 202 responses). The SSE event catalog is incomplete. Reconnect works over SSE with `Last-Event-ID`, not Socket.IO. The plan-review timeout exists even though the doc lists it as missing.
- [Nit] The heartbeat is `: ping`. History is 6 messages, `recursionLimit` is 120, the model timeout is 180 s. The order of operations differs. `sandboxId` is required.

**Undocumented (API):**
- Legacy chat messages with no `userId` are visible to every user.
- Default `PAYMENTS_SERVICE_URL` values differ between modules.
- The frontend calls routes that do not exist: `/api/settings/keys`, `/api/sandbox/health/:id`, `/api/ai/invoke`.

### Observability and k8s

#### docs/architecture/05-observability-and-error-handling.md
- [Blocker] The doc says the FaultKit error handler is mounted in all 5 services. Only AI and Payments mount it. Auth and Notification have none, and the Sandbox server leaks raw `err.message` on 500s.
- [Blocker] The checklist marks ServiceMonitors, alert rules, Alloy, Loki and `k8s/monitoring/` as done. None exist.
- [Major] `packages/faultkit` does not exist; FaultKit is an npm dependency. Logs are morgan text, not Pino JSON. There is no `req_<cuid2>` request-ID generation or `req.id`, and MQ messages carry no request ID. Pino child loggers do not exist, and `service` is always `"api"`.
- [Major] The error class table is wrong: `ValidationError` is 400, and the property is `errorCode`. Only Auth has `/metrics`. The LogQL label `ai-orchestration` should be `ai-server`.
- [Nit] The route normalizer, ports, ALB and redaction-key details are stale.

#### docs/infrastructure/grafana-prometheus-loki-stack.md
- [Major] The telemetry audit is stale: Auth already has prom-client. Notification also consumes `payment_notification_queue`, which has no alert. The ServiceMonitor selector and port name match no Service.
- [Major] `Helpers/metrics.js` does not exist, and Auth's module differs from the doc (prefix, labels, buckets). None of the domain metrics exist. FaultKit has no regex redaction.
- [Nit] Prefix inconsistencies. The `ai-orchestration` label. Two different manifest dirs, neither of which exists. The roadmap phases are numbered inconsistently.

#### docs/infrastructure/k8s-skaffold-production-guide.md
- [Blocker] `k8s/secrets.yml.example` does not match what the deployments read (Part 1), so pods fail to start.
- [Major] `TAVILY_API_KEY` is not injected. Four Dockerfiles differ from the "one shape" rule. `PORT` is set only for Payments, and Notification hard-codes 4000.
- [Nit] The port table is incomplete. Manifests do not follow the template's labels, container names, probes or units (`notifiction-deployment` is misspelled). RBAC has extra verbs and an invalid `deployment` resource. The sync pattern is incomplete.

**Undocumented (infra):**
- `NODE_ENV` is unset in k8s, so stack traces are always logged.
- Notification drops failed messages with no dead-letter queue.
- Payments makes up fallback request IDs.
- `skaffold.yml` needs the gitignored `secrets.yml`, so a fresh clone fails until it is created by hand.

### Frontend, product and root docs

#### docs/frontend/frontend-architecture-and-design-tokens.md
- [Major] Settings services return fake success on errors, so the hook's error path never runs.
- [Major] Components and hooks call `authenticatedFetch` directly. The `codingAgent`, `copilot` and `dashboard` api files are never imported, and codingAgent posts to a route that does not exist.
- [Major] The dbService spec is stale (`EditorCacheDB`, versions 1–4, a `key` index, a `fileLists` table). Code generated from the doc would create an incompatible database.
- [Nit] The theme is set after first paint, so the page can flash. The "system" theme saves `dark`. `CodeEditor.scss` does not exist. `features/chat` is an unused duplicate. `services/apiClient.js` is not documented.

#### docs/architecture/09-webgl-ui-performance.md
- [Major] The doc says the apps share components. CursorGrid and Lightfall exist only in payments_frontend, and Lightfall is never mounted.
- [Nit] The "unthrottled" description is only partly true. Lightfall's dpr is not clamped.

#### docs/architecture/08-browser-agent-extension.md
- [Blocker] All six checklist items are marked done. No extension, relay, parser, screenshots or VisualVerifier exists.
- [Major] The graph is described as 9 nodes. It has 10, and the debugger routes to tester or finalizer, not coder.
- [Nit] The `get_vite_runtime_errors` tool is not mentioned.

#### Frontend/README.md
- [Major] "Razorpay checkout done" is false for this app: there is no Razorpay, and the subscription call returns 404.
- [Major] Socket.io streaming is SSE in code. `file-change` is really `workspace-change`, and there is no Yjs. Logs are polled over HTTP. Inline completion does not exist.
- [Major] There are no thunks. The token lives in a module variable. The store topology is wrong. Dexie is in active use, not dead.
- [Nit] GSAP is not used in the layout. The listed env vars are unused. Vite is 8, not 7. "Production" status is claimed with no deployment.

#### payments_frontend/README.md
- [Major] It is the unmodified create-vite template: no routes, env vars, base path or checkout docs.

#### docs/prd/taksha-codespace-prd.md
- [Blocker] The MCP gateway is a headline feature, and it does not exist.
- [Blocker] "Unauthenticated sidecar access 0%" is not met: no JWT is checked anywhere in the router or sidecar.
- [Blocker] `.env` is said to be excluded from S3 sync. It is not.
- [Major] Multi-provider failover is described; only Mistral is used. The 9-node count and "compactor introduced" are wrong. The SHA-256 is of the error, not the patch, and there is no rollback. Clio has `updateFile`.
- [Major] Several described mechanics do not exist: the Flow 2 and 3 routes and credit endpoint, KMP patching, tier compute quotas and idle times, the ingress `/` and `/payments` routes. Ports are stale.
- [Nit] PKCE. Backoff is 1.2 s. The guard message text. "OGL orbs". "10 microservices" in one place. HITL approval is not described.

#### README.md (root)
- [Blocker] The Jev / RLCD "sub-100 ms routing brain" does not exist; routing is an LLM call.
- [Blocker] The `POST /mcp` and `ALLOWED_TOOLS_BY_ROLE` claims are false, so the README's own `curl` check fails.
- [Major] The state "code anchor" and its links are stale. "MongoDB checkpoint" is false. The node count is wrong. The Vite HMR socket and Visual QA claims are false.
- [Major] The quick start does not work: there is no root package.json, and every env var name and port is wrong.
- [Major] The service inventory has conflicting ports, `/ready` vs `/readyz`, a nonexistent `ai_telemetry_queue`, and a "token" sidecar auth that does not exist. The directory layout is stale.
- [Nit] ALB, gRPC, the debounce value (400 ms), and an MIT badge with no LICENSE file.

#### docs/README.md
- [Major] Invariants 3 and 4 (MCP, `errorSignatureHistory`, 16 hops) do not match code. Every blueprint link is an absolute `file:///Users/...` path.
- [Nit] The route name, "context loss recovery", and the node count.

**Undocumented (frontend):**
- The hard-coded Razorpay test key and plan prices in the fallback checkout.
- Fake API key generation.
- The theme preference is never applied across devices.
- The logs and editor APIs call `*.agent.localhost` with no bearer token.
