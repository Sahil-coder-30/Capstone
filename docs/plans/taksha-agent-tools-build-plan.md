# Build plan: Taksha agent tools

Status: **plan only, nothing built.** Written 2026-11-13, checked against the code on 2026-11-14. This file is the source of truth. The Claude Doc "Taksha MCP tools: analysis and roadmap to a Claude Code level agent" (tab "Build plan") holds the first draft, which was written without access to the code. Every open question of that draft is answered in section 2.

Plan index and ownership rules: [README.md](README.md). What exists today: [mcp-sandbox-server.md](mcp-sandbox-server.md). Audit notes: [AUDIT-2026-11-24.md](AUDIT-2026-11-24.md) (changed here: router path, write-attribution log in P2, checkpoints persisted in P4, P4 pauses need foundation F1).

## 1. Summary

The plan takes Taksha from 9 sandbox tools to 24 (plus one optional) in six phases over about 12 weeks, and puts live co-editing (Yjs with Monaco) last, as its own layer that the patch tool never depends on. The week counts are estimates for one engineer.

The order follows one idea: **give the agent eyes before giving it more hands.** Browser errors come first because part of the data is already collected. Editing and navigation come next, then running and seeing the app, then safety. Live co-editing comes last because it is a product feature for the human, not something the agent needs to do good work.

| This plan owns | This plan does not touch |
|---|---|
| `Sandbox/Agent` (tools), `Sandbox/template` (seed files), `Sandbox/server/src/kubernetes/pod.js` (limits), `Sandbox/sync-agent` (one ignore entry) | Auth, Payments, Notification, the router gateway |
| `Ai_orchestration/src/agent/` (tool wrappers, guards, prompts, graph nodes) | Tool call logging to MongoDB (owner: [taksha-tool-call-analytics-plan.md](taksha-tool-call-analytics-plan.md)) |
| The editor, file tree and logs panel in `Frontend` | Kafka, RabbitMQ, the admin portal |

**It stands alone.** No phase needs another plan. The gates read their numbers from the eval runner's own result files (Phase 0).

**Rules every tool follows from Phase 0 on:**

1. **Disk is the source of truth.** Every tool reads and writes files in `/workspace`. Vite, npm and the shell all see the same bytes. Yjs later mirrors disk, it never replaces it.
2. **One result envelope.** `{ ok, data, error: { code, message, hint } }` on every new or rewritten tool. The `hint` always says what to do next.
3. **Bounded output for agents.** The AI service already cuts every result at 24,000 characters (`tools/toolResult.js`). The sidecar applies the same cap for scoped tokens (external agents). The editor uses the owner token and gets full files.
4. **Cursors, not dumps.** Any tool that reads a stream (logs, errors, job output) takes `since` and returns `nextCursor`.
5. **Writes are guarded.** A write can carry the hash of the content it was based on, and is refused if the file changed. The AI tool layer keeps `path -> hash` for the run and sends the hash itself. The model never copies a hash.
6. **Every write returns a diff.** The agent, the user and the UI all see the same unified diff.
7. **One list, checked by a test.** A test fails when the sidecar's tool list and the AI service's allowlist differ.

## 2. What the code looks like today (checked)

| Question from the draft | Answer | Where |
|---|---|---|
| Where does the MCP server run? | Inside the sandbox pod, in the `agent` container, port 3000, path `/mcp`. Stateless, a fresh server per request | `Sandbox/Agent/src/mcp/server.js` |
| Is the agent server Node? | Yes, Express 5, ESM. Image `node:20-bullseye` (Debian), runs as uid 1000 | `Sandbox/Agent/` |
| Who calls it? | Everyone through the router, which is the only network path into a pod (`8e0bf26`). The AI service through the router's internal path `POST /internal/sandboxes/<id>/mcp` (since `3f800a6`, refreshes the TTL). External agents through the router gateway (`/api/mcp/<sandboxId>`). The frontend editor, file tree and logs panel through `*.agent.localhost` | `tools/sandbox.client.js`, `Sandbox/router/src/internalMcpProxy.js`, `Sandbox/router/src/mcpGateway.js`, `Frontend/src/services/sandboxAgentClient.js` |
| Which model drives the agent? | NVIDIA models through `ChatOpenAI`. Whether the model accepts images is not known. Check with `npm run check:model` before Phase 3 | `Ai_orchestration/src/agent/llm/` |
| Can the pod take another container? | Yes, but each pod already has limits of 512Mi (Vite) + 512Mi (agent) + 256Mi (sync). The root filesystem is **not** read-only | `Sandbox/server/src/kubernetes/pod.js` |
| Which templates exist? | One: Vite + React 19. No test runner in it | `Sandbox/template/` |
| How does Monaco load files? | Through the same MCP tools (`read_file`, `create_file`, `update_file`, `delete_file`, `list_files`). File changes reach the editor as a Socket.IO `workspace-change` event from chokidar | `features/editor/service/editor.api.js`, `Sandbox/Agent/src/sockets/socket.js` |

