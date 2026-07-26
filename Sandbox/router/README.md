# 🔀 Sandbox Router Service

> Routes every browser request — HTTP and WebSocket — to the right sandbox pod using subdomain-based dispatch, so the frontend never needs to know which K8s service name a user's session lives behind.

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
Sandbox Router is an intelligent HTTP and WebSocket reverse proxy. It receives all traffic whose hostname matches `*.preview.<domain>` or `*.agent.<domain>`, extracts the `sandboxId` from the subdomain prefix, refreshes the session TTL in Redis to keep the session alive, and forwards the request to the appropriate per-pod K8s service — the Vite dev server container (port 5173) for preview traffic, or the agent sidecar container (port 3000) for terminal and file API traffic. It maintains a lazy proxy cache so each `sandboxId` only creates one proxy instance regardless of how many concurrent requests it receives.

### Why this is its own microservice (not part of a monolith)

- **Bounded context:** Router exclusively owns the question of _how a subdomain maps to a live backend target_. The Nginx Ingress routes `*.preview.*` and `*.agent.*` wildcard traffic here; no other service knows how to turn a sandboxId into a target hostname.
- **Independent scaling need:** The Router is the single point of ingress for all sandbox preview and terminal WebSocket connections. Its load profile is high-throughput, low-latency connection proxying — very different from the Sandbox Control Server's slow K8s API calls or the AI service's multi-minute LLM loops. It needs to scale horizontally based on concurrent connections, not API request count.
- **Independent deployability:** Routing logic (new subdomain patterns, proxy cache strategy, Redis TTL refresh policy) changes independently of pod provisioning or AI agent logic.
- **Failure isolation:** If the Router goes down, existing WebSocket connections drop and preview iframes go blank — but active AI agent runs continue to completion inside the pod, and no data is lost. The Sandbox Control Server and Auth continue operating.
- **Data isolation strategy:** No database. The Router's only stateful dependency is Redis (shared TTL cache with the Sandbox Control Server). There is no MongoDB connection — it is intentionally stateless beyond the proxy cache held in memory.

### The "User" of this service

| Caller | Call type | Why it calls this service |
|---|---|---|
| Frontend SPA (preview iframe) | HTTP via Nginx wildcard (`*.preview.*`) | Proxy to the Vite dev server inside the sandbox pod |
| Frontend SPA (xterm.js terminal) | WebSocket via Nginx wildcard (`*.agent.*`) | Proxy to the agent sidecar's Socket.io terminal endpoint |
| AI Orchestration Service (tool calls) | HTTP via agent subdomain | Tool HTTP calls to the sidecar File API are routed through this service |
| Nginx Ingress | Inbound proxy | Nginx forwards all wildcard subdomain traffic here; Router dispatches to the right pod |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v1.0.0 |
| **Last deployed** | 2026-07 |
| **Owner(s)** | Sahil Sharma |
| **Known technical debt** | Proxy instances are cached in plain in-memory maps (`httpProxies`, `wsProxies`, etc.). When the Router pod is killed and restarted, the cache is cold — the first request to each sandbox after a restart pays a small proxy initialization cost. More critically, if a sandbox pod is stopped/deleted while the Router is running, the cached proxy entry still exists and will route to a dead target until the Router restarts. A Redis-backed proxy registry (or a TTL expiry on the cache entry) would eliminate this stale-proxy window. |

### Features built (working today)

- `GET /api/router/health` — Liveness probe — ✅ done
- `GET /api/router/ready` — Readiness probe — ✅ done
- HTTP proxy: `*.preview.<domain>/*` → `http://sandbox-service-<sandboxId>:5173` — ✅ done
- HTTP proxy: `*.agent.<domain>/*` → `http://sandbox-service-<sandboxId>:3000` — ✅ done
- WebSocket proxy: `*.preview.<domain>` upgrade → Vite HMR WebSocket inside sandbox — ✅ done
- WebSocket proxy: `*.agent.<domain>` upgrade → Socket.io terminal connection on agent sidecar — ✅ done
- Redis TTL refresh on every inbound request (`refreshTTL(sandboxId)`) — ✅ done
- Lazy proxy cache: one proxy instance per sandboxId, created on first request — ✅ done

### How it was built
- **Language/runtime:** Node.js 20, ESM (`"type": "module"`)
- **Framework:** Express 5 + Node.js `http.Server` (raw, to intercept the `upgrade` event for WebSocket proxying)
- **Design patterns used:**
  - **Lazy proxy cache** — Proxy instances are created on-demand and cached in module-level Maps keyed by `sandboxId`. This avoids the overhead of creating a new proxy for every request while keeping memory proportional to the number of active sessions rather than paying the full cost upfront.
  - **Host-header dispatch** — The service parses `req.headers.host` and splits on `.` to extract `sandboxId` (first segment) and `targetHost` (`preview` or `agent`). This is the single routing decision for both HTTP and WebSocket traffic.
  - **Manual WebSocket upgrade interception** — Because Express's middleware chain does not handle WebSocket upgrades, the raw `http.Server` `upgrade` event is intercepted directly. The Router resolves the correct proxy and calls `proxy.upgrade(req, socket, head)`. This is necessary because `http-proxy-middleware`'s auto-upgrade (`ws: true`) would auto-subscribe all connections, which breaks selective subdomain routing.
