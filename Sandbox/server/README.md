# 🗂️ Sandbox Control Server

> Owns every Kubernetes resource lifecycle decision — creates, starts, stops, and deletes per-user sandbox pods and services so no other service ever calls the K8s API directly.

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
Sandbox Control Server is the Kubernetes control plane proxy for the platform. When a user creates or starts a project, this service uses the official `@kubernetes/client-node` SDK to provision a multi-container Pod (Vite dev server + agent sidecar + S3 sync daemon), a dedicated K8s Service for subdomain-based routing, and a Redis TTL entry for session liveness. It tracks project metadata (name, status, sandboxId) in MongoDB and exposes a REST API for project lifecycle management — create, list, start, stop, soft-delete, restore, and permanent delete.

### Why this is its own microservice (not part of a monolith)

- **Bounded context:** Sandbox Control Server exclusively owns the K8s API surface. The decision of _how a sandbox pod is shaped, what containers it runs, what volumes it mounts, and when it is torn down_ belongs here alone. No other service holds the `@kubernetes/client-node` dependency or a ServiceAccount with cluster permissions.
- **Independent scaling need:** K8s API calls are slow and synchronous (pod scheduling, readiness polling). Placing this logic inside the Auth or AI service would introduce unpredictable latency on unrelated request paths. Isolating it means the K8s wait loops only block this service's thread pool.
- **Independent deployability:** Pod template changes (adding a sidecar, changing resource limits, updating the init-container image) iterate on a infrastructure cadence, not a feature cadence. Decoupling this lets infrastructure updates deploy without touching the AI or Auth release process.
- **Failure isolation:** If Sandbox Control Server goes down, existing running pods continue operating — users can keep coding. New project creation and stop/start lifecycle operations fail, but active sessions are unaffected because the Router and Agent sidecar are independent processes inside the pod.
- **Data isolation strategy:** Database-per-service. Sandbox Control Server owns its MongoDB database (project metadata, sandbox state). Redis is used for TTL-based session liveness tracking shared with the Router Service — this is an intentional shared cache (not a shared database), documented here explicitly.

### The "User" of this service

| Caller | Call type | Why it calls this service |
|---|---|---|
| Frontend SPA | Sync REST | Project CRUD, start/stop sandbox lifecycle (`POST /api/sandbox/create-project`, `GET /api/sandbox/projects`, `POST /api/sandbox/start/:projectId`, `POST /api/sandbox/stop/:projectId`) |
| Router Service | Redis TTL read | Router reads the Redis TTL to confirm a sandbox session is live before proxying traffic — does not call this service's REST API directly |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v1.0.0 |
| **Last deployed** | 2026-07 |
| **Owner(s)** | Sahil Sharma |
| **Known technical debt** | Pod readiness is polled via a `kubectl`-style watch loop rather than a proper K8s Watch API stream. This means there is a polling delay on the "sandbox is ready" signal sent to the frontend. A K8s informer/watch stream would reduce startup-to-ready latency and eliminate polling overhead. Additionally, pod deletion on project permanent-delete does not wait for pod termination confirmation — there is a window where the pod is still running after the API call returns. |

### Features built (working today)

- `POST /api/sandbox/create-project` — Creates a project record in MongoDB, provisions a K8s Pod + Service, registers a Redis TTL entry — ✅ done
- `GET /api/sandbox/projects` — Lists all active projects for the authenticated user — ✅ done
- `GET /api/sandbox/projects/trash` — Lists soft-deleted projects — ✅ done
- `GET /api/sandbox/project/:projectId` — Returns live pod status (pending/running/failed) polled from K8s — ✅ done
- `POST /api/sandbox/start/:projectId` — Re-provisions a stopped project's K8s Pod and Service — ✅ done
- `POST /api/sandbox/stop/:projectId` — Deletes the K8s Pod and Service, preserving the project record and S3 workspace — ✅ done
- `DELETE /api/sandbox/project/:projectId` — Soft-deletes the project (moves to trash) — ✅ done
- `PATCH /api/sandbox/project/:projectId/restore` — Restores a soft-deleted project — ✅ done
- `DELETE /api/sandbox/project/:projectId/permanent` — Hard-deletes the project record and tears down K8s resources — ✅ done

### How it was built
- **Language/runtime:** Node.js 20, ESM (`"type": "module"`)
- **Framework:** Express 5
- **Design patterns used:**
  - **Controller → Service → Kubernetes client layering** — Controllers parse HTTP input and call service functions; services invoke the `@kubernetes/client-node` API or Mongoose models. K8s client instantiation is isolated in the `kubernetes/` config directory.
  - **Soft-delete pattern** — `Project.model.js` has a `deletedAt` field; queries filter `deletedAt: null` by default, enabling the trash/restore workflow without data loss.
  - **UUID-based sandbox IDs** — Each sandbox gets a UUID (`uuid` package) used consistently as the K8s resource name suffix, the Redis key, and the subdomain prefix that the Router Service routes against.
  - **Redis TTL for session liveness** — On pod start, a Redis key `sandbox:<sandboxId>` is set with a TTL. The Router Service reads this key to confirm the session is live. When the pod is stopped, the key is deleted. This avoids any synchronous call from Router → Sandbox Server on every proxied request.
- **Key libraries:** `@kubernetes/client-node`, `mongoose`, `ioredis`, `jsonwebtoken`, `cookie-parser`, `uuid`, `morgan`

---

## 🏗️ Architecture & Design Patterns

