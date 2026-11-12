# CLAUDE.md

All rules and the short project overview live in AGENTS.md, shared by every AI agent:

@AGENTS.md

## Claude Code specifics

- This project starts in **plan mode** (`.claude/settings.json`). Use it to research and write the plan. Do not call ExitPlanMode to start work until the developer has reviewed the plan and said `go`.
- The plan gate hook (`.claude/hooks/plan-gate.mjs`) denies Bash, Edit and Write in a session until the developer sends a message that is exactly `go`. `stop` or `replan` closes the gate again.
- `.claude/hooks/guard.mjs` checks every Bash, Read, Edit, Write, Grep and Glob call against `agent-guardrails/policy.mjs`. Normal Bash commands run without a prompt. Sensitive ones (AGENTS.md rule 2) ask for approval, even in auto mode.
- The guard matches secret file names anywhere in a command string, even inside an exclude filter (`grep -v`, `find -not -name`). Leave those names out of commands entirely.
- When a hook denies a call, report it to the developer. Do not retry the same thing another way.
- After every finished feature or fix, big or small, test it and make one local commit on `main` without being asked. If the work is on another branch, ask the developer before moving it to `main`.
- Never add Claude as a contributor: no `Co-Authored-By: Claude` trailer and no Claude attribution in any commit or PR.
- Never push or open a PR unless the developer asks.
- Use `.env.example` files for config. Never read `.env`.

---

## Project context

Everything below was checked against the code. Where `docs/` or a README disagrees, trust the code.

### Services and ports

| Service | Local port | K8s container port | K8s Service | Database |
|---|---|---|---|---|
| `Auth/` | 3000 | 3000 | `auth-service:80` | Mongo `auth`, Redis (blacklist) |
| `Payments/` | 5002 | 5051 (`PORT` env) | `payments-service:80` | Postgres on Supabase (`DATABASE_URL`, Drizzle), Redis (blacklist, cron lock) |
| `Ai_orchestration/` | 3000 | 3000 | `ai-service:80` | Mongo `ai`, Redis (rate limit) |
| `Notification/` | 4000 (hardcoded) | 4000 | `notification-service:80` | none, RabbitMQ only |
| `Sandbox/server/` | 4000 (`.env.example`) | 3000 | `sandbox-service:80` | Mongo `sandbox`, Redis (sandbox TTL) |
| `Sandbox/router/` | 3000 | 3000 | `router-service:80` | Redis (TTL refresh) |
| `Sandbox/Agent/` | 3000 | 3000 in each sandbox pod | `sandbox-service-<sandboxId>` | none |
| `Frontend/` | 5173 | n/a | n/a | IndexedDB (Dexie) |
| `payments_frontend/` | 5174, base `/payments/` | n/a | n/a | n/a |

`Admin/` holds only a README. There is no Admin code yet.

### Ingress (`k8s/ingress.yml`)

| Match | Backend |
|---|---|
| `/api/auth` | auth-service |
| `/api/payments` | payments-service |
| `/api/ai` (REST + SSE) | ai-service |
| `/api/sandbox` | sandbox-service |
| host `*.preview.localhost` | router-service, then pod port 80 (Vite app) |
| host `*.agent.localhost` | router-service, then pod port 3000 (sidecar) |
| `/api/mcp` | router-service MCP gateway (`POST /api/mcp/<sandboxId>`, external agents with an MCP token) |

Both frontends proxy `/api` to `http://localhost` (the ingress) in dev. `Frontend/vite.config.js` also has `/api/agent-proxy` (reads `x-sandbox-id` header) and `/api/terminal-proxy` (reads `?sandboxId=`) that rewrite the Host to `<id>.agent.localhost`.

### Core flows

**1. Login (Auth)**
- `GET /api/auth/google` then callback: upsert `User`, publish to `auth_notification_queue`, issue token pair, redirect to `CLIENT_URL`.
- Access token: RS256, 15 min, `kid: auth-rsa-v1`, `iss: auth.takshacodespace.in`, `aud: takshacodespace-services`. Claims: `sub`, `id`, `email`, `name`, `role`. No `subscription` claim.
- Refresh token: opaque, SHA-256 hash stored in Mongo with a `familyId`, 30 days, cookie scoped to `/api/auth/refresh`. Reusing a rotated token revokes the whole family.
- Logout blacklists the access token in Redis until it expires.
- Frontend keeps the access token in memory only (`Frontend/src/services/apiClient.js`).

**2. Token checks in other services**

