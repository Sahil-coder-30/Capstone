# Agent tools: screens and components

UI for [taksha-agent-tools-build-plan.md](../../taksha-agent-tools-build-plan.md). Wireframes: [wireframes.html](wireframes.html) (open in a browser, light and dark switch at the top right). Design rules: [../README.md](../README.md#design-system).

Everything here lives inside the existing IDE (`App.jsx`): Orion panel on the left, Preview and Code in the middle, the bottom panel with Problems, Output, Terminal and Ports. No new page, no new colours. Orion parts use the `_orion.scss` mixins (`row-item`, `pill-tag`, `mono-text`, `action-button`), panel chrome uses `.tab-bar`, `.tab-btn`, `.panel-header` from `App.scss`.

| Screen | Phase | Where in code | New or changed |
|---|---|---|---|
| AT-1 Problems tab | P1 | `App.jsx` bottom tab `problems` (today a static placeholder) | New `features/logs/components/ProblemsPanel.jsx` |
| AT-2 Output tab | P1 | `features/logs/components/RuntimeLogs.jsx` | Changed: source switch, level filter, text filter, live cursor |
| AT-3 Tool steps | P1 to P3 | `features/coding-agent/components/activity/ToolStepRow.jsx`, `utils/toolSteps.utils.js` | New verbs, new cards: `EditDiffCard`, `JobCard`, `TestResultCard`, `ScreenshotCard` |
| AT-4 Ask first | P4 | `components/plan/PlanReviewCard.jsx` pattern | New `components/approval/ApprovalCard.jsx` |
| AT-5 Checkpoints | P4 | `components/conversation/RunItem.jsx` footer | New `CheckpointList.jsx`, restore modal |
| AT-6 Live editor | P5 | `features/editor/components/CodeEditor.jsx`, `Hooks/useWorkspaceSync.js` | Changed: y-monaco binding, presence, agent highlight, save state |
| AT-7 Diff review | P5 | `features/editor/components/` | New `DiffReview.jsx` on Monaco `DiffEditor` (shared with Source Control, see [../source-control/screens.md](../source-control/screens.md)) |

---

## AT-1 Problems tab

**Job:** show what is broken in the running app without opening the browser console.

**Data:** `get_browser_errors` (deduped, with `count`), `get_dev_server_log` with `level: error|warn`. Poll with `since` / `nextCursor` while the tab is open, every 2 s; when the tab is closed, poll every 10 s only for the badge count.

**Layout**
- Tab label `Problems` with a count pill: red (`--error-glow` bg, `--error` text) when errors exist, hidden when zero.
- Toolbar right side: `Fix with Orion` (Orion `action-button`, solid ember), `Clear` (ghost), close.
- Two groups, collapsible: **Browser** (errors from the preview) and **Build** (Vite errors and warnings). Group header shows a pill count and where it comes from on the right.
- Row: status icon, message (one line, `--text-secondary`), second line `file:line:col` in mono, `×count` pill, `Open file` (ghost, opens Monaco at the line).
- Status bar gets an error and warning counter next to "Sandbox Active". Click opens this tab.

**States**
- Empty: keep today's copy and green check: "No problems have been detected in the workspace."
- Sandbox not running: "Start the sandbox to see problems from your app." with `Start Sandbox`.
- Telemetry not available (old project without the injected script): show Build group only, plus a muted notice "Browser errors need a newer project setup. Build errors still show here."

**Behaviour**
- `Fix with Orion` opens the Orion panel and fills the composer with: `Fix this error: <message> at <file:line>`. It does not send.
- `Clear` calls `get_browser_errors({ clear: true })` and empties the Browser group.
- Message text is untrusted app output: render as text only.

## AT-2 Output tab

**Job:** read console, failed network calls and the dev server log in one place.

**Layout:** a second toolbar row (34 px) under the tab bar:
1. Source segmented control: `Console` · `Network` · `Dev server` (state saved per project in `localStorage`).
2. Level segmented control: `All` · `Errors` · `Warnings` · `Info` (Console and Dev server only).
3. Text filter (180 px min).
4. Right side: live dot + line count, Pause, Clear view.

**Rows:** mono 11.5 px, 20 px line height, timestamp in `--text-disabled`, level column 40 px. Error rows tint `rgba(239,68,68,.06)`, warning rows tint amber. Network source is a table: method, URL (truncated, full on hover), status (pill), duration ms.

**Data:** `get_console_logs({ since, levels, search, limit })`, `get_network_log({ since, statusMin })`, `get_dev_server_log({ since, level })`. The panel passes the same filters the user picks, so the user and Orion look at the same slice.

**States:** empty source: "No console output yet. Open the preview to start collecting." Pause shows "Paused. 24 new lines" as a clickable pill.

## AT-3 Tool steps in the Orion run

**Job:** show what the agent is doing with the new tools in the same quiet row style as today.

**Rows:** keep `ToolStepRow` (status icon 11 px, verb, mono target). Add the verbs in the table on the wireframe to `toolSteps.utils.js` (`getStepVerb`), running and done forms. Hit counts and durations go in a right-aligned `meta` span in `--text-disabled`.

**Cards** (all use the ChangedFiles card shell: 1 px border, radius 6, title row 11 px muted):

| Card | Trigger | Content |
|---|---|---|
| `EditDiffCard` | `patch_file`, `write_file` results with a diff | Title: status icon, "Edited" / "Created", path in mono, `+n` and `−n` pills, chevron. Body: unified diff, 8 lines collapsed, header line in indigo tint, adds green, deletes red. Click path opens the file |
| `JobCard` | `execute_command` with `background: true` | Title: spinner, "Running in background", command, timer, `Stop`. Body: last 6 lines of `get_job_output`. When done: check or cross, exit code, total time |
| `TestResultCard` | `run_tests` | Pills `n passed`, `n failed`. Each failure is an error notice: test name in bold, `file:line` in mono, message. Click opens the file at the line |
| `ScreenshotCard` | `screenshot`, `browser_action` | Two thumbnails (Desktop 1280 x 800, Phone 390 x 844), click opens full size in a modal. Pill "no errors on load" (green) or "n errors on load" (red) |

Long runs: cards collapse to their title row once the run finishes, except the last test card.

## AT-4 Ask first

**Job:** pause the run for a risky step and let the user decide.

**When:** `restore`, and `execute_command` with a command outside the allowlist (plan section 11). Same `interrupt()` path as plan review.

**Layout:** card with amber border (`rgba(245,158,11,.45)`), amber title with shield icon: "Orion wants to run a command" / "Orion wants to restore a checkpoint".
- Command: the exact command in a mono block, one sentence on why it asks, optional reason input, `Reject` (ghost) and `Run command` (solid).
- Restore: checkpoint name and time, list of files that change (from `get_diff`, status pill per file), warning notice "Your own edits to these files since <time> are lost too.", `Keep files` and `Restore n files`.

**Around it:** ChatHeader state becomes `waiting` ("Waiting for you", amber). The composer is disabled with placeholder "Orion is waiting for your answer above".

**Copy rules:** buttons name the action. After approval the step row reads "Ran npm install express-rate-limit@7"; after reject "Skipped: npm install …".

## AT-5 Checkpoints

**Job:** let the user undo agent work while the sandbox runs.

- `ChangedFiles` card gets a `Review changes` ghost button (opens AT-7 for this run).
- New `CheckpointList` card at the end of a run that made checkpoints: a thin vertical timeline, indigo dots for checkpoints, `Restore` ghost button per row except the first, newest at the bottom, "Now" as the last item.
- Muted notice once per chat: "Undo is available while the sandbox runs. Stopping the sandbox clears checkpoints."
- User restore opens the app modal (`.modal-card`): title `Restore "<label>"?`, one sentence, file list, `Cancel` (`btn-secondary`) and `Restore n files` (`btn-primary`). After restore: toast "Restored 3 files" and a step row in the chat.

## AT-6 Live editor

**Job:** show Orion's edits in the file the user has open, without fighting their typing.

- Presence chips on the right of the editor tab strip while a live document exists: `You` (ember dot) and `Orion` (indigo dot). Hidden when only the user is there.
- Orion's changed lines: indigo tint `rgba(99,102,241,.12)` and a 3 px indigo gutter bar for 4 s, then fade. A small "Orion" flag sits at the right end of the first changed line (awareness cursor label).
- The open tab of a file Orion is editing shows an indigo dot instead of the file icon.
- Status bar: `Saving…` during the 400 ms quiet window, then `Saved` with a check.
- Stale writes: after 2 on one file, Orion posts the amber notice "You are editing <file>. Orion will wait until you pause, then try again." and the step row "File changed while editing".
- Undo: Ctrl+Z undoes only the user's own changes. No UI needed, but the first time Orion edits an open file, show a one-time muted tip under the tabs: "Ctrl+Z undoes your typing only. Use Review changes to undo Orion's."

## AT-7 Diff review

**Job:** accept or reject each change Orion made in a run.

- Opens from `Review changes` (AT-5) or from a run's changed file. Replaces the editor area in the Code tab; Preview is untouched.
- Review bar (38 px, replaces the editor tabs): run name and counts, `Side by side` / `Inline`, `Reject all` (ghost), `Accept all` (solid), close.
- Left list (250 px, like Explorer): changed files with progress pill (`2 of 3`, `done`, `new`).
- Monaco `DiffEditor`. Above each hunk on the right side an indigo hunk bar: "Change 2 of 3", `Reject`, `Accept`.
- Accept keeps the change. Reject writes the original lines back with `patch_file` and `expectedHash`.
- Keys: Alt+↓ / Alt+↑ next and previous change, Esc closes. Shown in the status bar.
- Done state: "All changes reviewed" with `Close review`.

This view and the Source Control diff share one `DiffView` component in `features/editor/components/`.

## Accessibility

- All new buttons have text or `aria-label` (follow `IconButton`).
- Live log and Problems lists use `aria-live="polite"` for new errors only, not every console line.
- Colours: every status also has an icon or a word, never colour alone.
- `prefers-reduced-motion`: no spinner rotation, no line fade.