Standard controller → service → model stack. The Kubernetes interaction layer is further isolated in a `kubernetes/` directory containing the client configuration and pod/service manifest builders. This means the pod template (containers, volumes, resource limits) is co-located with the K8s client code, not scattered across controllers.

```
Sandbox/server/
├── server.js                          # Entry — binds Express, connects DB
└── src/
    ├── app/
    │   └── app.js                     # Express setup, middleware, route mounting
    ├── config/
    │   └── db.js                      # Mongoose connection
    ├── controllers/
    │   └── sandbox.controller.js      # Project CRUD + lifecycle request handlers
    ├── kubernetes/
    │   └── (k8s client init, pod manifest builder, service manifest builder)
    ├── middleware/
    │   └── auth.middleware.js         # identifyUser — JWT verification
    ├── models/
    │   └── Project.model.js           # projectId, sandboxId, userId, status, deletedAt
    └── routes/
        └── sandbox.routes.js
```

---

## ⚙️ Usage & Setup

### Environment variables
> Keys and fake example values only. Never a real secret, connection string, or token.

| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `PORT` | ✅ | Port the service listens on | `3000` |
| `MONGO_URI` | ✅ | MongoDB connection string for the sandbox database | `mongodb+srv://user:FAKE@cluster.mongodb.net/sandbox` |
| `JWT_ACCESS_SECRET` | ✅ | Shared JWT signing secret (same as Auth Service) | `your-256-bit-random-secret` |
| `REDIS_URI` | ✅ | Redis connection URL (shared with Router Service for sandbox TTL) | `redis://default:password@host:port` |

> **K8s access:** In-cluster, the service uses the `resource-manager` ServiceAccount (configured in `k8s/rabc.yml`) — no explicit K8s credentials env var is needed when running inside the cluster.

### Run locally
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start in dev mode (nodemon)
npm run dev

# 4. Run tests (not yet implemented)
npm test
```

### Run via Docker / Skaffold
```bash
# Build image locally
docker build -t sandbox:local .

# Run as part of the full cluster (requires K8s context to be active)
skaffold dev
# Declared in skaffold.yml as image: sandbox, context: Sandbox/server
```

---

## 🔌 Communication & Contracts

### Synchronous (REST)
| Direction | Protocol | Endpoint | Counterpart |
|---|---|---|---|
| Inbound | REST | `POST /api/sandbox/create-project` | Frontend SPA (via Ingress `/api/sandbox/*`) |
| Inbound | REST | `GET /api/sandbox/projects` | Frontend SPA |
| Inbound | REST | `GET /api/sandbox/projects/trash` | Frontend SPA |
| Inbound | REST | `GET /api/sandbox/project/:projectId` | Frontend SPA (polls for pod status) |
| Inbound | REST | `POST /api/sandbox/start/:projectId` | Frontend SPA |
| Inbound | REST | `POST /api/sandbox/stop/:projectId` | Frontend SPA |
| Inbound | REST | `DELETE /api/sandbox/project/:projectId` | Frontend SPA |
| Inbound | REST | `PATCH /api/sandbox/project/:projectId/restore` | Frontend SPA |
| Inbound | REST | `DELETE /api/sandbox/project/:projectId/permanent` | Frontend SPA |
| Outbound | K8s API | Pod create/delete, Service create/delete | Kubernetes API Server (via `resource-manager` ServiceAccount) |
| Outbound | Redis write | `SET sandbox:<sandboxId>` with TTL | Redis (shared with Router Service) |

### Asynchronous (event/queue)
Sandbox Control Server does not produce or consume any RabbitMQ messages.

### Contract source of truth
[`src/routes/sandbox.routes.js`](./src/routes/sandbox.routes.js). No OpenAPI spec generated yet.

---

## 🛡️ Production Readiness

### Health & observability
- **Liveness:** No dedicated `/healthz` endpoint — gap. TCP probe used by K8s.
- **Readiness:** No dedicated `/ready` or `/readyz` endpoint — gap. A real check should verify MongoDB + Redis connectivity and K8s API reachability.
- **Graceful shutdown:** No SIGTERM handler — gap.
- **Structured logging:** `morgan` HTTP logging only — gap.
- **Tracing / Metrics:** Not implemented.

### Security & compliance
- **AuthN/AuthZ:** JWT verification on all routes via `identifyUser` middleware.
- **K8s RBAC:** Runs under the `resource-manager` ServiceAccount. Permissions defined in `k8s/rabc.yml`: `get`, `list`, `watch`, `create`, `delete` on `pods`, `services`.
- **CORS policy:** Configured at Express app level.
- **Secrets management:** K8s Secrets. Secret names: `database` (`SANDBOX`), `jwt` (`JWT_SECRET`), `aws` (for pod-injected sync-agent credentials).

### CI/CD & deployment
- **Container:** [`Sandbox/server/dockerfile`](./dockerfile) — Node 20 Alpine base.
- **Orchestration:** K8s Deployment: `k8s/sandbox-deployment.yml`, Service: `k8s/sandbox-service.yml`.
- **Pipeline:** No CI pipeline defined. Manual Skaffold for development.
- **Rollback strategy:** Manual `kubectl rollout undo`.

---

## 📝 Changelog & Migration State

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `v1.0.0` | 2026-07 | Initial release: full project CRUD, K8s pod lifecycle, Redis TTL session management | None — first release |

---

## 🤝 Ownership
- **Maintainer(s):** Sahil Sharma
- **Escalation:** Check project issues or contact the maintainer directly.
