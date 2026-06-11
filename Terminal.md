# Guide: Building a Custom Terminal and Log Streaming API for AI Agent Sandboxes

This document details how to implement:
1. **A Custom Terminal API** (to run shell commands inside the sandbox environment).
2. **A Container Logs API** (to retrieve runtime logs from the application container).
3. **AI Agent Tool Integrations** (to expose these tools to the LangChain/LangGraph agent).

---

## 1. Architecture Design

In this project, each sandbox consists of a Kubernetes Pod with two main containers:
- `sandbox-container`: Runs the user's frontend application (Vite dev server on port `5173`).
- `agent-container`: Runs the agent sidecar server (Express app on port `3000`).

Both containers share a Kubernetes volume (`workspace-volume`) mounted at `/workspace`.

```
  ┌────────────────────────────────────────────────────────┐
  │                   Kubernetes Pod                       │
  │                                                        │
  │  ┌────────────────────────┐  ┌──────────────────────┐  │
  │  │   sandbox-container    │  │   agent-container    │  │
  │  │  (Vite App Port 5173)  │  │ (Agent API Port 3000)│  │
  │  └───────────┬────────────┘  └──────────┬───────────┘  │
  │              │                          │              │
  │              └────────────┬─────────────┘              │
  │                           ▼                            │
  │                 Shared /workspace Volume               │
  └───────────────────────────▲────────────────────────────┘
                              │ HTTP / WebSockets
                      ┌───────┴───────┐
                      │  AI Agent /   │
                      │  Orchestrator │
                      └───────────────┘
```

---

## 2. Implementing the Custom Terminal API

Since the `agent-container` runs on Node.js and has write access to the shared `/workspace` directory, we can run terminal commands (like `npm install`, `npm run build`, `npm test`) directly inside this container using Node's `child_process`.

### Step 2.1: Add the execute route in the sidecar agent
Add this endpoint to [app.js](file:///Users/home/Desktop/Capstone/Sandbox/Agent/src/app.js):
```javascript
import { exec } from "child_process";

/**
 * TOOL: execute-command
 *
 * @description
 *   Executes a terminal command in the /workspace directory.
 *   Returns the stdout, stderr, and exit code.
 *
 * @method  POST
 * @route   /api/agent/execute
 * @body    { "command": "npm run build" }
 */
app.post("/api/agent/execute", (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({
      status: "error",
      message: "Command is required",
    });
  }

  // Execute in /workspace with a 30 second timeout to avoid hanging processes
  exec(command, { cwd: WORKING_DIR, timeout: 30000 }, (error, stdout, stderr) => {
    res.status(200).json({
      status: "ok",
      exitCode: error ? error.code : 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      error: error ? error.message : null,
    });
  });
});
```

---

## 3. Implementing the Container Logs API

To read logs from the `sandbox-container` (which runs the Dev server), the request must query the Kubernetes API. The main Sandbox Server has the `resource-manager` ServiceAccount role with access to Kubernetes APIs.

### Step 3.1: Enable `pods/log` permissions in RBAC
Modify the [rabc.yml](file:///Users/home/Desktop/Capstone/k8s/rabc.yml) file to allow reading logs.

```yaml
# Add "pods/log" to the rules list
- apiGroups: [""]
  resources: ["pods", "pods/log", "services", "deployment"]
  verbs: ["get", "list", "watch", "create", "delete"]
```

### Step 3.2: Create the Logs endpoint in the Sandbox Server
Inside [app.js](file:///Users/home/Desktop/Capstone/Sandbox/server/src/app/app.js) (or a log controller), add the handler to query the Kubernetes API:

```javascript
import { k8sCoreV1Api } from "../kubernetes/config.js";

/**
 * Endpoint: GET /api/sandbox/:sandboxId/logs
 * Fetches logs from the "sandbox-container" in the specified sandbox pod.
 */
app.get("/api/sandbox/:sandboxId/logs", async (req, res) => {
  const { sandboxId } = req.params;
  const podName = `sandbox-pod-${sandboxId}`;

  try {
    const response = await k8sCoreV1Api.readNamespacedPodLog({
      name: podName,
      namespace: "default",
      container: "sandbox-container", // Specify the app container
      tailLines: 100,                  // Limit log history for speed
    });

    res.status(200).json({
      status: "success",
      logs: response.body,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to fetch container logs",
      details: err.message,
    });
  }
});
```

---

## 4. Exposing the Tools to the AI Agent

Now, define these two operations as LangChain tools inside the Orchestrator.

### Step 4.1: Update Agent Tools
Add the tools to [tool.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/agent/tool.js):

```javascript
// Expose Terminal Execution Tool
export const executeCommand = tool(
  async ({ command }) => {
    try {
      const response = await axios.post(
        `http://sandbox-service-${sandboxId}:3000/api/agent/execute`,
        { command }
      );
      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("executeCommand", err);
      return JSON.stringify({
        error: true,
        message: "Failed to execute command",
        details: formatted,
      });
    }
  },
  {
    name: "execute_command",
    description: "Run terminal commands (npm run build, npm test, etc.) in the sandbox workspace directory.",
    schema: z.object({
      command: z.string().describe("The shell command to execute."),
    }),
  }
);

// Expose Container Logs Tool
export const getContainerLogs = tool(
  async (_input) => {
    try {
      // Connects to the Sandbox Server API
      const response = await axios.get(
        `http://sandbox-service-${sandboxId}:3000/api/sandbox/${sandboxId}/logs`
      );
      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("getContainerLogs", err);
      return JSON.stringify({
        error: true,
        message: "Failed to fetch logs",
        details: formatted,
      });
    }
  },
  {
    name: "get_container_logs",
    description: "Retrieve runtime application logs (stdout/stderr) from the container to check for startup or build errors.",
    schema: z.object({}),
  }
);
```

### Step 4.2: Register the Tools in the Agent
Modify [code.agent.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/agent/code.agent.js) to import and register the new tools:

```javascript
import { listFiles, readFile, createFile, updateFile, executeCommand, getContainerLogs } from "./tool.js";

// Register inside createReactAgent
const agent = createReactAgent({
    llm: model,
    tools: [listFiles, readFile, createFile, updateFile, executeCommand, getContainerLogs],
    stateModifier: SYSTEM_PROMPT,
});
```

---

## 5. Making the Agent 100% Compatible

To guarantee the agent utilizes these new tools correctly, update the `SYSTEM_PROMPT` in `code.agent.js` with the following workflow and verification rules:

### System Prompt Additions
```markdown
## VERIFICATION WORKFLOW [strict]
- After writing code, ALWAYS verify your implementation using the terminal tool:
  - Run `execute_command` with `npm run build` or the project's test suite (`npm test`) to ensure there are no compilation or syntax errors.
  - If a server or application runs persistently, fetch the container logs using `get_container_logs` to verify there are no runtime runtime crashes or unhandled exceptions.
- Never declare a task complete without testing the build/compilation first.
```
