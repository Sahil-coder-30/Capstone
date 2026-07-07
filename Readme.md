# AI Sandbox — Cloud Code Editor & AI Orchestration Platform

An enterprise-grade, browser-based coding environment where every user gets an **isolated Kubernetes sandbox pod** containing a live React/Vite development server, an S3 workspace synchronization daemon, an interactive terminal, and an AI coding agent. 

Built using a **MERN + Kubernetes (K8s)** microservice architecture, the platform enables users and AI agents to write, test, preview, and deploy applications securely and in real time.

---

## Table of Contents

1. [Architecture & System Flow](#1-architecture--system-flow)
2. [Core Microservices Directory](#2-core-microservices-directory)
3. [Frontend Architecture & State Management](#3-frontend-architecture--state-management)
4. [Kubernetes Infrastructure & Orchestration](#4-kubernetes-infrastructure--orchestration)
5. [User Manual: Step-by-Step Platform Usage](#5-user-manual-step-by-step-platform-usage)
6. [Model Context Protocol (MCP) Connectors](#6-model-context-protocol-mcp-connectors)
7. [GitHub App Integration & Credential Security](#7-github-app-integration--credential-security)
8. [Developer Runbook & Deployment Setup](#8-developer-runbook--deployment-setup)
9. [API Catalog & Reference](#9-api-catalog--reference)
10. [Configuration Matrix (Environment Variables)](#10-configuration-matrix-environment-variables)
11. [Workspace Directory Mapping](#11-workspace-directory-mapping)

---

## 1. Architecture & System Flow

The AI Sandbox operates as a distributed system across core services (managing authentication, AI models, and databases) and dynamic, isolated user sandbox environments in Kubernetes.

```
                          User (Browser UI / Terminal)
                                      │
                                      ▼
     ┌──────────────────────────────────────────────────────────────────┐
     │                     Nginx Ingress Controller                     │
     │                                                                  │
     │  /api/auth/* ─────────► auth-service                             │
     │  /api/github/* ───────► github-service                           │
     │  /api/ai/* ───────────► ai-service                               │
     │  /api/sandbox/* ──────► sandbox-service                          │
     │  *.preview.localhost ─► router-service (proxies to Vite App)     │
     │  *.agent.localhost ───► router-service (proxies to Sidecar API)  │
     └──────────────────────────────────────────────────────────────────┘
            │               │                │               │
            ▼               ▼                ▼               ▼
     ┌─────────────┐ ┌─────────────┐  ┌─────────────┐ ┌─────────────┐
     │    Auth     │ │   GitHub    │  │     AI      │ │   Sandbox   │
     │   Service   │ │   Service   │  │Orchestration│ │   Server    │
     │  (Express)  │ │  (Express)  │  │(LangGraph)  │ │(K8s Control)│
     └──────┬──────┘ └──────┬──────┘  └──────┬──────┘ └──────┬──────┘
            │               │                │               │
      MongoDB / Redis       └────────┬───────┘               │
      RabbitMQ Emitter               │                       ▼
            │                        │        ┌──────────────────────────────┐
            ▼                        │        │    Sandbox Pod (per user)    │
     ┌─────────────┐                 │        │                              │
     │Notification │                 │        │  ┌────────────────────────┐  │
     │   Service   │                 │        │  │   sandbox-container    │  │
     │(Mail Engine)│                 │        │  │ (Vite Dev Server :5173)│  │
     └─────────────┘                 │        │  └───────────▲────────────┘  │
                                     │        │              │ Shared        │
                                     │        │  ┌───────────▼────────────┐  │
                                     └────────┼─►│    agent-container     │  │
                                              │  │ (Sidecar File API :3000)│  │
                                              │  └───────────▲────────────┘  │
                                              │              │ /workspace    │
                                              │  ┌───────────▼────────────┐  │
                                              │  │       sync-agent       │  │
                                              │  │  (S3 Workspace Sync)   │  │
                                              │  └───────────┬────────────┘  │
                                              └──────────────┼───────────────┘
                                                             ▼
                                                      AWS S3 Storage
```

### Flow Cycles
* **Initialization**: When a user logs in and starts a project, the `sandbox-service` provisions a K8s pod. The template workspace is loaded, and the `sync-agent` checks S3. If user backups exist, they are pulled down to `/workspace`, overriding the blank templates.
* **Orchestration Loop**: The AI Agent receives prompts, creates a multi-step checklist, and utilizes custom filesystem and execution tools (File API) to build out the application. The Vite container auto-updates via HMR.
* **Credential Ingestion**: GitHub App OAuth is completed on the `auth-service`. When git operations are run, the `agent-container` sidecar dynamically fetches a short-lived token and configures git configs outside the watched workspace.

---

## 2. Core Microservices Directory

### A. Auth Service
* **Path**: `Auth/` | **Port**: `3000` | **Db**: MongoDB (`auth` db) + Redis
* **Role**: Identity gateway. Handles user onboarding, credentials verification (bcrypt), JWT generation, and profile configurations.
* **Token Storage**: Hosts the encryption code for GitHub App installation keys using `AES-256-GCM`.
* **State Manager**: Handles active session cache and publishes notifications/events onto RabbitMQ exchanges.

### B. GitHub Service
* **Path**: `Github/` | **Port**: `3000`
* **Role**: Integrates platform operations with the GitHub API. Provides listing, creation, and issue tracking dashboards.
* **Authentication**: Signs internal requests to the Auth Service using short-TTL (30s) JWTs to obtain active installation tokens.

### C. AI Orchestration Service
* **Path**: `Ai_orchestration/` | **Port**: `3000`
* **Role**: Brain of the AI Agent. Runs LangGraph ReAct loops using Mistral Devstral. Exposes LangChain tools to inspect the sandbox filesystem and execute commands.

### D. Sandbox Control Server
* **Path**: `Sandbox/server/` | **Port**: `3000` (internal)
* **Role**: Orchestrates Kubernetes resource lifecycles. Uses the official Kubernetes Node client to build, monitor, and clean up pods and services dynamically.

### E. Router Service
* **Path**: `Sandbox/router/` | **Port**: `3000`
* **Role**: Unified path/subdomain routing. Proxies client WebSocket and HTTP requests to the target pod's Vite server or Agent API using cached service maps.

### F. S3 Sync Agent
* **Path**: `Sandbox/sync-agent/`
* **Role**: Runs as a daemon container inside sandbox pods. Watches `/workspace` for real-time changes and synchronizes the directory structure with AWS S3.

### G. Notification Service
* **Path**: `Notification/`
* **Role**: Listens to RabbitMQ message streams and triggers email alerts (SMTP) for user quota limits, verification codes, and events.

### H. Frontend Web App
* **Path**: `Frontend/` | **Port**: `5173` (dev)
* **Role**: Client Dashboard. Includes Monaco Editor integration, WebSocket-based terminal using `xterm.js`, live preview frame, and chat assistant drawer.

---

## 3. Frontend Architecture & State Management

The frontend dashboard is designed as a feature-based, highly modular Single Page Application (SPA) built on **React** and bundled via **Vite**. Global state is managed using **Redux Toolkit** with asynchronous operations handled via Redux Thunks.

### Directory Structure & Modular Design
All code lives in [Frontend/src](file:///Users/home/Desktop/Capstone/Frontend/src), partitioned into reusable features:
* **`auth`**: Handles user login, registration, JWT session storage, and route authorization.
* **`sandbox`**: Manages K8s sandbox lifecycle actions (starting, restarting, retrieving health statuses) and retains active sandbox preview and agent URLs.
* **`editor`**: Mounts Monaco Editor (`@monaco-editor/react`) for code editing, maps the file explorer hierarchy recursively, and tracks open tabs.
* **`logs`**: Streams Vite container output, allowing users to watch compilation stages in real time.
* **`chat` & `coding-agent`**: Directs AI agent prompts. Contains the SSE reader that parses token streams from the LangGraph agent and renders active execution plans.
* **`settings`**: Manages appearance setups, theme selections, and GitHub integration connectivity.

### Redux State Store Topology
The global Redux store configures isolated slices of state in [store.js](file:///Users/home/Desktop/Capstone/Frontend/src/store.js):
```javascript
export const store = configureStore({
  reducer: {
    sandbox: sandboxReducer,     // status ('starting'|'running'), previewUrl, agentUrl
    editor: editorReducer,       // activeFile, openTabs, fileTree
    codingAgent: codingAgentReducer, // currentStep, agentSteps, isThinking
    copilot: copilotReducer,     // autocomplete states & selections
    logs: logsReducer,           // Vite server stderr/stdout logs
    auth: authReducer,           // activeUser, jwtToken, loginStatus
    settings: settingsReducer,   // layout, keybindings, theme config
  },
});
```

### Low-Latency Terminal Bridge
The terminal pane utilizes `@xterm/xterm` with the `@xterm/addon-fit` layout plugin to match container boundaries.
1. When the terminal mounts, a direct connection is established over Socket.io using a reverse-proxied route `/api/terminal-proxy/socket.io?sandboxId=...`.
2. Input events captured by `xterm.onData` emit a `terminal-input` WebSocket payload.
3. The sandbox `node-pty` process executes commands and emits back `terminal-output`, which is written directly to the xterm viewport with minimal latency.

---

## 4. Kubernetes Infrastructure & Orchestration

### Dynamic Pod Architecture
When a user launches a workspace, the Sandbox Server provisions a Pod containing:
* **`init-container`**: Pulls the starter React template and seeds the shared emptyDir volume.
* **`sandbox-container`**: Mounts `/workspace` and boots up the Vite Dev Server (port `5173`).
* **`agent-container`**: Mounts `/workspace`, runs the File System API sidecar, and initiates the terminal PTY process.
* **`sync-agent-container`**: Mounts `/workspace` and runs the file backup daemon.

### RBAC Requirements
The Sandbox Server relies on a ServiceAccount named `resource-manager` with cluster permissions configured in `k8s/rabc.yml`:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-manager-role
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "pods/exec", "services", "deployments"]
    verbs: ["get", "list", "watch", "create", "delete"]
```

---

## 5. User Manual: Step-by-Step Platform Usage

### Step 5.1: Signup & Session Login
* Navigate to the dashboard. Enter your email and password.
* The system saves your profile in MongoDB and sends a verification email via the RabbitMQ `Notification Service`.
* Once logged in, your browser retains a secured platform JWT.

### Step 5.2: Launch a Coding Sandbox
* Click **"New Project"**.
* The frontend hits `POST /api/sandbox/start`. The control plane schedules your pod, and the S3 Sync Agent checks for previous code backups.
* Once the pod status reports `running`, the dashboard mounts the file explorer, boots the terminal, and renders the live preview panel.

### Step 5.3: Work with Monaco Editor & Interactive Terminal
* Select any file in the explorer to load it into the **Monaco Editor**. Edits are patched via `PATCH /api/agent/update-file`.
* Use the terminal panel to run shell commands. Input is piped over Socket.io directly to `node-pty` in the sidecar.

### Step 5.4: Prompting the AI Coding Agent
* Open the **AI Chat** panel and enter a request.
* The orchestrator activates the LangGraph loop: planning steps, executing file updates, and verifying compilation.

### Step 5.5: Connecting GitHub & Syncing Repositories
* Navigate to Settings → Integrations → Connect GitHub.
* Authorize the platform's **GitHub App**.
* The Auth Service saves the authorized `installationId`. You can now run `git` operations inside the terminal.

---

## 6. Model Context Protocol (MCP) Connectors

The platform utilizes Anthropic's **Model Context Protocol (MCP)** to allow the AI Agent to dynamically connect to and orchestrate external applications (such as Postgres, Slack, Jira, Figma, or search APIs) without modifying the core orchestrator codebase.

```
                      ┌──────────────────────────────────────┐
                      │    AI Orchestration (MCP Client)     │
                      └──────────┬────────────────────┬──────┘
                                 │                    │
                  (SSE / WS)     │                    │ (SSE / WS)
            ┌────────────────────▼───┐            ┌───▼────────────────────┐
            │   Sandbox Local DB     │            │ External App Connector │
            │      MCP Server        │            │ (Slack/Jira MCP Server)│
            └────────────────────────┘            └────────────────────────┘
```

### Dynamic Application Integration
* **Host-to-Server Protocol**: The AI Orchestration agent acts as an **MCP Client (Host)**. On sandbox startup, it establishes connections to active MCP servers via Server-Sent Events (SSE) or WebSockets.
* **External Application Bridges**: MCP Servers act as isolated gateways to third-party applications. By exposing standard tool protocols, they allow the AI Agent to:
  * **Database Connectors**: Run schema queries and fetch diagnostics on sandboxed databases.
  * **Collaboration Tools**: Send progress notifications to Slack channels or fetch task updates from Jira cards.
  * **Design Integrations**: Fetch UI assets and color schemas from Figma layout models.
* **Security & Isolation**: The credentials and OAuth keys for these external integrations are isolated on the specific MCP server (which is protected inside the sandbox network namespace). The LLM orchestrator never touches or holds these raw third-party access tokens.
* **Dynamic Protocol Handshake**:
  1. The agent calls `tools/list` to fetch the schemas of all available operations.
  2. The tools are instantly registered inside the LangGraph ReAct loop.
  3. The agent triggers actions by sending a JSON-RPC request `tools/call` containing the tool name and arguments.

---

## 7. GitHub App Integration & Credential Security

Our platform enforces strict credential isolation to protect user access tokens.

### Dynamic Installation Tokens
* **Security Choice**: We use a **GitHub App**. The database only stores `installationId`. Raw access tokens are never saved.
* **Sandbox Isolation**: `.gitconfig` and `.git-credentials` are saved to the container user's home directory (`/root`), keeping them isolated from the project `/workspace`.
* **Sync Blockers**: The S3 backup daemon filters out credential paths.
* **LLM Leak Shields**: The `execute` endpoint sanitizes command subprocesses by deleting `GITHUB_TOKEN` from their environments and redacting token signatures from stdout/stderr.

---

## 8. Developer Runbook & Deployment Setup

### Prerequisites
* [Docker Desktop](https://www.docker.com/) or [Minikube](https://minikube.sigs.k8s.io/).
* [Skaffold CLI](https://skaffold.dev/).
* [Nginx Ingress Controller](https://kubernetes.github.io/ingress-nginx/).

### Launch Cluster
Boot the stack using Skaffold:
```bash
skaffold dev
```

### Local Hosts File Mapping
```text
127.0.0.1 sandbox.localhost
127.0.0.1 ai.localhost
127.0.0.1 router.localhost
127.0.0.1 *.preview.localhost
127.0.0.1 *.agent.localhost
```

---

## 9. API Catalog & Reference

### Auth Service APIs
* `POST /api/auth/register`: Create user.
* `GET /api/auth/github`: Initiate GitHub Auth.
* `DELETE /api/auth/github`: Revoke GitHub integration.

### Sandbox Control APIs
* `POST /api/sandbox/start`: Provisions a user pod and service.

### Sidecar Agent APIs
* `GET /api/agent/list-files`: List files.
* `PATCH /api/agent/update-file`: Update code content.

---

## 10. Configuration Matrix (Environment Variables)

| Variable Name | Purpose |
| :--- | :--- |
| `MONGO_URI` | Auth Service Database Connection |
| `REDIS_URL` | Session and Event Cache |
| `RABBITMQ_URL` | Event Message Broker |
| `GITHUB_APP_ID` | Application ID for token creation |
| `AWS_BUCKET_NAME` | Target S3 bucket for project code |

---

## 11. Workspace Directory Mapping

```
Capstone/
│
├── Ai_orchestration/                # Agent brain (LangGraph, MCP Host, tools)
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