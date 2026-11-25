# Settings redesign

Wireframes for the redesigned Settings module in Taksha CodeSpace. Open [wireframes.html](wireframes.html) in a browser.

Status: Redesign proposed for review.

| ID | Screen | Replaces component | Route or trigger | Data source |
|---|---|---|---|---|
| SR-01 | Profile | `SettingsProfilePage.jsx` | `?route=settings&tab=profile` | `GET /api/auth/profile`, `PUT /api/auth/profile` |
| SR-02 | Sign-in & alerts | `SettingsSecurityPage.jsx` (notifications) and `SettingsProfilePage.jsx` (logout, delete) | `?route=settings&tab=signin` | `PUT /api/auth/preferences`, `authLogout()` |
| SR-03 | Appearance | `SettingsAppearancePage.jsx` (theme section) | `?route=settings&tab=appearance` | `GET /api/auth/preferences`, `PUT /api/auth/preferences`, `localStorage.theme` |
| SR-04 | Editor | `SettingsAppearancePage.jsx` (editor section) | `?route=settings&tab=editor` | `preferences.editor`, `PUT /api/auth/preferences` |
| SR-05 | Orion & Clio | `SettingsAppearancePage.jsx` (copilot section) | `?route=settings&tab=copilot` | `preferences.copilot`, `PUT /api/auth/preferences` |
| SR-06 | Plan & usage | `SettingsBillingPage.jsx` | `?route=settings&tab=billing` | `GET /api/payments/credit`, loaded packages, transactions, summary, analytics |
| SR-07 | Trash | `SettingsTrashPage.jsx` | `?route=settings&tab=trash` | `GET /api/sandbox/projects/trash`, `GET /api/ai/chats/trash`, restore and permanent delete endpoints |
| SR-08 | API keys (Soon) | `SettingsSecurityPage.jsx` (keys section) | `?route=settings&tab=keys` | Honest coming-soon placeholder (backend route `/api/settings/keys` pending) |
| SR-09 | Phone (390 px) | Mobile layout | Viewport width <= 720 px | Shared responsive shell and stacked editor screen |
| States | System states | Multiple components | Loading, empty, error, saved, dialogs | Component local state and API responses |

---

## Shell redesign

- Sidebar reduced to 240 px, matching IDE activity and explorer rhythm.
- Back link: Quiet "Dashboard" link with left arrow at top of sidebar, replacing the bulky boxed button and duplicate bottom links.
- Sidebar groups in sentence case (Account, Workspace, Plan & billing, Data), replacing uppercase labels.
- Active navigation item marked by a 2 px ember bar on the left edge and an ember icon.
- Sidebar footer shows user avatar, name ("Aarav Mehta"), and actual plan pill loaded from `credit.subscription` instead of a hardcoded badge.
- Content area: Left-aligned, max width 720 px, padding 40 px 56 px.
- Page header displays screen title (22 px, 600 weight), a one-line lead (13 px muted), and an autosave indicator ("Saved" with green check or "Saving..." in flight).
- Layout pattern: Quiet two-column rows (240 px left for label and hint, right for controls) separated by hairlines. Stacked cards eliminated; bordered panels used only for discrete objects like theme cards, code preview, and tables.
- Sub-tab routing: Persists active tab in the URL query (`?route=settings&tab=editor`), ensuring browser refresh keeps the active view.

---

## SR-01 Profile

**Purpose:** View identity information managed by Google OAuth and update developer bio, experience, skills tags, and social links.

**Data and API calls:**
- Reads auth profile from Redux `settings` slice (`GET /api/auth/profile`).
- Form submission calls `updateProfile` (`PUT /api/auth/profile`).
- Plan pill reflects `credit.subscription` ('free', 'pro', or 'max').

**States:**
- Default view: Pre-populated with user profile fields for Aarav Mehta.
- Dirty state: Sticky unsaved changes bar appears at bottom with amber indicator, "You have unsaved changes", "Discard", and "Save changes".
- Validation state: Invalid URL input shows error outline and helper message "Enter a full URL starting with https://".

