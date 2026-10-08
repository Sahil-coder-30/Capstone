# Orion Fix Roadmap — Prioritized, with Patches

Your doc already nailed the root-cause analysis. This is the execution order plus the actual
code — including two gotchas the original write-up glosses over (the reducer-reset trap in RC1,
and a residual thrash risk in RC3).

## Priority order & why

1. **RC4 (zero output)** — isolated, one node + one guard clause, zero risk of touching graph
   topology. Ship this today; it stops the "blank chat window" bug regardless of what else is broken.
2. **RC1 (checkpointer pollution)** — everything downstream of `routerNode` behaves correctly
   only if state entering it is clean. Fix this before you touch RC2/RC3/RC5, or you'll be
   debugging symptoms of stale state and mistaking them for new bugs.
3. **RC3 (scope guard schema mismatch)** — currently the guard is either silently bypassed
   (createFile/updateFile) or wrongly blocking (patchFile). Fix before RC2, because a fixed
   Critic will approve more "create" steps, which means more `createFile` calls hitting the
   guard.
4. **RC2 (planner↔critic loop)** — schema fix + hard revision cap.
5. **RC5 (tester↔debugger burn loop)** — cheap guard, no architecture change.
6. **RC7 (sandbox timeout)** — one-line change, do it opportunistically.
7. **RC6 (Clio streaming)** — separate codepath from Orion, lowest urgency, biggest refactor.

---

## Fix 1 — Zero-output escape hatch (RC4)

```js
// socket.js
const STREAMABLE_NODES = new Set(["general", "coder", "debugger", "finalizer"]);
```

```js
// finalizer.node.js
async function finalizerNode(state) {
  const diff = state.diffSummary || "No file changes were made.";
  const summary = state.escalated
    ? `Couldn't fully complete this automatically.\n\n${state.currentSituation}\n\nChanges so far:\n${diff}`
    : `Done. ${state.currentSituation || "Task completed."}\n\nChanges:\n${diff}`;

  return {
    messages: [new AIMessage(summary)],
    taskStatus: state.escalated ? "escalated" : "complete",
    currentSituation: summary,
  };
}
```

```js
// ai.controller.js — belt-and-suspenders fallback, independent of the streaming path
if (!assistantText) {
  assistantText = finalState.currentSituation || finalState.diffSummary
    || "Task finished with no summary available.";
}
```

Edge case the fallback doesn't cover: if `finalizerNode` itself throws before returning (e.g.
`diffSummary` computation fails), you still get nothing. Wrap the diff/git-status call in a
try/catch inside finalizer and fall back to `"Task finished — see file changes in the editor."`

---

## Fix 2 — Checkpointer reset (RC1)

Two viable approaches. Pick one, don't half-do both.

**Option A — fresh thread per task run.** Simple, but you lose `messages` continuity across
turns unless you reconstruct history from MongoDB on each invoke (which `ai.controller.js`
seems to already do via `formattedHistory` for Clio — reuse that helper for Orion).

```js
const thread_id = `${projectId}:${taskId}`; // taskId = new uuid per user message
```

**Option B — keep `thread_id: projectId`, explicitly reset task-scoped channels on each
invoke.** Keeps `messages` continuity for free. This is what your doc recommends — but there's
a trap: **you can't reset an accumulator-reducer channel with `[]`.**

```js
// routingHistory reducer as currently written:
(x, y) => (y ? [...x, ...y] : x)
```

`[]` is truthy in JS, so passing `routingHistory: []` as input hits the `[...x, ...[]]` branch
— which just returns `x` unchanged. Your "reset" silently does nothing. Same bug applies to
`attemptedFixes`. Fix the reducer to treat `null` as an explicit reset sentinel:

```js
routingHistory: (x, y) => {
  if (y === null) return [];
  return y ? [...x, ...y] : x;
},
attemptedFixes: (x, y) => {
  if (y === null) return [];
  return y ? [...x, ...y] : x;
},
```

Then in `ai.controller.js`, pass the reset as part of the *invoke input* (not a node return —
input-level merge happens before the first node runs):

```js
await appAgent.invoke(
  {
    messages: [new HumanMessage(task)],
    plan: null,
    planApproved: false,
    currentStep: 0,
    routingHistory: null,   // sentinel → []
    attemptedFixes: null,   // sentinel → []
    criticPass: false,
    criticFeedback: "",
    buildLog: null,
    testResults: null,
    flaggedFiles: [],
    retryCount: 0,
    escalated: false,
    diffSummary: null,
    taskStatus: "routing",
  },
  { configurable: { thread_id: projectId } }
);
```

Also worth doing regardless of A/B: migrate `MemorySaver` → Redis or Postgres checkpointer
(your own scaling doc already flags this) — in-memory state doesn't survive a pod restart,
so today a mid-task pod eviction is indistinguishable from RC1's symptom.

---

## Fix 3 — Tool scope guard (RC3)

```js
function extractFilePaths(toolName, input) {
  switch (toolName) {
    case "createFile":
      return (input.files || []).map((f) => f.file);
    case "updateFile":
      return (input.updates || []).map((u) => u.file);
    case "patchFile":
      return [input.filePath];
    default:
      return [input.path || input.file || input.filename].filter(Boolean);
  }
}

