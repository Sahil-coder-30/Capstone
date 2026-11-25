# Taksha project checklist

The one list we follow, top to bottom. Each line points to the plan that holds the detail. Tick a box only when its "done when" check passes and the work has a local commit.

Written 2026-11-24 from `docs/plans/` and checked against the code that day. Updated the same day by the plan audit ([AUDIT-2026-11-24.md](AUDIT-2026-11-24.md)): new Phase 0.5 (foundations), GitHub source control added to Phase 5, Kafka and admin lines changed. Order follows [README.md](README.md) "Suggested order", with the new LLMOps work as the last phase (product testing phase). Updated 2026-11-25: the admin client is built in two phases, web + PWA (Phase 3) then Tauri v2 (Phase 5), and Phase 8 V3 was added.

**Rules for every item:** tests green before the commit, one local commit per finished item, no push unless asked, never open `k8s/secrets.yml`, `.env` or key files, live model runs (`npm run e2e:live`, live evals) only after asking because they spend credits.

## Progress

| Phase | Plan | Status |
|---|---|---|
| 0. Open fixes | [../reviews/FIX_PLAN.md](../reviews/FIX_PLAN.md) and each service's `fix.md` | In progress |
| 0.5 Foundations F3, F2, F1 | [platform-foundations-plan.md](platform-foundations-plan.md) | Not started |
| 1. Tool call analytics | [taksha-tool-call-analytics-plan.md](taksha-tool-call-analytics-plan.md) | Not started |
| 2. Agent tools P0 to P2 | [taksha-agent-tools-build-plan.md](taksha-agent-tools-build-plan.md) | Not started |
| 3. Admin platform P0 to P4, with the admin app Phase 1 (web + PWA, W0 to W3) | [admin-platform-hld.md](admin-platform-hld.md), `Admin/PLAN.md`, [admin-native-app-plan.md](admin-native-app-plan.md) | Not started. Client: web + PWA first, Tauri v2 second (decision 2026-11-25) |
| 4. Kafka K0 to K4 | [kafka-whatsapp-architecture.md](kafka-whatsapp-architecture.md) | K0 lessons 1 and 2 taught |
| 5. The rest: agent tools P3 to P5, admin P5 to P8, Kafka K5 to K8, GitHub source control G0 to G7 | same plans, [github-source-control-plan.md](github-source-control-plan.md) | Not started (G6d keep-alive part built in `3f800a6`) |
| 6. LLMOps, last (evals, token economics, CI/CD, cloud, LLM observability) | [llmops-evals-cicd-plan.md](llmops-evals-cicd-plan.md) | Not started. Starts after phases 1 to 5 are built end to end |
| 7. **V2.5 Taksha Hosting** (deploy built apps like Vercel; Share button opens the dashboard) | [taksha-hosting-deployments-plan.md](taksha-hosting-deployments-plan.md) | Not started. After V2 (phases 0 to 5) |
| 8. **V3 Taksha desktop app with a local LLM** | [admin-native-app-plan.md](admin-native-app-plan.md) section 9 | Idea, high level only. After V2.5 |

Already built: [mcp-sandbox-server.md](mcp-sandbox-server.md) (sandbox MCP server, sandbox and external agent tokens).

---

## Phase 0. Open fixes

Tracked in detail in [FIX_PLAN.md](../reviews/FIX_PLAN.md). Tick each step when every P0 in it is fixed and re-checked in code.

- [ ] Step 1: Ai_orchestration P0-1 to P0-5, Frontend P0-1
- [ ] Step 2: Auth P0-1, P0-2, k8s P0-4 (`.dockerignore`), then rotate the signing key
- [ ] Step 3: Sandbox/sync-agent P0-1
- [ ] Step 4: Sandbox/server P0-1 to P0-3
- [ ] Step 5: sidecar auth across Sandbox Agent, router, server and Frontend
- [ ] Step 6: Payments P0s, then payments_frontend P0s (Payments bug sweep pushed as `48aee60` on 2026-11-09; check what is left)
- [ ] Pending from 2026-11-09: run `npm run db:migrate` on Supabase (migration 0002) before any deploy
- [ ] Step 7: k8s P0-1 to P0-3
- [ ] Step 8: P1s per service
- [ ] Step 9: docs (label aspirational docs, fix README quick start)

