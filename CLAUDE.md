# CLAUDE.md

All rules and the short project overview live in AGENTS.md, shared by every AI agent:

@AGENTS.md

## Claude Code specifics

- This project starts in **plan mode** (`.claude/settings.json`). Use it to research and write the plan. Do not call ExitPlanMode to start work until the developer has reviewed the plan and said `go`.
- The plan gate hook (`.claude/hooks/plan-gate.mjs`) denies Bash, Edit and Write in a session until the developer sends a message that is exactly `go`. `stop` or `replan` closes the gate again.
- `.claude/hooks/guard.mjs` checks every Bash, Read, Edit, Write, Grep and Glob call against `agent-guardrails/policy.mjs`. Normal Bash commands run without a prompt. Sensitive ones (AGENTS.md rule 2) ask for approval, even in auto mode.
- The guard matches secret file names anywhere in a command string, even inside an exclude filter (`grep -v`, `find -not -name`). Leave those names out of commands entirely.
- When a hook denies a call, report it to the developer. Do not retry the same thing another way.
- Never offer to commit, push or open a PR. Say the change is ready for the developer to review and commit.
- Use `.env.example` files for config. Never read `.env`.

---

## Project context

Everything below was checked against the code. Where `docs/` or a README disagrees, trust the code.

### Services and ports

| Service | Local port | K8s container port | K8s Service | Database |
|---|---|---|---|---|
| `Auth/` | 3000 | 3000 | `auth-service:80` | Mongo `auth`, Redis (blacklist) |
| `Payments/` | 5002 | 5051 (`PORT` env) | `payments-service:80` | Mongo `payments`, Redis (blacklist, cron locks) |
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
| `/api/ai` (REST + Socket.IO at `/api/ai/socket.io`) | ai-service |
| `/api/sandbox` | sandbox-service |
| host `*.preview.localhost` | router-service, then pod port 80 (Vite app) |
| host `*.agent.localhost` | router-service, then pod port 3000 (sidecar) |

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
| Sandbox sidecar | **none, no auth at all** | no |

**3. Project and sandbox (Sandbox/server)**
- `POST /api/sandbox/create-project`: max 5 projects per user, allocates a UUIDv7 `sandboxId`, status `not_started`.
- `POST /api/sandbox/start/:projectId` creates, in namespace `default`:
  - Pod `sandbox-pod-<id>`: init `template` (copies seed files), init `sync-agent --restore-only` (pulls from S3), then containers `template` (Vite :5173), `agent` (:3000), `sync-agent` (pushes to S3).
  - Service `sandbox-service-<id>`.
  - Redis key `sandbox:<id>` with 120s TTL.
- Router refreshes the TTL to 1200s on every request. When the key expires, Sandbox server (keyspace notifications, enabled at startup with `CONFIG SET`) deletes the pod and service and sets the project to `down`.
- `GET /api/sandbox/projects` reconciles DB status with the real pod phase.
- Delete is soft (trash). Permanent delete removes the Mongo document.

**4. AI agent (Ai_orchestration)**
- REST: `POST /api/ai/code-agent/invoke`, `/app-agent/invoke`, plus stop, plan-approve, plan-reject and chat history routes.
- Socket.IO events: `agent:invoke`, `agent:subscribe`, `agent:stop`, `agent:plan_approve`, `agent:plan_reject`. Handshake token from cookie, `auth.token` or `?token=`.
- Middleware order: `identifyUser`, `requireOwnedSandbox`, `aiRateLimiter`, `creditLedger`.

