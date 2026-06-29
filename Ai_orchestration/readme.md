# AI Orchestration Service

The AI Orchestration Service is the core backend component responsible for managing developer agents, coordinating Kubernetes sandbox interaction tools, persisting chat histories, and streaming real-time reasoning events to the frontend.

---

## Technical Stack & Dependencies

The service is built on Node.js and integrates the following primary libraries:
*   **Express**: Powering the REST API endpoints and handling Server-Sent Events (SSE) streaming.
*   **Socket.io**: Streaming real-time, interactive token chunks and tool status updates for the coding agent.
*   **LangGraph & LangChain**: Managing the agent's cognitive loops, tool bindings, state variables, and model invocations.
*   **Mongoose & MongoDB**: Storing persistent chat logs, terminal execution summaries, and model token usage.
*   **jsonwebtoken & cookie-parser**: Implementing cookie and header-based JWT authentication to secure endpoints.

---

## Project Structure

```
Ai_orchestration/
├── server.js                        # App entry point; initializes HTTP server and starts WebSocket listener
├── src/
│   ├── app/
│   │   └── app.js                   # Express application setup, global cookie parsing, and health checks
│   ├── config/
│   │   └── db.js                    # MongoDB connection initialization and configuration
│   ├── middleware/
│   │   └── auth.middleware.js       # JWT validation middleware protecting REST endpoints
│   ├── routes/
│   │   └── ai.routes.js             # API Router securing endpoints and routing to controllers
│   ├── controllers/
│   │   ├── ai.controller.js         # Controllers for AI generation (App Agent invoke, title generator)
│   │   └── chat.controller.js       # Controllers for chat log database persistence (get/clear chats)
│   ├── socket/
│   │   └── socket.js                # Socket.io gateway handling secured coding agent execution streams
│   ├── agent/
│   │   ├── code.agent.js            # Configuration of Mistral models, LangGraph agents, and system instructions
│   │   └── tool.js                  # Custom LangChain agent tools bound to the K8s developer sandbox
│   └── models/
│       ├── ChatMessage.model.js     # Schema for user/assistant messages, tool logs, and token usages
│       └── CommandSummary.model.js  # Schema for executed shell commands and their AI summaries
```

---

## Architectural Choices & Key Optimizations

### 1. Dual-ID Routing (Sandbox vs. Project)
The application separates the database scope from the infrastructure scope:
*   **Project ID (`projectId`)**: A persistent MongoDB ID. All chat history queries, database cleanups, and token accumulations are associated with this ID to preserve state across agent lifecycles.
*   **Sandbox ID (`sandboxId`)**: A dynamic UUID. Used to route network traffic directly to the active Kubernetes pod container (e.g. DNS resolves to `sandbox-service-${sandboxId}`).

### 2. Token & Billing Optimization
To decrease API billing overhead for both you and the end user, we implement two primary token filters:
*   **System Prompt Pruning**: Replaced verbose raw markdown files in the system prompt with highly concise, bulleted workflow instructions. This **saves over 3,200 tokens on every model execution**.
*   **Active File Truncation**: Limits the size of the active file code context sent to the co-pilot (App Agent) to a maximum of 10,000 characters (~2,500 tokens). This prevents cost blowouts when developers have massive files open in their workspace.

### 3. Brainstorming Reduction via Tool Log Context
To prevent the agent from repeatedly executing discovery tools (such as listing or inspecting files over and over), assistant messages loaded from history include a compressed `[System Tool Executions]` log from the previous turn. This gives the agent immediate context about what it has already accomplished, accelerating reasoning speed and cutting token consumption.

### 4. Active Token Usage Auditing
The service extracts and accumulates input, output, and total token usage metadata from all agent runs (supporting LangChain standard `usage_metadata` and response-metadata fallback formats). These metrics are saved in the database under `ChatMessage.tokenUsage` and `CommandSummary.tokenUsage` to serve as a foundation for credit billing.