**Exact copy:**
- Page title: Profile
- Page lead: Manage your public identity and developer profile across Taksha.
- Header notice: Managed by your Google account
- Group: About you
- Fields:
  - Job title: e.g. Senior Frontend Engineer
  - Company: e.g. Taksha Labs
  - Location: e.g. Bengaluru, India
  - Years of experience: e.g. 6
  - Short bio: Tell other developers about yourself and what you build (character count: 79 / 240)
- Group: Skills
  - Tag input: Add skill input with remove icons on active skill chips (React, Node.js, TypeScript, Kubernetes, Redis)
- Group: Links
  - GitHub: https://github.com/aaravmehta
  - LinkedIn: https://linkedin.com/in/aaravmehta
  - X: https://x.com/aaravmehta_dev
  - Website: https://aaravmehta.dev
- Unsaved changes bar: You have unsaved changes, Discard, Save changes

**What changed and why:**
- Split read-only identity (Google name and email) from editable metadata so users understand Google manages authentication.
- Replaced comma-separated skills text input with interactive tag chips and an add input, matching modern code platforms.
- Moved Danger Zone and Logout actions out of Profile into Sign-in & alerts to separate personal metadata from account lifecycle.
- Replaced browser `alert()` popups with a non-intrusive sticky save bar and toast notifications.

---

## SR-02 Sign-in & alerts

**Purpose:** Manage authentication session, email alerts for login and security events, and account deletion.

**Data and API calls:**
- Reads `preferences.notifications` (`emailLogins`, `securityAlerts`) via `GET /api/auth/preferences`.
- Switch toggles immediately call `PUT /api/auth/preferences`.
- Logout triggers `onLogout` (`authLogout()`).
- Account deletion will target `DELETE /api/auth/account` once implemented on backend.

**States:**
- Default view: Shows connected Google account (aarav.mehta@gmail.com), active alert toggles, and danger panel.
- Account deletion modal: Confirmation dialog requesting user email input before enabling delete button.

**Exact copy:**
- Page title: Sign-in & alerts
- Page lead: Control how you access your account and when Taksha emails you.
- Group: Sign-in
  - Google account: aarav.mehta@gmail.com, Connected
  - Log out: Sign out of your active session on this device, Log out
- Group: Email alerts
  - Login alerts: Get an email each time someone signs in to your account
  - Security alerts: Get an email when a key is revoked or a security setting changes
- Group: Danger zone
  - Delete account: Permanently remove your account, all sandbox environments, and saved preferences. You cannot undo this. Delete account

**What changed and why:**
- Removed internal variable names (`notifications.emailLogins`, `notifications.securityAlerts`) from screen display, keeping them only in pin notes.
- Restyled danger zone panel to use standard surface with a 1 px border tinted with `--error` rather than a fully red-tinted background.
- Unified security controls and session management in one place instead of scattering them between Profile and Security tabs.
- Replaced browser `confirm()` deletion with an accessible modal dialog requiring email confirmation.

---

## SR-03 Appearance

**Purpose:** Choose workspace appearance between Dark, Light, and System themes.

**Data and API calls:**
- Reads `preferences.theme` via `GET /api/auth/preferences`.
- Theme selection calls `PUT /api/auth/preferences`, writes `localStorage.setItem('theme', ...)`, and toggles `light-theme` class on `document.documentElement`.

**States:**
- Dark: Selected state marked with 2 px ember border and check badge. Thumbnail scoped to `.thumb-dark` so it remains dark in all board modes.
- Light: Visual preview of light chrome and editor canvas scoped to `.thumb-light` so it remains light in all board modes.
- System: Displays split dark and light preview. Caption indicates current resolved mode from device preference.

**Exact copy:**
- Page title: Appearance
- Page lead: Customize the look and feel of your sandbox workspace.
- Group: Workspace theme
- Options:
  - Dark mode: Deep ink surfaces for low-light coding
  - Light mode: High contrast clean surfaces for bright environments
  - System default: Follows your device. Right now: Dark.