## Phase 0.5. Platform foundations (about 3 weeks)

Detail in [platform-foundations-plan.md](platform-foundations-plan.md). Built before any feature that needs them.

- [ ] **F3 Safe sandbox stop:** `deletePod` grace 30 s, `terminationGracePeriodSeconds: 30`, sync-agent runs as `node sync.js`, flush on `SIGTERM`, restore fails closed. Gate: an edit made 300 ms before a pod delete survives; a blocked S3 restore marks the project `error` and leaves S3 unchanged
- [ ] **F2 Internal identity:** per-caller tokens (`X-Internal-Caller`), route allowlists in Auth, Sandbox server, router; one release accepting the old shared token with a log line per use, then removed. Gate: a caller not on a route's list gets 403
- [ ] **F1 Durable agent runs:** S1 checkpointer spike, then F1a Mongo checkpointer and `agentruns` with compare-and-set pause and resume, F1b Redis streams, lease, control channel and presence key, F1c Redis model pacing and memory lock, F1d sweeper and `replicas: 2`. Gate: a paused plan review survives a restart; start on one replica, approve on another; kill the executing pod and see Resume within 45 s

## Phase 1. Tool call analytics (about 5 days)

Plan section 8. Done when every tool call of a test run is in MongoDB within 5 s, no planted secret appears, overhead under 2 ms per call.

- [ ] Day 1: run context in `config.configurable` (Orion and Clio), `redactInput` and `redactText` with tests
- [ ] Day 2: `toolLogger.service.js`, `ToolCall.model.js`, hooks in `runToolLoop` and `callSandboxTool`, `TOOL_LOGGING` flag (default off)
- [ ] Day 3: 5 minute rollup with `$merge`, `npm run tools:report`, `queued` and `dropped` in `/api/ai/healthz`
- [ ] Day 4: four warning conditions, Atlas Charts page on `toolstatshourly`
- [ ] Day 5: rollout, read 50 records by hand, measure overhead, turn on in the cluster

## Phase 2. Agent tools, Phase 0 to 2 (about 5 weeks)

- [ ] **P0 Foundation:** result envelope, readers accept both shapes, sidecar output cap, ring buffer helper, list test, `search_code` glob fix, stale tool guides removed, **eval suite of 30 seeded tasks with `npm run eval`**. Gate: baseline score saved in `Ai_orchestration/evals/baseline.json`
- [ ] **P1 Observe:** telemetry buffers in the sidecar, injected browser script, `get_console_logs`, `get_browser_errors`, `get_network_log`, `get_dev_server_log`. Gate: a crash is found in one call
- [ ] **P2 Edit and find:** one file layer, `read_file` ranges and hash, multi-edit `patch_file` with `expectedHash` and diff, `write_file`, `move_file`, trash, `glob_files`, ripgrep `search_code`. Gate: tokens per task down 50%, pass rate not lower

## Phase 3. Admin platform, P0 to P4

- [ ] **P0 Foundations:** backend and portal skeletons, admin Supabase project, `Admin/k8s`, `Admin/skaffold.yml`, caller `admin` (F2). **No database users for other services** (decision 2026-11-24). Gate: admin pod healthy, main `skaffold dev` unchanged
- [ ] **P1 Identity:** maintainer CLI and login, Google plus passkey, tokens, step-up, admin mailer and outbox. Gate: user login unchanged, login alert email arrives
- [ ] **P2 Organization:** applications, approvals, grants, limits, audit, emails. Gate: `can()` and limit tests pass
- [ ] **P3 Data views:** users 360, projects, chats, AI runs and usage, payments (read), each through the owning service's `GET /internal/admin/*` route (admin HLD section 1a). Gate: masking and history limit tests pass **inside each service**
- [ ] **P4 Analytics:** overview and analytics dashboards from per-service stats routes, then from the Kafka 7.5 read models once K4 exists. Gate: numbers match each service's own stats route

### Admin app Phase 1: web + PWA

Detail in [admin-native-app-plan.md](admin-native-app-plan.md) sections 0 and 8. Auth exactly as the admin HLD (passkey in the browser, httpOnly refresh cookie). React code stays shell-agnostic (`authClient`, `offlineStore`) so Phase 2 is a wrap.