Facts that change the draft:

| Fact | Effect |
|---|---|
| The tool list is frozen (`CERTIFIED_TOOLS`) and exists twice: sidecar and AI service | Every new tool is added in both, in the same commit series (section 4) |
| Tool handlers return three different shapes today (`success: false`, `status: "error"`, `error: true`) | The envelope is introduced tool by tool. Readers accept both shapes during the move |
| `search_code` `fileGlob` is a plain substring check (`relativePath.includes(fileGlob)`) | This is the "glob bug": `src/**` can never match. Fixed in Phase 0 |
| Path safety with symlink checks already exists | `safeResolve` in `Sandbox/Agent/src/workspace/paths.js`. Reuse it, write nothing new |
| Browser errors are already posted by the preview app, but only printed to the terminal | `POST /api/agent/report-error` (open route, cleaned and rate limited). Phase 1 stores them |
| The injected script lives in the project's own `vite.config.js`, which is saved to S3 with the project | A new script reaches **new projects only**. Old projects keep posting to `report-error`, so that route stays and feeds the same buffer |
| Vite writes all output, compile errors too, to `/sandbox-logs/vite.log`, which the sidecar reads | `get_dev_server_log` needs no Vite plugin. It reads the file with a cursor |
| Vite runs in the `template` container. The sidecar cannot signal it | `restart_dev_server` touches `vite.config.js` (Vite restarts on a config change) and waits for the ready line in the log |
| Commands run with `exec()` in the agent container, 30 s, or 120 s for installs and builds. Timeouts above it: 150 s in `invokeRoute.js` and in the AI client, 30 s in the frontend client | Foreground commands stay at 120 s. Longer work uses background jobs, so no timeout chain changes |
| The shell guard exists twice with the same regex (`mcp/tools.js`, `tools/guards.js`) | Change both together |
| `sync-agent` does not sync `.git`, `node_modules`, `dist` | Checkpoints live only as long as the pod. See Phase 4 |
| `yjs` is already a dependency of `Sandbox/Agent`, but no code imports it. The frontend has Monaco and `socket.io-client`, no Yjs | Phase 5 carries Yjs updates over the existing authenticated Socket.IO connection |
| Two tool guides exist (`Ai_orchestration/src/skills/tool-info/skill.md`, `Sandbox/template/skills/tool-info/skill.md`). They say "8 tools" and "one file per turn". No code under `Ai_orchestration/src/agent` loads them | The model only sees the descriptions in `tools/*.tools.js`. The guides are stale documents. Phase 0 removes or regenerates them |
| Orion already has plan steps with a status, shown in the UI, and a plan review pause | `todo_write` is optional. The "ask" permission reuses the `interrupt()` pattern |
| `ripgrep` is not in the agent image. `git` comes with the `node:20-bullseye` base image | Add `ripgrep` to the dockerfile in Phase 2. Confirm `git --version` in a pod before Phase 4 |

## 3. Architecture

```
Model (NVIDIA)                      External agent (Claude Code, Cursor)
   |  tool call                        |  POST /api/mcp/<sandboxId>, tks_mcp_ token
AI service                           Router gateway
   LangChain tool (own description)     token check, 120 calls/min, wake, scoped token
   guards, hash memory, 24,000 char cap |
   |  MCP, 2-hour sandbox token         |  MCP, 10-minute scoped token
   |  POST router /internal/sandboxes/<id>/mcp
   +----------------+-------------------+
                    v
Router (only path into a pod, refreshes the idle TTL)
                    v
Sandbox pod
   agent container :3000                         template container :5173
     /mcp  -> certified tools                      Vite dev server
     telemetry buffers, jobs (P1, P3)              output -> /sandbox-logs/vite.log
     headless Chrome, on demand (P3)
     checkpoints git dir (P4)
     Socket.IO: terminal, workspace-change, Yjs (P5)
                    |
              /workspace  (files on disk, the source of truth)  -> sync-agent -> S3

User browser
   Preview app: injected script posts console logs and errors to the sidecar (P1)
   Editor (Monaco): same MCP tools with the owner token, live sync through Yjs (P5)
```

The model never sees what the sidecar advertises. It sees the AI service's own tool descriptions. External agents see the sidecar's descriptions, filtered by token scope.

## 4. Where a tool lives (change list for every tool)

A new or renamed tool is not done until every row is done.