| Service | Key source | Redis blacklist check |
|---|---|---|
| Auth | `Auth/certs/public.pem` | yes |
| Payments | JWKS, keyed by `kid`, cached 24h | yes |
| AI | JWKS, plus HS256 `JWT_ACCESS_SECRET` fallback for local tests | no |
| Sandbox server | JWKS | no |
| Sandbox sidecar | JWKS (`AUTH_JWKS_URI`); owner only: `sub == OWNER_USER_ID`; also accepts a sandbox token (`aud: taksha-sandbox`, `sbx == SANDBOX_ID`) | no |

**3. Project and sandbox (Sandbox/server)**
- `POST /api/sandbox/create-project`: max 5 projects per user, allocates a UUIDv7 `sandboxId`, status `not_started`.
- `POST /api/sandbox/start/:projectId` creates, in namespace `default`:
  - Pod `sandbox-pod-<id>`: init `template` (copies seed files), init `sync-agent --restore-only` (pulls from S3), init `fix-permissions` (chown to uid 1000), then containers `template` (Vite :5173), `agent` (:3000), `sync-agent` (pushes to S3).
  - Hardening (`pod.js`): no service account token (`automountServiceAccountToken: false`), `template` and `agent` run as `node` (uid 1000) with no privilege escalation and all capabilities dropped. Vite output is teed to `/sandbox-logs/vite.log` (shared `emptyDir`), which the sidecar's `vite-runtime-errors` reads. `k8s/sandbox-networkpolicy.yml` limits sandbox traffic (not enforced by Docker Desktop). `node scripts/print-pod-manifest.js | kubectl create --dry-run=server -f -` validates the manifest.
  - Service `sandbox-service-<id>`.
  - Redis key `sandbox:<id>` with 120s TTL.
- Router refreshes the TTL to 1200s on every request. When the key expires, Sandbox server (keyspace notifications, enabled at startup with `CONFIG SET`) deletes the pod and service and sets the project to `down`.
- `GET /api/sandbox/projects` reconciles DB status with the real pod phase.
- Delete is soft (trash). Permanent delete removes the Mongo document. Both revoke the project's MCP tokens.
- **External agents (MCP tokens):** owners create tokens in the editor header (plug icon, `ConnectAgentModal`) via `GET/POST /api/sandbox/project/:projectId/mcp-tokens` and `DELETE .../mcp-tokens/:tokenId`. Token `tks_mcp_...`, shown once, SHA-256 hash in Mongo (`McpToken`), cached in Redis `mcptoken:<hash>`; scopes `read` (always), `write`, `exec` (opt-in); 1-90 days, max 10 active per project.
  - The router gateway (`Sandbox/router/src/mcpGateway.js`) checks the token, rate-limits (120/min), wakes a stopped sandbox (`POST /internal/sandboxes/:id/wake` on the Sandbox server, waits 45s), gets a 10-minute scoped sandbox token from Auth `POST /internal/sandbox-token`, and proxies to the sidecar's `/mcp`.
  - `/internal/*` routes (Auth, Sandbox server) are not routed by the ingress and need `INTERNAL_SERVICE_TOKEN` (k8s secret `internal-service`, optional in the manifests; without it they fail closed).
  - A scoped token reaches only `/mcp` on the sidecar, and only the tools in its scopes.

**4. AI agent (Ai_orchestration)**
- REST + SSE only (no Socket.IO): `POST /api/ai/code-agent/invoke` (stream), `GET /code-agent/stream/:projectId?sessionId=` (re-attach, 204 unless a run is live in that chat), stop, plan-approve, plan-reject, `/app-agent/invoke` (Clio stream), `/app-agent/title`, chat history routes.
- **Chat sessions.** Orion and Clio keep separate chats: same base schemas (`models/chatSchemas.js`), separate collections (`chatmessages` + `orionchatsessions` + `orionprojectmemories`, `copilotchatmessages` + `cliochatsessions` + `clioprojectmemories`, map in `models/chatStores.js`). Every row has `userId` (token only), then `projectId`, then `sessionId`; every query starts with `userId`.
  - Routes `chats/:agentType/sessions` (list with `liveSessionId`, `:sessionId/messages`, rename, trash, restore, permanent), `chats/trash`, `chats/message/*`. Invoke takes an optional `sessionId`; without one a chat opens on the first message (`agent:session`, Clio `event: session`).
  - Pre-session messages move into "Earlier chat" sessions on first list (`chatSession.service.js`). Rows without `userId` are claimed only after the Sandbox service confirms ownership.
  - Model context: last 10 messages of the chat, only prompts and final answers (`loadChatHistory`: no tool logs, steps, thinking or error replies), plus background notes from `memory.service.js` `buildMemory`: the agent's project notes, summaries of its last 20 other chats, and this chat's summary once turns fall out of the window.
  - Memory agent (`src/agent/memory/`): after each ok or stopped turn, one fast-model call updates the chat summary (`summaryThrough`), the title (first time, unless renamed) and the project notes. In-process queue per agent, user and project; usage goes to Payments as `agentType: memory` (0 credits, shown as platform discount).
