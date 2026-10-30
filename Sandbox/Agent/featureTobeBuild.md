# Sandbox/Agent (sidecar): features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Token authentication (HTTP + Socket.IO) | PRD target "unauthenticated sidecar access 0%" is not met. See fix.md P0-1. | Sandbox server mints tokens; router checks them | M |
| 2 | Per-user / per-socket terminal sessions | Replaces the single global PTY broadcast. | #1 | S |
| 3 | In-pod runtime error buffer (no Kubernetes API) | Lets `vite-runtime-errors` work without namespace-wide `pods/log` access. | template error reporter (exists) | S |
| 4 | Command policy (allow/deny lists, non-root execution) | Real isolation for `exec`, shared with AI guards. | AI `guards.js` | S |
| 5 | MCP server (`POST /mcp`, `tools/list`, JSON-RPC) | Headline claim in README/PRD/doc 02. Could wrap the existing REST handlers so AI keeps working. Optional: drop the claim instead. | #1 | L |
| 6 | `get_file_tree` tool and 2 MB read cap | Both documented, neither exists. Tree tool reduces tool calls for the agent. | none | S |
| 7 | Yjs collaborative sync | Documented in README; never imported. Only needed if multi-cursor editing is a real goal. | Frontend | L |
| 8 | Keep-alive HTTP agent / connection reuse for AI calls | Documented, not present. Small latency win. | AI `sandboxClient.js` | S |
| 9 | Template-type awareness (`TEMPLATE_TYPE`) | Docs describe per-template tool sets; only the Vite React template exists. Needed before adding a second template. | template images | M |

Suggested order: 1 → 2 → 3 → 4 → 6 → 8, then decide on 5, 7, 9.