function buildScopedTools(activeFiles) {
  const allowSet = new Set((activeFiles || []).map((f) => normalize(f)));
  const scopeCheck = (tool) => async (input, config) => {
    const violations = extractFilePaths(tool.name, input)
      .map(normalize)
      .filter((p) => allowSet.size > 0 && !allowSet.has(p));
    if (violations.length) {
      return {
        error: `SCOPE_VIOLATION: ${violations.join(", ")} not in allowlist. ` +
               `Allowed files: ${[...allowSet].join(", ")}`,
      };
    }
    return tool.invoke(input, config);
  };
  // wrap createFile, updateFile, patchFile with scopeCheck
}
```

The `Allowed files:` addition matters as much as the extraction fix — right now when the
guard *does* fire correctly, the LLM sees a bare rejection and retries blind variations. Giving
it the actual allowlist lets it self-correct in one turn instead of thrashing.

---

## Fix 4 — Planner/Critic schema (RC2)

```js
const PlanStepSchema = z.object({
  id: z.number(),
  title: z.string(),
  action: z.enum(["create", "modify", "delete"]),
  activeFiles: z.array(z.string()),
});
```

```js
// critic.node.js
for (const step of plan.steps) {
  if (step.action !== "create" && step.activeFiles?.length > 0) {
    for (const file of step.activeFiles) {
      if (!workspaceFileSet.has(normalize(file))) {
        issues.push({ stepId: step.id, type: "FILES_MISSING", detail: `"${file}" not in workspace` });
      }
    }
  }
}
```

Schema fix removes the *false-positive* loop, but doesn't cap a *genuine* disagreement loop
(critic keeps finding real issues, planner keeps failing to address them). Add a hard cap
alongside it — this is your doc's own "maxRevisions ≤ 2" from §9, which isn't actually wired
into `criticEdge` in the code shown:

```js
export function criticEdge(state) {
  if (state.criticPass) return "coder";
  if ((state.planRevisions ?? 0) >= 2) return "finalizer"; // escalate, don't loop forever
  return "planner";
}
```

`planRevisions` needs an accumulating reducer (`(x, y) => y ?? x + 1`, incremented in
`criticNode` on each rejection) and the same reset treatment as RC1 above.

---

## Fix 5 — Tester/debugger burn loop (RC5)

```js
// tester.node.js
const pkgJson = JSON.parse(await readFile.invoke({ path: "package.json" }, config));
if (!pkgJson?.scripts?.build) {
  // no build script exists — nothing to verify at this layer, don't fail the task over it
  return { testResults: { pass: true, errorLines: [], flaggedFiles: [] } };
}
```

And separately — even with a real build script, if `flaggedFiles` ever comes back empty on a
genuine failure, don't hand the debugger an empty allowlist (that's what strips it down to
read-only tools in the first place):

```js
const filesForDebugger = flaggedFiles.length > 0 ? flaggedFiles : state.activeFiles;
```

---

## Fix 6 — Sandbox timeout (RC7)

```js
const isLongRunning = /npm (install|ci)|npm run build/.test(command);
const COMMAND_TIMEOUT = isLongRunning ? 120000 : 30000;
```

120s of total silence is still bad UX even if it no longer false-fails. If you want this to
actually feel responsive, swap `exec()` for `spawn()` and forward `stdout`/`stderr` chunks to
the socket as they arrive instead of buffering until completion — cheap change, big perceived
latency win.

---

## Fix 7 — Clio streaming (RC6)

```js
// ai.controller.js
const eventStream = appAgent.streamEvents(
  { messages: formattedHistory },
  { version: "v2", configurable: { thread_id } }
);

for await (const event of eventStream) {
  if (event.event === "on_chat_model_stream") {
    const content = event.data?.chunk?.content;
    if (typeof content === "string" && content) {
      res.write(`data: ${content}\n\n`);
    }
  }
}
```

`streamEvents` walks the full callback tree, so it picks up token chunks from `createReactAgent`
sub-invocations too — no change needed to `inspectorNode`/`modifierNode`/`responderNode`
themselves, as long as `config` (with the callback manager) is still forwarded into each nested
`.invoke()`, which your current code already does. Worth factoring the event-filter into a
shared helper — Orion's `socket.js` and Clio's controller end up doing the same
`on_chat_model_stream` filtering with different plumbing.

---

## Residual risk after all seven

- **RC2's cap doesn't fix a wrong-but-syntactically-valid `action`.** The LLM can still tag a
  modify step as `"create"` and skip a real file-existence check. Regex was brittle; an enum
  the model can still mis-set is *less* brittle but not bulletproof. Consider a cheap
  post-hoc check: if `action === "create"` but the file *already exists*, flag it as
  `FILE_ALREADY_EXISTS` instead of silently overwriting.
- **RC1 Option B's reducer sentinel pattern needs to be applied to every accumulator channel**,
  not just the two shown — audit `messages` too if you ever want per-task (not per-project)
  message scoping.
- **RC5's `pkgJson.scripts.build` check assumes a single-root project.** If Taksha ever
  supports monorepo workspaces, this needs to check the right `package.json` for the active
  workspace, not the repo root.

---

## If constraints were looser

Two structural changes underneath all seven point-fixes:

1. **Replace regex-based state judgments with structured verifier calls.** `detectStuckLoop`,
   the critic's `isCreationStep` regex (now fixed, but only for this one case), and
   `buildFailed` detection in tester are all pattern-matching over strings that were never
   designed to be parsed that way. A cheap, fast model call with a Zod-typed output
   (`{ isLooping: boolean, reason: string }`) generalizes past whatever regex you write today,
   at the cost of one extra small LLM call per check.
2. **Postgres/Redis checkpointer with per-run snapshots, not just per-thread state.** Beyond
   surviving pod restarts, this gives you a debug replay tool for free — pull any
   `(projectId, taskId)` pair's full state history and step through exactly where a run
   diverged, instead of reconstructing it from logs after the fact.