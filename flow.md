# Project Flow & API Reference (Excluding the frontend folder)

This document explains the complete backend + infrastructure flow for the application, including how the AI agent reads files, writes frontend code, runs commands, and verifies the Vite app.

> Scope note: The analysis below covers everything except the separate frontend folder.

---

## 1) High-level project structure

### Root folders

- [Ai_orchestration](Ai_orchestration)  
  Main AI orchestration service. Receives user prompts and runs the LangGraph agent.
- [Sandbox](Sandbox)  
  Contains the sandbox control plane, router, agent API, and template project.
- [k8s](k8s)  
  Kubernetes deployment files for the AI service, sandbox service, router, and sandbox pods.
- [Auth](Auth)  
  Placeholder/identity-related area.
- [Notification](Notification)  
  Placeholder/notifications-related area.

### Key files

- [Ai_orchestration/server.js](Ai_orchestration/server.js)  
  Starts the AI orchestration service.
- [Ai_orchestration/src/app/app.js](Ai_orchestration/src/app/app.js)  
  Registers health endpoints and mounts the AI router.
- [Ai_orchestration/src/routes/ai.routes.js](Ai_orchestration/src/routes/ai.routes.js)  
  Handles the SSE `/api/ai/invoke` endpoint used by the frontend.
- [Ai_orchestration/src/agent/code.agent.js](Ai_orchestration/src/agent/code.agent.js)  
  Defines the AI agent, system prompt, and tool constraints.
- [Ai_orchestration/src/agent/tool.js](Ai_orchestration/src/agent/tool.js)  
  Wraps the sandbox APIs into agent tools.
- [Sandbox/server/src/app/app.js](Sandbox/server/src/app/app.js)  
  Creates sandbox pods/services.
- [Sandbox/router/src/app.js](Sandbox/router/src/app.js)  
  Routes subdomains to correct sandbox services.
- [Sandbox/Agent/src/app.js](Sandbox/Agent/src/app.js)  
  File system + command APIs for the sandbox container.
- [Sandbox/template](Sandbox/template)  
  Blank React + Vite project used to seed each sandbox.
- [skaffold.yml](skaffold.yml)  
  Local development/deployment automation.

---

## 2) Complete project flow

### Flow A — creating a sandbox for the user

1. User requests a new coding environment.
2. The sandbox control service receives `POST /api/sandbox/start`.
3. It generates a unique `sandboxId`.
4. It creates:
   - a pod with `init-container`, `sandbox-container`, and `agent-container`
   - a service exposing the preview and agent routes
5. The response returns:
   - `previewUrl` for the running app
   - `agentUrl` for agent/tool access

### Flow B — AI agent building frontend code

1. The frontend sends a request to `POST /api/ai/invoke`.
2. The AI orchestration service streams responses using SSE.
3. The agent uses tools to:
   - list workspace files
   - read files
   - create/update/patch files
   - execute commands
   - fetch Vite runtime errors
4. The agent writes React/Vite project files inside the sandbox workspace.
5. The sandbox dev server updates the live preview.

### Flow C — runtime verification

1. After edits, the agent calls `GET /api/agent/vite-runtime-errors`.
2. If logs show errors, the agent reads the broken file and fixes it.
3. The loop repeats up to 3 times.

---

## 3) API inventory

## 3.1 AI Orchestration APIs

### A. Health checks

| Method | Route             | Purpose                    | Input | Sample output                                            |
| ------ | ----------------- | -------------------------- | ----- | -------------------------------------------------------- |
| GET    | `/api/ai/healthz` | Check AI service health    | None  | `{ "status": "ok", "message": "AI service is healthy" }` |
| GET    | `/api/ai/readyz`  | Check AI service readiness | None  | `{ "status": "ok", "message": "AI service is ready" }`   |

### B. Main AI invocation

