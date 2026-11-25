# Billing app (`payments_frontend`): screens and components

Wireframes for the built billing portal in `payments_frontend/`. Open [wireframes.html](wireframes.html) in a browser (light and dark switch at the top right, hide notes toggle beside it). Design rules: [../../README.md](../../README.md#design-system), built inventory: [../INVENTORY.md](../INVENTORY.md).

Status: built (`payments_frontend/src/App.jsx`, `payments_frontend/src/components/layout/AppShell.jsx`, `payments_frontend/src/features/payments/components/`)

| ID | Screen | Component file | Route or trigger | Data source |
|---|---|---|---|---|
| PF-01 | Intro loader | `payments_frontend/src/features/payments/components/intro/PaymentsIntroLoader.jsx` | First session load or `?forceLoader=true` | `sessionStorage` (`taksha_payments_intro_v10_clip`) |
| PF-02 | Dashboard | `payments_frontend/src/features/payments/components/dashboard/DashboardPage.jsx` | `/` (or `/dashboard`, `/status`, `?route=dashboard`) | `GET /api/payments/dashboard/overview`, `/usage-events/analytics`, `/transactions`, `/usage-events`, `/credit/transactions/summary` |
| PF-03 | Usage analytics | `payments_frontend/src/features/payments/components/usage/UsagePage.jsx` | `/usage` (or `?route=usage`) | `GET /api/payments/usage-events/analytics`, `GET /api/payments/usage-events?page=1&limit=100` |
| PF-04 | AI requests | `payments_frontend/src/features/payments/components/requests/RequestsPage.jsx` | `/requests` (or `?route=requests`, `logs`) | `GET /api/payments/usage-events` |
| PF-05 | Request drawer | `payments_frontend/src/features/payments/components/requests/RequestDrawer.jsx` | Row click or `Enter` on PF-04 | Selected event row from PF-04 (`GET /api/payments/usage-events`) |
| PF-06 | Plans | `payments_frontend/src/features/payments/components/plans/PlansPage.jsx` | `/plans` (or `/compare`, `?route=plans`) | `utils/plans.js` (`Payments/config/plans.config.js`), `GET /api/payments/credit`, `GET /api/payments/subscription` |
| PF-07 | Checkout | `payments_frontend/src/features/payments/components/checkout/CheckoutPage.jsx` | `/checkout/:planId` (or `/checkout`, `/plans/:planId`, `?route=checkout`) | `GET /api/payments/subscription`, `GET /api/auth/getMe`, `POST /api/payments/create/order`, `POST /api/payments/verify` |
| PF-08 | Payment successful | `payments_frontend/src/features/payments/components/checkout/CheckoutSuccess.jsx` | `checkout.status === 'success'` after `/verify` | `POST /api/payments/verify` response + refreshed `overview`, `history`, `summary` |
| PF-09 | Invoices | `payments_frontend/src/features/payments/components/invoices/InvoicesPage.jsx` | `/invoices` (or `?route=invoices`) | `GET /api/payments/transactions?page=1&limit=100` |
| PF-10 | Invoice drawer | `payments_frontend/src/features/payments/components/invoices/InvoiceDrawer.jsx` | Row click or `Enter` on PF-09 | Selected transaction from PF-09 (`GET /api/payments/transactions`) + `GET /api/auth/getMe` |
| PF-11 | Sign in required | `payments_frontend/src/components/layout/RequireAuth.jsx` | Any guarded route while `user === null` | `GET /api/auth/getMe`, `VITE_MAIN_APP_URL` (`http://localhost:5173`) |

---

## Shell (`AppShell.jsx`, `Sidebar.jsx`, `Topbar.jsx`, `navigation.js`)

- Mounted by `payments_frontend/src/App.jsx` under React Router `basename="/payments"`. On load, `App.jsx` calls `GET /api/auth/getMe`, restores the in-memory JWT via `setAccessToken`, and calls `syncOwner(userId)` so cached Redux entries in `localStorage` (`taksha_payments_cache`) are cleared if a different user signs in.
- **Sidebar (`248 px`):** Fixed left rail (off-canvas drawer below `1100 px`) with `TakshaIcon` + `Taksha Billing`, three nav groups (`Dashboard`; `Usage`: `Usage analytics`, `AI requests`; `Billing`: `Plans & checkout`, `Invoices`), live `AI credits` meter (`useQueries(['credit', 'subscription'])`), `Light` / `Dark` theme switch (`localStorage.theme`), and user menu (`Open IDE`, `Sign out` -> `POST /api/auth/logout`, `resetCache()`, redirect to `IDE_URL`) or `Sign in` button when signed out.
- **Topbar (`56 px` sticky):** Mobile menu button, breadcrumb `Billing / <pageTitle>`, current `<Tier> plan` badge linking to `/plans` (when signed in and credits loaded), and `Open IDE` link.

---

## PF-01 Intro loader

**Purpose:** Display a brief animated splash overlay on the first billing portal visit of a browser session before revealing the app shell.

**Data and API calls:**
- Reads and writes `sessionStorage` key `taksha_payments_intro_v10_clip` (no API calls).
- Bypassed immediately if `sessionStorage` already holds `'true'` unless `?forceLoader=true` is in the URL query string.

**States:**
- Playing: GSAP timeline lifts title, sweeps gradient across text (`0.15 s` to `2.1 s`), draws divider (`1.65 s` to `2.15 s`), fades in Razorpay row (`1.9 s` to `2.35 s`), then exits `0.6 s` after completion (or at `4.2 s` fallback timer).
- Dismissed early: click anywhere or press `Escape`, `Enter`, or `Space`.
- Reduced motion: `.entryLoader` transitions shrink to `0.01 ms` via `index.scss`.

**Exact copy:**
- Title: `Taksha Payments`
- Attribution: `Powered by` `razorpay`
- Aria label: `Taksha Payments Portal Entry`

**Components reused:** `PaymentsIntroLoader.module.scss`, `gsap`.

---

## PF-02 Dashboard

**Purpose:** Summarize current subscription tier, 5-hour AI credit refill window, 30-day usage trends, spending patterns, and recent payments and AI calls on one overview page.

**Data and API calls:**
- Mount triggers `useQueries(['overview'])` (`GET /api/payments/dashboard/overview`, pre-filling `credit`, `subscription`, and `analytics:30` in Redux), `useQueries(['analytics:' + range])` (`GET /api/payments/usage-events/analytics?days=<range>`), and `useQueries(['history', 'sample', 'summary'])` (`GET /api/payments/transactions?page=1&limit=100`, `GET /api/payments/usage-events?page=1&limit=100`, `GET /api/payments/credit/transactions/summary`).
- Re-fetches stale keys automatically on `visibilitychange` (`visible`) and window `online` events.

**States:**
- Loading (`core.loading`): `DashboardSkeleton` (8 KPI tiles, `2-1` chart/list skeletons, two rows of `3` panel skeletons).
- Cold error (`core.error && !dashboardOverview`): `EmptyState` `"We could not load your billing data"` with `Try again`.
- Stale error (`core.error && dashboardOverview`): `Alert` (`tone="warn"`) `"Could not load your latest data"` / `"The numbers below may be out of date."` with `Try again`.
- Empty sub-lists: `"No agent usage in this period."`, `"No model usage yet."`, `"No project usage yet."`, `"No payments yet"`, `"No AI requests yet"`.

**Exact copy:**
- Header: `{greeting()}, {firstName}`, `Your plan, AI credits, usage and spending for the last {range} days.`, ranges `7D`, `30D`, `90D`, buttons `Updated {relative}` / `Refresh`, `Upgrade`
- 8 KPIs: `Current plan`, `AI credits available`, `Tokens · {range} days`, `AI requests · {range} days`, `Credits used · {range} days`, `Avg tokens per request`, `Active days`, `Total spent`
- Panels: `Usage trend` (`Tokens`, `Requests`, `Credits`; `Total`, `Daily average`, `Peak day`), `AI credits` (`Your balance refills 5 hours after it runs low`, `AI requests pause when fewer than {lowerLimit} credits are left, and the full balance returns 5 hours later.`), `Subscription` (`Up next`, `Upgrade plan` / `Extend plan`), `Usage by agent`, `Token mix` (`Input sent vs output generated`), section `Patterns` (`Spending by month`, `Activity by hour`, `Activity by weekday`, `Top models`, `Top projects`, `Account totals`), `Recent payments` (`All invoices`), `Recent AI activity` (`All requests`)

**Components reused:** `PageHeader`, `Segmented`, `Button`, `Alert`, `EmptyState`, `Panel`, `KeyValues`, `DashboardKpis`, `UsageTrendPanel`, `CreditWindowCard`, `SubscriptionCard`, `BarChart`, `BarList`, `SplitBar`, `PaymentsTable`, `ActivityList`.

---

## PF-03 Usage analytics

**Purpose:** Break down token, request, and credit consumption over 7, 30, or 90 days across agents, models, providers, plan token limits, and daily rows.

**Data and API calls:**
- `useQueries(['analytics:' + range])` (`GET /api/payments/usage-events/analytics?days=<range>`) and `useQueries(['sample'])` (`GET /api/payments/usage-events?page=1&limit=100`).
- `TokenLimitPanel` reads `caps` (`dailyTokenCap` 50,000 for Free, `monthlyTokenCap` 5,000,000 for Pro, `null` for Max) via `useAccount()`.

**States:**
- Loading (`!usageAnalytics`): 6 KPI skeletons and `2-1` panel skeletons; `sample.loading` shows `TableSkeleton` in `By model` and `ListSkeleton` in `Request size`.
- Error (`main.error && !usageAnalytics`): `EmptyState` `"Could not load usage data"` / `"The payments service did not respond. Your usage is still being recorded."` with `Try again`.
- Empty daily table: `"No usage in this period."`
- `TokenLimitPanel` on Max tier: `"No cap"` / `"Your plan has no token limit. Usage is only paced by your AI credit balance."`

**Exact copy:**
- Header: `Usage analytics`, `How much AI you used, when, and through which agents and models.`, ranges `7 days`, `30 days`, `90 days`
- 6 KPIs: `Tokens`, `Requests`, `Credits used`, `Tokens per day`, `Peak day`, `Active days`
- Panels: `Tokens per day` (`Prompt (input) and completion (output) tokens`), `Token limit` (`Used today` / `Used in the last N days`, `Left`, `Limit`), `By agent`, `By model`, `Daily breakdown` (`Days with AI usage, newest first`; `Date`, `Requests`, `Prompt`, `Completion`, `Total tokens`, `Credits`), `By provider`, `Request size` (`Median request`, `Average prompt`, `Average completion`, `Largest request`, `Smallest request`, `Average credits`)

**Components reused:** `PageHeader`, `Segmented`, `Button`, `Panel`, `KpiGrid`, `BarChart`, `TokenLimitPanel`, `BreakdownTable`, `RequestSizePanel`, `Table`, `Pagination`, `EmptyState`, `KpiSkeleton`, `PanelSkeleton`, `TableSkeleton`.

---

## PF-04 AI requests

**Purpose:** Provide a searchable, filterable, server-paginated log of every AI request made from the workspace and open its full breakdown on click.

**Data and API calls:**
- `useQueries([eventsKey({ page, limit: 20, agent, period, q })])` calling `GET /api/payments/usage-events` with `page`, `limit=20`, `agentType`, `search`, and computed `startDate` (`1d`, `7d`, `30d`).
- Keeps up to `MAX_EVENT_PAGES` (8) cached query pages in Redux and retains previous results via `useLastValue` while next page/filter loads.

**States:**
- Initial loading (`!usageEvents && !state.error`): `TableSkeleton` (`rows={8}`, `cols={6}`).
- Refreshing (`busy`): table container dims (`is-busy`, opacity `0.55`).
- Refresh error with cached rows: `Alert` (`tone="warn"`) `"Could not refresh requests"` / `"Showing the last list we loaded."`
- Empty error (`state.error && events.length === 0`): `EmptyState` `"Could not load requests"` / `"The payments service did not respond."` with `Try again`.
- Empty / filtered empty: `"No AI requests yet"` (`"Requests from the coding agent and Copilot show up here."`) or `"No requests match these filters"` (`"Try a wider period or another agent."` + `Clear filters`).

**Exact copy:**
- Header: `AI requests`, `Every AI call made from your workspace, with tokens and credits charged.`, button `Refresh`
- Panel title: `{total} requests` or `{total} matching requests`
- Filters: placeholder `Search request ID or model`, `All agents` (`Coding agent`, `Copilot`, `Chat titles`, `App agent`, `Memory agent`), `All time` (`Last 24 hours`, `Last 7 days`, `Last 30 days`)
- Table columns: `Time`, `Agent`, `Model`, `Prompt`, `Completion`, `Tokens`, `Credits` (plus `−{n} platform discount` subline when `creditsDiscounted > 0`)

**Components reused:** `PageHeader`, `Panel`, `Button`, `Alert`, `SearchInput`, `Select`, `Table`, `Pagination`, `EmptyState`, `TableSkeleton`, `RequestDrawer`.

---

## PF-05 Request drawer

**Purpose:** Inspect token split, platform discount, model/provider metadata, and correlation IDs for a single AI request row without leaving PF-04.

**Data and API calls:**
- Reads the `event` object passed from `RequestsPage` (`GET /api/payments/usage-events`); makes no additional network calls.

**States:**
- Open (`Boolean(event)`): portaled right-side drawer (`460 px` max width) locking body scroll; closes on `Escape`, scrim click, or close button.
- Discounted request (`event.creditsDiscounted > 0`): shows `"4 credits · Platform discount −4 · Charged 0. Taksha pays for chat memory upkeep."`
- Optional `Chat ID`: rendered under `References` only when `event.chatId` exists.

**Exact copy:**
- Header: `AI request`, subtitle `{formatDateTime(event.createdAt)}`
- Hero stat: `{totalTokens}` `tokens · {creditsDeducted} credits`
- Sections: `Details` (`Agent`, `Model`, `Provider`, `Plan at the time`, `Time`), `References` (`Request ID`, `Project ID`, `Chat ID`)

**Components reused:** `Drawer`, `SplitBar`, `KeyValues`.

---

## PF-06 Plans

**Purpose:** Let signed-in and signed-out users compare Free, Pro, and Max plans, understand non-renewing 30-day queueing rules, and enter checkout for a paid plan.

**Data and API calls:**
- Plan catalog, pricing, limits, and `FEATURE_MATRIX` come statically from `utils/plans.js` (mirroring `Payments/config/plans.config.js`: Free ₹0, Pro ₹499, Max ₹999).
- Signed-in user state comes from `AppShell` `useQueries(['credit', 'subscription'])` via `useAccount()`.

**States:**
- Signed out (`/plans` has no `RequireAuth`): `SubscriptionCard` is omitted, all three plan cards render with `Included for everyone` (Free, disabled) and `Get Pro` / `Get Max`, and `CompareTable` highlights no column.
- Signed in: current tier card gets `.is-current` border and `Current plan` badge; Pro shows `Most chosen` when not current; lower-tier button reads `Queue {plan.name}`, current paid plan reads `Extend by 30 days`, higher tier reads `Get {plan.name}`.

**Exact copy:**
- Header: `Plans`, `Pick the plan that fits how much you build. Every paid plan runs for 30 days and never renews on its own.`
- Cards: `Free` (`₹0` `forever`), `Pro` (`₹499` `/ 30 days`), `Max` (`₹999` `/ 30 days`)
- Rules panel: `How buying a plan works`, `Nothing you paid for is ever lost` (`No paid plan yet`, `Same plan again`, `Higher plan`, `Lower plan`)
- Sections: `Compare plans` (`Your plan`), `Questions` (5 FAQ items in `Faq.jsx`)

**Components reused:** `PageHeader`, `PlanCard`, `SubscriptionCard`, `Panel`, `CompareTable`, `Faq`, `Tag`, `Button`.

---

## PF-07 Checkout

**Purpose:** Preview how a chosen paid plan activates or queues on the account, review billing details, and complete payment through Razorpay.

**Data and API calls:**
- Reads `subscription` (`GET /api/payments/subscription`) and `user` (`GET /api/auth/getMe`). Invalid or free `planId` redirects to `/plans`.
- `Pay ₹{priceINR}` (`useRazorpayCheckout.js`): loads `https://checkout.razorpay.com/v1/checkout.js`, calls `POST /api/payments/create/order` (`{ packageId }`), opens Razorpay checkout modal, then confirms with `POST /api/payments/verify` (`{ paymentId, orderId, signature }`) and runs `refreshAfterPayment()`.

**States:**
- `idle`: `Steps` at step 2 (`Review`); `Pay ₹499` / `Pay ₹999` enabled.
- `creating` / `open` / `verifying`: `Steps` advances to step 3 (`Pay`); `PlanPicker` radios disabled; button shows `"Starting payment…"`, `"Complete payment in Razorpay…"`, or `"Confirming payment…"`.
- `cancelled` (Razorpay `ondismiss`): `Alert` (`tone="info"`) `"Payment cancelled"` / `"You closed the payment window. You were not charged."`
- `failed`: `Alert` (`tone="bad"`) `"Payment not completed"` with `error` message and `Dismiss` button.
- `success`: swaps entire view to `CheckoutSuccess` (PF-08).

**Exact copy:**
- Back link: `All plans`; Header: `Checkout`, `Review your plan and pay securely with Razorpay.`
- Steps: `Choose plan`, `Review`, `Pay`, `Done`
- Panels: `Plan` (`You can switch before paying`), `What happens after you pay` (`Starts right away` / `Adds 30 days to your plan` / `Upgrades you right away` / `Waits in your queue`; `New plan starts`, `New plan ends`, `Renews automatically` `No`), `Billing details` (`Your receipt and invoice go to this account`; `Name`, `Email`, `Currency` `Indian rupee (INR)`, `Every paid plan gives you 30 days from its start date.`)
- Summary: `Order summary`, `Subtotal`, `Taxes` `Included`, `Total due today`, `UPI`, `Cards`, `Net banking`, `Wallets`, `Payments are processed securely by Razorpay. Taksha never sees your card or bank details.`

**Components reused:** `Button`, `PageHeader`, `Steps`, `Panel`, `PlanPicker`, `KeyValues`, `OrderSummary`, `Alert`, `CheckoutSuccess`.

---

## PF-08 Payment successful

**Purpose:** Confirm a verified Razorpay purchase with plan activation details, payment/order references, and links back to the dashboard or invoices.

**Data and API calls:**
- Rendered inline by `CheckoutPage` when `useRazorpayCheckout().status === 'success'`; reads `receipt` returned by `POST /api/payments/verify` plus refreshed `activeSlot` and `plan` from `useAccount()`.

**States:**
- Standard live mode: shows confirmation card, 6 receipt rows, and action buttons.
- Test mode (`order.keyId` starts with `rzp_test`): appends warning tag `"Test mode payment"` inside `.success__receipt`.

**Exact copy:**
- Title: `Payment successful`
- Body: `Taksha AI {receipt.plan.name} is on your account. A receipt has been sent to your email.`
- Receipt labels: `Plan bought`, `Amount paid`, `Active plan now`, `Active until`, `Payment ID`, `Order ID`, `Test mode payment`
- Actions: `Go to dashboard`, `View invoice`

**Components reused:** `KeyValues`, `Tag`, `Button`.

---

## PF-09 Invoices

**Purpose:** List past payment attempts with aggregate spend KPIs, client-side search/status filtering, CSV export, and quick receipt printing.

**Data and API calls:**
- `useQueries(['history'])` fetches `GET /api/payments/transactions?page=1&limit=100` (backend max page size).
- `Export CSV` runs `exportCsv(rows)` (`utils/invoice.js`) client-side to download `taksha-payments.csv`; per-row download button calls `printInvoice(t, user)`.

**States:**
- Loading (`state.loading`): `KpiSkeleton` (`count=4`) and `TableSkeleton` (`rows=6`).
- Error with no cached rows (`state.error && all.length === 0`): `EmptyState` `"Could not load your payments"` / `"The payments service did not respond. Your invoices are safe; try again in a moment."` with `Try again`.
- Stale error (`state.error && all.length > 0`): `Alert` (`tone="warn"`) `"Could not refresh your payments"` / `"Showing the last list we loaded."`
- Empty / filtered empty: `"No payments yet"` (`"Invoices appear here after your first purchase."` + `See plans`) or `"No payments match"` (`"Try another search or status."` + `Clear filters`).

**Exact copy:**
- Header: `Invoices`, `Every payment you made, with invoices you can print or save as PDF.`, buttons `Refresh` (`aria-label`), `Export CSV`
- 4 KPIs: `Total paid`, `Invoices`, `Failed payments`, `Last payment`
- Table panel: `Payment history`, search placeholder `Invoice, plan or payment ID`, select `All statuses` (`Paid`, `Failed`, `Pending`), columns `Date`, `Description`, `Invoice`, `Status`, `Amount`

**Components reused:** `PageHeader`, `Button`, `Alert`, `EmptyState`, `KpiGrid`, `Panel`, `SearchInput`, `Select`, `PaymentsTable`, `Pagination`, `KpiSkeleton`, `TableSkeleton`, `InvoiceDrawer`.

---

## PF-10 Invoice drawer

**Purpose:** Preview a single transaction's line item, customer billing details, and Razorpay IDs, and print or save a paid invoice as PDF.

**Data and API calls:**
- Reads the selected transaction `tx` from PF-09 (`GET /api/payments/transactions`) and `user` from `AppShell` outlet context via `invoiceFields(tx, user)`.
- `Print or save PDF` calls `printInvoice(tx, user)` which writes a standalone HTML invoice document into `window.open('', '_blank', ...)` and invokes `window.print()`.

**States:**
- Paid (`f.status === 'paid'`): title `Invoice {number}`, `Paid` pill, and `Print or save PDF` footer button.
- Failed (`f.status === 'failed'`): title `Payment attempt`, `Failed` pill, no footer button, inline note `"This payment did not go through, so there is no invoice and you were not charged for it."`
- Pending (`f.status === 'pending'`): title `Payment attempt`, `Pending` pill, no footer button.

**Exact copy:**
- Labels: `Amount`, `Item`, `Taxes` `Included`, `Total`, `Billed to` (`Name`, `Email`), `Payment` (`Invoice number`, `Payment ID`, `Order ID`, `Processed by` `Razorpay`)
- Footer CTA: `Print or save PDF`

**Components reused:** `Drawer`, `Button`, `KeyValues`, `StatusPill`.

---

## PF-11 Sign in required

**Purpose:** Guard authenticated billing routes when no session exists and guide the user back to the main IDE login or the public plans page.

**Data and API calls:**
- Driven by `App.jsx` session check (`GET /api/auth/getMe`, `timeout: 5000`); `Sign in` links out to `VITE_MAIN_APP_URL` (`http://localhost:5173`).

**States:**
- Checking session (`!authChecked`): renders `KpiSkeleton` (`count=4`) and `grid--2-1` `PanelSkeleton` blocks.
- Signed out (`authChecked && !user`): renders centered `.auth-gate__card` inside `AppShell` (while `Sidebar` hides `AI credits` and shows `Sign in`, and `Topbar` hides the plan badge).
- Signed in: renders the requested child route.

**Exact copy:**
- Heading: `Sign in to see your billing`
- Body: `Your plan, AI credits, usage and invoices show up here once you are signed in to Taksha CodeSpace.`
- Actions: `Sign in`, `See plans`

**Components reused:** `AppShell`, `Sidebar`, `Topbar`, `Button`, `KpiSkeleton`, `PanelSkeleton`.

---

## Gaps seen in the code

- **Hardcoded client plan catalogue (`utils/plans.js`):** `payments_frontend/src/features/payments/utils/plans.js` duplicates plan IDs, prices (`₹0`, `₹499`, `₹999`), limits, and `FEATURE_MATRIX` from `Payments/config/plans.config.js` instead of reading them from an API endpoint; `plans.config.js` uses badges `'Popular'` and `'Best Value'` while `utils/plans.js` renders `'Most chosen'` via `recommended: true`.
- **Hardcoded credit constants in UI copy:** `useAccount.js` defaults `tokensPerCredit` to `1000`, `Sidebar.jsx` line 36 passes literal `5` to `remainingTone(left, total, 5)` instead of `credit?.tierConfig?.creditLowerLimit`, and `Faq.jsx` line 15 hardcodes `"Free 20, Pro 150, Max 200"`, `"1,000 tokens"`, and `"fewer than 5 credits"` in prose.
- **100-item sample ceiling on breakdowns and invoices (`payments.queries.js`):** `sample` fetches `page: 1, limit: 100` from `/usage-events` and `history` fetches `page: 1, limit: 100` from `/transactions`, so `Top models`, `Top projects`, `Activity by hour`, `By model`, `Request size`, `Spending by month`, and `InvoicesPage` filters/KPIs only inspect the latest 100 records (whereas `Account totals` reads lifetime `summary` from `/credit/transactions/summary`).
- **Unwired `faultkit:error` event and missing toast UI:** `services/api.js` line 165 dispatches a `window` `CustomEvent('faultkit:error', ...)` on API errors, but no component listens to it, and no toast feedback exists for `Export CSV`, `Refresh`, or `Print or save PDF`.
- **Ephemeral filter/range state and popup printing:** Time range (`7D`/`30D`/`90D`), chart metric (`Tokens`/`Requests`/`Credits`), request/invoice search, status filters, and table page numbers live in local `useState` rather than URL params, so reloading resets view state. `printInvoice()` relies on `window.open('', '_blank', ...)` with inline light-mode HTML and silently returns `false` if popups are blocked.
- **Hardcoded dark colors and emoji in `ErrorBoundary.jsx` and `PaymentsIntroLoader.module.scss`:** `ErrorBoundary.jsx` uses inline hex colors (`#0F0F12`, `#1F1F24`, `#6366F1`) and a `⚠️` emoji outside CSS tokens, and `PaymentsIntroLoader.module.scss` hardcodes `#090C15` while `payments.slice.js` defaults `readTheme()` to `'light'`.
- **Pending state in `InvoiceDrawer.jsx` and unused `history.summary`:** `InvoiceDrawer` only shows an action footer for `paid` and an explanatory note for `failed`, leaving `pending` transactions without explanation; `usePayments()` reads `history?.summary` which `InvoicesPage` never consumes.
- **Generic skeleton on `RequireAuth` and hidden mobile `Open IDE`:** `RequireAuth` shows a 4-KPI + `2-1` panel skeleton while checking auth even for `/usage`, `/requests`, `/checkout/:planId`, or `/invoices`. `Topbar.scss` hides `.topbar__ide` below `640 px`, so signed-out mobile visitors have no `Open IDE` link in the topbar or user menu.