**What changed and why:**
- Scoped Dark and Light thumbnails to `.thumb-dark` and `.thumb-light` classes using copied token values from `Frontend/src/styles/index.scss`, guaranteeing thumbnails retain proper contrast regardless of board theme.
- Rendered split dark and light thumbnail for System default option.
- Moved pins out of thumbnail cards into free space beside them.
- Overrode min-height so the frame crops tightly to content without empty bottom canvas.

---

## SR-04 Editor

**Purpose:** Configure Monaco code editor defaults with live interactive preview.

**Data and API calls:**
- Reads `preferences.editor` (`fontSize`, `tabSize`, `minimap`, `wordWrap`, `autoSave`).
- Changes call `PUT /api/auth/preferences` via debounce.

**States:**
- Live preview reacts immediately in the browser to control clicks:
  - Font size: Adjusts line height and font size of `.code`.
  - Tab size: Adjusts indent guide width and spacing.
  - Minimap: Toggles minimap strip visibility.
  - Word wrap: Toggles between line wrap and horizontal scrolling.
  - Autosave: Updates preference flag.

**Exact copy:**
- Page title: Editor
- Page lead: How code looks and behaves in your sandboxes.
- Preview header: quiz-arena/src/components/ScoreBoard.jsx
- Group: Text & formatting
  - Font size: Font size of code lines in the editor (12, 14, 16, 18)
  - Tab size: Number of spaces per indentation level (2, 4, 8)
  - Word wrap: Wrap long code lines to fit the viewport width
- Group: Display & saving
  - Code minimap: Show an overview strip on the right side of the editor
  - Auto save: Save files a moment after you stop typing

**What changed and why:**
- Moved pin 1 off the "Live preview" header into free space to the right of the preview panel.
- Made the Tab size segmented control match the compact width of the Font size control.
- Added live React component code preview so developers immediately see the impact of their typography and formatting choices.

---

## SR-05 Orion & Clio

**Purpose:** Configure AI coding agent (Orion) response verbosity and editor copilot (Clio) inline suggestions.

**Data and API calls:**
- Reads `preferences.copilot` (`autoSuggest`, `interactiveMode`, `modelPreference`).
- Updates save to `PUT /api/auth/preferences`.

**States:**
- Inline suggestions switch toggles ghost text preview on and off.
- Answer style segmented control toggles between Detailed and Concise preview cards.

**Exact copy:**
- Page title: Orion & Clio
- Page lead: Configure how the coding agent and copilot assist you.
- Group: Clio
  - Group lead: Inline code suggestions in the editor
  - Inline suggestions: Show ghost-text code completions while typing
  - Ghost text preview: `const calculateScore = (streak, multiplier) => { return streak * multiplier; + bonusPoints; };`
- Group: Orion
  - Group lead: Autonomous coding agent in chat
  - Answer style: Choose how detailed Orion should be in replies (Detailed, Concise)
  - Detailed preview: Explains root cause, lists affected files, and guides through each edit step by step.
  - Concise preview: Provides direct patch instructions with minimal commentary.
- Group: System
  - Model: Chosen by Taksha for each task (nvidia/nemotron-3-ultra-550b-a55b)

**What changed and why:**
- Removed visible code variable name (`copilot.autoSuggest`) from UI, documenting it in pin notes instead.
- Rendered model identifier as plain monospace text instead of an input-like bordered box.
- Styled Clio ghost text in clear indigo (`--accent-primary` at 0.75 opacity), maintaining visibility in both light and dark themes.

---

## SR-06 Plan & usage

**Purpose:** Review subscription plan, track AI credit consumption across providers, visualize 30-day usage trends, inspect recent usage events, and check sandbox quotas.

**Data and API calls:**
- Reads subscription tier and limits from `GET /api/payments/credit`.
- Reads usage analytics timeline and agent breakdown from `GET /api/payments/credit/analytics`.
- Reads recent events from `GET /api/payments/credit/transactions`.
- External billing handoff via `onNavigatePayments` to `payments_frontend`.

**States:**
- Free plan: Displays 20 credits limit meter and upgrade prompt.
- Pro/Max plan: Displays unmetered status and active period dates.
- Timeline chart: Renders 30-day token consumption bars with 4-level Y-axis and gridlines.

