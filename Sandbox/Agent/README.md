# 🖥️ Sandbox Agent (Sidecar)

> Runs inside every user's sandbox pod as the filesystem and terminal API — gives the AI agent and browser terminal secure, scoped access to `/workspace` without ever exposing a shell to the open internet.

![Version](https://img.shields.io/badge/version-1.0.1-blue)
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
Sandbox Agent is a sidecar process deployed in every user's sandbox pod alongside the Vite dev server. It serves two distinct responsibilities:
1. **File System API** — Provides a structured REST+Socket.io API for reading, writing, creating, and deleting files and directories within `/workspace`. This is the only interface through which the AI Orchestration service's tool layer touches the user's code.
2. **Terminal Bridge** — Spawns a `node-pty` pseudo-terminal process and bridges its I/O over Socket.io, giving the browser's `xterm.js` client a real interactive shell inside the container.

It also uses `chokidar` to watch `/workspace` for file changes and emit real-time file-tree diff events to connected clients.

### Why this is its own microservice (not part of a monolith)

- **Bounded context:** The sidecar exclusively owns filesystem access and terminal I/O within one sandbox pod. The AI Orchestration service knows what files to read/write; the sidecar is the only thing that actually touches the filesystem. Keeping this boundary clean means the AI can never accidentally escape its intended scope.
- **Independent scaling need:** There is one sidecar instance per user pod — it scales exactly with the number of active sandboxes, not with any shared service. Its resource profile (filesystem I/O, PTY process, chokidar watcher) is tied entirely to one user's session and must be co-located with that user's files in the shared `emptyDir` volume.
- **Independent deployability:** Sidecar changes (new file API endpoints, PTY configuration, chokidar ignore patterns) can be deployed by updating the pod template in the Sandbox Control Server without touching the AI Orchestration or Auth services.
- **Failure isolation:** If the sidecar crashes, only that user's terminal and file editing break. Other users' sandboxes are unaffected (each pod has its own sidecar). The Vite dev server in the same pod continues running — the user can still see their preview.
- **Data isolation strategy:** No database. The sidecar reads and writes only to the pod's shared `emptyDir` volume (`/workspace`). All persistence is delegated to the Sync Agent, which watches the same directory and mirrors changes to S3.

### The "User" of this service

| Caller | Call type | Why it calls this service |
|---|---|---|
| AI Orchestration Service (LangGraph tools) | HTTP REST (via Router Service → agent subdomain) | Tool calls: read file, write file, list directory, execute command, create file |
| Frontend SPA (xterm.js terminal) | WebSocket via Socket.io (via Router Service → agent subdomain) | Real-time terminal I/O: `terminal-input` / `terminal-output` events |
| Frontend SPA (file explorer) | WebSocket via Socket.io | Real-time file tree change events from `chokidar` watcher |
| Yjs collaborative editing (if enabled) | Socket.io | Document sync events for collaborative real-time editing |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟢 Production |
| **Version** | v1.0.1 |
| **Last deployed** | 2026-07 |
| **Owner(s)** | Sahil Sharma |
| **Known technical debt** | The PTY process runs as whatever user the container runs as — there is no user sandboxing below the container boundary. A user with terminal access can access anything the container user can. This is acceptable in the current single-user-per-pod model but would be a security concern if pods were ever shared. Additionally, the `chokidar` watcher fires events for every file change including those made by the sync-agent pulling files from S3 on startup, which can produce a burst of events on fresh pod launch. |

### Features built (working today)

- File System API (HTTP REST):
  - `GET /api/agent/files` — List directory contents (recursive file tree) — ✅ done
  - `GET /api/agent/file` — Read a single file's content — ✅ done
  - `POST /api/agent/create-file` — Create a new file at a given path — ✅ done
  - `PATCH /api/agent/update-file` — Write/overwrite a file's content — ✅ done
  - `DELETE /api/agent/delete-file` — Delete a file — ✅ done
  - `POST /api/agent/execute` — Execute a shell command and return stdout/stderr — ✅ done
- Terminal Bridge (Socket.io):
  - `terminal-input` event → writes to PTY stdin — ✅ done
  - `terminal-output` event → emits PTY stdout to client — ✅ done
  - `terminal-resize` event → resizes the PTY window — ✅ done
- File watcher (chokidar → Socket.io):
  - `file-change` event emitted on create/modify/delete inside `/workspace` — ✅ done
- Yjs document sync for collaborative editing — ✅ done (via `yjs` package)

### How it was built
- **Language/runtime:** Node.js 20, ESM (`"type": "module"`)
- **Framework:** Express 5 + Socket.io 4
- **Design patterns used:**
  - **Sidecar pattern** — This service is not independently deployed; it always runs co-located with the Vite sandbox container in the same K8s Pod, sharing a volume mount. The boundary is enforced at the pod template level in the Sandbox Control Server.
  - **Event bridge** — PTY output and file watcher events are bridged directly to Socket.io without buffering or transformation. This keeps the terminal latency minimal and avoids a separate polling mechanism.
  - **Single `app.js` architecture** — The entire service logic lives in one file (`src/app.js`) because the surface area is small and well-bounded. A layered controller structure would be premature overhead for a service with this scope.
- **Key libraries:** `socket.io`, `node-pty`, `chokidar`, `yjs`, `@kubernetes/client-node` (for cluster metadata reads), `express`, `morgan`

---

## 🏗️ Architecture & Design Patterns

All logic lives in `src/app.js`. Express handles REST file API endpoints. Socket.io handles terminal I/O and file-watcher event streaming. The `node-pty` process is spawned once per connected terminal client and torn down on disconnect. The `chokidar` watcher is a single instance watching `/workspace`, broadcasting events to all connected Socket.io clients in the room.

```
Sandbox/Agent/
├── server.js               # Entry — starts Express+Socket.io on port 3000
└── src/
    └── app.js              # All logic: file API routes, PTY bridge, chokidar watcher, Socket.io handlers
```

---

## ⚙️ Usage & Setup

### Environment variables
> The sidecar inherits environment from the pod spec injected by the Sandbox Control Server. Keys and fake example values only.

| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `PORT` | ✅ | Port the sidecar listens on | `3000` |
| `WORKSPACE_DIR` | ❌ | Root directory for file operations (defaults to `/workspace`) | `/workspace` |

> **Injected by pod spec:** No `.env` file exists — the Sandbox Control Server sets environment variables in the pod manifest when provisioning the container.

### Run locally (for development/testing)
```bash
# 1. Install dependencies
npm install

# 2. Start in dev mode (nodemon)
npm run dev
# Listens on port 3000; /workspace defaults to the local filesystem path
```

### Run via Docker / Skaffold
```bash
# Build image locally
docker build -t agent:local .

# Run as part of the full cluster (deployed as a sidecar in each sandbox pod)
skaffold dev
# Declared in skaffold.yml as image: agent, context: Sandbox/Agent
# In production: pod template in Sandbox/server/src/kubernetes/ references this image
```

---

## 🔌 Communication & Contracts

### Synchronous (REST) — File API
| Direction | Protocol | Endpoint | Counterpart |
|---|---|---|---|
| Inbound | REST | `GET /api/agent/files` | AI Orchestration tool layer (via Router agent subdomain) |
| Inbound | REST | `GET /api/agent/file?path=<path>` | AI Orchestration tool layer |
| Inbound | REST | `POST /api/agent/create-file` | AI Orchestration tool layer |
| Inbound | REST | `PATCH /api/agent/update-file` | AI Orchestration tool layer + Frontend Monaco editor |
| Inbound | REST | `DELETE /api/agent/delete-file` | AI Orchestration tool layer |
| Inbound | REST | `POST /api/agent/execute` | AI Orchestration tool layer (shell command execution) |

### Asynchronous (Socket.io)
| Event | Direction | Description |
|---|---|---|
| `terminal-input` | Inbound from client | User keystroke → PTY stdin |
| `terminal-output` | Outbound to client | PTY stdout → xterm.js render |
| `terminal-resize` | Inbound from client | Resize PTY dimensions |
| `file-change` | Outbound to client | chokidar file create/modify/delete event |
| Yjs sync events | Bidirectional | Collaborative document state sync |

### Contract source of truth
[`src/app.js`](./src/app.js) — all route and Socket.io event definitions are co-located in one file.

---

## 🛡️ Production Readiness

### Health & observability
- **Liveness:** No dedicated `/healthz` endpoint — gap. K8s uses TCP probe on port 3000.
- **Readiness:** No dedicated `/ready` or `/readyz` endpoint — gap.
- **Graceful shutdown:** No SIGTERM handler — gap. PTY processes are orphaned if the container is killed ungracefully.
- **Structured logging:** `morgan` for HTTP; `console.log` for Socket.io events — partial.
- **Tracing / Metrics:** Not implemented.

### Security & compliance
- **AuthN/AuthZ:** No authentication on the sidecar REST API — it relies on the Router Service to only forward traffic from the correct authenticated session. Traffic reaches the sidecar via `*.agent.<domain>` which is a non-guessable subdomain formed from the sandboxId. A JWT check on each request would be the correct hardening step.
- **Command execution:** `POST /api/agent/execute` runs arbitrary shell commands inside the container. This is intentional (AI agent needs to run build tools, git commands, etc.) and is scoped to the container — which is single-user. The risk surface is the same as giving the user a terminal.
- **Secrets management:** No secrets held by the sidecar itself.

### CI/CD & deployment
- **Container:** [`Sandbox/Agent/dockerfile`](./dockerfile) — Node 20 base (requires `node-pty` native bindings; Alpine is not compatible).
- **Orchestration:** Not an independent K8s Deployment — runs as a container in each dynamically-provisioned sandbox Pod (defined in the pod template in Sandbox Control Server).
- **Skaffold:** `image: agent` in `skaffold.yml` — the image is built by Skaffold and referenced by the pod template at deploy time.

---

## 📝 Changelog & Migration State

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `v1.0.1` | 2026-07 | Added Yjs document sync support | Requires frontend to use matching Yjs provider version |
| `v1.0.0` | 2026-06 | Initial release: file API, PTY terminal bridge, chokidar file watcher | None |

---

## 🤝 Ownership
- **Maintainer(s):** Sahil Sharma
- **Escalation:** Check project issues or contact the maintainer directly.
