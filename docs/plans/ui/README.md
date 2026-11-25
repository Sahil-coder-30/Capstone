# UI plans: every screen the plans need

Written 2026-11-24. One folder per plan that needs UI, each with a `screens.md` (what each screen does, data, states, copy, components) and HTML wireframes. Open [index.html](index.html) in a browser to see them all. Every board has a light and dark switch at the top right. All numbers and names in the wireframes are sample data.

## Which plans need UI

| Plan | UI | Folder | Screens |
|---|---|---|---|
| [taksha-agent-tools-build-plan.md](../taksha-agent-tools-build-plan.md) | Yes, inside the IDE | [agent-tools/](agent-tools/screens.md) | AT-1 to AT-7: Problems, Output, tool steps and cards, ask first, checkpoints, live editor, diff review |
| [github-source-control-plan.md](../github-source-control-plan.md) (draft) | Yes, inside the IDE and Settings | [source-control/](source-control/screens.md) | SC-1 to SC-8: Settings GitHub, new project with repo, Source Control panel, empty states, commit and branch menus, confirms, conflicts, history |
| [kafka-whatsapp-architecture.md](../kafka-whatsapp-architecture.md) | K5 and K6 only | [whatsapp-notifications/](whatsapp-notifications/screens.md) | WA-1 to WA-5 (user app), NT-1 to NT-4 (admin notify module) |
| [admin-platform-hld.md](../admin-platform-hld.md) + `Admin/PLAN.md` | Yes, a new app | [admin-platform/](admin-platform/screens.md) | AD-01 to AD-60 in four boards: access, organization, data and analytics, operations |
| [taksha-tool-call-analytics-plan.md](../taksha-tool-call-analytics-plan.md) | In the admin portal (P4) | [tool-call-analytics/](tool-call-analytics/screens.md) | TA-1 to TA-3 |
| [llmops-evals-cicd-plan.md](../llmops-evals-cicd-plan.md) | No user UI. Optional admin tab | [llmops/](llmops/screens.md) | LM-1, LM-2 (proposal) |
| [mcp-sandbox-server.md](../mcp-sandbox-server.md) | Already built | none | The "Connect your own agent" modal exists (`ConnectAgentModal.jsx`) |
| Sandbox edge auth (built 2026-11-25, `Sandbox/router/src/sandboxEdgeAuth.js`) | Yes, Preview tab, WhatsApp and router pages | [preview-sharing/](preview-sharing/screens.md) | PS-1 to PS-6: owner-only preview and new tab, share a live preview, live links, link from WhatsApp, what a viewer sees, expired / turned off / asleep / private pages |
| [CHECKLIST.md](../CHECKLIST.md), [README.md](../README.md) | Index files | none | |

## Screens already built

Wireframes of every screen that exists in the code today (added 2026-11-25), so the whole app, built and planned, is in one place. They live in [current/](current/INVENTORY.md). [current/INVENTORY.md](current/INVENTORY.md) lists each screen with its component file, route or trigger and main states. Each board has a `screens.md` marked "Status: built". The prompt used to draw them is in [current/AGY-PROMPT.md](current/AGY-PROMPT.md).

| Board | App | Screens | Files |
|---|---|---|---|
| Public and sign in | `Frontend/` | CA-01 to CA-07: landing page sections, sign in, session check | [wireframes](current/public-auth/wireframes.html), [screens.md](current/public-auth/screens.md) |
| Dashboard | `Frontend/` | CD-01 to CD-07: Playground, provisioning, Recents, My Apps, create and delete, account menu | [wireframes](current/dashboard/wireframes.html), [screens.md](current/dashboard/screens.md) |
| IDE | `Frontend/` | CI-01 to CI-11: workspace, preview states, editor, bottom panel, Orion, plan review, chat history, Clio, connect an agent, request errors | [wireframes](current/ide/wireframes.html), [screens.md](current/ide/screens.md) |
| Settings | `Frontend/` | CS-01 to CS-05: Profile Account, Editor & Copilot, Billing & Limits, API & Security, Trash & Recovery | [wireframes](current/settings/wireframes.html), [screens.md](current/settings/screens.md) |
| Payments in the main app | `Frontend/` | CP-01 to CP-05: plans, comparison, plan detail, checkout, invoices (today the route redirects to the billing app) | [wireframes](current/payments/wireframes.html), [screens.md](current/payments/screens.md) |
| Billing app | `payments_frontend/` | PF-01 to PF-11: intro, dashboard, usage, requests, plans, checkout, invoices, sign in required | [wireframes](current/payments-frontend/wireframes.html), [screens.md](current/payments-frontend/screens.md) |

## Design system

These screens do not invent a new look. Every value comes from the app as it is today. The shared kit [_shared/taksha-wireframe.css](_shared/taksha-wireframe.css) copies the tokens so the wireframes look like the real screens.