- **Key libraries:** `http-proxy-middleware`, `ioredis`, `express`, `morgan`

---

## 🏗️ Architecture & Design Patterns

The service creates one Express app for HTTP routing and one raw `http.Server` wrapping it for WebSocket upgrade interception. All routing logic lives in `src/app.js`. There are no controllers, models, or database connections — the service is intentionally thin. Redis is the only external dependency for TTL refresh.

```
Sandbox/router/
├── server.js               # Entry — binds HTTP server on port 3000
└── src/
    ├── app.js              # All routing logic: subdomain dispatch, proxy cache, WS upgrade
    └── config/
        └── redis.js        # ioredis client + refreshTTL(sandboxId) helper
```

---

## ⚙️ Usage & Setup

### Environment variables
> Keys and fake example values only. Never a real secret, connection string, or token.

| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `PORT` | ✅ | Port the service listens on | `3000` |
| `REDIS_URI` | ✅ | Redis connection URL (same instance as Sandbox Control Server) | `redis://default:password@host:port` |

### Run locally
```bash
# 1. Install dependencies
npm install

# 2. Configure environment — no .env.example exists yet; create manually
echo "REDIS_URI=redis://localhost:6379" > .env

# 3. Start in dev mode (nodemon)
npm run dev
```

> **Note:** The Router only works meaningfully when running inside (or connected to) a K8s cluster, because it proxies to `http://sandbox-service-<sandboxId>` hostnames that only resolve within the cluster DNS.

### Run via Docker / Skaffold
```bash
# Build image locally
docker build -t router:local .

# Run as part of the full cluster
skaffold dev
# Declared in skaffold.yml as image: router, context: Sandbox/router
```

---

## 🔌 Communication & Contracts

### Synchronous (REST)
| Direction | Protocol | Endpoint | Counterpart |
|---|---|---|---|
| Inbound | REST | `GET /api/router/health` | Kubernetes liveness probe |
| Inbound | REST | `GET /api/router/ready` | Kubernetes readiness probe |
| Inbound | HTTP proxy | `*.preview.<domain>/*` | Frontend browser (Nginx forwards here) |
| Inbound | HTTP proxy | `*.agent.<domain>/*` | AI Orchestration tool calls (Nginx forwards here) |
| Outbound | HTTP proxy | `http://sandbox-service-<sandboxId>:5173` | Vite dev server inside sandbox pod |
| Outbound | HTTP proxy | `http://sandbox-service-<sandboxId>:3000` | Agent sidecar inside sandbox pod |

### Asynchronous (WebSocket)
| Direction | Protocol | Pattern | Counterpart |
|---|---|---|---|
| Inbound WS upgrade | WebSocket | `*.agent.<domain>` upgrade | Frontend xterm.js terminal connection |
| Inbound WS upgrade | WebSocket | `*.preview.<domain>` upgrade | Vite HMR client in preview iframe |
| Outbound WS proxy | WebSocket | Forward to `http://sandbox-service-<sandboxId>:3000` | Socket.io terminal on agent sidecar |
| Outbound WS proxy | WebSocket | Forward to `http://sandbox-service-<sandboxId>:5173` | Vite HMR WebSocket |

### Contract source of truth
[`src/app.js`](./src/app.js) — the subdomain dispatch logic and proxy target construction is the authoritative contract definition.

---

## 🛡️ Production Readiness

### Health & observability
- **Liveness:** `GET /api/router/health` (or `/healthz`) — returns 200 if Express process is alive — ✅ done
- **Readiness:** `GET /api/router/ready` — returns 200 but does not verify Redis connectivity — partial (gap: Redis check)
- **Graceful shutdown:** No SIGTERM handler. Active WebSocket connections drop on pod kill — gap.
- **Structured logging:** `morgan` combined format for HTTP; `console.log/error` for WebSocket proxy events — partial.
- **Tracing / Metrics:** Not implemented.

### Security & compliance
- **AuthN/AuthZ:** No authentication on proxied traffic — the Router trusts that Nginx Ingress only forwards traffic from authenticated browser sessions. The sandboxId is extracted from the Host header and used as-is. **Risk:** a user who knows another user's sandboxId can proxy to their sandbox via a crafted Host header. Adding a token check (JWT query param or cookie verified against the sandboxId) is a planned hardening item.
- **CORS policy:** Not applicable — traffic is proxied, not originated here.
- **Rate limiting:** Not implemented — gap.
- **Secrets management:** K8s Secrets. Only `REDIS_URI` is sensitive.

### CI/CD & deployment
- **Container:** [`Sandbox/router/dockerfile`](./dockerfile) — Node 20 Alpine base.
- **Orchestration:** K8s Deployment: `k8s/router-deployment.yml`, Service: `k8s/router-service.yml`.
- **Pipeline:** No CI pipeline defined. Manual Skaffold for development.
- **Rollback strategy:** Manual `kubectl rollout undo`.

---

## 📝 Changelog & Migration State

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `v1.0.0` | 2026-07 | Initial release: subdomain-based HTTP + WebSocket proxy, lazy cache, Redis TTL refresh | None — first release |

---

## 🤝 Ownership
- **Maintainer(s):** Sahil Sharma
- **Escalation:** Check project issues or contact the maintainer directly.