**Exact copy:**
- Page title: Plan & usage
- Page lead: Monitor your AI credits, token consumption, and sandbox allocations.
- Subscription banner: Free plan (₹0 / month), Manage plan
- Group: AI credits
  - Balance meter: 14.20 of 20 credits left
  - Balance hint: Resets with your plan. Pro and Max have no credit cap.
- Group: Usage (last 30 days)
  - Timeline title: Daily token consumption
  - Breakdown by agent:
    - Orion: 64,200 tokens
    - Clio: 28,100 tokens
    - App agent: 12,400 tokens
    - Titles: 1,800 tokens
- Group: Recent activity
  - Table columns: When, Agent, Model, Tokens, Credits
  - Rows:
    - 24 Nov, 18:42, Orion, nvidia/nemotron-3-ultra-550b-a55b, 3,420, 0.85
    - 24 Nov, 17:15, Clio, nvidia/nemotron-3.5-lightning-30b-a3b, 210, 0.05
    - 24 Nov, 16:30, Orion, nvidia/nemotron-3-ultra-550b-a55b, 5,120, 1.28
    - 24 Nov, 14:02, Clio, nvidia/nemotron-3.5-lightning-30b-a3b, 440, 0.11
    - 23 Nov, 19:10, Orion, nvidia/nemotron-3-ultra-550b-a55b, 2,890, 0.72
    - 23 Nov, 11:45, App agent, nvidia/nemotron-3-ultra-550b-a55b, 1,600, 0.40
  - Table footer link: View all billing history
- Group: Sandbox allocation
  - Active environments: 2 of 5 projects provisioned
  - Compute per environment: 0.5 vCPU, 512 MB RAM per sandbox

**What changed and why:**
- Equipped daily token bar chart with a 4-level Y axis (0, 10k, 20k, 30k) and background gridlines.
- Used Fira Sans for agent names and activity timestamps; reserved monospace styling strictly for model IDs.
- Removed speculative statement "Quotas scale automatically with your plan", adding a pin note indicating sandbox limits are hard-coded in current clients and await backend plan integration.

---

## SR-07 Trash

**Purpose:** Restore or permanently delete soft-deleted sandbox projects and AI chat sessions.

**Data and API calls:**
- Fetches deleted items via `Promise.allSettled` calling `GET /api/sandbox/projects/trash` and `GET /api/ai/chats/trash`.
- Restore project: `PATCH /api/sandbox/project/:id/restore`.
- Restore chat: `PATCH /api/ai/chats/:id/restore`.
- Permanent delete project: `DELETE /api/sandbox/project/:id/permanent`.
- Permanent delete chat: `DELETE /api/ai/chats/:id/permanent`.

**States:**
- Populated list: Displays 7 soft-deleted items ordered by deletion timestamp in a single bordered panel with hairline dividers.
- Filtered counts: Segmented filter displays All (7), Projects (3), Chats (4).
- Restored item toast: Toast reads "Restored portfolio" with "Open" over the lower edge; restored item is removed from the active list.
- Frame height: Sized to content without empty bottom canvas.

**Exact copy:**
- Page title: Trash
- Page lead: Restore soft-deleted projects and AI chat sessions, or remove them forever.
- Filter options: All (7), Projects (3), Chats (4)
- Items:
  - quiz-arena, Sandbox ID: sbx_9f2a81b, Deleted 24 Nov, 18:40, Restore, Delete forever
  - Fix CSS grid layout in scoreboard, Orion, Project: quiz-arena, Whole chat, Deleted 24 Nov, 15:20, Restore, Delete forever
  - ScoreBoard component test suite, Clio, Project: quiz-arena, AI report, Deleted 23 Nov, 11:05, Restore, Delete forever
  - algo-visualizer, Sandbox ID: sbx_4c1e79a, Deleted 22 Nov, 16:15, Restore, Delete forever
  - Optimize binary search tree rebalance, Orion, Project: algo-visualizer, Whole chat, Deleted 22 Nov, 14:30, Restore, Delete forever
  - Refactor auth hook session caching, Clio, Project: quiz-arena, Whole chat, Deleted 21 Nov, 19:00, Restore, Delete forever
  - metrics-collector, Sandbox ID: sbx_8b3d22e, Deleted 20 Nov, 10:45, Restore, Delete forever