| Method | Route            | Purpose                            | Input                                                  | Sample output                                    |
| ------ | ---------------- | ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| POST   | `/api/ai/invoke` | Run the AI agent on a user request | JSON body `{ "message": string, "projectId": string }` | SSE stream with `event: final` and `event: done` |

#### Request body

```json
{
  "message": "Build a landing page for a tech startup",
  "projectId": "abc123"
}
```

#### Success SSE example

```text
event: final
data: "I built the landing page and updated the files."

event: done
data: [DONE]
```

#### Error SSE example

```text
event: error
data: {"message":"The AI provider is temporarily rate-limiting requests. Please wait a moment and try again.","code":"RATE_LIMIT"}
```

---

## 3.2 Sandbox Server APIs

### A. Health checks

| Method | Route                 | Purpose         | Input | Sample output                                                                |
| ------ | --------------------- | --------------- | ----- | ---------------------------------------------------------------------------- |
| GET    | `/api/sandbox/health` | Liveness probe  | None  | `{ "status": "ok", "message": "Sandbox API is working fine" }`               |
| GET    | `/api/sandbox/ready`  | Readiness probe | None  | `{ "status": "ready", "message": "Sandbox API is ready to accept traffic" }` |

### B. Sandbox creation

| Method | Route                | Purpose                      | Input | Sample output                                                                                                                                                              |
| ------ | -------------------- | ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/sandbox/start` | Create sandbox pod + service | None  | `{ "status": "success", "message": "Sandbox with ID ...", "previewUrl": "http://<id>.preview.localhost", "agentUrl": "http://<id>.agent.localhost/api/agent/list-files" }` |

#### Example output

```json
{
  "status": "success",
  "message": "Sandbox with ID 0198f7a0-12c0-7f2a-9d45 created successfully",
  "previewUrl": "http://0198f7a0-12c0-7f2a-9d45.preview.localhost",
  "agentUrl": "http://0198f7a0-12c0-7f2a-9d45.agent.localhost/api/agent/list-files"
}
```

---

## 3.3 Router APIs

The router is mainly a proxy layer; it does not expose a rich API surface.

| Method | Route                | Purpose                | Input | Sample output                                                                |
| ------ | -------------------- | ---------------------- | ----- | ---------------------------------------------------------------------------- |
| GET    | `/api/router/health` | Router health check    | None  | `{ "status": "ok", "message": "Sandbox API is working fine" }`               |
| GET    | `/api/router/ready`  | Router readiness check | None  | `{ "status": "ready", "message": "Sandbox API is ready to accept traffic" }` |

Routing behavior:

- `<sandboxId>.preview.localhost` → sandbox Vite app (supports WebSockets / HMR)
- `<sandboxId>.agent.localhost` → sandbox agent API (supports HTTP and WebSocket upgrade / Socket.io connections)

---

## 3.4 Agent Sidecar APIs (the main APIs used by the AI agent)

These are the most important APIs for frontend generation.

### A. Health and readiness

| Method | Route               | Purpose                   | Input | Sample output                                                              |
| ------ | ------------------- | ------------------------- | ----- | -------------------------------------------------------------------------- |
| GET    | `/api/agent/health` | Check agent API health    | None  | `{ "status": "ok", "message": "Agent API is working fine" }`               |
| GET    | `/api/agent/ready`  | Check agent API readiness | None  | `{ "status": "ready", "message": "Agent API is ready to accept traffic" }` |

### B. List files

| Method | Route                   | Purpose                    | Input | Sample output                                                     |
| ------ | ----------------------- | -------------------------- | ----- | ----------------------------------------------------------------- |
| GET    | `/api/agent/list-files` | Recursively list all files | None  | `{ "status": "ok", "files": ["index.html", "src/App.jsx", ...] }` |

Example output:

```json
{
  "status": "ok",
  "files": [
    "index.html",
    "src/main.jsx",
    "src/App.jsx",
    "src/App.css",
    "src/assets/hero.png"
  ]
}
```

### C. Read files

| Method | Route                              | Purpose                | Input                                                 | Sample output                                                                |
| ------ | ---------------------------------- | ---------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/api/agent/read-file?files=a,b,c` | Read one or many files | Query param `files` as comma-separated relative paths | `{ "status": "ok", "files": [{ "file": "src/App.jsx", "content": "..." }] }` |