- Middleware order: `identifyUser`, `requireOwnedSandbox`, `aiRateLimiter`, `creditLedger`.

| Middleware | On failure |
|---|---|
| `requireOwnedSandbox` (asks Sandbox `/api/sandbox/projects` with the caller's token, 60s cache) | fails closed (503 / 403) |
| `aiRateLimiter` (Redis Lua token bucket) | fails open |
| `creditLedger` (asks Payments `/api/payments/credit/check`) | fails open, except a real 402 |

- Agent code lives in `src/agent/` (`llm/`, `tools/`, `core/`, `nodes/`, `graph/`). The rest of the service imports only `src/agent/index.js`.
- Orion graph (`graph/orion.graph.js`): router, general, planner, critic, plan_review (`interrupt()` pause), coder, tester, reviewer, debugger, finalizer. Clio (`graph/clio.graph.js`) is a one-node copilot graph without a checkpointer.
- Every tool-using node runs `core/toolLoop.js` (own ReAct loop: guards, unknown-tool errors, repeat-call stop, turn budget that keeps finished work).
- Model: NVIDIA build.nvidia.com via `ChatOpenAI` (`NVIDIA_API_KEY`). Defaults `nvidia/nemotron-3-ultra-550b-a55b` (main) and `nvidia/nemotron-3.5-lightning-30b-a3b` (fast), override with `NVIDIA_MODEL` / `NVIDIA_FAST_MODEL`. `llm/rateLimiter.js` adds pacing, 429 backoff and a call timeout. Many catalog models return 404 for a given account or are end-of-life: check with `npm run list:models` and `npm run check:model`.
- Tools (`src/agent/tools/`) reach the sandbox only through `tools/sandbox.client.js` `callSandboxTool(config, name, args)`: MCP at `http://sandbox-service-<id>:3000/mcp` (`tools/mcp.client.js`, one client per run), REST `/api/agent/*` as fallback for pods without `/mcp` or with `SANDBOX_TOOL_TRANSPORT=rest`. 9 certified tools (allowlist in `mcp.client.js`, frozen list in `Sandbox/Agent/src/mcp/tools.js`); the model only sees the AI-side descriptions. `SANDBOX_URL_TEMPLATE` overrides the sidecar origin for local dev. `search_internet` uses Tavily and stays in the AI service.
- `npm run e2e:live` runs Orion with the real model against the real sidecar app (owner-token auth + MCP) on a temp workspace, with a throwaway key as Auth (no cluster needed; run `npm install` in `Sandbox/Agent` once).
- After a run, usage goes to `POST /api/payments/credit/update` with the user's own token, with `projectId`, `chatId` (session id) and a `requestId` per run or turn.

**5. Payments**
- Postgres (Supabase project `Taksha-Payments`) through Drizzle. Schema in `db/schema.js`, migrations in `db/migrations` (`npm run db:generate`, `npm run db:migrate`). Tables: `accounts`, `subscription_slots`, `orders`, `payments`, `invoices`, `transactions`, `usage_events`. RLS on, no policies. Money in paise.
- `DATABASE_URL` must be the Supabase transaction pooler (port 6543, IPv4). The direct host is IPv6 only and fails from Docker/k8s.
- Plans in `config/plans.config.js`: free, `pro_regular` (Rs 499), `max_regular` (Rs 999), plus tier limits.
- Checkout: `POST /api/payments/create/order` (writes an `orders` row), Razorpay modal, then `POST /api/payments/verify` (order must belong to the caller, payment re-fetched from Razorpay) and/or `POST /api/payments/webhook` (HMAC over `req.rawBody`). `processSubscriptionPayment` runs in one transaction with an account row lock; the payment id is the `payments` primary key, so it applies once.
- Subscriptions are slots: one active slot plus queued slots that keep `remaining_ms`. Expiry is promoted lazily on read and by a nightly cron.
- Credits: one 5-hour window per user on `accounts` (Free 20, Pro 150, Max 200). Refill is lazy on read. `usage_events` is unique on `(user_id, request_id)`. Providers: `nvidia`, else `unknown`. Agent types in `PLATFORM_PAID_AGENT_TYPES` (`memory`) are recorded with real tokens but `credits_deducted = 0`; `creditsDiscounted` is derived from tokens in the serializers.
- Only cron job: nightly slot promotion, behind a Redis `SET NX` lock.
- No referral and no admin routes (removed 2026-11-03).
- Emails go out through `payment_notification_queue`, to the email saved on the order.

**6. Notification**
- Consumes `auth_notification_queue` and `payment_notification_queue`, sends mail with nodemailer. Templates in `src/emails/template/`.

### Commands

| Task | Command |
|---|---|
| Run a backend service | `npm run dev` inside the service folder (nodemon `-L`) |
| Run a frontend | `npm run dev` / `npm run build` / `npm run lint` |
| Full cluster dev loop | `skaffold dev` (builds all images, applies `k8s/*.yml`) |
| Payments tests (local Postgres only, they truncate tables and refuse non-localhost) | `cd Payments && docker compose up -d && npm test` |
| Auth load test | `k6 run Auth/src/k6/load-test.js` |
| Guardrail self-test | `node .claude/hooks/test-guardrails.mjs` |

AI service: `cd Ai_orchestration && npm test` is offline (no network, no DB) and safe to run. `fix_frontends.sh` kills Vite, deletes both `node_modules` and clears the npm cache. Do not run it without explicit approval.

### Conventions

- Layout per backend: `server.js` boots, `src/app/app.js` builds Express, then `routes/`, `controllers/`, `services/`, `models/`, `middleware/`, `config/`. Payments has its folders at the root, without `src/`, and uses `db/` (Drizzle) and `serializers/` instead of `models/`.
- Payments and AI throw FaultKit errors (`faultkit`) and end with `createExpressErrorHandler`. Auth and Sandbox return plain `{ status: 'error', message }`.
- Always take the user id from the verified token (`req.user.id`). Payments rejects a body `userId` that does not match.
- Payments needs the exact raw body for webhook HMAC (`express.json({ verify })` sets `req.rawBody`). Do not add another body parser before it.
- Frontends: React 19, Redux Toolkit, feature folders (`features/<name>/{components,Hooks,service,slice}`), SCSS with tokens in `src/styles/tokens.scss`.
- Auth metrics: `prom-client` registry in `src/observability/metrics.js`, served at `GET /metrics`. That path is not under any ingress prefix, so it is cluster-internal only.

### Known gaps and traps

- **Sidecar auth lives in the sidecar, not the router** (`Sandbox/Agent/src/auth/`). The preview app's Vite proxy (`Sandbox/template/vite.config.js`) also reaches port 3000, so never trust "came from localhost". Open routes: `health`, `ready`, `report-error`. The AI service gets a 2-hour sandbox token from `POST /api/auth/sandbox-token` per run (`Ai_orchestration/src/agent/tools/sandboxAuth.js`), renewed on plan approve.
- **Rate limit tier is always `free`.** AI reads `req.user.subscription`, but Auth never puts `subscription` in the token.
- **AI is single replica.** LangGraph uses an in-memory `MemorySaver`, active run state lives in `agentRun.service.js` memory, and the memory agent queue and legacy-migration memo are in-process too.
- Frontend chat state: `features/chat-history` (sidebar, message actions, `useChatSessions`) is shared UI; each agent keeps its own slice state (`chatHistory.codingAgent`, `chatHistory.copilot`). Call `useChatSessions` and `useCodingAgent` only in the panel that owns the chat.
- `Auth/src/routes/credit.routes.js` and its controller are not mounted. Credits live in Payments.
- `Frontend` still calls `PATCH /api/payments/subscription`, which does not exist (see `Payments/fix.md` P1-8).
- `previewUrl` is hardcoded to `http://<id>.preview.localhost` in `sandbox.controller.js`.
- `k8s/secrets.yml.example` is out of date with the manifests (for example `aws` vs `aws-secret`, `REDIS_URL` vs `REDIS_URI`, `JWT_SECRET` vs `RSA_PRIVATE_KEY` / `JWT_REFRESH_SECRET`). Rebuild it from the manifests, never from the real file.
- Auth needs `certs/public.pem` at startup, and `RSA_PRIVATE_KEY` or `certs/private.pem`. Never open those files.
- Port defaults in code differ from `.env.example` and k8s (for example Payments JWKS default `localhost:5000`). Always set the env var.
- `docs/` describes some things that do not exist in code yet: gRPC, HTTP/2 SSE, the Chrome extension, the Admin service, Loki. Check the code before relying on a doc.

## Launch video rule

- Follow `.claude/skills/saas-launch-video/SKILL.md` for all launch video work in `launch-video/`.
- After each round of feedback on the video, update that skill in the same turn: add the general rule and a dated changelog line.
