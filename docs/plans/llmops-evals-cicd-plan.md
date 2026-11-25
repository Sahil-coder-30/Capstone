# Plan: evals, token economics, CI/CD and LLM observability

Status: **Plan, last phase** (written 2026-11-24, checked against the code that day). Where this plan and the code disagree, trust the code and fix the plan.

**When:** this is the final phase of the project. It starts only after every other plan (tool call analytics, agent tools, admin platform, Kafka and WhatsApp) is built end to end, as part of the product testing phase. The one exception is the small eval runner that agent tools Phase 0 already needs for its gates; it stays in that plan.

Tracked in [CHECKLIST.md](CHECKLIST.md), Phase 6 (sections E, T, C and O). Audit 2026-11-24: [AUDIT-2026-11-24.md](AUDIT-2026-11-24.md). Changed here: semantic cache demoted to measure-first, OpenTelemetry Collector with tail sampling in front of Tempo and Langfuse, multi-arch images, sandbox image tags in deploys, a cluster capacity cap, Langfuse components checked.

## 1. Summary

Four tracks that turn Taksha from "it works when I try it" into a system that is measured on every change:

| Track | Goal | Main output |
|---|---|---|
| E. Evals | Stop vibe checks. Every prompt or model change is scored against golden datasets before it merges | `Ai_orchestration/evals/` with datasets, scorers, an LLM judge and a CI gate |
| T. Token economics and latency | Know and lower the cost and time of every request | Cost per request, model routing, prompt compression, semantic cache |
| C. Containers, CI/CD, cloud | Every push is tested and built the same way, and the app runs outside the laptop | Production Dockerfiles, GitHub Actions, images in GHCR, one cloud deploy |
| O. LLM observability | See tokens, latency and errors per run, per node and per tool call | OpenTelemetry traces + Langfuse for LLM spans, next to the Prometheus and Loki stack |

**Order:** it runs last, on the finished product, so the evals and traces cover every feature at once. Technically no track needs another plan, but building them last avoids instrumenting code that is about to change. Where it touches another plan, section 8 says who owns what.

**Free tier only.** Every tool chosen here has a free self-hosted or free cloud tier. Section 7 lists the limits.

## 2. What the code looks like today (checked 2026-11-24)

| Area | Today | Where |
|---|---|---|
| Models | NVIDIA hosted, OpenAI-compatible. Two models: main `nemotron-3-ultra-550b-a55b` and fast `nemotron-3.5-lightning-30b-a3b` | `Ai_orchestration/src/agent/llm/model.js` |
| Model routing | Already two tiers. The fast model is used by the router node, finalizer, memory agent and chat titles. Everything else uses the main model | `router.node.js`, `finalizer.node.js`, `memoryAgent.js`, `copilot.service.js` |
| Rate limiting | Per model pacing, 429 backoff, 180 s timeout per call. Redis token bucket per user (tier is always "free") | `llm/rateLimiter.js`, `middleware/rateLimit.middleware.js` |
| Token counting | `usage_metadata` read per call. Tokens saved on each chat message (`tokenUsage`) and sent to Payments by `recordAiUsage` | `core/messages.js`, `models/chatSchemas.js`, `services/credit.service.js` |
| Cost | Payments turns tokens into credits. **No cost in money per request**, no per node or per tool breakdown | `Payments/` credit routes |
| Context control | Chat summary compaction, history window, memory notes with character limits | `services/memory.service.js` (`LIMITS`), `HISTORY_MESSAGES` |
| Retrieval | No vector store. "Retrieval" in Taksha means: the agent finding the right files (`search_code`, `read_file`), memory notes, and Tavily web search | sandbox tools, `memory.service.js`, `internetSearch.service.js` |
| Tests | `node --test` in Ai_orchestration (offline flow tests with a scripted model), Auth, Payments (80 tests, they `deleteMany`), Sandbox Agent, router, server, Frontend. `npm run e2e:live` runs one real model task and costs credits | each `package.json` |
| Evals | None yet. The agent tools plan Phase 0 plans 30 seeded tasks and `npm run eval` | `taksha-agent-tools-build-plan.md` section 7 |
| Dockerfiles | 9 of them (lowercase `dockerfile`): Auth, Payments, Notification, Ai_orchestration, Sandbox server, router, Agent, sync-agent, template. All are **dev images**: `node:20-alpine`, full `npm install`, `CMD npm run dev` (nodemon), run as root. No Dockerfile for Frontend, payments_frontend or Admin | each service folder |
| Dev loop | `skaffold.yml` with file sync, `k8s/` manifests, Docker Desktop | repo root |
| CI/CD | **None.** `.github/` exists but is empty | |
| Metrics and logs | Only Auth has `/metrics` (`prom-client`). No Prometheus, Grafana or Loki deployed. The design is in `docs/infrastructure/grafana-prometheus-loki-stack.md` and Kafka plan K7 | `Auth/src/observability/metrics.js` |
| Tracing | None. No OpenTelemetry, no Langfuse | |

