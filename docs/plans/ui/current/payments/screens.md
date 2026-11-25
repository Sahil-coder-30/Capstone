# Payments (main app): screens and components

Wireframes for the built payments feature in `Frontend/`. Open [wireframes.html](wireframes.html) in a browser (light and dark switch at top right, hide notes toggle beside it). Design rules: [../../README.md](../../README.md#design-system), built inventory: [../INVENTORY.md](../INVENTORY.md).

Status: built (`Frontend/src/features/payments/components/PaymentsLandingPage.jsx`). `Frontend/src/App.jsx` mounts this component on `?route=payments`, while an effect immediately sends `?route=payments` to the standalone billing app on port 5174, so these screens only flash before the redirect today.

| ID | Screen | Component file | Route or trigger | Data source |
|---|---|---|---|---|
| CP-01 | Overview & Plans | `Frontend/src/features/payments/components/PaymentsLandingPage.jsx`, `PlanCard.jsx` | `?route=payments` (`activeView === 'landing'`, default) | `GET /api/payments/credit`, `GET /api/payments/credit/packages` (unused), local `defaultPackages` |
| CP-02 | Feature comparison | `Frontend/src/features/payments/components/FeatureComparisonTable.jsx` | Scroll below plan cards on `landing` view | Static 3-group matrix in component; compares against `Payments/config/plans.config.js` |
| CP-03 | Plan detail modal | `Frontend/src/features/payments/components/PlanDetailModal.jsx` | `usePayments().openPlanDetail(planId)` (`activeView === 'detail'`, unreachable in UI) | `plan` and `billingCycle` props; `getSpecs()` switch on `plan.tier` |
| CP-04 | Checkout modal | `Frontend/src/features/payments/components/CheckoutModal.jsx` | Plan card CTA (`switchView('checkout')`) or CP-03 `Select` button | `plan`, `billingCycle`, `onClose`, `onConfirmPayment` props (not passed by parent) |
| CP-05 | Invoices & Billing | `Frontend/src/features/payments/components/InvoicesView.jsx` | Top nav `Invoices & Billing` tab (`activeView === 'invoices'`) | `GET /api/payments/credit/transactions`, `GET /api/payments/credit/transactions/summary`, `GET /api/payments/credit/analytics` |

---

## CP-01 Overview & Plans

**Purpose:** Present the three Taksha AI subscription tiers (`Free`, `Pro`, `Max`) with monthly or annual pricing, core highlights, and collapsible benefit drawers.

**Data and API calls:**
- On mount, `PaymentsLandingPage.jsx` runs `loadCredit()` (`GET /api/payments/credit`) and `loadPackages()` (`GET /api/payments/credit/packages`) via `usePayments()`.
- `currentSubscription` reads `credit?.subscription || 'free'`; `packageList` assigns hardcoded `defaultPackages` instead of Redux `packages`.
- Top nav tabs call `switchView('landing')` or `switchView('invoices')`; billing toggle calls `selectBillingCycle('monthly' | 'yearly')`.
- Clicking a non-current plan CTA runs `selectPlan(plan.id)` and `switchView('checkout')`.
- Below `FeatureComparisonTable`, `PaymentsLandingPage.jsx` also renders a 2-column `Frequently Asked Questions` section with 4 static cards.

**States:**
- Active tier card disables its CTA button (`Current Subscription`) and omits the arrow icon.
- `PlanCard` drawer defaults collapsed (`View plan benefits`) and toggles inline categorized lists (`Hide plan benefits`) via local `isExpanded`.
- `annual` billing cycle multiplies non-zero `plan.priceINR` by `0.8` (`Math.round(plan.priceINR * 0.8)` -> `₹399`, `₹799`).
- No loading skeleton or error banner is rendered for `isLoading` or `error`.

**Exact copy:**
- Header: `Taksha CodeSpace`, badge `Plans & Pricing`, tabs `Overview & Plans`, `Invoices & Billing`, user pill `(free)`, link `Return to IDE`
- Hero: pill `Supercharge your code with Taksha AI`, heading `Power your coding workflow with a` / `Taksha AI Plan`, subtitle `Access our most advanced AI coding agents, high-performance vCPU sandboxes, and enterprise token quotas built for modern software engineers.`, region `Region: India (INR ₹)`, toggle `Monthly` / `Annual Billing` / `Save 20%`
- Plan cards:
  - `Get Started`, `Taksha AI Free`, `Free`, `0.5 vCPU • 512 MB RAM`, `Essential sandbox and AI model credits for developers getting started.`, button `Current Subscription` or `Get Started Free`
  - `Most Popular`, `Taksha AI Pro`, `₹499 /mo`, `2.0 vCPU • 2 GB RAM Isolated`, `Full AI power with high-performance isolated sandbox containers.`, button `Get Pro`
  - `Flagship Tier`, `Taksha AI Max`, `₹999 /mo`, `4.0 vCPU • 4 GB RAM Dedicated`, `Uncapped tokens, flagship LLMs, and priority worker execution queue.`, button `Get Max`
- Drawer toggles: `View plan benefits`, `Hide plan benefits`
- FAQ section: `Frequently Asked Questions`, `Everything you need to know about Taksha AI plans, sandbox billing, and token limits.` (line 108 uses `Yes!` with an exclamation mark in source)

**Components reused:** `TakshaIcon` (`BrandLogo.jsx`), `PlanCard`, `FeatureComparisonTable`, `InvoicesView`, `CheckoutModal`, `usePayments`, `lucide-react` (`Sparkles`, `Globe`, `ArrowRight`).

---

## CP-02 Feature comparison

**Purpose:** Compare AI models, token caps, sandbox hardware, and support levels side by side across the three subscription tiers.

**Data and API calls:**
- Pure presentational component with no API calls or Redux selectors; renders a static 3-category `categories` array and fixed monthly pricing columns.

**States:**
- Static comparison matrix table (`google-matrix-table`) wrapped in a horizontally scrollable container (`google-matrix-table-wrapper`).

**Exact copy:**
- Section header: `Detailed Feature Matrix`, `Comprehensive breakdown of features, AI capabilities, and resource allocations across Taksha AI subscription tiers.`
- Column headers: `Plan Features`, `Taksha AI Free` / `₹0 / mo`, `Popular` / `Taksha AI Pro` / `₹499 / mo`, `Flagship` / `Taksha AI Max` / `₹999 / mo`
- Category 1 `Productivity & AI Models`: `Supported AI Models`, `Daily & Monthly Token Quotas`, `Agentic Code Execution`, `Deep Repository Search`
- Category 2 `Cloud Infrastructure & Sandboxes`: `vCPU Container Allocation`, `Container Memory (RAM)`, `Persistent Workspace Storage`, `Worker Execution Queue`
- Category 3 `Dev Credits & Support`: `Monthly Cloud Dev Credits`, `Team Workspace Seats`, `Support Level` (Free cell uses an em dash in source)

**Components reused:** None (standalone JSX table inside `PaymentsLandingPage.jsx`).

---

## CP-03 Plan detail modal

**Purpose:** Display an expanded breakdown of a single plan's capabilities, 4 hardware/SLA spec cards, and included highlights before proceeding to checkout.

**Data and API calls:**
- Receives `plan`, `billingCycle`, `onClose`, and `onCheckout` as props.
- `displayPrice()` returns `'Free'` or `` `₹${finalPrice}/month` `` (`0.8` multiplier when `billingCycle === 'yearly'`).
- `getSpecs()` maps `plan.tier` (`'max'`, `'pro'`, default `'free'`) to 4 specification rows; renders optional `plan.bannerImage` if present.

**States:**
- Returns `null` when `!plan`.
- Open modal over backdrop: clicking overlay calls `onClose`; clicking `Select {plan.label}` calls `onClose()` then `onCheckout(plan.id)`.

**Exact copy:**
- Header: `{plan.label}, Detailed Explanation` (source line 44 uses an em dash between `{plan.label}` and `Detailed Explanation`), `Pricing: {displayPrice()}`
- Subheadings: `Overview & Capabilities`, `Hardware & Infrastructure Specifications`, `Key Features Included`
- Spec labels: `Container Resources`, `AI Token Allowance`, `Storage Quotas`, `Priority SLA Queue`
- Buttons: `Close Breakdown`, `Select {plan.label}`

**Components reused:** `lucide-react` (`X`, `Cpu`, `Database`, `Zap`, `ShieldCheck`, `CheckCircle2`, `ArrowRight`).

---

## CP-04 Checkout modal

**Purpose:** Collect a payment method (`UPI / QR`, `Card`, or `Net Banking`) for the chosen plan and billing cycle, submit activation, and display confirmation.

**Data and API calls:**
- Receives `plan`, `billingCycle`, `onClose`, and `onConfirmPayment` props.
- Submitting calls `await onConfirmPayment(plan.tier)`; no direct call to `Frontend/src/features/payments/service/payments.api.js` exists inside `CheckoutModal.jsx` or `PaymentsLandingPage.jsx`.

**States:**
- Returns `null` when `!plan`.
- Payment method tabs: `UPI / QR` (default, shows UPI ID input), `Card` (shows Card Number, Expiry, CVC/CVV inputs), `Net Banking` (renders no additional inputs).
- Submitting (`isSubmitting === true`): disables submit button and shows spinner with `Processing Payment…`.
- Error (`error !== null`): displays inline red error text (`err.message || 'Payment failed'`).
- Success (`success === true`): replaces form with green check icon, confirmation heading, and `Done` button.

**Exact copy:**
- Header: `Checkout & Activation`
- Order summary: `{plan.label} Subscription ({billingCycle})`, `₹{displayPrice()} / mo`, `Includes 256-bit SSL secure payment processing & instant invoice generation.`
- Payment methods: `Select Payment Method`, `UPI / QR`, `Card`, `Net Banking`
- Inputs: `UPI ID (GPay / PhonePe / Paytm)` (`username@okaxis or 9876543210@upi`), `Card Number` (`4532 •••• •••• 8910`), `Expiry (MM/YY)` (`12/28`), `CVC / CVV` (`•••`)
- Submit button: `Pay ₹{displayPrice()} & Upgrade Now`, loading `Processing Payment…`
- Confirmation: `Subscription Activated` (source line 52 includes a trailing exclamation mark), `You have successfully upgraded to {plan.label}. Your new credits, LLMs, and sandbox container specs are live.`, button `Done`

**Components reused:** `lucide-react` (`X`, `Lock`, `ShieldCheck`, `CheckCircle2`, `Loader2`, `CreditCard`, `Smartphone`, `Building`).

---

## CP-05 Invoices & Billing

**Purpose:** Show account billing totals (`Total Spent`, `Active Subscription`, `Tokens Consumed`) and a filterable table of past payment transactions with receipt download buttons.

**Data and API calls:**
- Entering `activeView === 'invoices'` triggers `loadTransactions()` (`GET /api/payments/credit/transactions?page=1&limit=20`), `loadSummary()` (`GET /api/payments/credit/transactions/summary`), and `loadAnalytics()` (`GET /api/payments/credit/analytics`) in `PaymentsLandingPage.jsx`.
- `InvoicesView` receives `transactions` and `summary` props and filters `transactions` locally by `filter === 'all'` or `tx.type === 'CREDIT_PURCHASE'`.

**States:**
- Empty (`filtered.length === 0`): centered `#i-file` icon with `"No invoice or transaction records found."`.
- Populated table: 6-column table with `en-IN` formatted dates, INR amounts, hardcoded `Completed` status badge, and `PDF` button per row.
- Filter toggle switches between `All` and `Payments` (`CREDIT_PURCHASE`).

**Exact copy:**
- Header: `Billing & Invoices`, `View your complete payment audit trail, subscription charges, and token usage history.`
- Filter buttons: `All`, `Payments`
- Summary KPIs: `Total Spent`, `Active Subscription`, `Tokens Consumed`
- Empty state: `No invoice or transaction records found.`
- Table headers: `Date`, `Description`, `Type`, `Amount`, `Status`, `Receipt`
- Row fallbacks/actions: `Subscription Invoice`, `Completed`, `PDF`

**Components reused:** `lucide-react` (`Download`, `FileText`, `CheckCircle2`, `Clock`, `Filter`; `Clock` and `Filter` are imported but unused).

---

## Gaps seen in the code

- **Immediate redirect on `?route=payments`:** `Frontend/src/App.jsx` mounts `<PaymentsLandingPage user={user} />` when `activeRoute === 'payments'`, while a `useEffect` (lines 235 to 240) immediately sets `window.location.href` to port `5174` and the URL-sync `useEffect` (lines 222 to 226) omits an `else if (activeRoute === 'payments')` branch so the URL resets to `?tab=playground`. As a result, these screens only flash before redirect.
- **Unreachable `PlanDetailModal`:** `payments.hooks.js` exports `openPlanDetail(planId)` (setting `detailPlanId` and `activeView = 'detail'`) and `payments.slice.js` documents `'detail'` in `activeView`, but `PaymentsLandingPage.jsx` never imports or renders `PlanDetailModal.jsx`.
- **`CheckoutModal` rendered without props or payment API:** `PaymentsLandingPage.jsx` line 170 renders `<CheckoutModal />` with no `plan`, `billingCycle`, `onClose`, or `onConfirmPayment` props, so `if (!plan) return null` inside `CheckoutModal.jsx` prevents it from rendering. `payments.api.js` also defines no checkout order or verification endpoint.
- **Missing CSS for modal classes:** `PlanDetailModal.jsx` and `CheckoutModal.jsx` rely on `.plan-detail-overlay`, `.plan-detail-card`, `.modal-header`, `.modal-body`, `.btn-close`, `.detail-banner-hero`, and `.specs-grid`, none of which exist in `payments.scss`, `index.scss`, or `App.scss`.
- **`Net Banking` option has no UI:** Clicking `Net Banking` in `CheckoutModal.jsx` sets `method = 'netbanking'` and hides both the UPI and Card forms without rendering a bank selector or instructions.
- **Broken inline `textTransform` and stubbed controls in `InvoicesView.jsx`:** Lines 61, 65, 71, and 88 pass unquoted `textTransform: uppercase` in style objects, `Completed` status is hardcoded for every row regardless of `tx.status`, the `PDF` button has no `onClick` handler, `Payments` filtering matches only `CREDIT_PURCHASE`, and pagination metadata from `GET /api/payments/credit/transactions` has no UI.
- **Hardcoded plan lists diverge from `Payments/config/plans.config.js`:** `PaymentsLandingPage.jsx` sets `const packageList = defaultPackages` (ignoring Redux `packages` from `GET /api/payments/credit/packages`), states `"20 AI credits per provider daily"` while `plans.config.js` defines 5-hour credit windows (`20`, `150`, `200`), and uses different badges (`"Get Started"`, `"Most Popular"`, `"Flagship Tier"` vs `null`, `"Popular"`, `"Best Value"`). `FeatureComparisonTable.jsx` hardcodes monthly prices (`₹0 / mo`, `₹499 / mo`, `₹999 / mo`) ignoring `billingCycle`, and lists `"Priority Queue"` for Pro while `TIER_LIMITS.pro.features.priorityQueue` is `false`.
- **Unused Redux state and silent API fallbacks:** `payments.slice.js` defaults `selectedPlanId` to `'pro_early_access'` (absent from `defaultPackages` and `plans.config.js`); `PaymentsLandingPage.jsx` destructures `packages`, `isLoading`, and `selectedPlanId` without rendering them (`isLoading` has no loading UI) and calls `loadAnalytics()` (`GET /api/payments/credit/analytics`) without passing `analytics` to `InvoicesView`; every method in `payments.api.js` catches errors and returns `{ status: 'success', ... }` fallback payloads instead of surfacing errors.
- **Hardcoded hex colors, font drift, and punctuation:** `payments.scss`, `PlanDetailModal.jsx`, `CheckoutModal.jsx`, and `InvoicesView.jsx` hardcode hex values (`#0A0A0C`, `#111114`, `#6366F1`, `#818CF8`, `#FF8A4C`, `#22C55E`, `#EF4444`, `#C084FC`) with no `.light-theme` overrides; `payments.scss` specifies `'Google Sans', 'Inter'` instead of `var(--font-sans)` (`Fira Sans`); `PlanDetailModal.jsx` line 44 contains an em dash and `CheckoutModal.jsx` line 52 plus `PaymentsLandingPage.jsx` line 108 contain exclamation marks.
