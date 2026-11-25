# IDE: screens and components

Wireframes: [wireframes.html](wireframes.html) (open in a browser, light and dark switch at the top right). Design rules: [../../README.md](../../README.md#design-system). Inventory: [../INVENTORY.md](../INVENTORY.md#ide-ci).

Status: built (`Frontend/src/App.jsx` when `currentProjectId` is set, plus `features/sandbox`, `features/editor`, `features/logs`, `features/coding-agent`, `features/chat-history`, `features/copilot`).

`App.jsx` has no router. Opening a project from Dashboard sets `currentProjectId` and renders `SandboxHeader` on top, `Layout` in the middle (Orion on the left, `Preview` / `Code` tabs in the center, collapsible bottom panel), the 24 px status bar at the bottom, and the floating `AppAgentFloat` (Clio) portal when opened from the editor toolbar.

| ID | Screen | Component file | Route or trigger | Data source |
|---|---|---|---|---|
| CI-01 | Workspace with live preview | `App.jsx`, `SandboxHeader.jsx`, `Layout.jsx` | Project open (`?project=<id>&title=<name>`), `Preview` tab | `useSandbox`, `useWorkspaceSync`, `useCodingAgent` |
| CI-02 | Preview while booting or offline | `App.jsx` (`PreviewWarmingScreen`, offline block) | Sandbox `warming`, `starting`, `idle`, or `down` | `useSandbox` (`GET /api/sandbox/project/:id`, `POST /api/sandbox/start/:id`, `/api/preview-ping`) |
| CI-03 | Code tab: Explorer and editor | `FileExplorer.jsx`, `CodeEditor.jsx`, `FileIcon.jsx` | `Code` tab or `Cmd+Shift+T` | `useEditor` (MCP `list_files`, `read_file`, `update_file`, `create_file`, `delete_file` + IndexedDB cache) |
| CI-04 | Bottom panel tabs | `TerminalShell.jsx`, `RuntimeLogs.jsx`, `App.jsx` | `Cmd+J` or bottom panel bar (`Terminal & Output`) | `/api/terminal-proxy/socket.io`, MCP `get_vite_runtime_errors` (`useLogs`), static Problems and Ports |
| CI-05 | Orion panel: empty and composer | `AIChat.jsx`, `ChatHeader.jsx`, `EmptyState.jsx`, `Composer.jsx`, `FileSuggestions.jsx`, `AttachmentChips.jsx` | `Cmd+Shift+B` or Sparkles toggle in `SandboxHeader` | `useChatSessions('codingAgent', projectId)`, `useComposer`, `useEditor().files` |
| CI-06 | Orion run | `MessageList.jsx`, `UserMessage.jsx`, `RunItem.jsx`, `AssistantTurn.jsx`, `activity/*.jsx`, `MessageActions.jsx` | Send prompt in `Composer` | SSE `/api/ai/code-agent/invoke` and `/api/ai/code-agent/stream/:projectId`, `/api/ai/chats/*` |
| CI-07 | Plan review card | `PlanReviewCard.jsx`, `PlanStepItem.jsx` | SSE `agent:plan_review` interrupt | `POST /api/ai/code-agent/plan-approve`, `POST /api/ai/code-agent/plan-reject` |
| CI-08 | Chat history sidebar | `ChatHistorySidebar.jsx` | History button in `ChatHeader` or `AppAgentFloat` | `GET /api/ai/chats/:agentType/sessions`, `PATCH`, `DELETE` |
| CI-09 | Clio copilot float | `AppAgentFloat.jsx` | `Ask App Agent (Clio)` button in `CodeEditor` toolbar | SSE `/api/ai/app-agent/invoke`, `useEditor().activeFile`, `useChatSessions('copilot', projectId)` |
| CI-10 | Connect your own agent | `ConnectAgentModal.jsx`, `agentSetup.js` | Plug icon button in `SandboxHeader` | `useMcpTokens` (`GET`, `POST`, `DELETE /api/sandbox/project/:projectId/mcp-tokens`) |
| CI-11 | Request error banner | `App.jsx` (`faultAlert`) | `window` event `faultkit:error` | `services/apiClient.js` (`parseFaultKitResponse`, Axios interceptor) |

---

## CI-01 Workspace with live preview

**Purpose:** Host the full coding workspace with Orion on the left, live app preview in the center, interactive bottom tools, and sandbox status controls.

**Data and API calls:**
- `loadSandboxStatus(projectId)` calls `GET /api/sandbox/project/:projectId` on project open; starts via `POST /api/sandbox/start/:projectId` if `idle` or `down`.
- `stopSandboxAPI(projectId)` calls `POST /api/sandbox/stop/:projectId`; `useWorkspaceSync` subscribes to `workspace-change` on `/api/terminal-proxy/socket.io`.
- Keyboard shortcuts in `App.jsx`: `Cmd+B` Explorer, `Cmd+Shift+B` Orion chat, `Cmd+J` bottom panel, `Cmd+Shift+T` Preview/Code switch.

**States:**
- Running (`status === 'running'`): `Stop Sandbox`, `Sandbox Live` dropdown (`Stop Sandbox`, `Preview Tab`), iframe rendering `previewUrl`, `Port: 5173` in status bar.
- Collapsed panels: `Layout.jsx` renders 24 px vertical bar (`Chat`) on left, 24 px vertical bar (`Explorer`) in Code tab, or 24 px horizontal bar (`Terminal & Output`) at bottom.

**Exact copy:**
- Header left: `← Back to start`, tooltips `Toggle AI Chat (Cmd+Shift+B)`, `Toggle Explorer (Cmd+B)`, `Toggle Terminal (Cmd+J)`.
- Header right: `Start Sandbox` / `Stop Sandbox` / `Starting...`, `Sandbox Live` / `Provisioning...` / `Sandbox Offline`, `Remix`, `Share`, `Publish`, `Connect your own agent (Claude Code, Cursor)`, `Settings`.
- Tabs: `Preview`, `Code`; bottom tabs: `Problems`, `Output`, `Terminal`, `Ports`.
- Status bar: `main*`, `Sandbox Active` / `Booting Container...` / `Sandbox Offline`, `Port: 5173`, `JavaScript JSX`, `CodeSpace IDE v1.0`.

**Components reused:** `SandboxHeader`, `Layout`, `AIChat`, `TerminalShell`, `RuntimeLogs`, `AppAgentFloat`.

## CI-02 Preview while booting and when offline

**Purpose:** Show container startup progress with helpful tips while booting, and give a single Start action when the sandbox is stopped.

**Data and API calls:**
- `useSandbox.js` polls `/api/preview-ping` with `x-preview-host` every `2000 ms` up to `90000 ms`.
- Progress messages step at attempt thresholds `0`, `3`, `6`, `10`, `14`, `18`: `Provisioning sandbox container…`, `Container starting` (pulling image), `Installing dependencies…`, `Starting Vite dev server…`, `Waiting for network to be ready…`, `Almost there…`.

**States:**
- Idle / down: `about:blank` address bar, centered play ring, `Start Sandbox` button.
- Starting (`status === 'starting'`): spinner and `Allocating sandbox container…`.
- Warming (`status === 'warming'`): `PreviewWarmingScreen` with 4-tip carousel rotating every `4500 ms` (`Use Custom Instructions`, `Real-time Hot Reload`, `Collapsible Terminal Shell`, `Bidirectional Syncing`).

**Exact copy:**
- Offline: `Launch a sandbox to see your app here`, `Start Sandbox`.
- Starting: `Allocating sandbox container…`.
- Warming: `Generating application`, `Enjoy these tips while you wait`, `Provisioning sandbox container…`.

**Components reused:** `PreviewWarmingScreen` (internal to `App.jsx`), `useSandbox`.

## CI-03 Code tab: Explorer and editor

**Purpose:** Browse workspace files and edit code in Monaco with IndexedDB-backed caching, autosave, and live container sync.

**Data and API calls:**
- `editor.api.js` calls sandbox MCP tools at `POST /api/agent-proxy/mcp` (dev) or `http://<sandboxId>.agent.localhost/mcp`: `list_files`, `read_file`, `update_file`, `create_file`, `delete_file`.
- `dbService.js` caches the file list and file contents in IndexedDB; `useWorkspaceSync` refreshes open unmodified tabs on `workspace-change`.
- `CodeEditor.jsx` debounces autosave for `2000 ms` when `autosaveEnabled && isModified` and binds `Cmd+S` / `Ctrl+S`.

**States:**
- Loading tree / file: spinner (`RefreshCw`); lazy chunk fallback renders `EditorSkeleton` (`LazyFallback.jsx`).
- Explorer offline: `Launch a sandbox to explore workspace files`. Empty workspace: `No files found in workspace`.
- No file open: `No File Open` empty view in `CodeEditor.jsx`.
- Saving / synced: `Saving...`, `Saved`, `Autosave on`, `Synced just now` / `Syncing...`.
- Explorer error banner: displays `error` string with dismiss `✕`.

**Exact copy:**
- Explorer: `EXPLORER`, `WORKSPACE FILES`, placeholder `src/components/Button.jsx`, `Create`.
- Editor empty: `No File Open`, `Select a file from the explorer, or ask the AI assistant to create and open one for you.`
- Editor toolbar: `Format Code`, `Ask App Agent (Clio)`, `Reload from sandbox`, `Save`, `Editor Settings`.
- Settings popover: `EDITOR SETTINGS`, `Autosave`, `Minimap` (`Shown` / `Hidden`), `Word Wrap` (`Wrap` / `Truncate`), `Font Size (<n>px)`.

**Components reused:** `FileExplorer`, `CodeEditor`, `FileIcon`, `EditorSkeleton`.

## CI-04 Bottom panel tabs: Terminal, Output, Problems, Ports

**Purpose:** Provide an interactive shell, Vite dev server runtime logs, workspace problem status, and exposed port listing.

**Data and API calls:**
- `TerminalShell.jsx` connects `@xterm/xterm` to `/api/terminal-proxy/socket.io?sandboxId=...` (`terminal-input`, `terminal-output`, `terminal-resize`).
- `RuntimeLogs.jsx` calls `fetchViteLogsAPI` (`get_vite_runtime_errors` MCP tool), with optional `5000 ms` polling.
- Problems and Ports tabs render static markup in `App.jsx` with no API calls.

**States:**
- Offline (`status !== 'running'`): Terminal shows `Launch a sandbox to open an interactive terminal`; Output shows `Launch the sandbox to fetch runtime pod errors`.
- Output empty / filtered: `No log streams fetched yet`, `No log lines matched the search filter`.
- Output error: `Warning: <error>`.

**Exact copy:**
- Terminal toolbar: `sh (Interactive Terminal)`, `Reconnect Terminal`, `online`.
- Output toolbar: `Vite Runtime Logs & Errors`, `Auto-poll (5s)`, `Filter logs (e.g. error, warn, success)...`.
- Problems: `No problems have been detected in the workspace.`
- Ports headers: `PORT`, `PROTOCOL`, `ADDRESS`, `SERVICE`; rows: `5173` (`HTTP / WS`, `localhost:5173`, `Vite Frontend dev server`) and `3000` (`HTTP`, `localhost:3000`, `Agent File API Server`).

**Components reused:** `TerminalShell`, `RuntimeLogs`, `TerminalSkeleton`.

## CI-05 Orion panel: empty state and composer

**Purpose:** Let users start a new coding task from suggested prompts or attach project files via `@` mentions and the file picker.

**Data and API calls:**
- `useChatSessions('codingAgent', projectId)` fetches `GET /api/ai/chats/codingAgent/sessions?projectId=...`.
- `useAgentWorkspace` loads `files` via `list_files` and reads attached files on demand via `read_file`.
- `Composer` submits `{ message, projectId, sandboxId, sessionId, attachments }` to `POST /api/ai/code-agent/invoke`.

**States:**
- Empty (sandbox running): `EmptyState` shows `TakshaIcon`, copy, and three prompt buttons.
- Offline / busy elsewhere: `EmptyState` hides prompt buttons (`showPrompts={!isOffline && !isBusyElsewhere}`); `Composer` shows `Notice` (`Sandbox is offline. Start it to work with Orion.`) or `AIChat` shows warning (`Orion is working in another chat. Open it`).
- `@` mention / file picker: up to `8` matching paths, or `No files available`.

**Exact copy:**
- Header states: `Ready`, `Working`, `Waiting for you`, `Offline`; title fallback `New chat`.
- EmptyState: `Tell Orion what to build. It plans, writes the code and checks it.`, prompts `Add a dark mode toggle to my app`, `Build a responsive landing page with hero and pricing sections`, `Find and fix any errors in my app`.
- Composer placeholders: `Ask Orion to build or fix something`, `Start the sandbox to chat with Orion`, `Orion is busy in another chat`, `Review the plan above to continue`, `Orion is working…`.
- Toolbar: `Attach a file`, `@ to attach`, `Send`, `Stop Orion`.

**Components reused:** `ChatHeader`, `EmptyState`, `Composer`, `FileSuggestions`, `AttachmentChips`, `Notice`, `IconButton`.

## CI-06 Orion run

**Purpose:** Stream and display one user task and Orion's reasoning, plan progress, tool calls, edited files, final report, and message actions.

**Data and API calls:**
- SSE `POST /api/ai/code-agent/invoke` and reconnect `GET /api/ai/code-agent/stream/:projectId?sessionId=...&lastEventId=...` via `readAgentStream`.
- Events handled: `agent:snapshot`, `agent:msg_created`, `agent:session`, `agent:model`, `agent:status`, `agent:thinking`, `agent:message`, `agent:message_retract`, `agent:final`, `agent:tool_log`, `agent:steps`, `agent:step`, `agent:plan_review`, `agent:done`, `agent:stopped`, `agent:error`.
- Stop button calls `POST /api/ai/code-agent/stop`; delete calls `POST /api/ai/chats/message/batch-delete`; select mode (`useRunSelection`) deletes multiple runs.

**States:**
- Live: `ThinkingBlock` defaults open (`Thinking`), `PhaseList` highlights `in_progress` step with `detail`, `RunStatusLine` shows active tool verb (`Preparing Orion`, `Reading`, `Editing`, `Running`, etc.).
- Finished: `ThinkingBlock` collapses to `Thought process`, `ToolStepList` collapses to `<N> steps`, `ChangedFiles` lists `New` / `Edited` / `Deleted` files, `MessageActions` shows on hover (`Copy`, `Edit` on user, `Retry` on assistant, `Delete` with confirm).
- Blank / stopped / partial / failed: `This run ended without a report.`, `Stopped`, `Partly done`, `Could not complete`, or error `Notice` (`Orion could not finish this run.`).

**Exact copy:**
- Changed files header: `<n> file(s) changed`; tags: `New`, `Edited`, `Deleted`.
- Tool verbs (`toolSteps.utils.js`): `Scanning`/`Scanned`, `Reading`/`Read`, `Creating`/`Created`, `Updating`/`Updated`, `Editing`/`Edited`, `Deleting`/`Deleted`, `Running`/`Ran`, `Checking`/`Checked`, `Searching`/`Searched`, `Failed`.
- MessageActions: `Delete this message?`, `Delete`, `Cancel`.

**Components reused:** `MessageList`, `RunItem`, `UserMessage`, `AssistantTurn`, `ThinkingBlock`, `PhaseList`, `ToolStepList`, `ToolStepRow`, `ChangedFiles`, `RunStatusLine`, `MessageActions`, `StatusIcon`, `Notice`.

## CI-07 Plan review card

**Purpose:** Pause a coding run before execution so the user can inspect each proposed step, approve, or request changes with feedback.

**Data and API calls:**
- Triggered by SSE `agent:plan_review` payload `{ plan, warnings, taskSubType }`.
- `Approve` calls `POST /api/ai/code-agent/plan-approve`.
- `Send feedback` calls `POST /api/ai/code-agent/plan-reject` with `{ feedback }`.

**States:**
- Review default: `Approve` (`⌘↵` on Mac, `Ctrl+↵` elsewhere) and `Request changes`. Steps expand/collapse individually.
- Feedback open (`isFeedbackOpen`): textarea `What should change in this plan?`, `Send feedback`, `Cancel` (`Esc` closes).
- Submitting (`isSubmitting`): spinner on primary action button, buttons disabled.

**Exact copy:**
- Header: `Waiting for you` in `ChatHeader`; `Waiting for your approval` and `Review the plan below` in `RunStatusLine`.
- Card: `Review plan`, `<n> step(s) · <taskSubType>`, `Approve`, `Request changes`, `What should change in this plan?`, `Send feedback`, `Cancel`.

**Components reused:** `PlanReviewCard`, `PlanStepItem`, `Notice`.

## CI-08 Chat history sidebar

**Purpose:** Browse, search, start, rename, and delete past chat sessions for Orion or Clio inside an overlay drawer.

**Data and API calls:**
- `GET /api/ai/chats/:agentType/sessions?projectId=...&before=...` via `useChatSessions`.
- `GET /api/ai/chats/:agentType/sessions/:sessionId/messages` on session select.
- `PATCH /api/ai/chats/:agentType/sessions/:sessionId` to rename; `DELETE /api/ai/chats/:agentType/sessions/:sessionId` to trash.

**States:**
- Loading: `Loading chats…`. Empty: `No chats yet.` or `No chats match your search.`
- Active & live: active item highlighted; `liveSessionId` shows pulsing ember dot (`Orion is working here`) and disables delete (`Stop Orion before deleting this chat`).
- Item modes: `view`, `rename` (inline input, `Enter` saves, `Esc` cancels), `confirm` (`Delete “<title>”?`, `Delete`, `Cancel`).

**Exact copy:**
- Header: `Chats`; controls: `New chat`, `Search chats`, `Load older chats`.
- Groups: `Today`, `Yesterday`, `Previous 7 days`, `Older`.

**Components reused:** `ChatHistorySidebar` (shared by `AIChat` and `AppAgentFloat`).

## CI-09 Clio copilot float

**Purpose:** Provide a draggable, resizable floating chat focused on the file currently open in `CodeEditor`.

**Data and API calls:**
- `useCopilot` streams `POST /api/ai/app-agent/invoke` with `{ userPrompt, projectId, sandboxId, sessionId, activeFile, activeFileContent }`.
- Uses `useChatSessions('copilot', projectId)` for session history and `POST /api/ai/chats/message/batch-delete` to delete a turn pair.

**States:**
- Closed (`!isOpen`): returns `null`; opened only via `Ask App Agent (Clio)` in `CodeEditor.jsx`.
- Minimized (`isMinimized`): collapses body to header bar (`Chat history` disabled).
- No active file: context bar shows `Active File: None` and warning `Open a file to context-sync`; composer placeholder becomes `Open a file to start…`.
- Streaming: `Thinking…` accordion, three-dot typing indicator, `tool-logs` chips (`readFile:`, `updateFile:`).

**Exact copy:**
- Header: `Clio`, tooltips `Chat history`, `New chat`, `Expand` / `Minimize`, `Close Co-pilot`.
- Context bar: `Active File: <filename>` or `None`, `Open a file to context-sync`.
- Composer placeholder: `Ask about <filename>…` or `Open a file to start…`.

**Components reused:** `AppAgentFloat`, `ChatHistorySidebar`, `MessageActions`, `Markdown`.

## CI-10 Connect your own agent

**Purpose:** Issue, copy, and revoke per-project MCP tokens so external agents (Claude Code, Cursor, Antigravity) can read, edit, or run commands in the sandbox.

**Data and API calls:**
- `useMcpTokens(projectId)` calls `GET /api/sandbox/project/:projectId/mcp-tokens`, `POST /api/sandbox/project/:projectId/mcp-tokens`, and `DELETE /api/sandbox/project/:projectId/mcp-tokens/:tokenId`.

**States:**
- Default form + list: name input (default `Claude Code`), scopes (`Read files and logs` locked, `Create and edit files` checked, `Run commands (npm install, build)` optional with red warning), expiry select (`7 days`, `30 days`, `90 days`), active token list (or `Loading…` / `No tokens yet.`).
- Token shown once (`newToken`): amber warning, raw token + `Copy`, `AgentSetup` tabs (`Claude Code`, `Cursor` with `cursor://` install link, `Antigravity`, `Other`), `Show prompt`, `Manual setup`, `Done`.
- Error: `.connect-agent__error` banner (`Could not load tokens` / `Could not create the token` / `Could not revoke the token`).

**Exact copy:**
- Title: `Connect your own agent`.
- Intro: `Use Claude Code, Cursor, Antigravity or any MCP client to work in this project's sandbox. Create a token, then paste one prompt into your agent. A stopped sandbox starts on the first call.`
- One-time warning: `Copy this token now. It will not be shown again.` and `The prompt and the install link contain your token. Paste them only into your own agent.`
- Exec warning: `Commands get a full shell in your sandbox. Anyone with this token can run anything there.`
- Actions: `Create token`, `Copy setup prompt`, `Add to Cursor`, `Done`, `Revoke`.

**Components reused:** `ConnectAgentModal`, `AgentSetup` (internal), `agentSetup.js`.

## CI-11 Request error banner

**Purpose:** Surface API and SSE FaultKit errors globally across the IDE with support trace IDs and upgrade calls to action.

**Data and API calls:**
- Triggered by `window` `faultkit:error` CustomEvents dispatched from `parseFaultKitResponse` and the Axios response interceptor in `Frontend/src/services/apiClient.js`.

**States:**
- `INSUFFICIENT_CREDITS` (HTTP `402`): amber border and icon, title `Credit Limit Reached`, sticky until closed, `Upgrade to Pro Plan` button redirecting to port `5174`.
- `RATE_LIMIT_EXCEEDED` (HTTP `429`): orange border and icon, title `Rate Limit Exceeded`, sticky until closed.
- Any other code: red border and icon, title `Request Error`, auto-dismisses after `7000 ms`.

**Exact copy:**
- Titles: `Credit Limit Reached`, `Rate Limit Exceeded`, `Request Error`.
- Body: `faultAlert.message`, optional `Ref ID: <requestId>`, action `Upgrade to Pro Plan`.

**Components reused:** Inline banner in `App.jsx`.

---

## Gaps seen in the code

1. `App.jsx` Problems tab (lines 945 to 950) is a static placeholder showing `No problems have been detected in the workspace.` with no error source connected.
2. `App.jsx` Ports tab (lines 951 to 978) hardcodes ports `5173` and `3000` regardless of sandbox status or running processes.
3. `App.jsx` status bar (lines 461 and 485) hardcodes `main*` and `JavaScript JSX` regardless of git state or the active file language.
4. `SandboxHeader.jsx` (lines 324, 339, 341, 356) uses native `alert()` dialogs for `Remix`, `Share`, and `Publish`, and `Remix` / `Publish` perform no API calls.
5. `FileExplorer.jsx` (lines 157 and 240) uses native `confirm()` dialogs for file and folder deletion.
6. `AppAgentFloat.jsx` (line 263) returns `null` when closed and only toggles from `CodeEditor.jsx` toolbar, so Clio has no floating launcher and cannot be opened from the `Preview` tab or when no file is open (unlike `INVENTORY.md` which mentions a closed bubble).
7. `App.jsx` `faultAlert` (lines 511 to 569) uses hardcoded inline hex colors (`#f59e0b`, `#f97316`, `#ef4444`, `#000000`) and hardcodes `:5174` for `Upgrade to Pro Plan`.
8. `CodeEditor.jsx` (unsaved dots `#fbbf24`) and `SandboxHeader.jsx` (`#6B6E82`, `#cbd5e1`) still contain hardcoded colors that bypass theme tokens in light mode.
9. `codingAgent.slice.js` defines `WELCOME_MSG` (`Welcome to CodeSpace...`), which `runs.utils.js` skips (`if (msg.id === WELCOME_ID) continue`) so `EmptyState.jsx` renders instead; the slice welcome text is dead UI copy.
10. `App.jsx` routes only `?project=<id>&title=<name>` in the URL; `workspaceTab`, `bottomTab`, open editor tabs, and Clio visibility do not persist across reloads.
11. `ConnectAgentModal.jsx` shows plain `Loading…` text while fetching active tokens rather than skeleton rows, and `formatDate` prints `never` in lowercase when `lastUsedAt` is null.