## 3. Track E: evals

### 3.1 What gets evaluated

| Suite | What it checks | Golden data | Scorer | Cost to run |
|---|---|---|---|---|
| E1 Router | The router node picks the right path (general, plan, code, ...) | 100 to 200 labelled user messages | Exact match, confusion matrix | Fast model only, cheap |
| E2 Structured output | Planner and reviewer return valid objects | 50 inputs | zod parse rate, retries needed | Cheap |
| E3 Context retrieval | The agent reads the files that matter, and not many that do not | Per task: a gold list of relevant files | **Context precision** = relevant files read / all files read. **Context recall** = relevant files read / gold files | Comes free with E5 runs |
| E4 Memory recall | Facts from earlier chats come back in later turns | Seeded chats with planted facts, then questions | Recall of planted facts, and no leaks across users or projects | Medium |
| E5 Agent tasks | End to end coding tasks in a temp workspace | The 30 seeded tasks from agent tools Phase 0, grown to 50+ | Pass or fail by a check script per task, tool calls, tokens, time | Expensive (real model, real sidecar) |
| E6 Answers (Clio, general) | Quality of chat answers | 50 to 100 questions with reference answers | **LLM as judge** with a rubric | Medium |

### 3.2 Golden datasets

- Live in `Ai_orchestration/evals/datasets/<suite>.jsonl`, one case per line, with an `id`, `input`, `expected` and `tags`.
- Seeded by hand first, then grown from real failures: every bug found in a chat becomes a case (redacted, no user data, no secrets).
- Versioned in git. A dataset change is reviewed like code.
- Each case has a `split`: `dev` (used while tuning prompts) or `holdout` (only scored in CI, never looked at while tuning).

### 3.3 LLM as judge

- The judge is **not** the model being tested. Use a different free model (for example another NVIDIA hosted model) with `temperature: 0`.
- Rubric per suite, scored 1 to 5 on named criteria (correct, complete, follows instructions, safe), with a short reason.
- Pairwise mode for regressions: the judge sees the baseline answer and the new answer in random order and picks the better one, or a tie.
- Calibrate the judge once: score 30 cases by hand, check the judge agrees on most of them. Re-check when the judge model changes.
- Store every judge call (prompt, answer, score, reason) in the run's result file, so a score can be audited.

### 3.4 Regression gate

- `evals/baseline.json` holds the last accepted scores per suite.
- A run writes `evals/results/<date>-<sha>.json`.
- `npm run eval:compare` fails when a score drops past its threshold (start with: router accuracy -2 points, E5 pass rate -5 points, judge win rate below 45%, tokens per task +20%).
- When a change is accepted on purpose, the baseline is updated in the same commit.

### 3.5 When evals run

| Trigger | What runs | Why |
|---|---|---|
| Every PR, every push | Offline suites: scorer unit tests, dataset schema checks, E1 and E2 against recorded model answers (replay) | Free, deterministic, no API key in CI |
| PR that touches `src/agent/core/prompts.js`, `src/agent/llm/`, `src/agent/nodes/`, `src/skills/` or an `NVIDIA_*MODEL` default | Live E1, E2, E6 with the judge, a 10 task smoke set of E5 | Prompt or model changes are exactly what the gate is for |
| Manual (`workflow_dispatch`) or weekly | Full E5 and E4 | Expensive. Never run without asking, it spends model credits |

