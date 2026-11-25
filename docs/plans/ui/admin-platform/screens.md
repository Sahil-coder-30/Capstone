# Admin portal: screens and components

UI for [admin-platform-hld.md](../../admin-platform-hld.md) and `Admin/PLAN.md`. Design rules: [../README.md](../README.md#design-system).

Wireframes, in four boards:

| Board | Screens |
|---|---|
| [wireframes-1-access.html](wireframes-1-access.html) | AD-01 to AD-06: maintainer sign in, passkey, enrollment, admin registration, step-up, account status |
| [wireframes-2-organization.html](wireframes-2-organization.html) | AD-10 to AD-14: applications, approve with grants matrix, admins, role templates, audit log |
| [wireframes-3-data.html](wireframes-3-data.html) | AD-20 to AD-26: overview, users 360, projects, chats, AI runs, payments, analytics |
| [wireframes-4-ops.html](wireframes-4-ops.html) | AD-30 to AD-60: cluster, live logs, log search, trace, data explorer, query, edit and revert, tickets, user actions, payments actions |

Related boards that live in the same portal: notify module (K6) in [../whatsapp-notifications/](../whatsapp-notifications/wireframes.html#nt1), Agent tools tab in [../tool-call-analytics/](../tool-call-analytics/wireframes.html), Quality and cost tab (proposal) in [../llmops/](../llmops/wireframes.html).

`Admin/PLAN.md` delivery steps 4 and 5 name `docs/frontend/admin-design-system.md` and `docs/frontend/admin-ui.md`. This folder is the input for both: when those steps start, copy the decisions below into them or point them here.

## Design decisions for the portal

| Decision | Choice | Why |
|---|---|---|
| Tokens | The main app's tokens (`Frontend/src/styles/index.scss`): ink canvas, ember `--brand-primary`, indigo `--accent-primary`, Fira Sans and Fira Code, both themes | `Admin/PLAN.md` section 10 says the portal reuses Frontend's SCSS tokens and folder layout |
| Shell | The payments_frontend dashboard shell: 248 px sidebar, 56 px top bar, 24 px content padding, KPI cards, panels with radius 12, tables, badges, drawers | It is the app's existing pattern for a data dashboard, and admins read tables all day |
| Charts | `recharts`, two series max: ember first, indigo second (same pair payments_frontend validated); status colours only for status | Plan section 10 picks recharts |
| Density | Table rows 40 px, 12.5 px text, tabular numbers | Lists are the main job |
| The one distinctive element | The **scope strip**: a dashed indigo bar above any list that the backend filtered, saying exactly what was limited ("last 90 days", "PII masked", "services ai, sandbox") | Limits are applied in the readers. The response says which ones were applied (HLD 5.4), and an admin must never mistake a filtered view for the whole data |
| Sensitive actions | One step-up dialog (AD-05) and one confirm pattern (AD-51): one sentence on what happens to the user, a reason field, a danger or primary button with the fingerprint icon | Same habit everywhere, so a passkey prompt is never a surprise |
| Masking | Masked values in mono, muted: `s•••@g••••.com`, `+91 ••••• ••418` | Masked data stays readable as a shape without leaking |
| Components (2026-11-25) | **ui-sdk** (`@ui-sdk/react`, headless) for every control, styled with the tokens above; our own `DataTable` primitive; agent marks and tests per screen | The in-app admin agent can only see and use ui-sdk parts. Full rules in [admin-native-app-plan.md](../../admin-native-app-plan.md) section 10.4 |

## Navigation

Sidebar groups, top to bottom: Overview, Analytics; People (Users, Projects, Chats, AI runs, Payments); Operations (Cluster, Logs, Trace, Data explorer, Tickets); Notify (after K6); Organization (maintainer only: Applications, Admins, Role templates) and Audit log. The footer shows who is signed in and when the passkey was last used (maintainer) or when access ends (admin).

The frontend hides modules the account has no grant for (see the Support Agent sidebar on AD-21 and AD-23). The backend still checks every request.

## Screen list

| ID | Screen | Phase | Route | Grant | Notes |
|---|---|---|---|---|---|
| AD-01 | Maintainer sign in | P1 | `/login/maintainer` | none | Username, password; "Invalid credentials" only; lockout state with time |
| AD-02 | Maintainer passkey | P1 | same | pre-auth cookie | 5 min window; backup key link; failure state |
| AD-03 | Enrollment | P1 | `/enroll` | CLI code | 404 without a code; two passkeys required; closes for good |
| AD-04 | Admin registration | P1, P2 | `/join` | none | Google, passkey, application form; three step dots |
| AD-05 | Step-up dialog | P1 | global | any | On `401 step_up_required`; names action and target; retries once |
| AD-06 | Status pages | P2 | `/` | none | pending, rejected (reapply date), suspended, expired (renew) |
| AD-10 | Applications | P2 | `/org/applications` | maintainer | Pending, approved, rejected, renewal requests |
| AD-11 | Approve | P2 | `/org/applications/:id` | maintainer | Template chips, module x action matrix, limits inline, expiry, note, approve with passkey |
| AD-12 | Admins | P2 | `/org/admins` | maintainer | Status badges, drawer with grants and activity, extend, suspend |
| AD-13 | Role templates | P2 | `/org/templates` | maintainer | Edit uses the AD-11 matrix |
| AD-14 | Audit log | P2 | `/audit` | `audit.view` (own or all) | Filters, weight-coloured action badges, before/after JSON diff, revert link |
| AD-20 | Overview | P4 | `/` | `analytics.view` | 4 KPIs, runs chart, "Needs attention" list |
| AD-21 | Users and User 360 | P3 | `/users/:id` | `users.view` | Identity card, tabs per source, actions in the top bar |
| AD-22 | Projects | P3, P7 | `/projects` | `projects.view`, `stop_sandbox` | Sandbox state, pod, CPU, memory, idle time |
| AD-23 | Chats | P3 | `/chats/:id` | `chats.view` | Reason gate + step-up every time, read-only transcript with watermark, 15 min access |
| AD-24 | AI runs | P3, P7 | `/ai` | `ai.view_runs`, `stop_run` | Tabs: Runs, Usage, Agent tools, Quality and cost |
| AD-25 | Payments (read) | P3 | `/payments` | `payments.view` (history days) | Transactions, subscriptions, credits ledger, webhooks |
| AD-26 | Analytics | P4 | `/analytics/:board` | `analytics.view` (product, ai, revenue) | Each panel names its source query |
| AD-30 | Cluster | P5 | `/cluster` | `cluster.view` (services) | K8s API + metrics-server; consumer lag after K7 |
| AD-31 | Pod detail | P5 | `/cluster/:pod` | `cluster.view` | Live, previous container, events |
| AD-32 | Log search | P5 | `/logs` | `logs.view` (services, days) | Loki; deleted pods labelled |
| AD-33 | Trace | P7 | `/trace` | `tickets.view` | User + project + time window, merged timeline |
| AD-40 | Data explorer browse | P6 | `/explorer` | maintainer or `db.query` | Side-effect warnings, role badge |
| AD-41 | Query console | P6 | `/explorer/query` | same | Read-only roles, 3 s timeout, `$out`/`$merge` rejected |
| AD-42 | Edit and revert | P6 | `/explorer/:db/:table/:id` | maintainer | Form editor, diff, reason, step-up, revert if unchanged |
| AD-50 | Tickets | P7 | `/tickets/:id` | `tickets.*` | Thread, reply by email, links to trace and chat |
| AD-51 | User actions | P7 | dialogs | per action | Force logout, suspend, stop sandbox, stop run |
| AD-60 | Payments actions | P8 | `/payments/*` | maintainer (P8) | Coupons, plan overrides, credit grants through the ledger, refunds |

## States every page needs

| State | Pattern |
|---|---|
| Loading | Skeleton rows (tokens `skeleton` mixin), never a full-page spinner |
| Empty | One sentence that says what would appear and why it is empty, plus the next action if any. Example: "No pending applications. New ones appear here and in your email." |
| Error from a reader | Error notice in the panel with the service name: "Could not read Mongo ai (timed out after 3 s). Other panels still work." The page never fails as a whole |
| Limits applied | Scope strip at the top of the list |
| No grant | The menu item is hidden. A direct URL shows "You do not have access to Payments. Ask the maintainer." |
| Step-up needed | AD-05 dialog, then retry |
| Account changed while open | Within 30 s the backend refuses; the portal shows the AD-06 status page |

## Copy rules

- Name actions by what they do: "Approve with passkey", "Suspend with passkey", "Grant 500 credits", "Replay 2".
- Confirmations say what happens to the user, in one sentence, before the button.
- Errors name the source and the next step. No apologies.
- Dates: "24 Nov, 18:40" in lists, full date in drawers. Relative time ("2 h ago") only for the last 24 hours.
