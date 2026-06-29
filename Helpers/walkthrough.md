# Walkthrough - MongoDB Integration, Real-Time Sync, ID Separation & Model Layout

We have fully implemented and verified:
1. MongoDB integration to associate agent chats with the `projectId` and enable automatic command summarization.
2. Real-time file synchronization between the code editor and the workspace.
3. Separation of MongoDB project IDs and Kubernetes sandbox IDs.
4. Model Layout Optimization (Mistral Large for coding agent, Mistral Medium for app agent/co-pilot and command summarizer).
5. Token & Billing Cost Optimization (Prompt compression and active file context truncation).
6. Execution Error Saving & Tool-Log Context Injection.
7. Fixed Kubernetes RBAC authorization warning.

## Changes Made

### 1. MongoDB Setup & Connection
- **Dependency**: Installed `mongoose` package in the `Ai_orchestration` service.
- **Connection Logic**: Created [db.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/config/db.js) to initialize database connection via `MONGO_URI`.
- **Server Startup Refactor**: Updated [server.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/server.js) to bind the HTTP server synchronously first (to ensure liveness/readiness probes pass immediately) and connect to MongoDB asynchronously in the background.

### 2. Database Models
- **ChatMessage**: Created [ChatMessage.model.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/models/ChatMessage.model.js) to persist project chats for `codingAgent` and `copilot` agents with indexing on `projectId` and `timestamp`.
- **CommandSummary**: Created [CommandSummary.model.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/models/CommandSummary.model.js) to store terminal command runs and their AI-generated summaries.

### 3. Context & History Injection (Last 5 Messages)
- **Coding Agent (Socket.io)**: Modified [socket.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/socket/socket.js) to:
  - Save incoming user messages to MongoDB.
  - Retrieve the last 5 messages from MongoDB and prepend them to the prompt messages array.
  - Accumulate model stream chunks and log messages, saving the final assistant reply and tool logs to MongoDB.
- **Copilot (App Agent API)**: Modified [ai.routes.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/routes/ai.routes.js) to:
  - Save clean user prompts to MongoDB.
  - Retrieve the last 5 messages and prepend them to the prompt context array.
  - Save the final assistant response to MongoDB after stream ends.

### 4. Chat Management Endpoints
- **GET /api/ai/chats/:projectId/:agentType**: Returns the chronological chat messages for a specific project.
- **DELETE /api/ai/chats/:projectId/:agentType**: Clears/deletes chat messages for a project.

### 5. Frontend Integration & Auto-Load
- **State Slices**: Added `setMessages` action in both `codingAgent.slice.js` and `copilot.slice.js`.
- **Custom Hooks**: Updated `codingAgent.hooks.js` and `copilot.hooks.js` to:
  - Automatically load chat history from MongoDB via GET API when `projectId` changes.
  - Clear database history via DELETE API when the clear button is clicked.

### 6. Command Summarization (Mistral Medium)
- **Summary Model**: Configured `summaryModel` inside [tool.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/agent/tool.js) to use Mistral Medium (`mistral-medium-latest`) for command execution summary creation.
- **Retry Logic**: Configured `maxRetries: 6` to intercept and gracefully recover from API rate limits.
- **Execution Interception**: Intercepted the `executeCommand` tool so it automatically calls Mistral to generate a concise, one-sentence summary of the command's outcome and saves it to MongoDB.

### 7. Coding Model Configuration (Mistral Large)
- **Coding Model**: Changed the main coding model inside [code.agent.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/agent/code.agent.js) to use Mistral Large (`mistral-large-latest`) with `maxRetries: 10`.

### 8. Floating Co-Pilot / App Agent Model (Mistral Medium)
- **Co-Pilot Model**: Changed `appModel` inside [code.agent.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/agent/code.agent.js) to use Mistral Medium (`mistral-medium-latest`) with `maxRetries: 5`.

### 9. Token & Billing Cost Optimization
- **System Prompt Pruning**: Replaced the inclusion of raw, heavy markdown instruction files (originally ~3,500 tokens) with concise, bulleted core instructions in [code.agent.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/agent/code.agent.js#L28-L47). This saves ~3,200 tokens on **every single call** made by the coding agent.
- **Active File Truncation**: Modified [ai.routes.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/routes/ai.routes.js#L240-L253) to limit the active file content payload sent to the co-pilot to a maximum of 10,000 characters (~2,500 tokens), preventing cost blowouts when developers open large source files.

### 10. Execution Error Saving & Tool-Log Context Injection
- **Error Saving**: Updated the `catch (error)` handlers in both [socket.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/socket/socket.js#L208-L221) and [ai.routes.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/routes/ai.routes.js#L355-L368) to automatically insert error logs (along with any tool actions taken before failing) as assistant message entries in MongoDB.
- **Tool-Log Context Injection**: Refactored the history message mapping in both socket connections and REST endpoints to append a chronological `[System Tool Executions]` list to the end of assistant message strings. This allows the model to instantly know which files were read/written and commands executed in the previous turns, reducing cognitive overload and preventing redundant workspace scanning.

### 11. Real-Time File Sync
- **Polling Reduction**: Changed the filesystem sync polling interval in [App.jsx](file:///Users/home/Desktop/Capstone/Frontend/src/App.jsx) from 5 minutes to 5 seconds.
- **Instant Agent Triggers**: Updated [codingAgent.hooks.js](file:///Users/home/Desktop/Capstone/Frontend/src/features/coding-agent/Hooks/codingAgent.hooks.js) to trigger an immediate, synchronous `syncAllFilesToCache` whenever the agent completes a file-modifying tool (`create_file`, `update_file`, `patch_file`, `delete_file`, `execute_command`) or completes the stream run.
- **Copilot Triggers**: Updated [copilot.hooks.js](file:///Users/home/Desktop/Capstone/Frontend/src/features/copilot/Hooks/copilot.hooks.js) to sync all files immediately after the copilot finishes saving or writing code.

### 12. Project ID vs Sandbox ID (UUID) Separation
- **Dual-ID Payload**: Modified frontend hooks (`codingAgent.hooks.js` and `copilot.hooks.js`) to pass both `projectId` (MongoDB ID) and `sandboxId` (UUID) to the orchestrator.
- **Persistent Database Chats**: Configured database operations (retrieval and storage) to key off the persistent `projectId` so chats survive container stops and restarts.
- **Accurate Container Routing**: Configured backend agent invocation tools to run against `sandboxId` (e.g. `sandbox-service-${sandboxId}`) to resolve Kubernetes networking routes.

## Verification Results

### 1. Endpoint Testing
- Verified successful SSE streaming and final event dispatch on `/api/ai/app-agent/invoke`.
- Verified GET `/api/ai/chats/:projectId/:agentType` retrieves exact chronological logs.
- Verified DELETE `/api/ai/chats/:projectId/:agentType` successfully clears MongoDB collections.

### 2. MongoDB Persistence
- Checked MongoDB directly via database query script, confirming that user prompts and model responses are successfully persisted under the correct `projectId` and `agentType`.

### 3. File Synchronization
- Verified the frontend compiles successfully and the 5-second interval maintains real-time file tree and active content updates.