Request example:

```http
GET /api/agent/read-file?files=src/App.jsx,src/index.css,index.html
```

Response example:

```json
{
  "status": "ok",
  "files": [
    {
      "file": "src/App.jsx",
      "content": "import React from 'react';\n\nfunction App() {\n  return <div>Hello</div>;\n}\n\nexport default App;"
    },
    {
      "file": "src/index.css",
      "content": "body { margin: 0; }"
    }
  ]
}
```

### D. Update existing files

| Method | Route                    | Purpose                     | Input                                                              | Sample output                          |
| ------ | ------------------------ | --------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| PATCH  | `/api/agent/update-file` | Overwrite one or more files | JSON body `{ "updates": [{ "file": string, "content": string }] }` | `{ "status": "ok", "results": [...] }` |

Request example:

```json
{
  "updates": [
    {
      "file": "src/App.jsx",
      "content": "import React from 'react';\n\nexport default function App() {\n  return <div>Updated UI</div>;\n}"
    }
  ]
}
```

Response example:

```json
{
  "status": "ok",
  "results": [{ "file": "src/App.jsx", "status": "File updated successfully" }]
}
```

### E. Create files

| Method | Route                    | Purpose                      | Input                                                            | Sample output                          |
| ------ | ------------------------ | ---------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| POST   | `/api/agent/create-file` | Create one or more new files | JSON body `{ "files": [{ "file": string, "content": string }] }` | `{ "status": "ok", "results": [...] }` |

Request example:

```json
{
  "files": [
    {
      "file": "src/components/Hero.jsx",
      "content": "export default function Hero() { return <section>...</section>; }"
    }
  ]
}
```

Response example:

```json
{
  "status": "ok",
  "results": [
    { "file": "src/components/Hero.jsx", "status": "File created successfully" }
  ]
}
```

### F. Patch a small string within a file

| Method | Route                   | Purpose                                         | Input                                                                  | Sample output                                   |
| ------ | ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| POST   | `/api/agent/patch-file` | Replace one exact substring in an existing file | JSON body `{ "filePath": string, "oldStr": string, "newStr": string }` | `{ "success": true, "patched": "src/App.jsx" }` |

Request example:

```json
{
  "filePath": "src/App.jsx",
  "oldStr": "return <div>Hello</div>;",
  "newStr": "return <div>Hello World</div>;"
}
```

Response example:

```json
{
  "success": true,
  "patched": "src/App.jsx"
}
```

### G. Execute shell commands

| Method | Route             | Purpose                             | Input                                               | Sample output                                                                                          |
| ------ | ----------------- | ----------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| POST   | `/api/agent/exec` | Run shell commands in the workspace | JSON body `{ "command": string, "subDir": string }` | `{ "status": "ok", "success": true, "stdout": "...", "stderr": "", "error": null, "timedOut": false }` |

Request example:

```json
{
  "command": "npm install",
  "subDir": "src"
}
```

Response example:

```json
{
  "status": "ok",
  "success": true,
  "stdout": "added 42 packages in 5.2s",
  "stderr": "",
  "error": null,
  "timedOut": false
}
```

### H. Get Vite runtime logs/errors

| Method | Route                            | Purpose                                              | Input | Sample output                                                              |
| ------ | -------------------------------- | ---------------------------------------------------- | ----- | -------------------------------------------------------------------------- |
| GET    | `/api/agent/vite-runtime-errors` | Fetch recent runtime logs from the sandbox container | None  | `{ "success": true, "podName": "...", "namespace": "...", "logs": "..." }` |

