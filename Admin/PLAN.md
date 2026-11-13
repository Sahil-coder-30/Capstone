# Admin Platform Plan

Status: plan, nothing built yet. Date: 2026-11-13.

`Admin/README.md` describes features that do not exist (support agent, module federation, MFA). Trust this file, not that README. Rewrite the README when P1 ships.

## 1. Goal

One admin portal for the whole platform:

- The **maintainer** (one person, fixed) sees and changes everything: analytics, logs, pods, users, chats, payments, any database row.
- **Admins** apply, get approved by the maintainer, and see only the modules and limits the maintainer grants.

Rule for every phase: existing user flows keep working exactly as today. Changes outside `Admin/` are additive only (new files, new routes, new collections, a few mount lines) and listed per phase.

Payments features (plan editing, coupons, discounts, credit grants, refunds) come **last** (P8). Everything before P8 only reads Payments data.

## Related plan

Notifications (email, WhatsApp, announcements, offers, delivery log, retry, DLQ) are designed in `docs/plans/kafka-whatsapp-architecture.md`, mainly section 7. This file owns the portal, login, permissions, data access and audit. The two plans depend on each other: the admin backend publishes facts, the Notification service delivers them, and the portal is the screen for the delivery log and the DLQ.

Where the two files disagree on the admin portal, this file wins. Where they disagree on notifications or the event backbone, the other file wins.

## Delivery workflow

No code before the documents are done. Each step is reviewed before the next starts. Documents live in `Admin/docs/`.

| Step | Output | File |
|---|---|---|
| 1 | HLD: system design, components, flows, trust boundaries, deployment | `docs/01-hld.md` |
| 2 | PRD | `docs/02-prd.md` |
| 3 | OpenAPI spec for every admin API (Auth admin routes + admin backend) | `docs/03-openapi.yaml` |
| 4 | Design system: palette, typography, spacing, components, light and dark | `docs/04-design-system.md` |
| 5 | UI design of every page | `docs/05-ui.md` |
| 6 | Backend, phase by phase (section 11). Every API ships with unit, edge-case and integration tests. | `Admin/backend/` |
| 7 | Frontend, after the backend APIs of that phase are done | `Admin/frontend/` |
| 8 | End-to-end tests across portal, Auth, admin backend and emails | `Admin/e2e/` |

## 2. Architecture

```
                 Admin Portal (Admin/frontend, one app for maintainer + admins)
                                   |
            +----------------------+----------------------+
            |                                             |
  /api/auth/admin/*   (who are you)            /api/admin/*   (what can you do)
            |                                             |
     Auth service                                  Admin backend (Admin/backend)
  - maintainer credentials (hashes)              - admin accounts, applications
  - admin Google login                           - roles, grants, limits, audit
  - passkeys (public keys only)                  - readers: read-only DB users
  - admin token, aud taksha-admin                - writers: maintainer-only DB user
            |                                    - K8s API, Prometheus, Loki
            +--------> admin events <------------+
                            |
               Notification -> email, WhatsApp
```

| Concern | Owner |
|---|---|
| Authentication (login factors, tokens, step-up) | Auth service, new admin files |
| Authorization (status, grants, limits) | Admin backend, checked on every request |
| Notifications | Notification service. The admin backend and Auth only publish events (see section 8) |
| Data | Read straight from each service's DB with read-only users. Maintainer writes use a separate read-write user. |

Permissions are **not** in the token. The admin backend loads the account on each request (30 s cache), so suspend and permission changes apply within 30 s.

## 3. Identity

### 3.1 Maintainer

| Factor | Details |
|---|---|
| Username | 32 chars from `A-Za-z0-9`, `crypto.randomBytes` with rejection sampling (no modulo bias) |
| Password | 28 chars from letters, digits and symbols, same generator |
| Biometric | WebAuthn passkey, `userVerification: 'required'` |

- Generated once by `npm run admin:init-maintainer` (Auth, run through `kubectl exec`). Printed once. Stored as `crypto.scrypt` hashes.
- The CLI also prints a 10 minute enrollment code. The maintainer enters username, password and code in the portal, then registers the passkey. Enrollment then closes.
- Only one maintainer can exist: unique partial index on `kind: 'maintainer'`.
- Recovery only by `npm run admin:reset-maintainer` through `kubectl exec`. No HTTP reset route.
- Login: page 1 username + password, page 2 passkey. Errors always say "Invalid credentials".
- 5 failures in 15 minutes lock login for 30 minutes and email the maintainer. Every successful login emails the maintainer.
- Enroll two authenticators (main device + backup key).

