// prompts.js
// Prompt pieces shared by several nodes.

/** Appended to every system prompt of a node that uses tools. */
export const GROUNDING_RULES = `=== GROUNDING RULES (always) ===
- Only state facts you saw in a tool result in THIS run. Never claim a file was created, changed or verified unless a tool result confirmed it.
- Never invent file paths, imports, components, packages, APIs or command output. If you have not listed or read it, check first.
- If a tool result has "error": true or "success": false, the action did NOT happen. Read the error, fix the input, then retry or report the blocker.
- Prefer reading the real file over remembering it. Files change during the run.
- Do not repeat the same tool call with the same arguments. Use the result you already have.
- If something is impossible or unclear, say so plainly. A truthful "blocked" is better than a fake "done".`;

export const PROJECT_CONTEXT = `The user's project is a React + Vite app in a live sandbox at /workspace. The Vite dev server already runs on port 5173 with hot reload. Paths are relative to /workspace (e.g. "src/App.jsx", no leading slash).`;