- Restored toast: Restored portfolio, Open

**What changed and why:**
- Replaced separate item cards with a single unified panel featuring hairline dividers.
- Populated 7 sample items (3 projects, 4 chats) with matching category filter counts.
- Illustrated toast state "Restored portfolio" over frame edge, ensuring portfolio is omitted from the active trash list.

---

## SR-08 API keys (Soon)

**Purpose:** Provide an honest placeholder informing developers about upcoming CLI and API programmatic access.

**Data and API calls:**
- No backend endpoint exists for API keys in the current release (`/api/settings/keys` returns 404 on real servers).
- Form is disabled until backend API key service ships.

**States:**
- Honest empty state: Centered key icon, informational message, disabled action button, and descriptive notice.
- Cropped frame: Sized to content height without empty canvas space below.

**Exact copy:**
- Page title: API keys
- Page lead: Manage API access tokens for the Taksha command-line tool and CI workflows.
- Empty title: API keys are coming soon
- Empty body: Use a key to call Taksha from a script or CI job.
- Button: Create key (disabled)
- Information notice: API key generation will arrive with the upcoming CLI engine release. Keys previously generated in earlier previews were simulated in local storage.

---

## SR-09 Phone (390 px)

**Purpose:** Responsive view of Settings on mobile viewports.

**Data and API calls:**
- Shares the same underlying settings state and endpoints as desktop views.

**States:**
- Mobile layout: Sidebar collapses into a horizontally scrolling tab strip under the "Settings" title.
- Content rows: Two-column desktop rows stack label and description directly above input controls.
- Editor preview: Live code preview remains full width with horizontal scroll support.

**Exact copy:**
- Title: Settings
- Tabs: Profile, Sign-in, Appearance, Editor, Orion & Clio, Plan & usage, Trash (7), API keys

---

## States

**Purpose:** Render loading, empty, error, autosave confirmation, and destructive modal overlays.

**States:**
- Loading skeleton: Preserves two-column row alignment during initial preference hydration.
- Empty trash: Renders status icon and reassurance copy when trash is empty.
- Service error: Renders inline error notification with retry button on timeout.
- Autosave confirmed: Slices the editor page showing the header save indicator and a toast reading "Saved".
- Permanent delete modal: Dialog sized fully with title, warning body, Cancel, and Delete forever buttons over a dimmed Trash screen.
- Delete account modal: Dialog sized fully with title, warning body, email confirmation input (confirming aarav.mehta@gmail.com), Cancel, and Delete account buttons over a dimmed Sign-in screen.

---

## Needs backend work

1. **Account deletion endpoint:** Currently `SettingsSecurityPage.jsx` and `SettingsProfilePage.jsx` simulate account deletion. A real backend endpoint (`DELETE /api/auth/account`) is needed to drop database documents, terminate Kubernetes sandboxes, and revoke auth tokens.
2. **API keys microservice:** Backend route `/api/settings/keys` does not exist in the live service. Key generation, hash storage, prefix validation, and revocation endpoints must be implemented.
3. **Plan-based sandbox quota sync:** `projectsCount`, vCPU allocations, and memory quotas are hardcoded in client components. The payments service must expose dynamic sandbox tier limits via `GET /api/payments/credit`.
4. **Permanent trash deletion cascade:** Ensure permanent deletion of projects cleans up persistent volumes on the Kubernetes cluster.

---

## Front-end only changes

1. **URL tab query routing:** Active sub-tab now binds to `?route=settings&tab=...`, preserving tab selection across browser reloads.
2. **System theme implementation:** Updated theme switch to actually listen and bind to CSS `prefers-color-scheme`.
3. **Toasts and modal dialogs:** Replaced all browser `alert()` and `confirm()` calls with accessible modal cards and toasts.
4. **Surface loaded billing analytics:** Wire up the existing Redux `loadAnalytics()` and `loadTransactions()` data into visual charts and tables.
5. **Dynamic plan pill:** Derive plan badge dynamically from `credit.subscription` instead of hardcoding "FREE DEV PLAN".