| # | Place | File |
|---|---|---|
| 1 | Sidecar tool entry: name, scope, schema, annotations | `Sandbox/Agent/src/mcp/tools.js` |
| 2 | Sidecar handler, and its name in the handler map | `Sandbox/Agent/src/controllers/`, `controllers/index.js` |
| 3 | AI allowlist, read-only retry set, timeout | `Ai_orchestration/src/agent/tools/mcp.client.js`, `sandbox.client.js` |
| 4 | AI LangChain tool (the description the model sees) and the role sets | `tools/*.tools.js`, `tools/index.js` |
| 5 | Guards and activity analysis that match on tool names | `tools/guards.js` (`WRITE_TOOLS`, `extractWritePaths`), `core/toolActivity.js` |
| 6 | Frontend labels that match on tool names, and the editor calls | `features/coding-agent/Hooks/codingAgent.hooks.js`, `features/copilot/Hooks/copilot.hooks.js`, `features/editor/service/editor.api.js`, `features/logs/service/logs.api.js` |
| 7 | Tests | `Sandbox/Agent/tests/mcp.test.js`, `Ai_orchestration/tests/mcp.client.test.js`, `tests/helpers/fakeSandbox.js` |

**Scopes for external tokens.** Each tool has one scope. A token only sees the tools in its scopes, so new tools reach external agents with no gateway change.

| Scope | Tools |
|---|---|
| `read` | all Observe and Find tools, `read_file`, `get_job_output`, `get_diff`, `get_dom`, `screenshot` |
| `write` | `patch_file`, `write_file`, `delete_file`, `move_file`, `checkpoint`, `restore` |
| `exec` | `execute_command`, `stop_job`, `run_tests`, `restart_dev_server`, `browser_action` |

**Rollout order for every phase:**

1. Ship the sidecar first. New tools are added, old names stay.
2. Ship the AI service. For a renamed tool it calls the new name when the sandbox offers it (the client already knows the `offered` set), else the old name.
3. Ship the frontend.
4. Remove an old name one release after nothing calls it.

A sandbox pod keeps the image it started with until it stops (idle pods stop after 20 minutes), so the AI service must work with both for a short time. Step 2 covers that.

## 5. Final tool surface

| Area | Tool | Status | Phase | What it does and its key params |
|---|---|---|---|---|
| Observe | `get_console_logs` | New | P1 | Browser console output. `since`, `levels`, `search`, `limit`. Returns `logs` and `nextCursor` |
| Observe | `get_browser_errors` | New | P1 | Uncaught errors and promise rejections, deduped with a `count`. `since`, `clear` |
| Observe | `get_network_log` | New | P1 | Failed and slow requests from the page. `since`, `statusMin`, `urlPattern` |
| Observe | `get_dev_server_log` | Improved | P1 | Today's `get_vite_runtime_errors`, renamed. `since`, `level`. Compile errors are already in this log |
| Files | `read_file` | Improved | P2 | Keeps `files` (1 to 10). Adds `offset` and `limit` for a single file, line numbers, `hash` and `totalLines` per file |
| Files | `patch_file` | Improved | P2 | `edits: [{oldStr, newStr, replaceAll}]`, all or none, `expectedHash`, returns a unified diff. Today's single `oldStr` and `newStr` form stays valid |
| Files | `write_file` | Improved | P2 | Replaces `create_file` and `update_file`. `overwrite` flag, `expectedHash` when overwriting, returns a diff |
| Files | `delete_file` | Improved | P2 | Moves files to `.taksha/trash/` so a delete can be undone while the pod lives |
| Files | `move_file` | New | P2 | Rename or move, and report the import paths that now break |
| Find | `list_files` | Improved | P2 | Keeps the `files` array. Adds `path`, `maxDepth`, `respectGitignore`, `count` |
| Find | `glob_files` | New | P2 | `pattern` such as `src/**/*.jsx`. Sorted by last modified |
| Find | `search_code` | Improved | P2 | ripgrep underneath. `path`, `glob`, `contextLines`, `outputMode` |
| Run | `execute_command` | Improved | P3 | `background` flag, ANSI stripped, pipes to `grep`, `head` and `tail` allowed. Foreground limit stays 120 s |
| Run | `get_job_output` | New | P3 | Output of a background job. `jobId`, `since` |
| Run | `stop_job` | New | P3 | Stop a background job |
| Run | `run_tests` | New | P3 | Structured results: `passed`, `failed`, and `failures` with file and line |
| Run | `restart_dev_server` | New | P3 | Restart Vite and wait until it is ready, or report why it is not |
| See | `get_dom` | New | P3 | Accessibility tree of a route, as text. `selector`, `maxDepth` |
| See | `browser_action` | New | P3 | Scripted steps: `click`, `type`, `press`, `waitFor`. Returns the final accessibility tree, logs and a screenshot |
| See | `screenshot` | New | P3 | PNG of a route in headless Chrome. `path`, `viewport`, `waitFor`. Also returns errors seen during load |
| Safety | `checkpoint` | New | P4 | Snapshot `/workspace`. Returns an id |
| Safety | `restore` | New | P4 | Go back to a checkpoint. Returns the files that changed |
| Safety | `get_diff` | New | P4 | Unified diff since a checkpoint or since the task began |
| Editor | `get_editor_state` | New | P5 | The file, cursor and selection the user has open in Monaco |
| Plan | `todo_write` | Optional | P4 | The agent's task list. An AI service tool like `search_internet`, not a sandbox tool. Build it only if the eval shows the coder losing track inside a plan step |