| Middleware | On failure |
|---|---|
| `requireOwnedSandbox` (asks Sandbox `/api/sandbox/projects` with the caller's token, 60s cache) | fails closed (503 / 403) |
| `aiRateLimiter` (Redis Lua token bucket) | fails open |
| `creditLedger` (asks Payments `/api/payments/credit/check`) | fails open, except a real 402 |

- Orion graph (`src/agent/code.agent.js`): router, general, planner, critic, coder, tester, debugger, compactor, finalizer. `interruptBefore: ["critic"]` is the plan review pause. Clio (`clio.agent.js`) is the smaller app/copilot agent.
- Model: `codestral-latest` through Mistral (`MISTRALAI_API_KEY`, free tier; `mistral-large-latest` needs a paid plan), wrapped with per-model throttle, backoff and a call timeout.
- Tools (`src/agent/tool.js`) call `http://sandbox-service-<id>:3000/api/agent/*`: list, read, create, update, patch, delete file, search code, exec, Vite runtime errors. `search_internet` uses Tavily.
- After a run, usage goes to `POST /api/payments/credit/update` with the user's own token.

**5. Payments**
- Plans in `config/packages.config.js`: free, `pro_regular` (Rs 499), `max_regular` (Rs 999).
- Checkout: `POST /api/payments/order`, Razorpay modal, then `POST /api/payments/verify` (re-fetches the payment from Razorpay before writing) and/or `POST /api/payments/webhook` (HMAC over `req.rawBody`). `processSubscriptionPayment` is idempotent by `paymentId`.
- Subscriptions are slots: one active slot plus queued reserved slots. Expiry is promoted lazily on read and by a nightly cron.
- Credits: a 5-hour window balance on `Account` plus per-provider buckets on `Credit`. `Account._id` equals the user id.
- Cron jobs (`services/cron.service.js`), each behind a Redis `SET NX` lock: referral settlement hourly, slot promotion daily, credit window refill every 30 min.
- Emails go out through `payment_notification_queue`.

**6. Notification**
- Consumes `auth_notification_queue` and `payment_notification_queue`, sends mail with nodemailer. Templates in `src/emails/template/`.

### Commands

| Task | Command |
|---|---|
| Run a backend service | `npm run dev` inside the service folder (nodemon `-L`) |
| Run a frontend | `npm run dev` / `npm run build` / `npm run lint` |
| Full cluster dev loop | `skaffold dev` (builds all images, applies `k8s/*.yml`) |
| Payments tests (**developer only**, they `deleteMany`) | `cd Payments && npm test` |
| Auth load test | `k6 run Auth/src/k6/load-test.js` |
| Guardrail self-test | `node .claude/hooks/test-guardrails.mjs` |

No other service has tests. `fix_frontends.sh` kills Vite, deletes both `node_modules` and clears the npm cache. Do not run it without explicit approval.

### Conventions

- Layout per backend: `server.js` boots, `src/app/app.js` builds Express, then `routes/`, `controllers/`, `services/`, `models/`, `middleware/`, `config/`. Payments has the same folders at its root, without `src/`.
- Payments and AI throw FaultKit errors (`faultkit`) and end with `createExpressErrorHandler`. Auth and Sandbox return plain `{ status: 'error', message }`.
- Always take the user id from the verified token (`req.user.id`). Payments rejects a body `userId` that does not match.
- Payments needs the exact raw body for webhook HMAC (`express.json({ verify })` sets `req.rawBody`). Do not add another body parser before it.
- Frontends: React 19, Redux Toolkit, feature folders (`features/<name>/{components,Hooks,service,slice}`), SCSS with tokens in `src/styles/tokens.scss`.
- Auth metrics: `prom-client` registry in `src/observability/metrics.js`, served at `GET /metrics`. That path is not under any ingress prefix, so it is cluster-internal only.

### Known gaps and traps

- **Sidecar has no auth.** Anyone who knows a `sandboxId` can call `/api/agent/exec` through `<id>.agent.localhost`.
- **Rate limit tier is always `free`.** AI reads `req.user.subscription`, but Auth never puts `subscription` in the token.
- **AI is single replica.** LangGraph uses an in-memory `MemorySaver`, and active run state lives in `socket.js` memory.
- `Auth/src/routes/credit.routes.js` and its controller are not mounted. Credits moved to Payments (`Payments/scripts/migrate_credits_from_auth.js`).
- `previewUrl` is hardcoded to `http://<id>.preview.localhost` in `sandbox.controller.js`.
- `k8s/secrets.yml.example` is out of date with the manifests (for example `aws` vs `aws-secret`, `REDIS_URL` vs `REDIS_URI`, `JWT_SECRET` vs `RSA_PRIVATE_KEY` / `JWT_REFRESH_SECRET`). Rebuild it from the manifests, never from the real file.
- `k8s/ai-deployment.yml` still injects Google and Cohere keys. The code only uses Mistral and Tavily.
- Auth needs `certs/public.pem` at startup, and `RSA_PRIVATE_KEY` or `certs/private.pem`. Never open those files.
- Port defaults in code differ from `.env.example` and k8s (for example Payments JWKS default `localhost:5000`). Always set the env var.
- `docs/` describes some things that do not exist in code yet: gRPC, HTTP/2 SSE, the Chrome extension, the Admin service, Loki. Check the code before relying on a doc.

## Launch video rule

- Follow `.claude/skills/saas-launch-video/SKILL.md` for all launch video work in `launch-video/`.
- After each round of feedback on the video, update that skill in the same turn: add the general rule and a dated changelog line.
