# AI Sandbox — Cloud Code Editor & AI Orchestration Platform

An AI-powered, browser-based coding environment where every user gets an **isolated Kubernetes sandbox pod** containing a live Vite application, a file-management API sidecar, and an AI coding agent powered by [Mistral's Devstral model](https://mistral.ai/). Users can prompt the agent to build, edit, and fix React+Vite applications in real time — directly inside the browser.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Services](#services)
   - [AI Orchestration](#1-ai-orchestration)
   - [Sandbox Server](#2-sandbox-server)
   - [Router](#3-router)
   - [Agent Sidecar](#4-agent-sidecar)
   - [Template](#5-template)
3. [Kubernetes Infrastructure](#kubernetes-infrastructure)
   - [Static Deployments](#static-deployments)
   - [Dynamic Sandbox Pods](#dynamic-sandbox-pods)
   - [RBAC](#rbac)
   - [Ingress Routing](#ingress-routing)
4. [Agent Tools (File API)](#agent-tools-file-api)
5. [Planned Features](#planned-features)
   - [Terminal API](#terminal-api)
   - [Container Logs API](#container-logs-api)
   - [Web Code Editor](#web-code-editor)
6. [Development Setup](#development-setup)
7. [Project File Structure](#project-file-structure)
8. [Key Dependencies](#key-dependencies)

---

## Architecture Overview

```
 User (Browser)
      │
      ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │                       Nginx Ingress Controller                       │
 │                                                                      │
 │   /api/ai/*  ─────────────────────────────► ai-service              │
 │   /api/sandbox/* ─────────────────────────► sandbox-service         │
 │   *.preview.localhost ─────────────────────► router-service          │
 │   *.agent.localhost ───────────────────────► router-service          │
 └──────────────────────────────────────────────────────────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
  ┌─────────────┐       ┌──────────────────┐      ┌─────────────────┐
  │     AI      │       │  Sandbox Server  │      │     Router      │
  │Orchestration│       │ (creates pods &  │      │(sub-domain proxy│
  │  (Mistral)  │       │   services)      │      │   to pods)      │
  └──────┬──────┘       └──────────────────┘      └────────┬────────┘
         │                                                  │
         │                                                  ▼
         │                         ┌────────────────────────────────────┐
         │                         │       Sandbox Pod (per user)        │
         │                         │                                    │
         │                         │  ┌─────────────────────────────┐  │
         │                         │  │    sandbox-container         │  │
         │                         │  │   (Vite Dev Server :5173)   │  │
         │                         │  └──────────────┬──────────────┘  │
         │                         │                 │                  │
         │                         │  ┌──────────────▼──────────────┐  │
         └─────────────────────────┼──►    agent-container           │  │
             HTTP Tool Calls       │  │   (File API Server :3000)   │  │
                                   │  └──────────────┬──────────────┘  │
                                   │                 │                  │
                                   │  ┌──────────────▼──────────────┐  │
                                   │  │   Shared Volume /workspace   │  │
                                   │  └─────────────────────────────┘  │
                                   └────────────────────────────────────┘
```

---

## Services

### 1. AI Orchestration

**Location:** `Ai_orchestration/`  
**Port:** `3000`  
**K8s Deployment:** `k8s/ai-deployment.yml`

The brain of the system. A Node.js Express server that hosts the LangGraph ReAct agent built on the **Mistral Devstral** model.

- Receives user prompts via `POST /api/ai/...`
- Executes a multi-step agent loop using LangChain tools
- Each tool call makes an HTTP request to the target sandbox's **agent-container** API
- Uses a hardcoded `sandboxId` to route all tool calls to the correct pod

**Agent Tools registered:**

| Tool Name | HTTP Call | Purpose |
| :--- | :--- | :--- |
| `list_files` | `GET /api/agent/list-files` | List all workspace files |
| `read_file` | `GET /api/agent/read-file` | Read one or more file contents |
| `create_file` | `POST /api/agent/create-file` | Create new files (auto-creates parent dirs) |
| `update_file` | `PATCH /api/agent/update-file` | Overwrite existing file contents |

**System Prompt Strategy:**  
The agent follows a strict TODO-driven workflow (list → plan → write → tick → repeat) to stay within its LangGraph recursion limit budget of 100 tool calls. CSS/design rules are baked into the system prompt so the agent always generates production-grade React+Vite code.

---

### 2. Sandbox Server

**Location:** `Sandbox/server/`  
**Port:** `3000` (internal)  
**K8s Deployment:** `k8s/sandbox-deployment.yml`

The **control plane** for sandbox lifecycle management. This service runs permanently in the cluster and is responsible for dynamically creating and destroying Kubernetes resources on demand.

**Key Endpoints:**

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/sandbox/health` | Liveness probe |
| `GET` | `/api/sandbox/ready` | Readiness probe |
| `POST` | `/api/sandbox/start` | Creates a new sandbox pod + service, returns URLs |

When `POST /api/sandbox/start` is called:
1. Generates a UUID v7 as the `sandboxId`
2. Calls `createPod(sandboxId)` → provisions a pod with 3 containers (init + sandbox + agent) and a shared `emptyDir` volume
3. Calls `createService(sandboxId)` → creates a ClusterIP service exposing ports `80` → `5173` and `3000` → `3000`
4. Returns `previewUrl` and `agentUrl` to the caller

**Returns:**
```json
{
  "status": "success",
  "message": "Sandbox with ID <uuid> created successfully",
  "previewUrl": "http://<sandboxId>.preview.localhost",
  "agentUrl": "http://<sandboxId>.agent.localhost/api/agent/list-files"
}
```

---

### 3. Router

**Location:** `Sandbox/router/`  
**Port:** `3000`  
**K8s Deployment:** `k8s/router-deployment.yml`

A thin reverse proxy that reads the incoming **sub-domain** to determine which sandbox pod to forward the request to. It uses `http-proxy-middleware` and caches proxy instances per `sandboxId` to avoid re-creation on every request.

**Sub-domain Routing Logic:**

| Host Pattern | Forwards To | Port |
| :--- | :--- | :--- |
| `<sandboxId>.preview.localhost` | `sandbox-service-<sandboxId>` | `80` (Vite app) |
| `<sandboxId>.agent.localhost` | `sandbox-service-<sandboxId>` | `3000` (Agent API) |

Both proxies have `ws: true` enabled so WebSocket connections (live Vite HMR and future terminal streams) are forwarded correctly.

---

### 4. Agent Sidecar

**Location:** `Sandbox/Agent/`  
**Port:** `3000`  
**Container Name:** `agent-container` (inside each sandbox pod)

A lightweight Express server that runs as a **sidecar** inside every sandbox pod. It has direct filesystem access to `/workspace` (the shared volume) and exposes REST APIs for file management.

**All routes are prefixed with `/api/agent/`:**

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/agent/health` | Liveness probe |
| `GET` | `/api/agent/ready` | Readiness probe |
| `GET` | `/api/agent/list-files` | Recursively list all workspace files (skips `node_modules`, `.git`) |
| `GET` | `/api/agent/read-file?files=a,b,c` | Read one or many files by relative path |
| `PATCH` | `/api/agent/update-file` | Overwrite one or many files |
| `POST` | `/api/agent/create-file` | Create one or many files (auto-creates parent directories) |

**Security:** All file paths are validated with `path.resolve()` + prefix check to prevent path traversal attacks (e.g., `../../etc/passwd` is rejected).

---

### 5. Template

**Location:** `Sandbox/template/`  
**Container:** Used as both `init-container` and `sandbox-container`

A pre-built Docker image containing a blank React+Vite project at `/workspace`. The **init container** copies this template into the shared `emptyDir` volume on pod startup so every sandbox starts from the same clean slate.

---

## Kubernetes Infrastructure

### Static Deployments

These deployments run permanently in the cluster:

| Deployment | Image | Replicas | Service Port |
| :--- | :--- | :--- | :--- |
| `ai-deployment` | `ai-orchestration` | 2 | `80` → `3000` |
| `sandbox-deployment` | `sandbox` | 1 | `80` → `3000` |
| `router-deployment` | `router` | 1 | `80` → `3000` |

### Dynamic Sandbox Pods

Each sandbox pod is created on-demand by the Sandbox Server. A pod contains:

| Container | Image | Role | Port |
| :--- | :--- | :--- | :--- |
| `init-container` | `template` | Seed workspace volume | — |
| `sandbox-container` | `template` | Run Vite Dev Server | `5173` |
| `agent-container` | `agent` | Host File API for AI | `3000` |

All containers share a single `emptyDir` volume mounted at `/workspace`.

### RBAC

**File:** `k8s/rabc.yml`

The Sandbox Server needs permission to create pods and services dynamically. A `ServiceAccount` named `resource-manager` is granted a `Role` that allows:

```yaml
resources: ["pods", "services", "deployment"]
verbs:     ["get", "list", "watch", "create", "delete"]
```

> ⚠️ **Important:** To enable the planned Terminal feature, you must also add `pods/exec` with verb `create` to this role. See [Planned Features → Terminal API](#terminal-api).

### Ingress Routing

**File:** `k8s/ingress.yml` — Uses `nginx` IngressClass.

| Rule | Backend Service | Port |
| :--- | :--- | :--- |
| Path `/api/sandbox` | `sandbox-service` | `80` |
| Path `/api/ai` | `ai-service` | `80` |
| Host `*.preview.localhost` | `router-service` | `80` |
| Host `*.agent.localhost` | `router-service` | `80` |

The ingress sets long timeouts (`proxy-read-timeout: 300s`) to accommodate LLM agent responses that may take several seconds.

---

## Agent Tools (File API)

All agent tools live in `Ai_orchestration/src/agent/tool.js` and call the agent sidecar. The `sandboxId` is currently hardcoded in this file — in production this would be passed dynamically per user session.

```
tool.js
 ├── listFiles     → GET  /api/agent/list-files
 ├── readFile      → GET  /api/agent/read-file?files=...
 ├── createFile    → POST /api/agent/create-file
 └── updateFile    → PATCH /api/agent/update-file
```

Tools are registered in `code.agent.js` using `createReactAgent` from `@langchain/langgraph`:

```javascript
const agent = createReactAgent({
    llm: model,                   // Mistral Devstral
    tools: [listFiles, readFile, createFile, updateFile],
    stateModifier: SYSTEM_PROMPT, // Elite frontend engineer persona
});
```

---

## Planned Features

### Terminal API

> 📄 Full implementation guide: [Terminal.md](./Terminal.md)

Give the AI agent (and the user) the ability to run shell commands directly inside the sandbox workspace — for example, `npm install`, `npm run build`, or `npm test`.

**Implementation Plan:**

**1. Add `execute-command` route to the Agent Sidecar** (`Sandbox/Agent/src/app.js`):
```javascript
import { exec } from "child_process";

app.post("/api/agent/execute", (req, res) => {
  const { command } = req.body;
  exec(command, { cwd: "/workspace", timeout: 30000 }, (error, stdout, stderr) => {
    res.status(200).json({
      exitCode: error ? error.code : 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  });
});
```

**2. Add `execute_command` LangChain tool** (`Ai_orchestration/src/agent/tool.js`):
```javascript
export const executeCommand = tool(
  async ({ command }) => {
    const response = await axios.post(
      `http://sandbox-service-${sandboxId}:3000/api/agent/execute`,
      { command }
    );
    return JSON.stringify(response.data);
  },
  {
    name: "execute_command",
    description: "Run shell commands (npm install, npm run build, npm test) in the workspace.",
    schema: z.object({ command: z.string() }),
  }
);
```

**3. Register tool in agent:**
```javascript
tools: [listFiles, readFile, createFile, updateFile, executeCommand]
```

---

### Container Logs API

> 📄 Full implementation guide: [Terminal.md](./Terminal.md)

Let the agent query the **Vite dev server logs** from the `sandbox-container` to detect runtime errors, missing dependencies, or failed builds.

**Implementation Plan:**

**1. Add `pods/log` to the RBAC Role** (`k8s/rabc.yml`):
```yaml
- apiGroups: [""]
  resources: ["pods", "pods/log", "services"]
  verbs: ["get", "list", "watch", "create", "delete"]
```

**2. Add log endpoint to the Sandbox Server** (`Sandbox/server/src/app/app.js`):
```javascript
app.get("/api/sandbox/:sandboxId/logs", async (req, res) => {
  const { sandboxId } = req.params;
  const response = await k8sCoreV1Api.readNamespacedPodLog({
    name: `sandbox-pod-${sandboxId}`,
    namespace: "default",
    container: "sandbox-container",
    tailLines: 100,
  });
  res.status(200).json({ status: "success", logs: response.body });
});
```

**3. Add `get_container_logs` LangChain tool** (`Ai_orchestration/src/agent/tool.js`):
```javascript
export const getContainerLogs = tool(
  async () => {
    const response = await axios.get(
      `http://sandbox-service-${sandboxId}/api/sandbox/${sandboxId}/logs`
    );
    return JSON.stringify(response.data);
  },
  {
    name: "get_container_logs",
    description: "Fetch runtime stdout/stderr logs from the Vite app container to check for startup errors.",
    schema: z.object({}),
  }
);
```

---

### Web Code Editor

> 📄 Full implementation guide: [Editor.md](./Editor.md)

Allow the user to view and edit files inside their sandbox directly in the browser — so they can fix AI agent typos or make manual tweaks without needing a separate IDE.

Two implementation paths are available:

#### Option A: Monaco Editor (Recommended — Zero Backend Cost)

Embed the VS Code engine in your React dashboard UI. Reads and saves files via the existing Agent File API.

```bash
npm install @monaco-editor/react
```

```javascript
import Editor from '@monaco-editor/react';

// Load: GET /api/agent/read-file?files=src/App.jsx
// Save: PATCH /api/agent/update-file  { updates: [{ file, content }] }
```

✅ No extra containers. ✅ Reuses existing APIs. ✅ Full Monaco IntelliSense.

#### Option B: Cloud IDE (code-server in Pod)

Add a third container running `codercom/code-server` inside every sandbox pod. Serves a full VS Code UI over HTTP on port `8080`.

**Add to `pod.js`:**
```javascript
{
  image: "codercom/code-server:latest",
  name: "editor-container",
  ports: [{ containerPort: 8080 }],
  args: ["--auth", "password", "--bind-addr", "0.0.0.0:8080", "/workspace"],
  volumeMounts: [{ name: "workspace-volume", mountPath: "/workspace" }]
}
```

**Add sub-domain routing in `router/src/app.js`:**
Adds `*.editor.localhost` → port `8080` routing alongside the existing `preview` and `agent` routes.

| Option | Memory Per Pod | Setup | Best For |
| :--- | :--- | :--- | :--- |
| Monaco Editor | 0 MB (client-side) | Add npm package | Custom UI, embedded in your dashboard |
| code-server | ~300–500 MB | New container | Full VS Code features, extensions, terminal |

---

## Development Setup

### Prerequisites

- [Docker](https://www.docker.com/)
- [Kubernetes](https://kubernetes.io/) (local cluster via [Minikube](https://minikube.sigs.k8s.io/) or [Kind](https://kind.sigs.k8s.io/))
- [Skaffold](https://skaffold.dev/) — for hot-reload development
- [Nginx Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- A `MISTRALAI_API_KEY` secret in Kubernetes

### 1. Create the AI API Key Secret

```bash
kubectl create secret generic ai-secret \
  --from-literal=MISTRALAI_API_KEY=<your-key>
```

### 2. Install Nginx Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml
```

### 3. Start Development with Skaffold

```bash
skaffold dev
```

Skaffold will:
- Build Docker images for all 5 artifacts (`ai-orchestration`, `agent`, `router`, `template`, `sandbox`)
- Apply all K8s manifests from `k8s/`
- Watch `src/**` in each service for hot-reload file sync

### 4. Access the Services

| Service | URL |
| :--- | :--- |
| AI API | `http://localhost/api/ai/healthz` |
| Sandbox API | `http://localhost/api/sandbox/health` |
| Preview (after sandbox start) | `http://<sandboxId>.preview.localhost` |
| Agent API (after sandbox start) | `http://<sandboxId>.agent.localhost/api/agent/list-files` |

---

## Project File Structure

```
Capstone/
├── skaffold.yml                     # Skaffold build + deploy config
│
├── k8s/                             # Kubernetes manifests
│   ├── ai-deployment.yml
│   ├── ai-service.yml
│   ├── router-deployment.yml
│   ├── router-service.yml
│   ├── sandbox-deployment.yml
│   ├── sandbox-service.yml
│   ├── ingress.yml
│   └── rabc.yml                     # ServiceAccount + Role + RoleBinding
│
├── Ai_orchestration/                # AI Agent Service
│   └── src/
│       ├── app/app.js               # Express app, health routes
│       ├── routes/ai.routes.js      # Agent request routing
│       └── agent/
│           ├── code.agent.js        # LangGraph agent definition
│           └── tool.js              # LangChain tool definitions
│
└── Sandbox/
    ├── server/                      # Sandbox Server (pod lifecycle)
    │   └── src/
    │       ├── app/app.js           # Express app, /start endpoint
    │       └── kubernetes/
    │           ├── config.js        # k8s client setup (in-cluster)
    │           ├── pod.js           # createPod() function
    │           └── service.js       # createService() function
    │
    ├── router/                      # Router (sub-domain proxy)
    │   └── src/app.js
    │
    ├── Agent/                       # Agent Sidecar (file API)
    │   └── src/app.js               # list/read/create/update file routes
    │
    └── template/                    # Blank React+Vite seed project
```

---

## Key Dependencies

| Package | Service | Purpose |
| :--- | :--- | :--- |
| `@langchain/mistralai` | AI Orchestration | Mistral Devstral LLM client |
| `@langchain/langgraph` | AI Orchestration | ReAct agent loop |
| `@langchain/core` | AI Orchestration | Tool definition helpers |
| `zod` | AI Orchestration | Tool schema validation |
| `axios` | AI Orchestration | HTTP calls to Agent Sidecar |
| `@kubernetes/client-node` | Sandbox Server | Kubernetes API (create pods/services) |
| `uuid` | Sandbox Server | Generate sandbox UUIDs |
| `http-proxy-middleware` | Router | Sub-domain reverse proxy |
| `express` | All services | HTTP server |
| `morgan` | All services | HTTP request logging |
| `nodemon` | All services (dev) | Hot-reload for Node.js |