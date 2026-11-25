# Built screens inventory

Written 2026-11-25 from the code, not from docs. Every screen that exists today in `Frontend/` (main app, port 5173) and `payments_frontend/` (billing app, port 5174, base `/payments/`). Each board under this folder draws one group. All paths are relative to the repo root.

| Board | Folder | Screens |
|---|---|---|
| Public and sign in | [public-auth/](public-auth/wireframes.html) | CA-01 to CA-07 |
| Dashboard | [dashboard/](dashboard/wireframes.html) | CD-01 to CD-07 |
| IDE | [ide/](ide/wireframes.html) | CI-01 to CI-11 |
| Settings | [settings/](settings/wireframes.html) | CS-01 to CS-05 |
| Payments in the main app | [payments/](payments/wireframes.html) | CP-01 to CP-05 |
| Billing app (`payments_frontend`) | [payments-frontend/](payments-frontend/wireframes.html) | PF-01 to PF-11 |

## How the main app routes

`Frontend/src/App.jsx` has no router. It switches on state:

1. While the session check runs: the `auth-loader` screen ("Authenticating session…").
2. Signed out: `LandingPage`, or `Login` when `currentRoute === 'login'`.
3. Signed in with an open project (`currentProjectId`): the IDE (`SandboxHeader` + `Layout` + status bar), plus the Clio float.
4. Signed in, no project: `?route=settings` shows `SettingsPage`, `?route=payments` redirects to port 5174 (the billing app), anything else shows `Dashboard` with `?tab=` `playground`, `recents` or `my-apps`.

`EntryLoader` plays once on top of everything on first load.

## Public and sign in (CA)

| ID | Screen | Component | Route or trigger | Main states |
|---|---|---|---|---|
| CA-01 | Landing: nav and hero | `Frontend/src/features/auth/components/LandingPage.jsx` (`lp-hero`) | Signed out, default | Static; nav buttons scroll to sections or open Login |
| CA-02 | Landing: product workspace and statement | `LandingPage.jsx` (`#product`, `lp-statement`), `LandingWorkspace.jsx` | Scroll | Static, scroll motion (`useLandingMotion`) |
| CA-03 | Landing: forge stages and "Built on" marquee | `LandingPage.jsx` (`lp-forge`, `lp-marquee`), `LandingForge3D.jsx` | Scroll | 3D scene pinned while stage copy changes |
| CA-04 | Landing: features and pricing | `LandingPage.jsx` (`#features`, `#pricing`) | Scroll or nav | Static |
| CA-05 | Landing: FAQ, closing call to action, footer | `LandingPage.jsx` (`#faq`, `lp-kinetic`, footer from `buildFooter`) | Scroll or nav | FAQ items open and close |
| CA-06 | Sign in | `Frontend/src/features/auth/components/Login.jsx` | `currentRoute === 'login'` | Idle, redirecting to Google, back to home |
| CA-07 | Session check and intro | `App.jsx` (`auth-loader`), `Frontend/src/components/EntryLoader.jsx` | First load, `loading` | Loading only; `PageSkeleton` while lazy pages load |

## Dashboard (CD)

All in `Frontend/src/features/dashboard/components/Dashboard.jsx`.

| ID | Screen | Route or trigger | Main states |
|---|---|---|---|
| CD-01 | Playground: describe a new app | `?tab=playground` (default) | Empty prompt, typing, submitting |
| CD-02 | Provisioning panel ("Assembling Sandbox") | After a prompt or project create, while the sandbox starts | Steps in progress, failed |
| CD-03 | Recents with search | `?tab=recents` | Loading, list, no search match, empty |
| CD-04 | My Apps (My Projects grid and project cards) | `?tab=my-apps` | Loading, grid, "No Projects Yet", 5 project limit |
| CD-05 | Create project modal | "New App" or create button | Idle, validation error, creating |
| CD-06 | Delete project confirm | Project card menu, Delete | Confirm, deleting |
| CD-07 | Account menu | Sidebar footer avatar | Open: My Profile, Settings, Billing & Plans, Logout |

## IDE (CI)

| ID | Screen | Component | Route or trigger | Main states |
|---|---|---|---|---|
| CI-01 | Workspace with live preview | `App.jsx`, `Frontend/src/features/sandbox/components/SandboxHeader.jsx`, `Frontend/src/components/Layout.jsx` | Open a project, Preview tab | Sandbox Live, preview iframe |
| CI-02 | Preview while booting or offline | `App.jsx` (`PreviewWarmingScreen`, offline block) | Sandbox starting or stopped | Provisioning tips carousel, Sandbox Offline with Start Sandbox |
| CI-03 | Code tab: Explorer and editor | `Frontend/src/features/editor/components/FileExplorer.jsx`, `CodeEditor.jsx` | Code tab (Cmd+Shift+T) | Loading tree, no files, unsaved, syncing, save failed |
| CI-04 | Bottom panel: Terminal, Output, Problems, Ports | `TerminalShell.jsx`, `Frontend/src/features/logs/components/RuntimeLogs.jsx`, `App.jsx` | Cmd+J, tab clicks | Connecting, online, no logs, no filter match, no problems |
| CI-05 | Orion panel: empty and composer | `Frontend/src/features/coding-agent/components/panel/AIChat.jsx`, `ChatHeader.jsx`, `EmptyState.jsx`, `composer/Composer.jsx`, `FileSuggestions.jsx`, `AttachmentChips.jsx` | Cmd+Shift+B | Empty with suggestions, offline, busy in another chat |
| CI-06 | Orion run | `conversation/MessageList.jsx`, `UserMessage.jsx`, `RunItem.jsx`, `AssistantTurn.jsx`, `activity/*.jsx`, `Frontend/src/features/chat-history/components/MessageActions.jsx` | Send a prompt | Thinking, tool steps running, done with changed files, stopped, failed |
| CI-07 | Plan review | `plan/PlanReviewCard.jsx`, `PlanStepItem.jsx` | Orion pauses at `plan_review` | Waiting for you, approve, request changes |
| CI-08 | Chat history sidebar | `Frontend/src/features/chat-history/components/ChatHistorySidebar.jsx` | History button in the Orion or Clio header | Loading, grouped list, no match, delete confirm, live chat marker |
| CI-09 | Clio copilot float | `Frontend/src/features/copilot/components/AppAgentFloat.jsx` | Floating button, any open project | Closed bubble, open, thinking, no file open |
| CI-10 | Connect your own agent | `Frontend/src/features/sandbox/components/ConnectAgentModal.jsx` | Plug icon in `SandboxHeader` | Token list, create form, token shown once, no tokens |
| CI-11 | Request error banner | `App.jsx` (`faultAlert`) | Any FaultKit error from the AI service | Credit Limit Reached, Rate Limit Exceeded, Request Error |

