# ☁️ Sync Agent

> Watches `/workspace` for any file change and mirrors the diff to AWS S3 in real time — the only process in the system with S3 write access — so user work is never lost when a sandbox pod is stopped or evicted.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Status](https://img.shields.io/badge/status-Production-brightgreen)
![Runtime](https://img.shields.io/badge/runtime-Node.js%2020%20ESM-informational)

---

## 📖 Table of Contents
- [Overview & The "Why"](#-overview--the-why)
- [Built Features & Current State](#-built-features--current-state)
- [Architecture & Design Patterns](#-architecture--design-patterns)
- [Usage & Setup](#-usage--setup)
- [Communication & Contracts](#-communication--contracts)
- [Production Readiness](#-production-readiness)
- [Changelog & Migration State](#-changelog--migration-state)

---

## 🎯 Overview & The "Why"

### What this service does
Sync Agent is a pure daemon process that runs as a third sidecar container in every user's sandbox pod. On startup, if `SYNC_RESTORE_ON_STARTUP` is enabled, it performs a full restore from S3 (downloading the user's previous workspace into `/workspace`). After restore, it starts a `chokidar` file watcher on `/workspace` and uploads changed/created files to S3, deletes removed files from S3, and maintains a debounced event queue to coalesce rapid changes (e.g. a bulk file write by the AI agent) into efficient batched uploads. It has no HTTP server and exposes no REST API — it is entirely I/O-driven.

### Why this is its own microservice (not part of a monolith)

- **Bounded context:** Sync Agent exclusively holds S3 credentials and owns the decision of _what gets persisted to object storage_. No other service (not even the Agent sidecar, which writes to the filesystem) knows about S3. This means a storage provider change (e.g., migrating from AWS S3 to GCS) is a single-service change.
- **Independent scaling need:** S3 upload throughput (concurrent multipart uploads, debounce windows, retry backoff) is tuned entirely for filesystem sync — a very different load profile from the Agent sidecar's PTY I/O or the Vite dev server's HMR. Co-locating these would make it impossible to tune either independently.
- **Independent deployability:** S3 bucket changes, ignore pattern updates, or debounce tuning are operational concerns that change on a different cadence from the file API or the LLM integration. Decoupling the sidecar image allows these to ship without coordinating with the AI or Auth teams.
- **Failure isolation:** If Sync Agent crashes or stalls (e.g., S3 rate limit), the user's Vite dev server and terminal continue running unaffected. The workspace is intact on the local `emptyDir` volume. Work is not lost until the pod itself is evicted — and even then, whatever was synced before the crash is in S3.
- **Data isolation strategy:** No database. State is the S3 bucket keyed by `<projectId>/<relativePath>`. The sync agent's only external dependency is AWS S3. It does not share a database with any other service.

### The "User" of this service

| Caller | Call type | Why it calls this service |
|---|---|---|
| No external callers | — | Sync Agent is not called by anything. It is entirely event-driven by the local filesystem watcher. |
| Sandbox Control Server | Pod spec injection | The pod template provisions the sync-agent container with S3 credentials via K8s Secrets and the `PROJECT_ID` env var. This is a configuration relationship, not a runtime call. |
| AWS S3 | Outbound (S3 SDK) | Sync Agent pushes file changes and pulls restores from the project's S3 prefix |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v1.0.0 |
| **Last deployed** | 2026-07 |
| **Owner(s)** | Sahil Sharma |
| **Known technical debt** | The startup restore performs a full S3 list + download sequentially, which can be slow for workspaces with many files. A diff-based restore (compare local vs S3 ETags and only download missing/changed files) would reduce startup time. Additionally, the `node_modules` directory is excluded by hardcoded pattern — if a user renames their node_modules or uses a non-standard package manager directory (e.g., `.pnp`), files may be synced unnecessarily. |

### Features built (working today)

- **Startup restore:** On launch, syncs the user's previous S3 workspace down to `/workspace` (skips `node_modules`, `.git`, lock files, and common build artifacts) — ✅ done
- **Real-time upload:** `chokidar` `add` and `change` events trigger debounced S3 uploads using `@aws-sdk/lib-storage` multipart upload — ✅ done
- **Delete sync:** `chokidar` `unlink` events delete the corresponding S3 object — ✅ done
- **Debounce + stability threshold:** Changes are coalesced over a configurable debounce window (default 400ms) with a stability threshold (300ms) before upload — ✅ done
- **Concurrent upload throttle:** `p-limit` limits simultaneous S3 uploads (default 8 concurrent) — ✅ done
- **Retry with exponential backoff:** Failed uploads are retried up to `SYNC_MAX_RETRIES` times (default 5) — ✅ done
- **Configurable ignore patterns:** Hardcoded ignores (`node_modules`, `.git`, lock files, build outputs) plus additional patterns via `SYNC_IGNORE_EXTRA` env var — ✅ done
- **Structured logging:** `[INFO]`, `[WARN]`, `[ERROR]`, `[DEBUG]` prefixed log levels with ISO timestamps — ✅ done

### How it was built
- **Language/runtime:** Node.js 20, ESM (`"type": "module"`)
- **Framework:** None (no HTTP server — this is a daemon process)
- **Design patterns used:**
  - **Debounced event queue** — Rather than uploading on every `chokidar` event, changes are accumulated in a `Map<path, timer>` where each path's timer resets on repeated events. This coalesces rapid edits (e.g., an AI agent writing 20 files in 2 seconds) into 20 single uploads rather than N×20 intermediate uploads.
  - **Concurrency limiter** — `p-limit` wraps all S3 operations so the process never opens more than `MAX_CONCURRENT_UPLOADS` simultaneous connections, preventing S3 throttling under burst write conditions.
  - **Fail-fast config validation** — A `required(name)` helper at startup calls `process.exit(1)` if any critical env var is missing, rather than silently starting with broken config.
- **Key libraries:** `chokidar`, `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `p-limit`

---

## 🏗️ Architecture & Design Patterns

Everything runs in `sync.js` — a single file with three phases: config validation, startup restore, and the watcher loop. There is no HTTP server, no framework, no controller layer. The process is designed to be killed cleanly by the pod lifecycle (SIGTERM → in-flight uploads drain before exit — graceful shutdown is implemented).

```
Sandbox/sync-agent/
├── sync.js             # Everything: config, restore logic, chokidar watcher, S3 upload/delete
└── .env                # Local dev only — DO NOT commit real credentials
```

---

## ⚙️ Usage & Setup

### Environment variables
> Keys and fake example values only. Never a real secret, connection string, or token.

| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `PROJECT_ID` | ✅ | Unique project identifier — used as the S3 key prefix | `proj_abc123def456` |
| `AWS_BUCKET_NAME` | ✅ | S3 bucket for workspace storage | `codespace-sync-bucket-dev` |
| `AWS_REGION` | ✅ | AWS region where the bucket lives | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | ✅ | AWS IAM access key ID | `AKIAFAKEACCESSKEYID` |
| `AWS_SECRET_ACCESS_KEY` | ✅ | AWS IAM secret access key | `FakeSecretAccessKey+EXAMPLE` |
| `SYNC_ROOT` | ❌ | Local directory to watch (defaults to `/workspace`) | `/workspace` |
| `SYNC_DEBOUNCE_MS` | ❌ | Debounce window in ms before upload fires (default: 400) | `400` |
| `SYNC_STABILITY_THRESHOLD_MS` | ❌ | Chokidar stability threshold in ms (default: 300) | `300` |
| `MAX_CONCURRENT_UPLOADS` | ❌ | Max simultaneous S3 uploads (default: 8) | `8` |
| `SYNC_MAX_RETRIES` | ❌ | Max upload retries on failure (default: 5) | `5` |
| `SYNC_RESTORE_ON_STARTUP` | ❌ | Set to `false` to skip S3 restore on boot (default: `true`) | `true` |
| `SYNC_IGNORE_EXTRA` | ❌ | Comma-separated extra ignore patterns | `.cache,.temp` |
| `DEBUG` | ❌ | Set to any truthy value to enable debug-level logs | `1` |

### Run locally
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env  # or create manually with the keys above

# 3. Start daemon (nodemon in dev)
npm run dev
# Watches SYNC_ROOT (default: /workspace) — point to a local test directory
```

### Run via Docker / Skaffold
```bash
# Build image locally
docker build -t sync-agent:local .

# Run as part of the full cluster (deployed as a sidecar in each sandbox pod)
skaffold dev
# Declared in skaffold.yml as image: sync-agent, context: Sandbox/sync-agent
# Credentials injected via K8s Secret 'aws' in pod spec
```

---

## 🔌 Communication & Contracts

### Synchronous (REST)
None — Sync Agent has no HTTP server and accepts no inbound connections.

### Asynchronous (event/queue)
None — Sync Agent does not use RabbitMQ or any message queue. It is driven entirely by local filesystem events (chokidar) and responds by making outbound S3 API calls.

| Direction | Protocol | Target | Description |
|---|---|---|---|
| Outbound | AWS S3 SDK | `s3://<bucket>/<projectId>/<path>` | Upload changed/created files |
| Outbound | AWS S3 SDK | `s3://<bucket>/<projectId>/<path>` | Delete removed files |
| Outbound | AWS S3 SDK | `s3://<bucket>/<projectId>/` (list + get) | Startup restore — download previous workspace |

### Contract source of truth
[`sync.js`](./sync.js) — S3 key naming convention: `<projectId>/<relativePath>` where `relativePath` is the file's path relative to `SYNC_ROOT`.

---

## 🛡️ Production Readiness

### Health & observability
- **Liveness:** No dedicated `/healthz` HTTP endpoint — gap. K8s uses a process-existence check (no `livenessProbe` configured). If the watcher crashes silently, the pod remains "running" but sync stops.
- **Readiness:** No dedicated `/ready` or `/readyz` probe — gap.
- **Graceful shutdown:** ✅ SIGTERM handler is implemented — the process flushes the pending debounce queue and waits for in-flight uploads before exiting.
- **Structured logging:** ✅ Custom `log.info/warn/error/debug` with ISO timestamps and `[Sync Agent]` prefix — comprehensive logging for all S3 operations.
- **Tracing / Metrics:** Not implemented.

> ✅ **Positive:** Graceful shutdown is actually implemented here (unlike most other services in this system), making it the most operationally correct service for pod eviction scenarios.

### Security & compliance
- **AuthN/AuthZ:** No inbound connections — not applicable.
- **S3 access:** Uses IAM credentials injected via K8s Secret `aws`. The IAM policy should be scoped to `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on `arn:aws:s3:::<bucket>/<projectId>/*` only — principle of least privilege. Current policy scope is not verified in code.
- **Secrets management:** K8s Secret `aws` — `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`. Never in `.env` in production.

### CI/CD & deployment
- **Container:** [`Sandbox/sync-agent/dockerfile`](./dockerfile) — Node 20 Alpine base (no native bindings required).
- **Orchestration:** Not an independent K8s Deployment — runs as a container in each dynamically-provisioned sandbox Pod.
- **Skaffold:** `image: sync-agent` in `skaffold.yml` — watches `*.js` and `package.json`.

---

## 📝 Changelog & Migration State

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `v1.0.0` | 2026-07 | Initial release: chokidar watcher, S3 upload/delete/restore, debounce, concurrency limiter, retry | None — first release |

---

## 🤝 Ownership
- **Maintainer(s):** Sahil Sharma
- **Escalation:** Check project issues or contact the maintainer directly.