24 sandbox tools: 8 improved from today's 9 (`create_file` and `update_file` merge into `write_file`) and 16 new. `search_internet` stays in the AI service as today.

**Removed or folded in:** `create_file`, `update_file` and the name `get_vite_runtime_errors`. They stay as aliases (a second entry that calls the same handler) until step 4 of the rollout order.

## 6. Roadmap

| Phase | Weeks | Main work | Exit gate |
|---|---|---|---|
| P0 Foundation | 1 | Result envelope, both readers accept it, list test, eval suite (30 seeded tasks), `search_code` glob fix, stale tool guides | Baseline eval score saved |
| P1 Observe | 2 to 3 | Telemetry buffers in the sidecar, the four Observe tools | Crash found in 1 call |
| P2 Edit and find | 4 to 5 | `read_file` ranges and hash, `patch_file` multi-edit and diff, `write_file`, `move_file`, trash, `glob_files`, `list_files` filters, ripgrep | Tokens per task down 50% |
| P3 Run and see | 6 to 8 | Background jobs, `run_tests`, `restart_dev_server`, headless Chrome, `get_dom`, `browser_action`, `screenshot` | Agent checks its own UI |
| P4 Safety and loop | 9 to 10 | `checkpoint`, `restore`, `get_diff`, ask-first rule, verify-before-done prompt, explorer sub-agent | Eval pass rate 80%+ |
| P5 Live editor | 11 to 12 | Yjs over Socket.IO, `y-monaco`, disk bridge with hashes, `get_editor_state` | No edits lost, both directions |

Phases 0 to 4 make the agent. Phase 5 is for the person using Monaco, and can slip or be skipped without hurting the agent. The gate targets are estimates, to adjust after Phase 0 gives a real baseline.

Each phase ends with: all three test suites green (`Sandbox/Agent`, `Sandbox/server`, `Ai_orchestration`), a local commit per finished item, and `TOOLS_VERSION` raised by one if the analytics plan is live.

## 7. Phase 0: Foundation (week 1)

Phase 0 builds the base every later tool sits on, and records a score to beat. It adds no new tools.

- [ ] Envelope module in the sidecar (`Sandbox/Agent/src/mcp/result.js`): `ok(data)`, `fail(code, message, hint)`, and the codes `NOT_FOUND`, `STALE_WRITE`, `NO_MATCH`, `AMBIGUOUS_MATCH`, `BLOCKED`, `TIMEOUT`, `TOO_LARGE`, `BAD_INPUT`
- [ ] Teach the three readers both shapes: `callMcpTool` in `mcp.client.js`, `isToolErrorOutput` in `core/toolActivity.js`, and `callSandboxTool` in `Frontend/src/services/sandboxAgentClient.js`. A result with `ok: false` is a failure. Old shapes keep working
- [ ] Sidecar output cap for scoped tokens: 24,000 characters, `truncated: true`, same wording as `toolResult.js`
- [ ] Shared ring buffer helper with ids that only go up, for every `since` cursor (`Sandbox/Agent/src/workspace/ringBuffer.js`)
- [ ] List test: `Ai_orchestration/tests/` imports `CERTIFIED_TOOL_NAMES` from `Sandbox/Agent/src/mcp/tools.js` and compares it with the AI allowlist, the same way `scripts/live-e2e.js` already reaches into `Sandbox/Agent`
- [ ] Fix `search_code` `fileGlob`: write the failing test first (`src/**` must match `src/App.jsx`), then match with a real glob (`path.matchesGlob` on Node 22, or `picomatch`). The base image is Node 20, so check which one applies
- [ ] Delete both stale `tool-info/skill.md` files, or generate them from `tools.js` with a script. First confirm again with a search that nothing loads them
- [ ] Eval suite: 30 seeded tasks in `Ai_orchestration/evals/tasks/`, a runner `npm run eval` built on `scripts/live-e2e.js` (real model, real sidecar, temp workspace, no cluster), one JSON result file per run with pass or fail, tool calls and tokens per task

**Limits of the eval runner to know now:**

- It has no browser and no real Vite. Tasks that need Phase 1 or Phase 3 tools are checked by hand in the cluster on a seeded project, and the result is written into the same result file.
- The NVIDIA endpoint is paced by `llm/rateLimiter.js`. Thirty tasks take a long time. Run the suite at night, not after every change.

**Gate:** the eval suite runs end to end on today's 9 tools, and the baseline pass rate and tokens per task are saved in `Ai_orchestration/evals/baseline.json`.

**Later (LLMOps plan, last phase):** this runner becomes the base of the full eval pipeline in [llmops-evals-cicd-plan.md](llmops-evals-cicd-plan.md) section 3: golden datasets, context precision and recall (record which files each task read, so add a `filesRead` list to each task result now), LLM as judge, and a CI gate on every prompt or model change. Keep the result file format stable so that work only adds fields.