- [ ] **W0 Skeleton** (with P0): React app built on **ui-sdk** (every control a ui-sdk part, styled with our tokens; plan section 10.4), wireframe screens on mock data, `authClient` and `offlineStore` interfaces, manifest, service worker caching the shell only. Gate: installs as a PWA on the Mac; no `/api/*` response in the service worker cache
- [ ] **W1 Login** (with P1): cookie `authClient` on the HLD flow. Gate: maintainer passkey login works in the installed PWA
- [ ] **W2 PWA polish:** install prompt, "Reload to update" prompt, offline banner. Gate: a new deploy reaches the installed app on the next open
- [ ] **W3 Offline numbers** (with P4): allow-listed aggregates in IndexedDB, AES-GCM key from the passkey PRF extension, 24 h expiry, wiped on logout; shell-only where PRF is missing. Gate: no PII field in IndexedDB; cache unreadable without the passkey

### Admin agent (hybrid, decision 2026-11-25)

Detail in [admin-native-app-plan.md](admin-native-app-plan.md) section 10. Server-side read tools through the request gate, plus the ui-sdk bridge for the screen. Writes are always pressed by the admin and need a passkey.

- [ ] **A0 UI layer:** `Admin/app/src/ui/` on pinned `@ui-sdk/react` (beta), our `DataTable` primitive with an `agent` key, lint rule against raw `<button>`/`<input>`/`<select>`, agent test on 2 screens (plan 10.4 U1 to U13). Use the `ui-sdk` skill. Needs W0
- [ ] **A1 Agent module:** `agent` module in the admin backend, agent panel, read-only data tools (logs, metrics, users, payments, AI usage) through the same gate and limits, per-admin budget, audit `via: agent`. Needs P3 and P5
- [ ] **A2 UI tools:** `snapshot`, `act`, `query` run in the browser, `allow` for navigation only, `data-agent-confirm` on every write button, `data-agent-hidden` on passkey and device screens, no WebMCP. Gate: the agent can't press a write button
- [ ] **A3 Injection eval:** planted instructions in logs and chats. Gate: zero writes, zero outbound calls

## Phase 4. Kafka, K0 to K4

- [ ] **K0 Learn:** lessons 1 to 5 (1 and 2 taught, 3 next)
- [ ] **K1 Kafka core:** local Kafka, `k8s/kafka.yml` in `skaffold.yml`, topics, envelope helper, `config/kafka.js` per service. Gate: produce and consume from the CLI, every service starts with Kafka stopped
- [ ] **K2 Payments mail on Kafka:** Notification consumer, `deliveries`, retry, DLQ, then Payments outbox and relay. Gate: one email per payment, survives Kafka downtime
- [ ] **K3 Auth on Kafka, RabbitMQ removed:** Auth Mongo outbox and relay. Gate: no `amqplib` or `MQ_URL` left in code; login email arrives after Kafka was down during the login
- [ ] **K4 AI events:** AI Mongo outbox, `ai.usage` (no HTTP fallback; `credit/update` removed one release later), tier cache, `ai.runs`. Gate: Pro user gets Pro rate limits; usage written while Kafka was down reaches Payments once

## Phase 5. The rest (any order)

- [ ] Agent tools **P3 Run and see:** background jobs, `run_tests`, `restart_dev_server`, headless Chrome spike, `get_dom`, `browser_action`, `screenshot`
- [ ] Agent tools **P4 Safety and loop:** checkpoints, `restore`, `get_diff`, ask-first rule, explorer sub-agent, project map. Gate: eval pass rate 80%+, false "done" under 5%
- [ ] Agent tools **P5 Live editor:** Yjs over Socket.IO, `y-monaco`, disk bridge, `get_editor_state`, diff review view
- [ ] Admin **P5 Cluster and logs** (installs or checks the monitoring stack in `k8s/monitoring/`)
- [ ] **Admin app Phase 2, Tauri v2 (macOS first)**, after Phase 1 is in use. Detail in [admin-native-app-plan.md](admin-native-app-plan.md) sections 3 to 8:
  - [ ] **N0 Shell:** Tauri around the Phase 1 React code, capabilities locked (no `shell`, `fs`, `process`), CSP `connect-src` admin host only, ad-hoc signed
  - [ ] **N1 Native login:** Auth `/native/authorize` and `/native/token`, system browser + loopback + PKCE + `state`, 60 s one-time code, Keychain, CORS for the Tauri origins. Gate: a replayed code fails
  - [ ] **N2 Device binding:** DPoP, refresh rotation with reuse detection, `admindevices`, Devices page, Touch ID unlock (Keychain `biometryCurrentSet`). Gate: a copied refresh token fails without the device key; a revoked device is locked out within 30 s
  - [ ] **N3 Step-up and offline:** `/native/step-up` through the browser, offline aggregates in an AES-GCM file with the key behind Touch ID. Gate: no PII in the cache file
  - [ ] **N4 Release:** Tauri updater with its own key, `tauri-action` build on tag. **N5 later:** Windows, Linux, Android, iOS
