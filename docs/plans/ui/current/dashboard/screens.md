# Dashboard: screens and components

Status: built in `Frontend/src/features/dashboard/components/Dashboard.jsx` (mounted from `Frontend/src/App.jsx` when signed in with no `currentProjectId` and `activeRoute` not set to `'settings'`). Wireframes: [wireframes.html](wireframes.html) (open in a browser, light and dark switch at the top right). Design rules: [../../README.md](../../README.md#design-system).

The Dashboard uses a 240 px collapsible left sidebar (64 px collapsed, resizable 180 to 360 px) and a scrollable main viewport switching on `activeTab` (`playground`, `recents`, `my-apps`) synced with the `?tab=` URL query parameter.

| ID | Screen | Component file | Route or trigger | Data source |
|---|---|---|---|---|
| CD-01 | Playground: describe a new app | `Frontend/src/features/dashboard/components/Dashboard.jsx` | `?tab=playground` (default) or `Playground` / `New App` nav | `POST /api/ai/app-agent/title`, `GET /api/sandbox/projects`, Dexie `db.projects` |
| CD-02 | Provisioning panel | `Frontend/src/features/dashboard/components/Dashboard.jsx` | `allocationStep > 0` after Playground submit | `POST /api/ai/app-agent/title`, `POST /api/sandbox/create-project`, `POST /api/sandbox/start/:projectId`, `GET /api/preview-ping` |
| CD-03 | Recents with search | `Frontend/src/features/dashboard/components/Dashboard.jsx` | `?tab=recents` or `Recents` nav | `GET /api/sandbox/projects`, Dexie `db.projects`, `POST /api/sandbox/stop/:projectId` |
| CD-04 | My Apps grid with project cards | `Frontend/src/features/dashboard/components/Dashboard.jsx` (`ProjectCard`, `StatusBadge`) | `?tab=my-apps`, `My Apps` nav, or back from IDE | `GET /api/sandbox/projects`, Dexie `db.projects`, `POST /api/sandbox/stop/:projectId` |
| CD-05 | Create project modal | `Frontend/src/features/dashboard/components/Dashboard.jsx` | `New Project` button on `My Apps` (`projects.length < 5`) | `POST /api/sandbox/create-project`, Dexie `upsertCachedProject` |
| CD-06 | Delete project confirm | `Frontend/src/features/dashboard/components/Dashboard.jsx` (`ConfirmModal`) | `Delete Project` in any `ProjectCard` menu | `DELETE /api/sandbox/project/:projectId`, Dexie `deleteCachedProject` |
| CD-07 | Account menu | `Frontend/src/features/dashboard/components/Dashboard.jsx` | Click sidebar footer profile bar | Redux `state.auth.user` (`GET /api/auth/getMe`), `GET /api/payments/credit`, `POST /api/auth/logout` |

---

## CD-01 Playground: describe a new app

**Purpose:** Let the user describe an app idea in natural language or pick a preset chip to synthesize and launch a new containerized React + Vite project.

**Data and API calls:**
- Sidebar `ACTIVE & RECENTS` (capped at `projects.slice(0, 6)`) hydrates immediately from IndexedDB via `getCachedProjects()` (`EditorCacheDB.projects`) and refreshes from `GET /api/sandbox/projects` via `useDashboard().listProjects()`.
- Submitting runs `handlePlaygroundSubmit`: calls `authenticatedFetch('/api/ai/app-agent/title', { method: 'POST', body: { message } })`, falling back to `App - <first 16 chars>` on failure, then passes control to CD-02.
- Stores the prompt in `sessionStorage` (`initialPrompt_<projectId>`) so `AIChat` auto-sends it after the IDE mounts.

**States:**
- Empty prompt: `Create App` disabled; placeholder `"Describe an app and let CodeSpace do the rest..."`.
- Typing (`promptInput.length > 0`): `.prompt-card-wrapper.is-typing` enables dual-snake border animation and active ember `Create App` button.
- Error (`allocationError`): inline red alert box above the prompt card.
- 5-project limit reached (`projects.length >= 5`): submitting triggers `window.alert("You have reached the maximum of 5 projects. Please delete one to create a new app.")`.

**Exact copy:**
- Title: `Build your ideas with CodeSpace`
- Subtitle: `Spin up a containerized React + Vite workspace dynamically and let the agent implement your details instantly.`
- Textarea placeholder: `Describe an app and let CodeSpace do the rest...`
- Icon titles: `Voice Input`, `Attach Design Spec`, `Refresh active lists`
- Buttons: `I'm feeling lucky`, `Create App`
- Chips: `React Dashboard`, `Metallic Three.js Scene`, `Pricing Calculator`, `Developer Portfolio`
- Sidebar: `Playground`, `New App`, `Recents`, `My Apps`, `ACTIVE & RECENTS`, `No projects created`

**Components reused:** `BrandLogo`, `AmbientOrbs` (`DashboardStars`), `.icon-btn`, `useDashboard`, `useSandbox`, `useSettings`.

---

## CD-02 Provisioning panel

**Purpose:** Show step-by-step progress and live logs while the orchestrator names, creates, and boots a new sandbox pod from a Playground prompt.

**Data and API calls:**
- Step 1 (`allocationStep === 1`): `POST /api/ai/app-agent/title`.
- Step 2 (`allocationStep === 2`): `POST /api/sandbox/create-project` via `createProject(title)`, followed by `upsertCachedProject(responseProj.project)` in IndexedDB.
- Step 3 (`allocationStep === 3`): `POST /api/sandbox/start/:projectId` via `useSandbox().startSandbox(newProjectId)` and preview readiness polling on `GET /api/preview-ping` every 2 s (up to 90 s), appending `warmingMessage` lines into `allocationLogs`.
- Completion: redirects into the IDE via `onSelectProject(newProjectId, newProjectTitle)`.

**States:**
- Steps 1 to 3: completed steps turn green (`--completed`), active step highlights in indigo (`--active`), console scrolls live log lines.
- Failed (`catch`): logs error, sets `allocationError`, and resets `allocationStep` to `0` (returns to CD-01 with error banner).

**Exact copy:**
- Title: `Assembling Sandbox`
- Subtitle: `Configuring a virtual sandbox environment on the Capstone orchestrator. Just a few seconds...`
- Steps: `Synthesizing project title & features`, `Creating workspace directories`, `Spinning up sandbox pod`
- Console lines: `Initializing AI pipeline session...`, `Decomposing prompt parameters...`, `Synthesized project title: "<title>"`, `Creating workspace directory...`, `Workspace directory created successfully`, `Sandbox ID: <sandboxId>`, `Requesting sandbox pod boot...`, `Sandbox container provisioned` and `Redirecting to workspace...` (lines 510 and 528 include trailing exclamation marks in source)

**Components reused:** `DashboardStars`, `useDashboard().createProject`, `useSandbox().startSandbox`, `upsertCachedProject`.

---

## CD-03 Recents with search

**Purpose:** Provide fast search, status filtering, and one-click access or stop controls for active and recently used workspaces.

**Data and API calls:**
- Reads `projects` loaded from `getCachedProjects()` and `GET /api/sandbox/projects`.
- `activeProjects` filters `status === 'live' || status === 'building'`.
- `Stop` / `Stop Sandbox` calls `POST /api/sandbox/stop/:projectId` via `useSandbox().terminateSandbox(projectId)`, then re-fetches via `fetchProjects(true)`.
- `Delete Project` opens CD-06 (`ConfirmModal`).

**States:**
- Loading (`loading === true`): spinner + `"Loading environments…"`.
- Spotlight visible (`activeProjects.length > 0`, filter not `'offline'`, and search empty): displays `ACTIVE NOW (N)` card grid above the full grid.
- Search or filter empty (`filteredRecentProjects.length === 0`): shows `"No matching projects found"` (if `recentsSearch` non-empty) or `"No Recent Projects"` (if empty).
- Error (`error`): bottom `.dashboard__error-banner` with dismiss button.

**Exact copy:**
- Heading: `Recents`
- Subtitle: `Fast access to your active sandbox environments and recently updated workspaces.`
- Actions: `New App`, search placeholder `Search active or recent projects...`
- Filter pills: `All (<n>)`, `Active (<n>)`, `Offline (<n>)`
- Spotlight: `ACTIVE NOW (<n>)`, `Running container instances with instant codespace access`, `ID: <id>…`, `Open Workspace`, `Stop`
- Empty states: `No matching projects found` / `Try clearing your search query or changing filters.`; `No Recent Projects` / `Use the Playground tab to build an app and see active projects here.`

**Components reused:** `ProjectCard`, `StatusBadge`, `.icon-btn`, `useSandbox`, `useDashboard`.

---

## CD-04 My Apps grid with project cards

**Purpose:** Display all user projects (maximum 5) with sandbox status, capacity indicator, and create/open/stop/delete actions.

**Data and API calls:**
- Same project list source (`getCachedProjects()` + `GET /api/sandbox/projects`).
- `Stop Sandbox` calls `POST /api/sandbox/stop/:projectId`.
- `Open Codespace` calls `onSelectProject(project._id, project.title)` in `App.jsx`, which dispatches `initializeSandboxForProject(id)` and mounts the IDE (`GET /api/sandbox/project/:projectId`).

**States:**
- Loading: spinner + `"Loading environments…"`.
- Empty (`projects.length === 0`): dashed box with `"No Projects Yet"`.
- Populated (`1..4` projects): grid of `ProjectCard` items, `New Project` enabled.
- Capacity reached (`projects.length >= 5`): `New Project` disabled, capacity strip shows `Capacity reached` warning.
- Error: `.dashboard__error-banner`.

**Exact copy:**
- Heading: `My Projects`
- Subtitle: `Create and manage up to 5 sandbox development environments.`
- Button: `New Project`
- Capacity bar: `ENVIRONMENTS: <n> / 5`, `Capacity reached`
- Empty state: `No Projects Yet` / `Use the Playground tab to describe what you want to build and spin up a workspace.`
- Project card: status badges `Live`, `Building`, `Offline`, `Not Started`; menu `Stop Sandbox`, `Delete Project`; meta `SANDBOX ID`, `CREATED`, `N/A`; button `Open Codespace`

**Components reused:** `ProjectCard`, `StatusBadge`, `.icon-btn`, `ConfirmModal`.

---

## CD-05 Create project modal

**Purpose:** Create an empty named project directly from `My Apps` without starting from a Playground prompt.

**Data and API calls:**
- Submitting calls `createProject(titleToCreate)` (`POST /api/sandbox/create-project`), updates IndexedDB via `upsertCachedProject`, optionally stores `promptInput` in `sessionStorage`, and calls `onSelectProject(id, title)`.

**States:**
- Idle: focused text input (`maxLength={50}`).
- Validation error (`validationError`): red border on input and inline error text (`"Project title is required"`, `"You can only create up to 5 projects"`, or server error / `"Failed to create project"`).
- Creating (`createLoading === true`): inputs and buttons disabled, `Initialize` replaced by spinner.

**Exact copy:**
- Title: `Name Your CodeSpace`
- Subtitle: `Give a title to initialize your sandbox.`
- Label: `Workspace Name`
- Placeholder: `e.g. My Creative App, Vite Sandbox...`
- Buttons: `Cancel`, `Initialize`

**Components reused:** `.modal-backdrop`, `.modal-card`, `.btn-secondary`, `.btn-primary`, `.icon-btn`.

---

## CD-06 Delete project confirm

**Purpose:** Confirm permanent deletion of a project and teardown of its sandbox container and local caches.

**Data and API calls:**
- `Delete` calls `useSandbox().deleteProject(deleteTarget.id, deleteTarget.sandboxId)` (`DELETE /api/sandbox/project/:projectId`), clears IndexedDB `db.projects` (`deleteCachedProject`) and `localStorage` chat cache (`codingAgent_messages_<projectId>`), then calls `fetchProjects(true)`.

**States:**
- Confirm: shows target project title and destructive warning; `Escape` or backdrop click cancels.
- Deleting (`deleteLoading === true`): buttons disabled, `Delete` shows spinner.
- Error: closes modal and displays `"Failed to delete project"` (or response message) in `.dashboard__error-banner`.

**Exact copy:**
- Title: `Delete Project`
- Description: `Are you sure you want to permanently delete "<title>"? This will also tear down any running sandbox and cannot be undone.`
- Buttons: `Cancel`, `Delete`

**Components reused:** `ConfirmModal`, `.modal-backdrop`, `.modal-card`, `.btn-secondary`, `.btn-danger`.

---

## CD-07 Account menu

**Purpose:** Surface user identity, subscription tier, settings navigation, theme toggle, billing portal link, and sign-out from the sidebar footer.

**Data and API calls:**
- User `name`, `email`, and `photo` come from Redux `state.auth.user` (populated by `GET /api/auth/getMe` in `useAuth().verifySession`).
- Tier ring and label come from Redux `state.settings.credit.subscription` loaded on mount via `useSettings().loadCredit()` (`GET /api/payments/credit`).
- Theme toggle writes `localStorage.theme` (`'light'` or `'dark'`) and toggles `.light-theme` on `document.documentElement`.
- `Logout` calls `useAuth().authLogout()` (`POST /api/auth/logout`) and clears URL search params.

**States:**
- Closed: footer bar shows avatar/initials inside tier ring (`free`, `pro`, `max`), user name, tier badge (`Free`, `Pro`, `Max`), and right chevron.
- Open (`profileMenuOpen === true`): chevron rotates 90 deg and `.sidebar-profile-flyout` appears to the right of the footer. Closes on outside `mousedown`.

**Exact copy:**
- Trigger title: `Account menu`
- Tier badges: `Free`, `Pro`, `Max`
- Menu items: `My Profile`, `Settings`, `Upgrade to Pro` (or `Upgrade to Max` on Pro, `Manage Plan` on Max) with badge `PRO` / `MAX`, `Billing & Plans`, `Light Mode` / `Dark Mode`, `Logout`

**Components reused:** `.sidebar-profile-flyout`, `useSettings().loadCredit`, `useAuth().authLogout`.

---

## Gaps seen in the code

- **Unused `useDashboard` Redux state:** `Dashboard.jsx` imports `listProjects` and `createProject` from `useDashboard()`, yet keeps separate local `useState` variables for `projects`, `loading`, `error`, and `recentsSearch` instead of reading `state.dashboard`.
- **Dead `handlePromptSubmit` and unused imports:** `Dashboard.jsx` defines `handlePromptSubmit` (lines 547 to 555) and `isSettingsOpen` / `settingsTab` state (lines 249 to 250) without rendering or wiring them, alongside unused Lucide icon imports (`BookOpen`, `History`, `Keyboard`, `HelpCircle`, `CheckCircle`, `XCircle`, `Activity`, `ZapIcon`).
- **Unwired Playground action icons:** `Voice Input` and `Attach Design Spec` buttons in the Playground prompt footer have no `onClick` handlers.
- **Account flyout upgrade badge mismatch:** In `Dashboard.jsx` lines 741 to 746, when `subscription === 'pro'`, the label renders `"Upgrade to Max"` while the pill badge beside it still renders `"PRO"` (`subscription === 'max' ? 'MAX' : 'PRO'`).
- **Two `My Profile` / `Settings` targets do the same thing:** Both `My Profile` and `Settings` in the account menu call `handleNavigateSettings()` without passing a specific settings tab.
- **Browser `alert()` for 5-project cap in Playground:** `handlePlaygroundSubmit` calls `window.alert(...)` when `projects.length >= 5`, whereas `handleCreateProject` renders an inline `validationError`.
- **Duplicate refresh buttons on Recents:** `.dashboard__header` renders a Refresh icon button above all tabs, and `Recents` renders a second Refresh icon button inside `.dashboard__projects-panel-header`.
- **`deleteTarget` omits `sandboxId`:** `ProjectCard` calls `onDelete(project._id, project.title)` without `project.sandboxId`, so `deleteTarget.sandboxId` passed to `deleteProject` on line 581 is `undefined` (`deleteCachedProject` still cleans up by `projectId` lookup).
- **Spinner instead of skeleton cards, and silent mutations:** Loading renders a spinner (`"Loading environments…"`) instead of skeleton cards, and `Stop Sandbox` / `Delete Project` refresh silently without a confirmation toast.
- **Accessibility on sidebar nav items:** Sidebar navigation links and `ACTIVE & RECENTS` items are `<div onClick>` elements rather than semantic `<button>` elements.
- **Light-theme SCSS emerald remnants and hard-coded `projectsCount`:** `Dashboard.scss` light-theme rules still use emerald-tinted hex values (`#ecfdf5`, `#a7f3d0`) on active sidebar items and filter pills, and `App.jsx` passes a hard-coded `projectsCount={2}` to `SettingsPage`.