## 8. Phase 1: Observe (weeks 2 to 3)

Phase 1 lets the agent read what the browser reports: console logs, errors and failed requests, plus the dev server log with a cursor.

- [ ] Telemetry store in the sidecar's memory: three ring buffers (console 1000, errors 200, network 500 entries), each entry with a server `id` and `time`
- [ ] New open route `POST /api/agent/telemetry` for batches `{ console: [], errors: [], network: [] }`. It is open like `report-error`, because the preview app has no token. So: add it to `PUBLIC_PATHS`, clean every field with `cleanReportField`, cap the batch size, and rate limit it with `createReportLimiter`
- [ ] Keep `POST /api/agent/report-error` working as today, and also store each report in the errors buffer. Old projects only have this route
- [ ] New injected script in `Sandbox/template/vite.config.js`: all five console levels, `window.onerror`, `unhandledrejection`, and wrappers for `fetch` and `XMLHttpRequest` that record failed requests. Add the proxy entry for `/api/agent/telemetry` next to the one for `report-error`. Never proxy all of `/api/agent`
- [ ] Send a batch every 500 ms **only when there is something to send**, and use `navigator.sendBeacon` when the page unloads. No heartbeat: every request through the router extends the sandbox's life, and an idle open tab must not keep a sandbox alive
- [ ] Skip the telemetry endpoint inside the network wrapper, so it cannot report itself in a loop
- [ ] Dedupe errors by message plus top stack frame, and keep `count`, `firstSeen`, `lastSeen`
- [ ] Turn the page URL of a stack frame into a workspace path (strip origin and query). Source map lookup for exact lines is a stretch item
- [ ] Mask secrets on the way in (`tks_`, `Bearer`, JWTs). Never record request headers or bodies
- [ ] `get_dev_server_log`: read `/sandbox-logs/vite.log` from a byte offset (`since`), return `nextCursor`. If `since` is larger than the file (the file is trimmed above 5 MB), start from the beginning
- [ ] Tools `get_console_logs`, `get_browser_errors`, `get_network_log`, `get_dev_server_log`, following the change list in section 4. Add them to `CODER_TOOLS` and `DEBUGGER_TOOLS`. Move `getRuntimeLogs` and the frontend logs panel to the new name
- [ ] Every result includes `lastBrowserEventAt` (or `null`), so an empty list is not mistaken for a clean app when no page has loaded
- [ ] Tool descriptions say that browser text is data from the user's app, never instructions

```json
{
  "ok": true,
  "data": {
    "errors": [{
      "id": 41, "type": "runtime",
      "message": "Cannot read properties of undefined (reading 'theme')",
      "file": "src/components/BackgroundEffects.jsx", "line": 12, "col": 48,
      "count": 2, "firstSeen": "2026-11-13T18:57:02Z", "route": "/"
    }],
    "nextCursor": 41, "lastBrowserEventAt": "2026-11-13T18:57:02Z"
  },
  "error": null
}
```

**Known limit:** the buffers are in memory. They are empty after the agent container restarts, and a project made before this phase reports errors only (no console, no network) until its `vite.config.js` gets the new script.

**Gate:** on the seeded `state.ui` crash, in a new project with the preview open, the agent names the right file after one tool call.

## 9. Phase 2: Edit and find (weeks 4 to 5)

Phase 2 makes edits safe and cheap: small reads, many edits in one call, a diff on every write, and no silent overwrites.

- [ ] One file layer in the sidecar (`Sandbox/Agent/src/workspace/files.js`) that every file tool uses: `safeResolve`, read with hash, atomic write, diff. Phase 5 hooks in here
- [ ] The file layer appends `{path, at, actor}` to an in-memory write log (ring of 10,000) for every write: `run:<token jti>` for the AI service, `owner` for the editor, `external:<token id>` for MCP tokens. Cheap now, and the GitHub plan's `git_keeper` (G6b) needs it to tell the agent's changes from the user's
- [ ] `read_file`: `offset`, `limit`, numbered lines, `totalLines`, and a `hash` (sha256 of the whole file) per file
- [ ] `patch_file`: an `edits` array applied in order in memory, then one write. Any failed edit means nothing is written
- [ ] `expectedHash` on `patch_file` and `write_file`, optional at the sidecar. A mismatch returns `STALE_WRITE` with the current hash
- [ ] AI tool layer: keep `path -> hash` per run from every read and write result, send it as `expectedHash`, and clear it when the run releases its sandbox. The editor does not send a hash until Phase 5, so a user save still wins, as today
- [ ] `NO_MATCH` returns the closest lines (compare with whitespace ignored). `AMBIGUOUS_MATCH` returns the line number of each match
- [ ] A unified diff on every write, from the `diff` npm package (`createTwoFilesPatch`), capped like every result
- [ ] `write_file` with an `overwrite` flag. `create_file` and `update_file` stay as aliases. Move the editor calls in `editor.api.js` to `write_file`
- [ ] Atomic writes: write a temp file under `.taksha/tmp/`, then rename, so Vite never reads half a file
- [ ] `delete_file` moves files to `.taksha/trash/<time>/`, at most 50 MB, oldest removed first. Add `move_file`
- [ ] Add `.taksha` to `DEFAULT_IGNORE_DIRS` in `Sandbox/sync-agent/sync.js`, so trash and temp files never go to S3. The chokidar watcher already ignores dot folders
- [ ] `list_files` and `glob_files` honour `.gitignore` and always skip `node_modules`, `.git`, `dist` and `.taksha`
- [ ] `search_code` runs ripgrep (`rg --json`) with `outputMode`: `content`, `files` or `count`. Add `ripgrep` to `Sandbox/Agent/dockerfile`. Keep the input checks in `search.service.js`
- [ ] Update `WRITE_TOOLS`, `extractWritePaths` and the debugger's `writeScopeGuard` for `write_file` and `move_file`, and the labels in `codingAgent.hooks.js` and `copilot.hooks.js`