Response example:

```json
{
  "success": true,
  "podName": "sandbox-abc123",
  "namespace": "default",
  "logs": "[vite] Local: http://localhost:5173/\nError: Failed to resolve import"
}
```

### I. Real-time terminal connection (Socket.io)

The agent container hosts a Socket.io server to allow real-time interactive terminal execution using `node-pty`.

- **Transport**: WebSocket / Socket.io
- **Workspace Directory**: `/workspace`
- **Shell**: Environment shell (defaults to `bash` / `sh`)

#### Interactive Events

- **Client-to-Server**:
  - `terminal-input`: Character input to feed directly into the PTY process.
- **Server-to-Client**:
  - `terminal-output`: Text output emitted back in real-time from the PTY.

---

## 4) What the AI agent needs to build the frontend

The AI agent is not directly manipulating the browser. It works by editing files in the sandbox workspace and letting the Vite server refresh the frontend.

### Required understanding

The agent must know:

- the current project structure
- the exact contents of key files like `package.json`, `src/App.jsx`, `src/main.jsx`, `src/index.css`
- where components and styles belong
- how to verify if the frontend compiles successfully

### Agent workflow for frontend generation

1. Call `list-files` once to understand the repo.
2. Read `package.json` to see framework and scripts.
3. Read `src/App.jsx`, `src/main.jsx`, and CSS files.
4. Write a plan into `todo.md`.
5. Build one file at a time.
6. Tick off tasks in the plan.
7. Run `npm install` only if needed.
8. After edits, call `getViteRuntimeErrors`.
9. Fix issues and rerun verification.
10. Remove `todo.md` only after everything is verified.

### Files the agent commonly edits

- `src/App.jsx`
- `src/main.jsx`
- `src/index.css`
- `src/App.css`
- `src/components/*.jsx`
- `public/*`
- `index.html`
- `package.json`

### Agent rules that matter for frontend building

- Use `create-file` for new files.
- Use `update-file` for full rewrites.
- Use `patch-file` for small targeted changes.
- Use `execute-command` only for shell actions such as `npm install`, `npm run build`, `git`, `mkdir`, and `rm`.
- Never use shell commands to read/write source files.
- Never finish until runtime errors are clear or the build is verified.

---

## 5) Important implementation notes for the AI agent

### Frontend assumptions

- The target app is React + Vite.
- A simple UI is preferred unless a complex app is explicitly requested.
- The agent should avoid unnecessary dependencies.

### Safety and constraints

- All file paths are relative to the sandbox workspace.
- Path traversal attempts are blocked.
- Commands are limited to a controlled working directory.
- AI responses are streamed through SSE and are not raw JSON responses.

### Best practice flow for the agent

- Start by understanding the project.
- Keep changes small and traceable.
- Prefer one-file-per-turn edits.
- Verify after each major change set.
- Use runtime logs to debug, not guess.

---

## 6) Minimal end-to-end example

### Example user request

> Build a landing page for a SaaS product with hero, features, pricing, and CTA.

### Example backend flow

1. Frontend calls `POST /api/ai/invoke`.
2. AI agent runs `list-files`.
3. Agent reads `package.json` and `src/App.jsx`.
4. Agent creates or updates:
   - `src/App.jsx`
   - `src/index.css`
   - optionally `src/components/Hero.jsx`
5. Agent runs `getViteRuntimeErrors`.
6. Agent fixes any issues.
7. The preview URL reflects the updated UI.

---

## 7) Summary

The core architecture is:

- frontend request → AI orchestration API → LangGraph agent → sandbox file APIs → Vite workspace → live preview

The AI agent can fully build frontend code by using:

- file listing
- file reading
- file creation and updates
- small string patching
- shell execution
- real-time terminal interaction (via Socket.io)
- runtime error inspection

This is the complete flow required to make the frontend of the application using the current repository setup.