### 3.2 Admin

Registration, three pages:

1. Google login (separate passport strategy `google-admin`, callback `/api/auth/admin/google/callback`). Does not touch the `users` collection or `auth_notification_queue`.
2. Passkey registration (before approval, so a hijacked Google account cannot add a device later).
3. Application form: name, team, wanted role, reason, wanted duration.

Then status `pending`, emails to maintainer and applicant. Later logins: Google, then passkey.

### 3.3 Tokens and sessions

| Item | Value |
|---|---|
| Access token | RS256, same Auth key, `aud: taksha-admin`, `sub`, `kind`, `auth_time`, `amr`, 10 min |
| Refresh | Opaque, rotated, family revoke on reuse, cookie `adminRefreshToken` on path `/api/auth/admin/refresh`, 8 h absolute |
| Pre-auth (between factors) | httpOnly cookie, 5 min, never in the URL |
| Step-up | Sensitive actions need `auth_time` under 5 min, else the portal asks for the passkey again |
| Passkey relying party | `admin.takshacodespace.in` in production, `localhost` in dev. Passkeys are bound to this domain, so dev passkeys do not work in production. |
| Host guard | Auth serves `/api/auth/admin/*` only when the request host is the admin host, 404 on any other host. No change to `k8s/ingress.yml`. |

Every existing service verifies `aud: takshacodespace-services`, so an admin token is rejected by all user APIs.

## 4. Organization (authorization)

### 4.1 Account status

| Status | Can log in | Sees |
|---|---|---|
| `pending` | yes | Waiting page |
| `active` | yes | Granted modules |
| `rejected` | yes | Reason, can reapply after 7 days |
| `suspended` | yes | Nothing |
| `expired` | yes | Renew request button |

### 4.2 Modules, actions, limits

| Module | Actions | Limits |
|---|---|---|
| analytics | `view` | which dashboards (product, ai, revenue) |
| cluster | `view` | which services |
| logs | `view` | which services, history days |
| users | `view`, `force_logout`, `suspend` | PII masked or not |
| chats | `view` | reason + step-up every time |
| projects | `view`, `stop_sandbox` | |
| ai | `view_runs`, `stop_run`, `view_usage` | |
| payments | `view` | history days |
| db | `query` | which databases, read-only always |
| tickets | `view`, `reply`, `assign` | |
| notify | `send`, `view_deliveries`, `replay` | audience, channels, max per day |
| audit | `view` | own or all |
| organization | all | maintainer only, never grantable |
| data_explorer_write | all | maintainer only, never grantable |

Grants live as jsonb on the account, for example:

```json
{ "payments.view": { "historyDays": 90 }, "logs.view": { "services": ["ai"], "historyDays": 7 } }
```

- Role templates (Viewer, Support Agent, DevOps, Finance, AI Ops) are presets. Approving **copies** the template into the account, so editing a template later never widens existing admins.
- Enforcement is in the backend only: `can(account, 'payments.view')` on every route, limits applied inside the readers (date filters, service filters, masking). The frontend only hides menus.
- Default access expiry: 90 days.

### 4.3 Approve screen

Pick template, adjust the module x action matrix and limits, set expiry, passkey step-up, approve. Applicant gets an email with the grants.

## 5. Data access

### 5.1 Credentials (infra, no code change in services)

| Store | Admin backend user | Used by |
|---|---|---|
| Mongo `auth`, `ai`, `sandbox` | read-only user | all readers |
| Mongo same DBs | read-write user | maintainer writers only |
| Payments Postgres | `admin_reader` role, SELECT only | readers |
| Payments Postgres | `admin_writer` role | maintainer writers only |
| Redis | ACL user: `GET SCAN TTL EXPIRE DEL` on `sandbox:*`, `mcptoken:*` | readers, safe actions |
| K8s | ServiceAccount `admin-reader`: get/list/watch pods, pods/log, events, services, deployments | cluster pages |
| Admin Supabase (separate project) | owner | admin tables |

Payments tables have RLS on with no policies, so both Postgres roles need `BYPASSRLS` (verify Supabase allows it in P0).

### 5.2 Rules that protect shared infra