### Colour (from `Frontend/src/styles/index.scss`)

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--bg-canvas` | `#0A0A0C` | `#ffffff` | Page and editor background |
| `--bg-surface` / `--bg-sidebar` | `#111114` | `#ffffff` / `#f4f4f6` | Panels, sidebars, cards |
| `--bg-overlay` | `#18181D` | `#ffffff` | Panel headers, bottom panel, modals, menus |
| `--bg-element` | `#232329` | `#f1f5f9` | Inputs, selected nav, secondary buttons |
| `--border` / `--border-strong` | `#2A2A31` / `#3B3B45` | `#d0d7de` / `#8c8c94` | All separators |
| `--brand-primary` (ember) | `#EA580C` | `#C2410C` | Primary actions, active tab underline, active icons, running state, focus ring |
| `--accent-primary` (indigo) | `#6366F1` | `#4f46e5` | Links, info, the agent's own marks (Orion cursor, agent lines), scope strip, second chart series |
| `--success` / `--warning` / `--error` | `#22C55E` / `#F59E0B` / `#EF4444` | darker text variants | Status only, always with an icon or word |
| `--text-primary` / `--text-secondary` / `--text-muted` / `--text-disabled` | `#FFF` / `#E4E4E7` / `#A1A1AA` / `#52525B` | `#1a1a1e` / `#57606a` / `#6e7781` / `#afb8c1` | Headings / body / hints / chrome |

New tokens these plans need (add to `index.scss`, both themes): `--git-modified`, `--git-untracked`, `--git-conflict` for Source Control status letters. Nothing else.

Colour roles that repeat across plans:
- **Ember = you and your primary action.** Your cursor, the Commit button, the active tab.
- **Indigo = the agent and the system.** Orion's live cursor and changed lines, links, the admin scope strip, info notices.
- **Amber = waiting for a human.** Ask-first cards, "Waiting for you", expiring access.

### Type

`Fira Sans` for UI, `Fira Code` for code, paths, ids, commands and masked values. Sizes in use: 11 px panel titles and meta, 12 to 13 px body and rows, 13.5 px settings nav, 15 px modal titles, 20 px page titles, 24 px KPI numbers. Panel titles in the IDE keep the existing uppercase 11 px style; everything new uses sentence case.

### Spacing and shape

8 px grid (`tokens.scss`). Radius: 6 px for rows, pills and Orion cards; 7 px buttons and inputs; 10 px menus and editor blocks; 12 px panels and settings cards; 14 px modals and auth cards. Heights: 38 px tab bars and panel headers, 24 px status bar, 44 px sandbox header, 48 px activity bar width, 56 px admin top bar, 248 px admin sidebar.

### Components reused

| Component | From | Used in |
|---|---|---|
| `.tab-bar`, `.tab-btn`, `.panel-header`, `.status-bar`, `.activity-bar` | `App.scss` | AT, SC |
| Orion rows, pills, notices, `action-button` | `features/coding-agent/styles/_orion.scss` | AT, SC, WA-4 |
| `PlanReviewCard` pattern | coding-agent | AT-4, WA-4 |
| `.btn-primary` (ember to indigo gradient), `.btn-secondary`, `.btn-danger`, `.modal-card`, `.dropdown-menu` | `styles/index.scss` | everywhere |
| Settings sidebar and cards | `SettingsPage.jsx` | SC-1, WA-1 to WA-3 |
| AppShell, Sidebar, Topbar, Kpi, Panel, Table, Badge, Drawer, Segmented, Meter, BarChart | `payments_frontend` | Admin portal, TA, LM, NT |

### Shared new components (build once)

| Component | Used by |
|---|---|
| `DiffView` (Monaco `DiffEditor` wrapper with side by side / inline and per-hunk actions) | AT-7, SC-3, SC-8 |
| `StepUpDialog` | All admin sensitive actions |
| `ScopeStrip` | Every admin list with limits |
| `ConfirmAction` (one sentence, reason, named button) | AT-4/5, SC-6, AD-51, NT-4 |

### Polish pass (v2, 2026-11-24)

The boards were polished to production fidelity, still only with the app's tokens:

- **Real-looking data**: lists have realistic row counts, sorted the way the spec says, with a table footer (count and pages).
- **Charts** have a y axis, gridlines, slimmer bars with rounded tops, grouped bars for two series side by side, and a hover tooltip drawn on one bar.
- **Notices** use a tinted surface and border; the colour sits on the icon and the lead words, and the body stays readable. Links in notices end with "›".
- **Code and diffs** keep their indentation; side by side diffs line up the way Monaco does, with hatched filler lines.
- **States**: every board ends with a States section: skeleton loading, empty, reader error, no access, filtered, and the result toast.
- **Interaction**: buttons, chips, tabs and rows have hover states; segmented controls, tab bars and chip groups switch on click; motion is 120 ms and stops under `prefers-reduced-motion`.
- **Hide notes** (top right of every board) hides the numbered pins and notes, to see each screen as it ships.

New shared pieces to build once, next to the ones above: `Skeleton` (rows and lines), `EmptyState` (icon, one-line title, one sentence, optional action), `Toast` (verb from the button, optional Undo), `TableFooter` (count and pages), `ChartTooltip`.

## Rules the wireframes follow

- Buttons name the action ("Restore 3 files", "Approve with passkey"). Toasts reuse the verb ("Restored 3 files").
- Errors say what happened and the next step, no apologies.
- Status is never colour alone.
- Every list has an empty, loading and error state in its `screens.md`.
- `prefers-reduced-motion` turns off spinners and fades.

## How to view

Open [index.html](index.html), or any `wireframes*.html` directly. They load fonts from Google Fonts; offline they fall back to the system font.