### 5. Multi-Layer Security
All REST and Socket.io endpoints require verification of a JWT token against `process.env.JWT_SECRET`. Chat messages are saved with the authenticated `userId`, ensuring users can never read, modify, or delete another developer's chat history.

---

## API Documentation

All REST routes are prefixed with `/api/ai` and are protected by the `identifyUser` middleware.

### 1. REST Endpoints

#### POST `/api/ai/app-agent/invoke`
*   **Description**: Streams the co-pilot's (Clio's) response to the user's prompt using Server-Sent Events (SSE).
*   **Request Body**:
    ```json
    {
      "userPrompt": "How do I create a centered div?",
      "projectId": "66a0bc...",
      "sandboxId": "550e8400-e29b-41d4-a716-446655440000",
      "activeFile": "src/index.css",
      "activeFileContent": "body { margin: 0; }"
    }
    ```
*   **Headers/Cookies**: Cookie `token=<JWT_TOKEN>` or header `Authorization: Bearer <JWT_TOKEN>` required.
*   **Response**: A `text/event-stream` returning:
    *   `data: <token_chunk>` (live token updates)
    *   `event: final \n data: <complete_assembled_response>`
    *   `event: done \n data: [DONE]`

#### POST `/api/ai/app-agent/title`
*   **Description**: Generates a short, title-cased project name from the initial user prompt.
*   **Request Body**:
    ```json
    {
      "userPrompt": "Build a task manager with authentication"
    }
    ```
*   **Response**: `200 OK`
    ```json
    {
      "title": "Task Manager with Auth"
    }
    ```

#### GET `/api/ai/chats/:projectId/:agentType`
*   **Description**: Retrieves the chronological message logs for a project, filtered by the authenticated user ID.
*   **Parameters**:
    *   `projectId`: Persistent MongoDB project ID.
    *   `agentType`: `"codingAgent"` or `"copilot"`.
*   **Response**: `200 OK`
    ```json
    {
      "status": "ok",
      "messages": [
        {
          "role": "user",
          "content": "Create a button",
          "userId": "66b1cd..."
        },
        {
          "role": "assistant",
          "content": "Created the button.",
          "toolLogs": ["create_file: ..."],
          "tokenUsage": { "promptTokens": 100, "completionTokens": 50, "totalTokens": 150 }
        }
      ]
    }
    ```

#### DELETE `/api/ai/chats/:projectId/:agentType`
*   **Description**: Clears the persisted chat messages for a specific project.
*   **Parameters**:
    *   `projectId`: Persistent MongoDB project ID.
    *   `agentType`: `"codingAgent"` or `"copilot"`.
*   **Response**: `200 OK`
    ```json
    {
      "status": "ok",
      "message": "Chat history cleared for copilot"
    }
    ```

#### GET `/api/ai/healthz` & GET `/api/ai/readyz`
*   **Description**: Health and readiness checks for Kubernetes probes. Exempt from JWT authentication.
*   **Response**: `200 OK`
    ```json
    {
      "status": "ok",
      "message": "AI service is healthy"
    }
    ```

---

### 2. WebSocket gateway

*   **Path**: `/api/ai/socket.io`
*   **Authentication**: Handshake cookie parsing (`token=...`) or auth connection token (`auth: { token: ... }`).
*   **Events**:
    *   `agent:invoke` (client emitter): Triggers the coding agent loop. Payload:
        ```json
        {
          "message": "Write a Tic Tac Toe game",
          "projectId": "66a0bc...",
          "sandboxId": "550e8400-e29b-41d4-a716-446655440000"
        }
        ```
    *   `agent:thinking` (server emitter): Emits live text tokens generated by the coding model.
    *   `agent:tool_start` (server emitter): Notifies that the agent has started calling a workspace tool. Contains `toolName` and `input`.
    *   `agent:tool_end` (server emitter): Notifies tool call completion. Contains `toolName` and `output`.
    *   `agent:done` (server emitter): Signifies stream ended successfully.
    *   `agent:error` (server emitter): Dispatched when a timeout, rate limit, or runtime error occurs.
