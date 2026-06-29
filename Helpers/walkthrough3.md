# Walkthrough - MongoDB Integration, Real-Time Sync, ID Separation, Model Layout & Route Refactoring

We have fully implemented and verified:
1. MongoDB integration to associate agent chats with the `projectId` and enable automatic command summarization.
2. Real-time file synchronization between the code editor and the workspace.
3. Separation of MongoDB project IDs and Kubernetes sandbox IDs.
4. Model Layout Optimization (Mistral Large for coding agent, Mistral Medium for app agent/co-pilot and command summarizer).
5. Token & Billing Cost Optimization (Prompt compression and active file context truncation).
6. Execution Error Saving & Tool-Log Context Injection.
7. Active LLM Token Usage Logging for Credit Billing.
8. Controllers Refactoring & Routing Modularization (AI and Chat controllers).
9. User Authentication Middleware (`identifyUser` using JWT token verification).
10. Secured Websocket Handshake & User-scoped Chat History Persistence.
11. Cleaned up deprecated legacy HTTP invoke endpoint and helper functions.
12. Renamed App Agent / Co-pilot to **Clio** and Coding Agent to **Orion** across both backend and frontend.
13. Redesigned Dark Mode Color Palette to match Google AI Studio (Onyx background, high-contrast text, solid crisp borders, vibrant green/blue accents).
14. Fixed "Invalid project ID format" error by returning the full project object from the creation controller.
15. Fixed Multi-Project State Leakage where the running sandbox of one project polluted other projects in the UI.
16. Fixed optimistic state assumptions by only updating local state upon API confirmation and propagating errors.
17. Added `GET /api/sandbox/project/:projectId` endpoint to fetch single project status.
18. Fixed race condition between chat history loading and initial prompt submission by introducing `isHistoryLoading` synchronization.
19. Fixed Kubernetes RBAC authorization warning.

## Changes Made

### 1. MongoDB Setup & Connection
- **Dependency**: Installed `mongoose` package in the `Ai_orchestration` service.
- **Connection Logic**: Created [db.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/config/db.js) to initialize database connection via `MONGO_URI`.
- **Server Startup Refactor**: Updated [server.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/server.js) to bind the HTTP server synchronously first (to ensure liveness/readiness probes pass immediately) and connect to MongoDB asynchronously in the background.

### 2. Database Models with Token & User Tracking
- **ChatMessage**: Created [ChatMessage.model.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/models/ChatMessage.model.js) to persist project chats for `codingAgent` and `copilot` agents with indexing on `projectId` and `timestamp`.
  - Added `userId` field to the schema to track the owner of the chat.
  - Added compound indexes for fast queries when fetching project chat history.
  - Updated Schema to include a nested `tokenUsage` subdocument to track input, output, and total token usage.
- **CommandSummary**: Created [CommandSummary.model.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/models/CommandSummary.model.js) to store terminal command runs and their AI-generated summaries. Updated Schema to include the same `tokenUsage` fields.