Live runs need the model key as a GitHub Actions secret. Until the person adds it, live evals stay manual and local.

## 4. Track T: token economics and latency

### 4.1 Measure first

- Price table `Ai_orchestration/src/agent/llm/pricing.js`: price per 1M input and output tokens per model id. NVIDIA hosted models are free on the trial tier, so keep a "list price" column taken from a comparable paid provider, to show what it would cost at scale.
- Every model call records: model, node, input tokens, output tokens, cached tokens if any, latency (time to first token and total), cost.
- Per request roll up: **cost per request**, tokens per request, p50 and p95 latency, per agent (Orion, Clio, memory, title) and per node.
- Shown in Langfuse (track O), and the totals go to Prometheus as counters **without** a `userId` label (per user numbers come from the database, see Kafka plan section 6).

### 4.2 Model routing

The two-tier setup exists. Extend it, and prove each change with evals:

- Route simple Clio questions and the `general` path to the fast model when the router is confident. Fall back to the main model when the fast answer fails a cheap check (empty, wrong format, judge score low in evals).
- Give the router a `difficulty` field. Use it to choose the model for the planner on tiny tasks.
- A routing change ships only when E6 judge win rate stays at or above 50% against the main model and the cost per request drops.

### 4.3 Prompt compression

- Measure where tokens go first: system prompt, tool guides, memory, history, tool outputs.
- Cap tool outputs (long `read_file`, `run_command` logs) with head, tail and a "truncated" note. The agent tools plan already adds ranged reads and hashes (Phase 2), which is the biggest saving.
- Keep the stable part of the prompt first and the changing part last, so provider prefix caching can work where a provider supports it.
- Trim tool guides that are not needed for the current node.
- Gate: tokens per task drops, E5 pass rate does not.

### 4.4 Semantic cache (measure first, changed by the audit)

**Do not build it until the numbers say so.** Per-user scope (needed so answers never leak) makes the hit rate small, Clio's answers usually depend on the open project, and every request would pay an embedding call (latency and cost) to save a few. First step T6a: log a normalized hash of every Clio general question and chat title request for 2 weeks and measure the exact-repeat rate per user. Build an **exact-match** cache if that rate is 10% or more; move to embeddings only if exact match leaves a clear gap. If built, the rules below apply.

- Only for answers that do not depend on the workspace: Clio general questions and chat titles. **Never** for coding runs or anything that used a tool, because the files change.
- Store in the Redis the service already uses (`ioredis`). Key: embedding of the normalized question + model id + prompt version. Hit when cosine similarity is above a threshold (start at 0.95), checked on a dataset of near-duplicate and look-alike questions so a wrong hit is rare.
- Scope the cache per user, so no answer leaks between users.
- TTL of 24 hours, and the prompt version in the key so a prompt change empties it.
- Embeddings from a free NVIDIA embedding model. Track hit rate and the money saved.

### 4.5 Latency

- Stream tokens to the UI (already done for chat), measure time to first token.
- Run independent work in parallel (memory build and session load already use `Promise.all`).
- Watch the rate limiter: time spent waiting for a slot is its own span in traces.

## 5. Track C: containers, CI/CD and cloud

### 5.1 Production images

Today every image is a dev image. Add a production stage to each Dockerfile, and keep the dev stage for Skaffold:

