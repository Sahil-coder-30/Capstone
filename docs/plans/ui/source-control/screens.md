# Source Control and GitHub: screens and components

UI for [github-source-control-plan.md](../../github-source-control-plan.md) (draft, written 2026-11-24). Wireframes: [wireframes.html](wireframes.html). Design rules: [../README.md](../README.md#design-system).

The plan is still open on decisions D1 to D6. These screens follow its recommendations (GitHub App, opt-out repo on create, merge on pull, terminal push shows a hint, unlink never deletes). If a decision changes, the screens to touch first are SC-1, SC-2 and SC-4.

New feature folder, as the plan says: `Frontend/src/features/source-control/{components,Hooks,service,slice}`.

| Screen | Phase | Component(s) |
|---|---|---|
| SC-1 Settings, GitHub | G1 | `features/settings/components/SettingsGithubPage.jsx`, new sub tab `github` in `SettingsPage.jsx` |
| SC-2 New project with repo | G4 | Block in the existing create-project form (Dashboard) |
| SC-3 Panel with diff | G3 | `ActivityBar.jsx`, `SourceControlPanel.jsx`, `CommitBox.jsx`, `ChangeGroup.jsx`, `ChangeRow.jsx`, shared `DiffView.jsx` |
| SC-4 Empty states | G3, G4 | `SourceControlEmpty.jsx` |
| SC-5 Commit menu, branch picker, sync | G3, G4 | `CommitMenu.jsx`, `BranchPicker.jsx`, status bar items in `App.jsx` |
| SC-6 Confirmations and errors | G3 to G5 | App modal card, `ScmNotice.jsx` |
| SC-7 Conflicts | G4 | Merge group, Monaco decorations in `useConflictDecorations.js` |
| SC-8 History, badges, gutter | G5 | `HistoryView.jsx`, `FileExplorer.jsx` change, `useGitGutter.js` |

---

## Placement

The plan's sketch puts an activity bar on the far left. In today's IDE the far left is the Orion panel, and Explorer lives inside the **Code** tab. So the activity bar (48 px, `App.scss .activity-bar`, ember indicator) sits at the left edge of the Code workspace, in front of the left pane. It switches that pane between Explorer and Source Control (and History in G5). The Orion panel, Preview tab and bottom panel do not move.

`Ctrl+Shift+G` opens Code, then Source Control. The SandboxHeader folder toggle keeps working: it opens or closes the left pane, whichever view is active.

## SC-1 Settings, GitHub

**Job:** connect, check and disconnect GitHub once per user.

- New sub tab after "API & Security", GitHub icon, same nav button style as the other tabs.
- Page title "GitHub", one lead sentence on what Taksha can and cannot do.
- Connected card: avatar, login, "Connected <date> · Access to n selected repositories", green "Connected" badge. Then rows with switches: "Create a repository for new projects" (D3 default on), "New repositories are private" (on). "Repository access" opens the GitHub App page (`Manage on GitHub`, `btn-secondary` with external icon). "Disconnect GitHub" (`btn-danger`) with a confirm modal.
- Not connected: one card, `Connect GitHub` (`btn-primary`).
- `needs_reconnect`: amber border card, "Sign-in expired", `Reconnect GitHub`.
- Landing from the callback (`?tab=github&connected=1`): toast "GitHub connected". Error (`connected=0&reason=`): error notice with the reason and `Try again`.
- Optional: after connect, offer once "Use github.com/<login> on your profile" (fills the free-text profile field the plan mentions).

## SC-2 New project with a repository

- Block inside the create-project form, only when connected. Checkbox "Create a GitHub repository" (on), helper text "On <login>, private. The first commit is pushed when the sandbox starts."
- Name field prefilled `taksha-<slug>`, with an `<login> /` prefix. Live check (debounced 400 ms): "Name is free" in green, or "You already have a repository with this name" in red with `Link it instead`.
- Private checkbox.
- Not connected: muted notice "Not connected to GitHub? The project is still created. You can publish it later from Source Control." with a `Connect GitHub` link.
- Creating never waits for GitHub. If the repo call fails, the project opens and Source Control shows SC-4 "Publish to GitHub".

## SC-3 Source Control panel

**Panel header** (`.panel-header`, 38 px, uppercase title like Explorer): Commit (check), Refresh, View as tree / list, More (`Pull`, `Push`, `Fetch`, `Stash`, `Pop stash`, `Show history`).

**Commit box**
- Multi-line textarea, grows to 6 lines. Placeholder "Message (Ctrl+Enter to commit on "<branch>")".
- ✨ icon button inside the top right (G6, hidden before): writes the message from the staged diff, shows a spinner in place, puts the text in the box for editing. Never commits by itself.
- Split button: solid ember `Commit` and a caret for the menu (SC-5).
- Disabled with no changes, or while merging with conflicts left.

**Groups:** `Merge Changes` (only while merging), `Staged Changes`, `Changes`. Header: chevron, name, count pill; on hover: discard all and stage all (or unstage all).

**Rows:** file name, folder in `--text-disabled`, status letter on the right in mono:

| Letter | Meaning | Colour token |
|---|---|---|
| M | Modified | `--git-modified` (#E2C08D dark, #9a6700 light) |
| A | Added | `--success` |
| D | Deleted, name struck through | `--error` |
| U | Untracked | `--git-untracked` (#73C991 dark, #1a7f37 light) |
| R | Renamed | `--accent-hover` |
| C | Conflict | `--git-conflict` |

Add the `--git-*` tokens to `Frontend/src/styles/index.scss` in both themes. They are the only new colours this plan needs.

Hover actions: open file, discard, stage (or unstage). Row click opens the diff. Selected row uses `--bg-active`.

**Diff:** opens as an editor tab named `<file> (Working Tree)` or `<file> (Index)`, with a compare icon. Right part of the tab strip: `Side by side` / `Inline` segmented control and `Open file`. Monaco `DiffEditor`, left from `git_show_file`, right is the live file and stays editable. Shares `DiffView.jsx` with the agent tools review (AT-7).

**Status bar** (left section, before the sandbox status): branch with `*` when dirty (opens SC-5 picker), `↓behind ↑ahead`, `Sync`. Right section: linked repo `<login>/<repo>`, click opens GitHub in a new tab.

**Refresh:** on `git-change` (300 ms debounce) and `workspace-change` (500 ms). No polling.

## SC-4 Empty states

| Case | Title | Body | Actions |
|---|---|---|---|
| No `.git` | No repository yet | This project has no Git history. Start one to track changes and commit. | `Initialize repository` (solid), `Publish to GitHub` (ghost), helper line |
| Repo, no GitHub | Local only | Commits stay in this project. Connect GitHub to push them and pull changes made elsewhere. | `Connect GitHub` (solid), then the normal groups |
| Repo gone | (warning notice) The repository <name> was deleted or renamed on GitHub. | | `Create a new repository`, `Link another repository`, `Unlink` (red text) |
| Sandbox stopped | Start the sandbox to see changes. | | `Start Sandbox` |
| Loading | Skeleton rows (tokens `skeleton` mixin) | | |

## SC-5 Commit menu, branch picker, sync

- Commit menu (`.dropdown-menu`): Commit (Ctrl+Enter), Commit and Push, separator, Commit (Amend), separator, Write message with AI (G6).
- Nothing staged on commit: modal "Stage all changes and commit?" with checkbox "Always stage all when nothing is staged" (saved with the Editor & Copilot settings), `Cancel`, `Stage all and commit`.
- Branch picker: anchored above the status bar item, full width of the editor area up to 520 px. Search input on top ("Select a branch or type a new name"), `Create new branch…`, `Create new branch from…`, then Local and Remote groups. Current branch marked "current", ahead counts on the right.
- Switching with a dirty tree: modal "You have uncommitted changes" with `Stash and switch` and `Cancel` (plan: `git_checkout` refuses unless `stash: true`).
- Sync: spinner and the op name in the status bar ("Pulling…", "Pushing…"). One remote op at a time; other remote buttons are disabled while it runs. Result toast: "Pushed 2 commits to main", "Pulled 3 commits", "Already up to date".

## SC-6 Confirmations and errors

| Case | Pattern | Copy |
|---|---|---|
| Discard tracked file | Modal, `btn-danger` | "Discard changes in <file>?" / "Your edits since the last commit are lost. This cannot be undone." / `Discard changes` |
| Discard untracked file | Modal, `btn-danger` | "Move <file> to trash?" / `Move to trash` |
| Discard all | Modal | "Discard all n changes?" names the count |
| Secret file staged | Modal, safe option solid | "A secret file is staged" / "<file> looks like it holds secrets. Pushing it puts them on GitHub." / `Push anyway`, `Unstage and push` |
| Remote ahead | Warning notice in panel | "The remote has new commits. Pull first, then push." + `Pull` |
| Token expired | Error notice | "GitHub sign-in expired." + `Reconnect GitHub` |
| Archive too big | Warning notice | "History is larger than 200 MB, so it is not saved when the sandbox stops. Push to keep it." |
| Terminal push | Muted notice once per session | "Typed git push in the terminal? Use Sync in Source Control instead." |

Notices sit at the top of the panel body, newest first, and clear on the next successful op.

## SC-7 Conflicts

- Warning notice at the top: "Merging <ref>. Fix n conflicts, stage them, then commit." Commit disabled until Merge Changes is empty. `Abort merge` (ghost) at the end of the panel, with a confirm.
- Conflicted files show `C` in `--git-conflict`.
- In Monaco: code lens style actions above each block: Accept Current Change | Accept Incoming Change | Accept Both Changes | Compare Changes (links in `--accent-hover`). Current block tinted green, incoming tinted indigo. Staging the file marks it resolved.
- Status bar: branch shows "(merging)", right side "n conflicts" in red.

## SC-8 History, explorer badges, gutter (G5)

- History view: third item in the activity bar. Commit rows with an ember graph rail, message, author and short sha, relative time. Selecting a commit lists its files; a file opens the commit diff in `DiffView`. Infinite scroll with `git_log` cursor (limit 50 per page).
- Explorer: changed file names take the status colour, letter on the right (`.gl`). Folders show a small dot when a child changed.
- Editor gutter: 3 px bars from `git_diff` of the open file. Added green, changed indigo, removed a small red triangle. Click a bar to peek the old lines inline.

## Keyboard

| Keys | Action |
|---|---|
| Ctrl+Shift+G | Open Source Control |
| Ctrl+Enter (in commit box) | Commit |
| Alt+↓ / Alt+↑ (in a diff) | Next / previous change |
| Enter on a row | Open diff |
| Space on a row | Stage or unstage |

## Accessibility

- Status letters also have an `aria-label` ("Modified", "Untracked").
- Row actions are real buttons with labels, reachable with Tab when the row has focus.
- Remote op progress announced with `aria-live="polite"`.