```jsonc
// patch_file request (expectedHash is added by the AI tool layer)
{
  "filePath": "src/store/store.js",
  "expectedHash": "9f2c...",
  "edits": [
    { "oldStr": "scores: scoresReducer,", "newStr": "scores: scoresReducer,\n    ui: uiReducer," },
    { "oldStr": "import scoresReducer", "newStr": "import uiReducer from '../features/ui/uiSlice';\nimport scoresReducer" }
  ]
}
// patch_file result
{ "ok": true, "data": { "hash": "41ab...", "editsApplied": 2, "diff": "--- src/store/store.js\n+++ src/store/store.js\n@@ ..." }, "error": null }
```

**Gate:** median tokens per task on the eval suite falls by half against the Phase 0 baseline, and the pass rate does not drop.

## 10. Phase 3: Run and see (weeks 6 to 8)

> **2026-11-26:** [universal-sandbox-runtime-plan.md](universal-sandbox-runtime-plan.md) changes this phase: the dev server is any framework run by `taksha-run`, so `restart_dev_server` writes `/sandbox-run/control.json` instead of touching `vite.config.js`, logs move to `/sandbox-run/dev.log`, and Chromium opens the preview gateway `http://localhost:39080` instead of `:5173`. The P1 telemetry script is injected by the gateway, not by a Vite plugin. Read that plan before building P1 or P3.

Phase 3 lets the agent run long commands and look at the app itself, with no user tab open.

**Run:**

- [ ] Background jobs in the sidecar: `execute_command` with `background: true` returns a `jobId`, and output goes to a ring buffer. At most 3 jobs, each stopped after 10 minutes. Jobs die with the pod
- [ ] `get_job_output` (with `since`) and `stop_job`
- [ ] Foreground commands keep the 120 s limit, so the 150 s limits in `invokeRoute.js` and `sandbox.client.js` stay correct
- [ ] Set `NO_COLOR=1`, `FORCE_COLOR=0` and `CI=1` for every command, and strip ANSI codes from output
- [ ] Shell guard: allow a pipe into `grep`, `head`, `tail` or `wc` after another command. Keep the two existing rules (file work uses the file tools, no dev servers). Change `mcp/tools.js` and `tools/guards.js` together. Safety comes from the sandbox (uid 1000, no capabilities, no service account token, NetworkPolicy), not from the filter
- [ ] `run_tests`: add Vitest and a `test` script to `Sandbox/template/package.json`, parse the JSON reporter into `passed`, `failed`, `failures`. A project without a `test` script gets `ok: false` with a hint to add one
- [ ] `restart_dev_server`: change the modified time of `vite.config.js`, then wait for Vite's ready line in `/sandbox-logs/vite.log` after the current offset, or return the error text. First confirm in a pod that Vite 8 restarts on this

**See:**