## Settings (CS)

Shell: `Frontend/src/features/settings/components/SettingsPage.jsx` (260 px sidebar, content max 800 px). Route `?route=settings`.

| ID | Screen | Component | Main states |
|---|---|---|---|
| CS-01 | Profile Account | `SettingsProfilePage.jsx` | View, edit form, saving |
| CS-02 | Editor & Copilot | `SettingsAppearancePage.jsx` | Toggles and selects, saved |
| CS-03 | Billing & Limits | `SettingsBillingPage.jsx` | Credits, token usage, container limits |
| CS-04 | API & Security | `SettingsSecurityPage.jsx` | Key list, generate key, alerts toggles |
| CS-05 | Trash & Recovery | `SettingsTrashPage.jsx` | Loading, projects and chats in trash, empty per list |

## Payments in the main app (CP)

`Frontend/src/features/payments/components/`. Mounted by `App.jsx` for `?route=payments`, but an effect in `App.jsx` sends that route to the billing app on port 5174, so today these screens only flash before the redirect. They are drawn because the code is still shipped.

| ID | Screen | Component | Main states |
|---|---|---|---|
| CP-01 | Overview & Plans (hero, region, billing cycle, plan cards) | `PaymentsLandingPage.jsx`, `PlanCard.jsx` | Loading plans, current plan marked |
| CP-02 | Feature comparison | `FeatureComparisonTable.jsx` | Static |
| CP-03 | Plan detail modal | `PlanDetailModal.jsx` | Open |
| CP-04 | Checkout modal | `CheckoutModal.jsx` | Review, paying, done |
| CP-05 | Invoices & Billing | `InvoicesView.jsx` | Transactions, empty |

## Billing app (PF)

`payments_frontend/src/App.jsx` (react-router), shell `components/layout/AppShell.jsx`, `Sidebar.jsx` (Dashboard; Usage: Usage analytics, AI requests; Billing: Plans & checkout, Invoices), `Topbar.jsx`. Components below are under `payments_frontend/src/features/payments/components/`.

| ID | Screen | Component | Route or trigger | Main states |
|---|---|---|---|---|
| PF-01 | Intro loader | `intro/PaymentsIntroLoader.jsx` | First load | Playing, skipped under reduced motion |
| PF-02 | Dashboard | `dashboard/DashboardPage.jsx`, `DashboardKpis.jsx`, `UsageTrendPanel.jsx`, `ActivityList.jsx`, `shared/SubscriptionCard.jsx`, `shared/CreditWindowCard.jsx` | `/` | Skeleton, data, "We could not load your billing data", stale warning |
| PF-03 | Usage analytics | `usage/UsagePage.jsx`, `TokenLimitPanel.jsx`, `RequestSizePanel.jsx`, `BreakdownTable.jsx` | `/usage` | Skeleton, data, "No usage in this period.", could not load |
| PF-04 | AI requests | `requests/RequestsPage.jsx` | `/requests` | Skeleton, table, filtered empty, could not load |
| PF-05 | Request drawer | `requests/RequestDrawer.jsx` | Row click on PF-04 | Open |
| PF-06 | Plans | `plans/PlansPage.jsx`, `PlanCard.jsx`, `CompareTable.jsx`, `Faq.jsx` | `/plans` | Current plan, Most chosen |
| PF-07 | Checkout | `checkout/CheckoutPage.jsx`, `Steps.jsx`, `PlanPicker.jsx`, `OrderSummary.jsx` | `/checkout/:planId` | Review, Razorpay open, Payment cancelled, Payment not completed |
| PF-08 | Payment successful | `checkout/CheckoutSuccess.jsx` | After verify | Done |
| PF-09 | Invoices | `invoices/InvoicesPage.jsx`, `shared/PaymentsTable.jsx` | `/invoices` | Skeleton, list, "No payments yet", "No payments match", could not load |
| PF-10 | Invoice drawer | `invoices/InvoiceDrawer.jsx` | Row click on PF-09 | Open |
| PF-11 | Sign in required | `components/layout/RequireAuth.jsx` | Any guarded route while signed out | "Sign in to see your billing" |