- Multi-stage: `deps` (`npm ci --omit=dev`), `dev` (today's behaviour, used by `skaffold.yml` with `target: dev`), `prod` (copies only `node_modules` and `src`).
- Build `linux/amd64` and `linux/arm64` with `docker buildx` when the cloud choice is an ARM VM (option B below). The agent image compiles `node-pty`, so the arm64 build is checked in CI, not assumed.
- The three sandbox images (`template`, `agent`, `sync-agent`) are referenced today by bare names with `IfNotPresent` (`Sandbox/server/src/kubernetes/pod.js`). For a cloud cluster they become registry-qualified, digest-pinned names read from Sandbox server env (`SANDBOX_IMAGE_TEMPLATE`, `SANDBOX_IMAGE_AGENT`, `SANDBOX_IMAGE_SYNC`), and `deploy.yml` updates that env. Running pods keep their image until they stop, so the AI service must accept both tool versions for 20 minutes (agent tools plan, rollout order).
- `prod` runs as the `node` user, `CMD ["node", "server.js"]`, no nodemon, `NODE_ENV=production`, a `HEALTHCHECK` on the health route.
- `npm ci` with the lock file, not `npm install` from a mirror registry.
- Add Dockerfiles for Frontend and payments_frontend (build with Vite, serve with `nginx:alpine`). Admin gets one when its backend exists.
- Image scan with Trivy. Pin the base image digest.

### 5.2 GitHub Actions

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | PR and push to `main` | Path filter per service, then for each changed service: `npm ci`, lint, `npm test`. Payments tests run against a throwaway Postgres service container in the job (Payments has no MongoDB), never a real database; Mongo-based services that need one get a `mongo` service container |
| `evals.yml` | PR touching the agent paths (section 3.5), and manual | Offline evals always. Live evals only when the `NVIDIA_API_KEY` secret exists |
| `images.yml` | Push to `main`, tags | Build the `prod` stage of changed services, Trivy scan, push to GHCR as `ghcr.io/<owner>/taksha-<service>:<sha>` |
| `k8s.yml` | PR touching `k8s/` | `kubeconform` on the manifests, a check that `k8s/secrets.yml` is never in the diff |
| `deploy.yml` | Manual, then on tag | Roll the new image tags out to the cloud cluster (5.3) |

Rules: no secret in any workflow file, all keys come from GitHub secrets. Workflows only read the repo unless they push images. Use the GitHub free minutes (unlimited on a public repo, 2,000 minutes a month on a private one), so path filters and caching matter.

### 5.3 Cloud

The person named AWS, GCP and Azure. Managed Kubernetes control planes are not free on AWS (EKS) and only partly on GCP (GKE gives a credit for one zonal cluster). The free path:

| Option | What runs it | Cost | Lean |
|---|---|---|---|
| A. One free VM with k3s | GCP `e2-micro`, AWS `t2.micro`/`t3.micro` (12 months), Azure B1s (12 months) | Free, but 1 GB RAM is too small for the full stack | Only for a slimmed demo |
| B. Oracle Cloud Always Free ARM VM with k3s | Up to 4 cores and 24 GB RAM, free forever | Free | Best fit for the whole stack. Not one of the three named clouds |
| C. GKE Autopilot or EKS with credits | Managed k8s | Uses the new account credits, then paid | For learning the managed path, time boxed |
| D. Split | Frontends on a free static host, services on B | Free | Good for a public demo |

**Capacity rule for any single-node choice.** Each sandbox pod asks for about 0.6 to 1 GiB and may use up to 1.28 GiB (limits in `pod.js`). On a 24 GB node, after the platform services, Kafka and monitoring, that is roughly 10 to 12 live sandboxes. The Sandbox server gets a global cap (`MAX_LIVE_SANDBOXES`, checked with a Redis counter on start, released on expiry) and answers 503 "Taksha is full, try again in a few minutes" instead of letting the node run out of memory and evict everyone.

Decide at the start of C3. Whatever runs it: MongoDB Atlas free tier and Supabase free tier stay as the databases, images come from GHCR, and secrets go in as k8s Secrets created by hand or by the deploy job from GitHub secrets.

## 6. Track O: LLM observability

### 6.1 What goes where

| Signal | Tool | Notes |
|---|---|---|
| Service metrics (requests, errors, latency) | Prometheus via `kube-prometheus-stack` | Owned by Kafka plan K7. This plan only adds AI token and cost counters |
| Logs | Loki + Grafana Alloy | Owned by Kafka plan K7 |
| Traces across services | OpenTelemetry SDK in each Node service, exported over OTLP to an **OpenTelemetry Collector** (one Deployment in `monitoring`), which sends to Grafana Tempo (single binary, free) | `traceparent` header passed on every internal HTTP call, through the router's internal MCP path, and in the Kafka envelope once Kafka exists. The Collector is the one place for sampling, redaction and routing |
| LLM traces (prompt, completion, tokens, cost, latency per call, per node, per tool) | **Langfuse** (self-hosted with Docker, or Langfuse Cloud free Hobby tier) through its LangChain callback handler | One trace per agent run, spans per node, generations per model call, spans per tool call |
| Eval scores | Langfuse scores, linked to traces | Judge scores from track E show next to the trace they came from |

### 6.2 Rules

- Redact before sending: reuse `redactInput` and `redactText` from the tool call analytics plan. No tokens, keys or long file contents leave the cluster.
- Sampling: 100% in dev. In the cloud, **tail sampling in the Collector** (`tail_sampling` processor): keep every trace with an error or a span over 30 s, plus 10% of the rest. "Always keep runs that errored" cannot be done with head sampling in the SDK, because the error happens after the decision. Langfuse gets every agent run (it is per run, not per request, so the volume is small).
- `userId` goes into Langfuse as a trace attribute (fine there), never as a Prometheus label.
- Tracing must never break a run: exporter failures are dropped and counted.
- Off by default behind `LLM_TRACING=on`, same pattern as `TOOL_LOGGING`.

### 6.3 Error rates

- Error rate per model, per node, per tool, per service in Grafana (from Prometheus) and in Langfuse (per run).
- Alerts (Grafana, free): error rate above 5% for 10 minutes, p95 model latency above 60 s, rate limiter waits above a threshold, eval regression on `main`.

## 7. Free tier limits to know

| Service | Free limit (check before relying on it) |
|---|---|
| GitHub Actions | Unlimited minutes on public repos, 2,000 minutes a month on private |
| GHCR | Free for public images, storage limits for private |
| Langfuse Cloud Hobby | Limited events per month, short retention. Self-host (docs checked 2026-11-24, now labelled v4): web and worker containers plus Postgres, ClickHouse, Redis or Valkey, and S3-compatible blob storage (MinIO locally). Plan on 3 to 4 GB RAM, not 2; check the per-component pages before O2 |
| Grafana Tempo, Prometheus, Loki | Free, self-hosted, cost is RAM on the cluster |
| NVIDIA hosted models | Trial credits, rate limited. Live evals spend them |
| Oracle Always Free | 4 ARM cores, 24 GB RAM total, can be reclaimed if idle |

## 8. Touch points with other plans

| Touch point | Plans | Rule |
|---|---|---|
| Eval runner and `evals/baseline.json` | Agent tools Phase 0 (creates the runner and 30 tasks), this plan (adds suites, judge, CI gate) | Agent tools Phase 0 builds the runner. This plan extends it, never replaces it. If this plan runs first, it builds the runner to the Phase 0 spec |
| Redaction helpers | Tool call analytics (writes them), this plan (reuses them for Langfuse) | Whoever builds first writes them in `Ai_orchestration/src/services/redact.js` |
| Monitoring stack in `k8s/monitoring/` | Kafka K7, Admin P5, this plan (Tempo, Langfuse) | The stage that runs first installs it. This plan adds Tempo and Langfuse values files next to it and only adds |
| Token and cost numbers | Tool call analytics (per tool), Payments (credits), this plan (money per request) | Payments stays the source of truth for credits. Cost in money is for engineering views only |
| Dockerfiles and `skaffold.yml` | This plan adds a `prod` stage, Kafka K1 adds `k8s/kafka.yml` | Skaffold keeps building `target: dev`. The dev loop does not change |

## 9. Rules

- Each step ends with its tests passing and one local commit. No push unless asked.
- Live evals and `npm run e2e:live` spend model credits. Do not run them without asking.
- Never open `k8s/secrets.yml`, `.env` or key files. Use the `.example` files.