- [ ] **Spike first, 2 days:** run headless Chromium through Playwright inside the `agent` container, started on the first See call and closed after 5 idle minutes. Not a fourth container, so a sandbox that never uses it pays nothing. Check: it starts as uid 1000 with all capabilities dropped (needs `--no-sandbox` and `--disable-dev-shm-usage`, acceptable because it only opens `http://localhost:5173`, the user's own app), and how much memory it uses
- [ ] Raise the `agent` container memory limit in `pod.js` by what the spike measured (expected 512Mi to 1Gi), and validate with `node scripts/print-pod-manifest.js | kubectl create --dry-run=server -f -`
- [ ] If the spike fails: one shared browser pool as its own deployment that the NetworkPolicy lets reach sandbox port 5173. Decide after the spike, not before
- [ ] `get_dom`: the accessibility tree as text, capped like every other result
- [ ] `browser_action`: a `steps` array (`click`, `type`, `press`, `waitFor`), a 30 second budget, selectors by role and text first. Returns the final accessibility tree and logs
- [ ] `screenshot`: wait for the network to go idle, two fixed viewports (1280x800 and 390x844), return the PNG plus any errors seen during load. The PNG goes to the run's activity stream so the user sees it. It goes to the model only if the model accepts images. A text-only model works from `get_dom`
- [ ] Extend `parseText` in `mcp.client.js` to read an image content part
- [ ] A fresh browser context per call, closed afterwards, so state never leaks between checks
- [ ] The injected telemetry script also runs in headless Chrome, so those logs land in the same buffers

**Gate:** the agent fixes the seeded visual bug and the seeded keyboard bug, and proves each fix with its own `get_dom`, scripted run or screenshot.

## 11. Phase 4: Safety and loop (weeks 9 to 10)

Phase 4 makes the agent safe to leave alone: every change can be undone, risky actions ask first, and "done" requires proof.

- [ ] Checkpoints in a separate git directory outside the workspace: `GIT_DIR=/taksha-state/checkpoints.git`, `GIT_WORK_TREE=/workspace`, created on the first `checkpoint`. `/taksha-state` is a new `emptyDir` mounted in the `agent` and `sync-agent` containers only (not in `/workspace`, so Vite, the file tree and the user's repo never see it). The user's own `.git` is never touched, and old projects work too
- [ ] Persist checkpoints with the same archive code path as the GitHub plan's `.git` archive (its section 4.5.1: lock check, `fsck`, 3 versions), under `<projectId>/.taksha/checkpoints/`. One implementation, two directories. This removes the "checkpoints vanish when the pod stops" limit instead of accepting it
- [ ] `checkpoint`: commit the tree to `refs/taksha/checkpoints/<id>`, with `node_modules`, `dist` and `.taksha` excluded. Keep the last 50
- [ ] `restore` and `get_diff`
- [ ] The AI service takes a checkpoint at the start of every Orion run (a fixed call, not a model call)
- [ ] Ask-first rule, version 1: fixed defaults in code, no per-project settings. `restore` and commands outside a small allowlist pause the run with `interrupt()`, the same way `plan_review` does, and the UI shows an approve or reject card like `PlanReviewCard`. Per-project allow, ask and deny rules come later. **Needs foundation F1** (durable checkpointer and `agentruns`): a pause must survive an AI restart and be answerable from any replica
- [ ] Explorer sub-agent: a graph node that only gets `READ_ONLY_TOOLS` (the set already exists in `tools/index.js`)
- [ ] A short project map built at run start: framework, entry file, routes, scripts
- [ ] Decide on `todo_write` from the eval results (see section 5)

**Changed by the audit (2026-11-24):** checkpoints no longer die with the pod. They live in the shared `/taksha-state` volume and are archived to S3 by the sync-agent on stop (needs foundation F3, because today a pod is deleted with a 0 s grace period). Restore after a restart shows the checkpoints of the last session.

**Already there, nothing to build:** per-token rate limit for external agents (120 calls a minute in the router gateway), turn budgets and the repeat-call stop in `core/toolLoop.js`.

**System prompt rules to add in `core/prompts.js`:**

1. Search first, then read only the lines you need.
2. Never report done until the build passes, `get_browser_errors` is empty, and the changed route has been checked with `get_dom` or a screenshot.
3. After 3 failed fix attempts, restore the checkpoint and report the blocker.

**Gate:** eval pass rate at or above 80%, and the false "done" rate under 5%.

## 12. Phase 5: Live editor with Yjs and Monaco (weeks 11 to 12)

Phase 5 makes the agent's edits appear live in the user's open Monaco tab, and merges them with what the user is typing. It is a mirror of disk, and `patch_file` never calls it.

**Today:** the editor reloads a file when the `workspace-change` event arrives (`features/editor/Hooks/useWorkspaceSync.js`). That works when one side writes at a time. Yjs solves the other case: two writers in one open buffer.

**The design in five rules:**

1. **Disk stays the source of truth.** A Yjs document is a live copy of one open file, with one `Y.Text` for its content. It is created when a user opens the file and dropped when the last tab closes. Nothing is persisted in Yjs.
2. **Tools never touch Yjs.** `patch_file` and `write_file` keep writing to disk exactly as in Phase 2.
3. **A bridge keeps the two in step**, in both directions (below).
4. **Undo is per author.** A `Y.UndoManager` tracks only the user's origin, so Ctrl+Z never undoes the agent's work. The agent's changes are undone with `restore`.
5. **Big and binary files skip Yjs.** Above about 1 MB, Monaco opens the file read-only from disk.

**Agent edit to the editor (disk to Yjs):**

1. A tool writes the file through the file layer, which tells the bridge the path and new hash.
2. If that file has a Yjs document, the bridge diffs the old and new text (the `fast-diff` package).
3. It applies only the changed ranges to `Y.Text`, in one transaction with origin `disk`. It never replaces the whole text, because that would reset the user's cursor and undo history.
4. `y-monaco` updates every open editor. The changed lines are highlighted for a few seconds under an "Agent" label, using Yjs awareness.

**User typing to disk (Yjs to disk):**

1. The user types, and `y-monaco` updates `Y.Text` with the user's origin.
2. The bridge waits for 400 ms of quiet, then writes the file atomically and remembers the hash it wrote.
3. The file watcher sees the change, matches the hash, and ignores it. This stops an echo loop.
4. Before any tool reads or patches an open file, the file layer calls `bridge.flush(path)`, so the agent always sees the user's latest text.

**What happens on a clash:** if the user typed after the agent read the file, the agent's `expectedHash` no longer matches. `patch_file` returns `STALE_WRITE`, and the agent re-reads and patches again. No merge logic is needed in the tool. After 2 stale writes on one file, the agent tells the user it is waiting.

**Tasks:**

- [ ] Carry Yjs sync and awareness messages as binary events on the existing Socket.IO connection (`Sandbox/Agent/src/sockets/socket.js`). It already checks the owner token (`requireOwnerSocket`), refuses scoped tokens, and passes through the router. No new server and no new port
- [ ] `yjs` is already installed in the sidecar. Add `y-protocols` there, and `yjs`, `y-protocols` and `y-monaco` in `Frontend`
- [ ] `y-monaco` binding in the editor feature, one Monaco model per open file. Replace the reload in `useWorkspaceSync.js` for files that have a Yjs document
- [ ] Bridge module: `open(path)`, `close(path)`, `flush(path)`, `onDiskWrite(path, hash)`, called from the Phase 2 file layer, so every tool gets it for free
- [ ] Agent presence and changed-line highlights through awareness
- [ ] `get_editor_state`: the user's active file, cursor and selection, so "fix this" can mean the selected code
- [ ] A review view in Monaco's diff editor fed by `get_diff`, with accept and reject per change. This uses the Phase 4 diff, not Yjs
- [ ] Two-way stress test: a script types into a file through Yjs while the agent applies 20 patches to the same file

**Gate:** in the two-way test, no character is lost, and the text on disk equals the text in Monaco at the end.

## 13. Risks

| Risk | Phase | What goes wrong | How to limit it |
|---|---|---|---|
| Sidecar and AI service out of step | All | The AI service calls a tool an old pod does not have | The rollout order in section 4, the `offered` set, and the list test |
| Readers break on the new envelope | P0 | The frontend or a node reads `data.success` on a tool that now returns `ok` | Phase 0 teaches all three readers both shapes before any tool moves |
| Headless Chrome is heavy | P3 | Roughly 300 to 500 MB more memory per pod while it runs (estimate) | On demand in the agent container, closed after 5 idle minutes. Spike before building |
| The model cannot see images | P3 | Screenshots are useless to the agent | `get_dom` and `browser_action` return text. Screenshots are for the user unless the model check says otherwise |
| Telemetry floods | P1 | A `console.log` inside a render loop fills the buffer and hides the real error | Dedupe repeated messages into one entry with a `count`, keep errors in their own buffer, rate limit the route |
| Telemetry is untrusted input | P1 | The user's app prints text that reads like instructions to the model | Field caps, control characters stripped, and the tool description marks it as data |
| Secrets in logs | P1 | A token printed by the app lands in the buffer, then in the model's context | Mask known patterns on the way in. Never record request headers |
| Old projects miss the new script | P1 | Console and network tools stay empty for them | `report-error` keeps feeding the errors buffer. `lastBrowserEventAt` and the tool hint say why a list is empty |
| Stale-write retries loop | P2 | The user keeps typing, so every patch is stale | After 2 stale writes on one file, the agent tells the user it is waiting |
| Trash and temp files reach S3 | P2 | Deleted files are uploaded again | `.taksha` in the sync ignore list, in the same commit as the trash |
| Checkpoints vanish | P4 | The pod stops and the undo history is gone | Archived to S3 with the `.git` archive code path (P4 task), after foundation F3 |
| Yjs echo loop | P5 | Bridge writes to disk, watcher fires, bridge writes to Yjs, and so on | The hash check in the bridge, plus the two-way stress test as a release gate |
| NetworkPolicy is not enforced on Docker Desktop | P3 | A command can reach cluster services locally | Known gap of the local cluster. Do not rely on it in local tests |

**Open questions:**

- [ ] Does the main model accept image input? Decides how much `screenshot` is worth (check before Phase 3)
- [ ] Should a second template (Node API, Next.js, named in `Sandbox/template/featureTobeBuild.md`) come before Phase 3? This plan assumes Vite and React only

**What to build this week:** Phase 0, then the telemetry buffers, `get_browser_errors` and `get_console_logs`.