- [ ] Admin **P6 Data explorer** (typed views and edits per service, no generic console), **P7 Support and actions** (through each service's internal admin routes), **P8 Payments**
- [ ] Kafka **K5 WhatsApp** (lessons 12 to 16). Needs F1 and F2
- [ ] **GitHub G0 to G5** (spike, git-service and connect, local git and `.git` archive, panel, remote through the router, terminal git with browser-brokered credentials, polish). Needs F2 before G1 and F3 before G2. Detail and checklist: [github-source-control-plan.md](github-source-control-plan.md) section 12
- [ ] **GitHub G6 to G7** (agent read tools, `git_keeper`, `ask_user`, presence, import). G6b, G6c, G6d need F1
- [ ] Kafka **K6 Admin on Kafka** (needs admin P1 and P2)
- [ ] Kafka **K7 Service metrics and logs:** `/metrics` in every service, `ServiceMonitor`s, JSON logs with `requestId`
- [ ] Kafka **K8 Scale:** 3 brokers, replication, consumer lag, Strimzi

---

## Phase 6. LLMOps (last, product testing phase)

Starts only after phases 1 to 5 are built end to end. Detail in [llmops-evals-cicd-plan.md](llmops-evals-cicd-plan.md).

### E. Automated evals (no more vibe checks)

- [ ] E0 Grow the agent tools eval runner into `Ai_orchestration/evals/` with `datasets/`, `scorers/`, `results/`, `baseline.json`
- [ ] E1 Golden dataset for the router node (100 to 200 labelled messages), accuracy and confusion matrix
- [ ] E2 Structured output suite for planner and reviewer (zod parse rate, retries)
- [ ] E3 Context retrieval: gold relevant files per task, **context precision** and **context recall** scored on every agent task run
- [ ] E4 Memory recall suite: planted facts, recall rate, no leak across users or projects
- [ ] E5 Agent task suite grown from 30 to 50+ tasks, with `dev` and `holdout` splits
- [ ] E6 Clio and general answers scored by an **LLM as judge** (different model, rubric 1 to 5, pairwise vs baseline), judge calibrated on 30 hand scored cases
- [ ] E7 `npm run eval:compare` regression gate with thresholds, baseline updated only on purpose
- [ ] E8 Evals run on **every prompt or model change** in CI (offline always, live when the key secret exists)
- [ ] E9 Every new bug found in a chat becomes a redacted dataset case

### T. Token economics and latency

- [ ] T1 `pricing.js` per model, cost recorded per model call
- [ ] T2 **Cost per request**, tokens per request, p50 and p95 latency, per agent and per node
- [ ] T3 Token breakdown (system prompt, tool guides, memory, history, tool outputs) to find the waste
- [ ] T4 **Prompt compression:** cap tool outputs, trim unused tool guides, stable prefix first for provider caching. Gate: fewer tokens, same pass rate
- [ ] T5 **Model routing:** send simple Clio and general queries to the fast model, `difficulty` from the router, fallback to the main model. Gate: judge win rate 50%+, cost down
- [ ] T6a Measure the exact-repeat rate of Clio general questions and titles per user for 2 weeks
- [ ] T6 Cache only if T6a shows 10%+ repeats: exact match first, embeddings only if needed (per user, prompt version in the key, 24 h TTL)
- [ ] T7 Time to first token and rate limiter wait time measured

### C. Containers, CI/CD and cloud

- [ ] C1 Multi-stage Dockerfiles for all 9 services: `dev` stage (Skaffold keeps it), `prod` stage with `npm ci --omit=dev`, non-root `node` user, `node server.js`, `HEALTHCHECK`
- [ ] C2 Dockerfiles for Frontend and payments_frontend (Vite build, `nginx:alpine`), Admin when its backend exists
- [ ] C3 GitHub Actions `ci.yml`: path filters, `npm ci`, lint, tests per service, Payments tests on throwaway DB containers
- [ ] C4 `evals.yml`: offline evals on every PR, live evals on agent path changes and by hand
- [ ] C5 `images.yml`: build `prod` images, Trivy scan, push to GHCR
- [ ] C6 `k8s.yml`: `kubeconform`, block `k8s/secrets.yml` in any diff
- [ ] C7 Pick the cloud (free path: Oracle Always Free with k3s, or AWS/GCP/Azure free tier VM, or managed k8s on credits)
- [ ] C8 `deploy.yml`: roll image tags to the cloud cluster (including the three sandbox images through Sandbox server env), secrets from GitHub secrets, databases stay on Atlas and Supabase free tiers
- [ ] C9 `MAX_LIVE_SANDBOXES` cap in the Sandbox server sized to the chosen node; multi-arch images if the node is ARM

### O. Observability for LLMs

- [ ] O1 OpenTelemetry SDK in every Node service, `traceparent` on internal calls (and in the Kafka envelope), export to an OpenTelemetry Collector with tail sampling, then Grafana Tempo
- [ ] O2 **Langfuse** (self-hosted or free Hobby tier) through the LangChain callback: one trace per run, spans per node and tool, generations per model call
- [ ] O3 Redaction before export (reuse `redactInput` and `redactText`), `LLM_TRACING` flag, sampling, exporter failures never break a run
- [ ] O4 Token, cost and error counters in Prometheus without a `userId` label
- [ ] O5 Grafana dashboards: tokens, latency, **error rate** per model, node, tool and service
- [ ] O6 Alerts: error rate over 5% for 10 min, p95 model latency over 60 s, eval regression on `main`
- [ ] O7 Eval scores attached to Langfuse traces

---

## Phase 7. V2.5 Taksha Hosting (about 10.5 weeks)

Detail in [taksha-hosting-deployments-plan.md](taksha-hosting-deployments-plan.md) section 16. Added 2026-11-25. Until it ships, the preview is owner-only and the Share button is hidden.

- [ ] **H0 Domain and spike:** buy the hosting `.app` domain, DNS on the CDN, submit it to the Public Suffix List, check custom hostname limits and wildcard TLS, decide H-D4 (move previews off the app domain)
- [ ] **H1 Hosting service:** `Hosting/`, Mongo `hosting`, `/api/hosting`, `Site` model and slug rules, hosting limits in Payments (Free 1, Pro 3, Max 5 sites), owner check
- [ ] **H2 Builds:** `taksha-builder` image, `builds` namespace with NetworkPolicy and hardening, upload creds scoped to one deployment, Job lifecycle, logs (S3 + SSE), workspace snapshot by S3 object versions. Gate: a build can not reach cluster services
- [ ] **H3 Edge:** `hosting-edge` (Redis alias, SPA fallback, cache and security headers, notice pages, reconcile). Gate: sites keep serving with the Hosting service down
- [ ] **H4 Dashboard:** `hosting_frontend/` at `/hosting/`, Share button opens it, promote and rollback, per-deployment URLs
- [ ] **H5 Custom domains** (Pro, Max): TXT verify, CDN custom hostnames, apex instructions, daily re-check
- [ ] **H6 Git deploys:** deploy from a commit sha, auto-deploy on push (needs GitHub G7)
- [ ] **H7 Usage and abuse:** bandwidth roll-up and warnings, Safe Browsing check, admin takedown, retention

---

## Phase 8. V3 Taksha desktop app with a local LLM (idea)

High level in [admin-native-app-plan.md](admin-native-app-plan.md) section 9. Goal: save model cost. Decided 2026-11-25: code stays in the cloud sandbox first and moves to the machine later; one app, with a swappable model (cloud or local) and workspace (cloud sandbox or local).

- [ ] V3-0 Write the full plan (portable agent loop, model router, local runtime choice, billing for local runs)
- [ ] V3-1 Mode 2 hybrid: local model for cheap tasks, cloud agent for heavy runs, tools through the router
- [ ] V3-2 Mode 3: local model drives the agent loop, tools in the cloud sandbox through the router
- [ ] V3-3 Mode 4: local isolated workspace with the same MCP tool contract (offline coding)
