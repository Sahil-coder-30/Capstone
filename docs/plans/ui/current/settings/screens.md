# Settings: screens and components

Wireframes for the built settings module in `Frontend/`. Open [wireframes.html](wireframes.html) in a browser (light and dark switch at top right, hide notes toggle beside it). Design rules: [../../README.md](../../README.md#design-system), built inventory: [../INVENTORY.md](../INVENTORY.md).

Status: built (`Frontend/src/features/settings/components/SettingsPage.jsx`)

| ID | Screen | Component file | Route or trigger | Data source |
|---|---|---|---|---|
| CS-01 | Profile Account | `Frontend/src/features/settings/components/SettingsProfilePage.jsx` | `?route=settings`, default `profile` tab (Dashboard profile menu `My Profile` or `Settings`, or `SandboxHeader` gear icon) | `GET /api/auth/profile`, `PUT /api/auth/profile` |
| CS-02 | Editor & Copilot | `Frontend/src/features/settings/components/SettingsAppearancePage.jsx` | Sidebar `Editor & Copilot` (`activeSubTab === 'editor'`) | `GET /api/auth/preferences`, `PUT /api/auth/preferences`, IndexedDB `dbService`, `localStorage.theme` |
| CS-03 | Billing & Limits | `Frontend/src/features/settings/components/SettingsBillingPage.jsx` | Sidebar `Billing & Limits` (`activeSubTab === 'limits'`) | `GET /api/payments/credit` (plus `packages`, `transactions`, `summary`, `analytics` loaded by `SettingsPage`), `projectsCount` prop |
| CS-04 | API & Security | `Frontend/src/features/settings/components/SettingsSecurityPage.jsx` | Sidebar `API & Security` (`activeSubTab === 'security'`) | `POST /api/settings/keys`, `DELETE /api/settings/keys/:keyId`, `PUT /api/auth/preferences`, Redux `settings.apiKeys` |
| CS-05 | Trash & Recovery | `Frontend/src/features/settings/components/SettingsTrashPage.jsx` | Sidebar `Trash & Recovery` (`activeSubTab === 'trash'`) | `GET /api/sandbox/projects/trash`, `GET /api/ai/chats/trash`, restore and permanent delete endpoints in `sandbox.api.js` |

---

## Shell (`SettingsPage.jsx`)

- Mounted by `Frontend/src/App.jsx` when `activeRoute === 'settings'` (`?route=settings`), wrapped in `Suspense` with `PageSkeleton` (`"Taksha Settings"`).
- Two-column layout: fixed `260px` sidebar (`--bg-surface`, right border `--border`, padding `24px 16px`) and scrollable content area (`--bg-canvas`, padding `48px 64px`, inner container `max-width: 800px`).
- Sidebar top: `Back to Dashboard` button (returns to `playground`), `System Settings` uppercase label, and five buttons in code order: `Profile Account`, `Editor & Copilot`, `Billing & Limits`, `API & Security`, `Trash & Recovery`.
- Sidebar bottom (separated by `1px solid var(--border)`): `Playground` and `My Apps` buttons redirecting via `onBackToDashboard('playground')` and `onBackToDashboard('my-apps')`.
- On mount, `SettingsPage` dispatches `loadSettings`, `loadCredit`, `loadPackages`, `loadTransactions`, `loadTransactionSummary`, and `loadAnalytics`.

## CS-01 Profile Account

**Purpose:** View the signed-in developer summary and edit professional profile details, core skills, and social links.

**Data and API calls:**
- Reads auth props (`user`, `userName`, `userInitials`, `userPhoto`) from `App.jsx` and `profile` from Redux `settings` slice (`GET /api/auth/profile` in `fetchSettingsAPI`).
- Submit calls `updateProfile` -> `PUT /api/auth/profile` (`updateProfileSettingsAPI`), updating Redux `setProfile`.
- `Log Out Session` triggers `onLogout` -> `authLogout()` in `App.jsx`.

**States:**
- View / edit form: hydrated from `profile` on mount; renders skill tags below the skills input whenever `profile.skills?.length > 0`.
- Save done / error: `alert('Profile successfully updated.')` or `alert(err || 'Failed to update profile.')`.
- Delete account: `if (confirm('Delete account?')) alert('Simulating account deletion.')`.

**Exact copy:**
- Header badge: `FREE DEV PLAN`
- Card 1: `Professional Profile`, labels `Job Title` (`e.g. Senior Frontend Engineer`), `Company / Organization` (`e.g. Google, Stripe`), `Location` (`e.g. San Francisco, CA`), `Years of Experience` (`e.g. 5`), `Short Bio` (`Tell us about yourself...`), `Core Skills (comma separated)` (`React, Node.js, TypeScript, Kubernetes`).
- Card 2: `Social Integrations & Links`, labels `GitHub Profile` (`https://github.com/username`), `LinkedIn Profile` (`https://linkedin.com/in/username`), `Twitter / X Profile` (`https://twitter.com/username`), `Website / Portfolio` (`https://yourportfolio.dev`).
- Submit button: `Save Profile Changes`.
- Card 3: `Danger Zone`, body `Permanently delete your developer account and remove all active containers, API secrets, and cloud configurations. This process is irreversible.`, buttons `Delete Developer Account`, `Log Out Session`.

**Components reused:** `SettingsPage` shell, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `lucide-react` (`User`, `Save`, `Trash2`, `LogOut`, `ShieldAlert`, `Code2`, `Link`, `Globe`, `MapPin`, `Briefcase`, `Calendar`, `Award`).

## CS-02 Editor & Copilot

**Purpose:** Configure the workspace theme, Monaco editor defaults, and coding-agent suggestion preferences.

**Data and API calls:**
- Reads `preferences` (`theme`, `editor`, `copilot`) from Redux via `GET /api/auth/preferences`, with IndexedDB fallback (`getCachedPreferences`).
- Every theme click, select change, or toggle calls `onUpdatePreferences` -> `PUT /api/auth/preferences` (`updatePreferencesAPI`) and writes `setCachedPreferences` in Dexie.
- Theme click also toggles `light-theme` on `document.documentElement` and writes `localStorage.setItem('theme', ...)`.

**States:**
- Selected theme card gets `2px solid var(--brand-primary)` border and circular check badge.
- No loading, error, or saved toast UI in the component.

**Exact copy:**
- Card 1: `Workspace Theme`, cards `Dark Mode`, `Light Mode`, `System Default`.
- Card 2: `Editor Configurations`:
  - `Font Size`: `Font size of the active codespace editor and terminal.` (`12px`, `14px`, `16px`, `18px`)
  - `Tab Spacing`: `Number of spaces inserted when pressing TAB.` (`2 spaces`, `4 spaces`, `8 spaces`)
  - `Code Minimap`: `Show mini layout scroll view on the right side of Monaco editor.`
  - `Word Wrap`: `Force long code lines to wrap inside the editor viewport.`
  - `Auto-save Changes`: `Automatically compile and save changes every 5 seconds.`
- Card 3: `AI Copilot Preferences`:
  - `Inline Code Suggestions`: `Show ghost-text code completions while typing.`
  - `AI Explanation Style`: `Verbosity preference of the coding agent response chats.` (`Detailed & Educational`, `Concise & Direct`)

**Components reused:** `SettingsPage` shell, `dbService.js`, `lucide-react` (`SlidersHorizontal`, `Moon`, `Sun`, `Monitor`, `Check`, `Sparkles`, `ToggleLeft`, `ToggleRight`).

## CS-03 Billing & Limits

**Purpose:** Show current subscription tier, remaining AI credits per provider, token totals, and sandbox container allocations, with a handoff to the billing app.

**Data and API calls:**
- Reads `credit` from Redux (`GET /api/payments/credit` via `fetchCreditAPI`), `Refresh Credits` re-runs `loadCredit`.
- `Manage Subscription & Plans` invokes `onNavigatePayments` -> redirects browser from `:5173` to `:5174` (`payments_frontend`).
- `Sync Container Quotas` triggers `onSyncLimits` (`alert('Synced sandbox limits.')` in `App.jsx`).

**States:**
- Provider bucket grid (`providerCredits.filter(bucket => bucket.company !== 'unknown')`) renders only when `providerCredits.length > 0`.
- No dedicated loading skeleton or error banner.

**Exact copy:**
- Banner: `Current Plan: {planLabel} Tier`, `Account Subscription & Usage Limits`, `You are currently on the {planLabel} subscription. Upgrade your tier to unlock higher vCPU sandboxes, multi-agent AI orchestration, and priority execution.`, button `Manage Subscription & Plans`.
- Credits card: `AI Credits & Provider Quotas`, button `Refresh Credits`, label `REMAINING FREE CREDITS`, `{creditsRemaining.toFixed(2)} / 20.00 Credits`, caption `Free tier accounts receive 20 credits per model provider. Pro & Max plans feature un-capped metered AI processing.`, balance box `Your Balance` / `Credits Left`, token cards `Prompt Tokens`, `Completion Tokens`, `Total Tokens`.
- Containers card: `Active Sandbox Containers`, `CONTAINERS PROVISIONED`, `{projectsCount} / 5 Active Environments`, `CPU Allocation` (`0.5 / 2.0 vCPU`), `Memory Allocated` (`512 MB / 2 GB`), button `Sync Container Quotas`.

**Components reused:** `SettingsPage` shell, `lucide-react` (`RefreshCw`, `Cpu`, `Database`, `Coins`, `ArrowUpRight`, `Sparkles`, `Zap`, `ArrowRight`).

## CS-04 API & Security

**Purpose:** Manage workspace API keys, security email alerts, and view the placeholder for sandbox environment variables.

**Data and API calls:**
- Reads `apiKeys` and `preferences.notifications` from Redux `settings` slice.
- Form submit calls `onGenerateApiKey` -> `POST /api/settings/keys` (`generateApiKeyAPI`).
- Delete calls `onDeleteApiKey` -> `DELETE /api/settings/keys/:keyId` (`deleteApiKeyAPI`).
- Notification toggles call `onUpdatePreferences` -> `PUT /api/auth/preferences`.

**States:**
- Empty key list: dashed box `"No active API keys found. Generate one below to get started."`
- Copy key: swaps copy icon to green `Check` for `2000 ms`.
- Generate / delete feedback: browser `alert()` and `confirm()`.

**Exact copy:**
- Card 1: `Workspace API Access Keys`, `Use these API keys to authenticate command integrations and programmatically sync codespace sandbox containers with CLI engines.`, placeholder `API Key Name (e.g. CI pipeline secret)`, button `Generate API Key`, `Created: {key.created}`.
- Card 2: `Security Notification Settings`:
  - `Email Login Alerts`: `Receive email logs on successful login activities.`
  - `Critical Security Alerts`: `Receive alerts on password updates, key revocation, and system changes.`
- Card 3: `System Environment Secrets`, `Environment variables configured here are automatically injected into all running sandbox terminals when provisioned.`, `System environment variable updates are configured through the terminal command bar.`, button `Configure System Variables` (triggers `alert('Feature coming soon in Sandbox provisioning release.')`).

**Components reused:** `SettingsPage` shell, `.btn-primary`, `.btn-secondary`, `.icon-btn`, `lucide-react` (`Key`, `Copy`, `Plus`, `Trash2`, `Mail`, `ToggleLeft`, `ToggleRight`, `Check`).

## CS-05 Trash & Recovery

**Purpose:** Restore or permanently delete soft-deleted projects and AI chat sessions or individual messages.

**Data and API calls:**
- Mount calls `listTrashProjectsAPI` (`GET /api/sandbox/projects/trash`) and `getTrashChatsAPI` (`GET /api/ai/chats/trash`) via `Promise.allSettled`.
- Project actions: `restoreProjectAPI` (`PATCH /api/sandbox/project/:projectId/restore`, triggers `onProjectRestored`) and `permanentlyDeleteProjectAPI` (`DELETE /api/sandbox/project/:projectId/permanent`).
- Chat actions: `restoreChatSessionAPI` / `restoreChatMessageAPI` and `permanentlyDeleteChatSessionAPI` / `permanentlyDeleteChatMessageAPI` under `/api/ai/chats/...`.

**States:**
- Loading: spinner + `"Loading items from trash…"`.
- Empty projects: green `CheckCircle2`, `"No deleted projects in trash"`, `"Projects you soft-delete will appear here for recovery."`
- Empty chats: green `CheckCircle2`, `"No deleted chats in trash"`, `"Chat messages and generated reports soft-deleted from Taksha or Clio will appear here."`
- Confirm permanent delete modal: `"Confirm Permanent Delete"`, `"Are you sure you want to permanently delete \"{title}\"? This action cannot be undone."`, `Cancel`, `Permanent Delete`.
- Restore / delete error: `alert(err.response?.data?.message || 'Failed to ...')`.

**Exact copy:**
- Header: `Trash & Recovery`, `Manage soft-deleted projects and AI chat reports. Items can be restored back to active state or permanently deleted.`
- Tabs: `Deleted Projects ({count})`, `Deleted Chats & Reports ({count})`.
- Project row: `Sandbox ID: {id}…`, `Deleted {date}`, `Restore`, `Delete Permanently`.
- Chat row: agent badge `Clio` (when `agentType === 'copilot'`) or `Orion`, `Project: {projectId || 'Workspace'}`, `Restore chat` / `Restore message`, `Delete`, preview label `Whole chat:` / `AI Report:` / `User Prompt:`.

**Components reused:** `SettingsPage` shell, `sandbox.api.js`, `lucide-react` (`Trash2`, `RotateCcw`, `Loader2`, `Folder`, `MessageSquare`, `Code`, `Clock`, `CheckCircle2`, `ShieldAlert`).

---

## Gaps seen in the code

- **No URL routing for sub-tabs:** `SettingsPage.jsx` holds `activeSubTab` in local `useState('profile')`. Reloading on any tab resets to `Profile Account`, and both `My Profile` and `Settings` in `Dashboard.jsx` call `handleNavigateSettings` without selecting a sub-tab (`Dashboard.jsx` also declares an unused `settingsTab` state on line 250).
- **Hardcoded plan badge on profile:** `SettingsProfilePage.jsx` always renders `FREE DEV PLAN` regardless of `credit.subscription`.
- **Browser `alert()` / `confirm()` and simulated account deletion:** `SettingsProfilePage.jsx` and `SettingsSecurityPage.jsx` call `window.alert()` and `window.confirm()` for feedback, and `Delete Developer Account` only runs `alert('Simulating account deletion.')`. `SettingsProfilePage.jsx` also offers no inputs to edit `userName` or email.
- **Silent dummy fallbacks mask errors:** `settings.api.js` catches errors in every endpoint (`fetchSettingsAPI`, `fetchCreditAPI`, `fetchPackagesAPI`, `updateProfileSettingsAPI`, `updatePreferencesAPI`, `generateApiKeyAPI`, `deleteApiKeyAPI`, and others) and returns `{ status: 'success', ... }` mock objects, so Redux `settings.error` is not surfaced in any settings view.
- **Orphaned copilot model preference and hardcoded hex colors:** `settings.api.js` and `settings.slice.js` define `copilot.modelPreference` (`'nvidia/nemotron-3-ultra-550b-a55b'`), while `SettingsAppearancePage.jsx` has blank lines at 15 and 267 with no UI control for it. Theme cards hardcode `#111114`, `#ffffff`, `#0f0f12`, and choosing `System Default` saves `'system'` without applying `prefers-color-scheme` to `document.documentElement`.
- **Loaded billing data unused and container limits hardcoded:** `SettingsPage.jsx` calls `loadPackages()`, `loadTransactions()`, `loadTransactionSummary()`, and `loadAnalytics()` on mount, none of which are passed to `SettingsBillingPage.jsx`. `SettingsBillingPage.jsx` also computes `unbilledCents`, `lifetimeCents`, `centsPer1kTokens`, and a USD `formatCurrency` helper (`$...`) without rendering them, while `fetchPackagesAPI` returns INR prices (`₹0`, `₹299`, `₹499`, `₹999`, `₹1,499`). `App.jsx` passes hardcoded `projectsCount={2}`, and `SettingsBillingPage.jsx` hardcodes `/ 20.00 Credits`, `REMAINING FREE CREDITS`, `/ 5 Active Environments`, `0.5 / 2.0 vCPU`, and `512 MB / 2 GB`.
- **API keys never fetched on mount:** `fetchSettingsAPI` only calls `/api/auth/profile` and `/api/auth/preferences` (never `GET /api/settings/keys`), and `settings.slice.js` has no `loadApiKeys` thunk, so keys only appear in the current session after creation. `Configure System Variables` only shows an alert (`Feature coming soon in Sandbox provisioning release.`).
- **Token mismatch and silent fetch errors in Trash:** `SettingsTrashPage.jsx` styles Restore buttons with ember border/text (`var(--primary)`) on an indigo tint (`rgba(99, 102, 241, 0.08)`), hardcodes `#ef4444` for delete actions instead of `var(--error)`, uses a centered spinner rather than skeleton rows, silently ignores failed trash fetches in `Promise.allSettled`, and does not show a retention window.