### 3. JWT Authentication Middleware
- **Middleware Creation**: Created [auth.middleware.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/middleware/auth.middleware.js) to identify users. It extracts the JWT token from either the HTTP Cookie (`token`) or the Authorization header (`Bearer <token>`), verifies it using `process.env.JWT_SECRET`, and populates `req.user` with the decoded token payload (containing the user `id`).
- **Cookie Parsing Setup**: Updated [app.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/app/app.js#L6-L10) to mount `cookieParser` to parse client-side cookies before routes are matched.

### 5. Secured Socket.io Handshake
- **Handshake Authentication**: Added a Socket.io connection-level authentication middleware in [socket.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/socket/socket.js#L48-L77). It parses cookies and query tokens from the connection handshake and verifies them with `JWT_SECRET`.
- **User-Scoped Coding Agent Chats**: Stores the verified `userId` inside the socket instance (`socket.user.id`) and logs it in `ChatMessage` on every stream completion or error.

### 6. Cost & Legacy Cleanup
- **Removed Unused Route**: Deleted the deprecated HTTP `/invoke` route (and its mapping inside [ai.routes.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/routes/ai.routes.js)) since all coding agent communication is fully WebSocket-based.
- **Removed Unused Helpers**: Removed the redundant LangChain response helper functions (`getErrorPayload`, `getErrorStatus`, `getErrorCode`, `getErrorMessage`, `isRateLimitError`) and the unused `agent` graph import from [ai.controller.js](file:///Users/home/Desktop/Capstone/Ai_orchestration/src/controllers/ai.controller.js#L1-L5), reducing cognitive overload and simplifying code maintainability.

### 7. Renaming Agents (Clio & Orion)
- **Sanskrit Naming Integration**: Renamed all occurrences of the app agent (previously named "Tara") to **Clio** and the coding agent to **Orion** across both the backend (`Ai_orchestration`) and frontend (`Frontend`) services.

### 8. High-Contrast Dark Mode Theme (Google AI Studio Inspired)
- **Sleek Onyx Background**: Replaced muddy, dark-blue backgrounds with a clean, high-contrast dark palette (Onyx black `#07080B`, deep slate panel overlays `#131622`, solid borders `#1B1E2E` and `#2B2F48`).
- **High-Visibility Typography**: Raised text legibility by brighting secondary text color to `#E2E8F0`, muted text to `#CBD5E1`, and adding a distinct dark hint color `#8E9BAE`.
- **Vibrant Accent Glows**: Upgraded primary brand accents to emerald green (`#10B981`) and info/links to dodger blue (`#3B82F6`) to make buttons, sliders, active tab borders, and icons pop.
- **Float Refactor**: Configured floating agent floats ([AppAgentFloat.scss](file:///Users/home/Desktop/Capstone/Frontend/src/features/chat/components/AppAgentFloat.scss#L1-L256)) to inherit custom CSS variables instead of hardcoded background alphas.

### 9. Project Creation & Sandbox Booting Flow
- **Dashboard Booting**: Updated [Dashboard.jsx](file:///Users/home/Desktop/Capstone/Frontend/src/components/Dashboard.jsx) to call `startSandbox` directly on the Dashboard, rendering real-time container log progress updates before redirecting.
- **Auto-Invocation of Orion**: Updated the `initialPrompt` loader inside [AIChat.jsx](file:///Users/home/Desktop/Capstone/Frontend/src/features/coding-agent/components/AIChat.jsx#L41-L58) to automatically execute the user prompt once the workspace has loaded and the sandbox is active.

### 10. Fixed "Invalid project ID format" Error
- **Root Cause**: The project creation endpoint returned `project: project._id` (a string containing only the ID) instead of returning the full project document. This caused the frontend to read `response.project._id` and `response.project.title` as `undefined` and pass `undefined` as a query parameter when starting the sandbox, triggering validation failures on the server.
- **Fix**: Modified [sandbox.controller.js](file:///Users/home/Desktop/Capstone/Sandbox/server/src/controllers/sandbox.controller.js#L72) to return `project: project` (the full document), resolving the undefined parameter and restoring smooth workspace transitions.

### 11. Multi-Project State Leakage Fix
- **Redux Slice Association**: Redesigned [sandbox.slice.js](file:///Users/home/Desktop/Capstone/Frontend/src/features/sandbox/slice/sandbox.slice.js) to store sandbox data keyed by `projectId` inside local storage instead of single global variables (`sandboxId`, `previewUrl`, `agentUrl`). Added `initializeSandboxForProject` action.
- **Active Workspace Sync**: Modified [App.jsx](file:///Users/home/Desktop/Capstone/Frontend/src/App.jsx) to dispatch `initializeSandboxForProject(currentProjectId)` on mount and whenever the selected project changes. Switching to a new project now retrieves only that project's active container details (setting states to `idle` if it isn't running).
- **Dashboard Teardown Hooks**: Modified [Dashboard.jsx](file:///Users/home/Desktop/Capstone/Frontend/src/components/Dashboard.jsx#L359-L381) to call `terminateSandbox(projectId)` and `deleteProject(projectId)` from `useSandbox` instead of calling raw API modules directly. This ensures that stopping or deleting a project immediately clears that project's specific local storage and Redux states.

### 12. Correct Error Propagation & Stop Sandbox Handling
- **Non-Optimistic State Management**: Modified the `terminateSandbox` and `deleteProject` methods in [sandbox.hooks.js](file:///Users/home/Desktop/Capstone/Frontend/src/features/sandbox/Hooks/sandbox.hooks.js#L125-L147) to only invoke the Redux `clearSandbox` dispatch *after* the API resolves successfully.
- **Error Propagation**: If a request to stop or delete the sandbox fails (e.g. network timeout or API error), the error is caught, dispatched to the Redux store (`setError(errMsg)`), and thrown to propagate to the calling handler. The Dashboard UI displays the error in the red warning banner, preventing false indicators.

### 13. Project Status Retrieval API
- **Endpoint**: Added `GET /api/sandbox/project/:projectId` route mapped to `getProjectStatusController` in [sandbox.controller.js](file:///Users/home/Desktop/Capstone/Sandbox/server/src/controllers/sandbox.controller.js#L98-L121).
- **Functionality**: Extracts the project from MongoDB using the secure ownership guard `getAuthorizedProject`, returning details such as title, status, sandboxId, and previewUrl.

### 14. Initial Prompt Race Condition Fix
- **History Sync Lock**: Added an `isHistoryLoading` state to the [useCodingAgent](file:///Users/home/Desktop/Capstone/Frontend/src/features/coding-agent/Hooks/codingAgent.hooks.js#L134-L163) hook to track database chat history load state.
- **Auto-Submit Delay**: Modified [AIChat.jsx](file:///Users/home/Desktop/Capstone/Frontend/src/features/coding-agent/components/AIChat.jsx#L41-L58) to block `sendMessage` execution until `isHistoryLoading` is `false`. This prevents the history API response from overwriting active WebSocket streaming buffers during initial codespace mounts.

## Verification Results

### 1. Endpoint Testing
- Verified successful SSE streaming and final event dispatch on `/api/ai/app-agent/invoke`.
- Verified GET `/api/ai/chats/:projectId/:agentType` retrieves exact chronological logs.
- Verified DELETE `/api/ai/chats/:projectId/:agentType` successfully clears MongoDB collections.

### 2. MongoDB Persistence
- Checked MongoDB directly via database query script, confirming that user prompts and model responses are successfully persisted under the correct `projectId` and `agentType`.

### 3. File Synchronization
- Verified the frontend compiles successfully and the 5-second interval maintains real-time file tree and active content updates.