- Mongo: native `mongodb` driver collections, no Mongoose models (no accidental index creation), `maxPoolSize: 2`, `maxTimeMS: 3000`, every query has a limit, `readPreference: secondaryPreferred` when available.
- Postgres: pool max 2, `statement_timeout` 3 s for readers.
- Redis: `SCAN` with `COUNT`, never `KEYS` or `FLUSH*`.
- Never import code from other services. Readers live in `Admin/backend/src/readers/<service>.reader.js` with a contract check script against the real shapes.
- Never publish to `auth_notification_queue` or `payment_notification_queue`.

### 5.3 Safe actions that reuse existing behavior

| Action | How | Existing code it relies on |
|---|---|---|
| Stop sandbox | `EXPIRE sandbox:<id> 1` | `handleExpiredKey` in `Sandbox/server/src/config/redis.js` |
| Force logout | `refreshtokens.deleteMany({ userId })` | Auth refresh returns 401 when the token is missing |

## 6. Observability

| Data | Source |
|---|---|
| Pods, restarts, events, crash reasons | K8s API |
| CPU and RAM | `metrics.k8s.io` (metrics-server) |
| Live logs | K8s `pods/log` |
| Old logs, dead pods | Loki + Grafana Alloy reading container stdout (Promtail is deprecated) |
| Traffic, errors, latency | Prometheus (kubelet/cAdvisor, ingress-nginx metrics, Auth `/metrics`) |

`kube-prometheus-stack`, Loki and Grafana Alloy install with Helm into namespace `monitoring`, outside the main skaffold loop (same stack as section 6 of the Kafka plan). They need 1.5 to 2 GB RAM on Docker Desktop. Grafana stays the deep engineering view, the portal shows the numbers admins need.

Services do not log request ids today. Trace v1 works by user + project + time window: chat messages and tool logs, `usage_events`, pod logs in that window, ingress access log lines (`$req_id`).

## 7. Maintainer data explorer

- Browse any Mongo collection or Postgres table.
- Query console:
  - Postgres: SQL through `admin_reader`, so even raw SQL cannot write.
  - Mongo: `find` and `aggregate` with filters through the read-only user. `$out` and `$merge` stages rejected.
  - Admins with `db.query` get the same console, limited to the databases in their grant.
- Edit (maintainer only): row or document editor, diff preview, passkey step-up, Postgres writes in a transaction, before and after snapshots in `audit_logs`, one-click revert when the row has not changed since.
- Warnings on tables with side effects:

| Data | Side effect of a direct edit |
|---|---|
| Payments `accounts` credits | Skips the `transactions` ledger (use the P8 grant action) |
| User name or email | Shows in tokens after the next refresh (max 15 min) |
| MCP tokens | Redis cache `mcptoken:<hash>` may stay stale, the explorer deletes it |
| Project owner | AI ownership cache is stale for up to 60 s |

## 8. Notifications

Design lives in `docs/plans/kafka-whatsapp-architecture.md` section 7. Summary of what this side does:

| Admin side | Detail |
|---|---|
| Publishes facts, never sends mail | One small publisher module, events use the shared envelope (`eventId`, `type`, `version`, `occurredAt`, `data`) |
| Events | Application submitted, approved, rejected. Grants changed, suspended, reactivated, access expiring. Passkey added or removed. Maintainer login, failed login, lock. Daily digest. |
| Transport | RabbitMQ queue `admin_notification_queue` until Kafka Lesson 10, then topic `admin.events`. Only the publisher module changes. |
| Announcements and offers to users | `notify.send` grant + step-up. Admin backend resolves the audience and publishes one event per user to the broadcast topic. |
| Portal screens | Delivery log per user, failed deliveries and DLQ, replay, per-announcement counts |

Emails carry a portal link only, never an approve button. Security events are also written to the audit log by the producer, so a failed delivery never hides them.

## 9. Admin data model (Supabase, separate project)

| Table | Columns (main) |
|---|---|
| `admin_accounts` | id, identity_id, email, name, status, role_template_id, grants jsonb, approved_by, approved_at, expires_at |
| `admin_applications` | id, account_id, team, wanted_role, reason, wanted_days, status, decision_note, decided_at |
| `role_templates` | id, name, description, grants jsonb |
| `audit_logs` | id, actor_id, actor_kind, action, target_type, target_id, before jsonb, after jsonb, reason, ip, user_agent, created_at. A trigger blocks UPDATE and DELETE. |
| `tickets`, `ticket_messages` | support |

Auth Mongo, new collections: `adminidentities`, `adminpasskeys`, `adminrefreshtokens`, `adminauthevents`.

## 10. Stack

| Part | Choice | Reused from |
|---|---|---|
| Backend | Node ESM, Express 5, FaultKit, `server.js` + `src/app/app.js` + routes/controllers/services | Payments, AI |
| Admin DB | Drizzle + `postgres` | Payments |
| Readers | `mongodb`, `postgres`, `ioredis` | all services |
| K8s | `@kubernetes/client-node` | Sandbox server |
| Token verify | `jsonwebtoken` + JWKS fetch keyed by `kid` | Payments |
| Passkeys | `@simplewebauthn/server` (Auth), `@simplewebauthn/browser` (portal) | new |
| Frontend | React 19, Redux Toolkit, SCSS tokens, `features/<name>/{components,Hooks,service,slice}` | Frontend |
| Charts | `recharts` | new (no chart library exists yet) |

Local ports: backend 5010, portal 5175.

Hosts: production `admin.takshacodespace.in`, local `admin.localhost`. A separate Ingress object in `Admin/k8s/` serves that host: `/api/auth/admin` to auth-service, `/api/admin` to the admin backend, everything else to the portal. Nothing admin is reachable on the public app host.

Manifests in `Admin/k8s/`, separate `Admin/skaffold.yml`. The main `skaffold.yml` lists its manifests by name, so it never picks these up.

## 11. Phases

| Phase | Scope | Changes outside `Admin/` | Done when |
|---|---|---|---|
| P0 Foundations | Backend and portal skeletons, admin Supabase project and migrations, `Admin/k8s`, `Admin/skaffold.yml`, DB users and K8s SA | Infra only | Admin pod healthy, main `skaffold dev` unchanged |
| P1 Identity | Maintainer CLI + login, admin Google + passkey, tokens, refresh, step-up, admin email queue | Auth: 2 lines in `app.js`, 1 dependency, new files. Notification: new queue, consumer, templates | Maintainer and a test admin log in, user login unchanged, generator test passes |
| P2 Organization | Applications, approve/reject, templates, grants matrix, limits, expiry, suspend, audit, emails | none | `can()` and limit tests pass, all emails arrive |
| P3 Data views | Users 360, projects, chats, AI runs and usage, payments (read) | none | Masking and history-limit tests pass |
| P4 Analytics | Overview and analytics dashboards with charts | none | Numbers match direct DB queries |
| P5 Cluster and logs | Pods, events, CPU/RAM, live logs, Prometheus + Loki, history search | Helm installs in `monitoring` | Logs of a deleted sandbox pod are searchable |
| P6 Data explorer | Browse, query console, maintainer edit, diff, revert | none | Revert test passes, reader roles cannot write |
| P7 Support, notifications and actions | Tickets, trace, stop sandbox, force logout, stop run. Announcements, delivery log, DLQ replay (as far as the Kafka plan has reached) | Notification: per the Kafka plan section 7 | Each action audited and in the digest, a test announcement reaches only the chosen audience once |
| P8 Payments (last) | Plan overrides, coupons, discounts, credit grants, refunds | Payments: additive tables and internal routes, empty tables keep today's behavior | Payments test suite passes |

## 12. Decisions (defaults until changed)

| # | Question | Default |
|---|---|---|
| 1 | Maintainer passkey synced or device-bound | Device-bound only (reject backed-up credentials) + a backup security key. Admins may use synced passkeys. |
| 2 | Tell users when an admin views their chats | No, maintainer gets a daily digest |
| 3 | Raw SQL writes in the explorer | No, editor only |
| 4 | Admin access expiry | 90 days |
| 5 | Maintainer IP allowlist | Later |
| 6 | Admin events before Kafka exists | One new RabbitMQ queue now, moved to Kafka with Lesson 10 |
| 7 | Scale | 1 maintainer, up to 20 admins, 1 admin backend replica |
| 8 | Diagram format in the docs | Mermaid inside the markdown files |

## 13. Open checks before P0

- Supabase: second project on the current plan, `BYPASSRLS` roles.
- Mongo Atlas: custom read-only and read-write users, secondary reads.
- Redis Cloud: ACL users on the current plan.
- Exact field names of every collection a reader uses (check per phase).
