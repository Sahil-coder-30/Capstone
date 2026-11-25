# Development lifecycle

The order we follow for every new piece of Taksha, and for any new application. Written 2026-11-25 from the mistakes this project actually made (sources: [AUDIT-2026-11-24.md](AUDIT-2026-11-24.md), [../reviews/2026-10-26_DRIFT_REPORT.md](../reviews/2026-10-26_DRIFT_REPORT.md), [platform-foundations-plan.md](platform-foundations-plan.md), [CHECKLIST.md](CHECKLIST.md), `git log`, `git status`).

Flowchart (whiteboard): https://claude.ai/artifact/63yujbo2iCXeARAfP125Ei

## 1. The short version

1. **Think (no code).** Size the work, write the PRD, then the wireframes and the HLD side by side. Spike anything unknown. Pass the design review.
2. **Specify (still no code).** LLD per API, the OpenAPI contract with events and env vars, the test plan, the build plan in `CHECKLIST.md`. Commit the docs. Pass the "ready to code" gate.
3. **Build, ship, learn (code).** Walking skeleton and CI once per app. Then slice by slice: migration, backend with tests, frontend, gates. Release with migrations first. Every incident becomes a test and a row in the mistakes table.

Three answers you asked for directly:

| Question | Answer | Why, from this project |
|---|---|---|
| When does real code start? | After the "Ready to code" gate (stage 9). Before that only spikes, on throwaway branches, never merged. A size S bug fix may go straight to code with a failing test first | Plans were written fast and then the 2026-11-24 audit found 5 critical design breaks that would have been code by then |
| Backend or frontend first? | **The contract first.** Then per vertical slice: migration, backend with its tests, frontend. Not "all backend, then all frontend". The frontend may run on a mock generated from OpenAPI, never on hand-written fake success | Settings faked success and invented `sk_test_` keys for a route that does not exist; payments_frontend fell back to an orderless test-key checkout |
| When CI/CD? | **CI with the walking skeleton, before feature 1.** CD to a staging cluster with the first slice. Cloud production before the first real users. Evals gate every prompt or model change from the day the eval runner exists | `.github/` is empty today and CI/CD sits in Phase 6 of `CHECKLIST.md`, after everything else. That is the one place I disagree with the current checklist (section 6) |

## 2. Size the work first

Not every change needs every document. The size decides which ones are required, so small work stays fast and big work gets the full design.

| Size | Examples | Required before code |
|---|---|---|
| **S** | A bug, a copy change, a config value, a one-file fix | A failing test that reproduces it. The "why" and the fix design in the commit message (LLD-lite). Docs updated in the same commit if behaviour changes |
| **M** | A feature inside one service, a new route, a new screen | PRD section (one page), wireframes if there is UI, HLD delta (one diagram showing the new arrows), LLD, OpenAPI delta, test plan section, checklist lines |
| **L** | A new service, anything crossing services, a new queue, a new app (Admin, Hosting, git-service, desktop app) | Everything below, plus ADRs for each big choice and spikes for each unknown |

When unsure, size up. Something that touches auth, money, the router or another service's data is never S.

## 3. The stages

Each stage: what you produce, when it is done, which Taksha mistake it prevents.

### Row 1. Think (no code)

**Stage 1. PRD.** Problem, users, user stories with acceptance checks, non-goals, success numbers, and the non-functional numbers (users, requests per second, latency, cost ceiling, free-tier limits, data retention). Phases (V1, V2) if needed.
- *Done when:* every user story has an acceptance check you could turn into a test; non-goals are written down; the status line at the top is honest (`Proposed`, `Approved`, `Building`, `Built`).
- *Prevents:* the PRD and docs describing things as built that were not (`POST /mcp` gateway, 9-node graph, "Production Architecture & Beta Ready", `[x]` boxes for gRPC, Jev, Mongo checkpointing). Drift report Part 1.

**Stage 2a. Low-fi wireframes and flows** (in parallel with 2b). Every screen in every state (empty, loading, error, success, no permission), what data each screen needs, what each button does. `screens.md` plus the board in `docs/plans/ui/`.
- *Done when:* every user story has a path through screens, and every screen lists the data it reads and the actions it calls. That list is the input to the API design.
- *Prevents:* wireframes made after the plans (the Settings redesign on 2026-11-25 found missing backend routes: no `/api/settings/keys`, no account delete). Screens tell you what APIs you need; drawing them late finds gaps late.

**Stage 2b. HLD and ADRs** (in parallel with 2a). The system map: which existing service owns each piece, every new arrow and the entry point it passes through (router for pods, each service's API for its data), sync or async, which foundations it needs. One ADR (`docs/adr/NNNN-title.md`: context, options, decision, consequences) for each choice that would be expensive to reverse.
- *Done when:* the map exists as a diagram; there is a data ownership table; every arrow goes through an existing entry point; required foundations are listed as prerequisites.
- *Prevents:* features planned before foundations (F1, F2, F3 found only by the audit); the admin backend reading every service's database (A-1); git-service calling pods directly (G-1); the AI service calling sidecars directly so the sandbox TTL expired mid-run. Big decisions changing with no record (RabbitMQ to Kafka, Mistral to OpenRouter to Mistral to NVIDIA).

**Stage 3. Spike, only if something is unknown.** Time-boxed (hours to 2 days), on a throwaway branch, answering one written question. Example done right: S1 in the foundations plan (does `@langchain/langgraph-checkpoint-mongodb` work with our LangGraph?).
- *Done when:* the answer is written into the HLD or an ADR. The spike code is deleted, not merged.
- *Loop:* the answer changes the design, so go back to 2b.

**Stage 4. Design review gate.** Check the HLD against the six rules. On Taksha this is the audit, done **before** the LLD instead of after many plans exist. Ask Claude for it with "review this HLD against the six rules" and fix what it finds.

The six rules (from `CLAUDE.md` "Architecture first" and the audit):

| # | Rule | Fails when |
|---|---|---|
| 1 | Every new call goes through an existing entry point | A service talks to a pod, a sidecar or another service's DB directly |
| 2 | Works with 2 replicas and a restart | Anything that must survive lives in a process `Map`, `MemorySaver`, `setTimeout` or a per-process limiter |
| 3 | Fails closed, no silent fallback | A dependency down means "allow" or "continue with the old path" |
| 4 | Every route has authentication and an ownership or role check; every internal caller has its own identity | One shared token, or a check on `body.projectId` only |
| 5 | Each piece of data has one owner; money and events use an outbox and idempotency keys | Dual writes, an HTTP fallback for usage, two services writing one table |
| 6 | Foundations it needs exist or are scheduled first, and it fits the free-tier budget | A feature that pauses runs before F1 exists |

- *Loop:* a rule fails, go back to 2b (or ask Sahil if the right design is unclear).

### Row 2. Specify (still no code)

**Stage 5. LLD per API and per component.** For each route or consumer: the flow step by step (a sequence diagram for anything crossing services), request and response schemas, error codes, authz rule, DB writes and their transaction boundary, indexes, Redis keys with TTLs, idempotency, timeouts and retries, and a **failure table** (dependency down, timeout, duplicate, partial write) where each row says what happens and why it fails closed. Use the `api-flow-architect` skill for this.
- *Done when:* someone else could write the code from it without asking you anything.
- *Prevents:* fail-open checks (credit check, rate limiter, reviewer returns `pass: true` on error), `patch_file` falling back to `String.replace`, S3 restore continuing with the template (X5), missing ownership checks (Clio reading any file, chat restore by `messageId` only).

**Stage 6. The contract: OpenAPI, events, env vars.** Update `docs/openapi.yaml` (and the Kafka topic and envelope table for events) **before** any code. List every new env var in `.env.example` and `k8s/secrets.yml.example` with the same name the code will read.
- *Done when:* the OpenAPI file lints; a mock server can be generated from it; every env var has one name across code, example file and k8s.
- *Prevents:* `openapi.yaml` rewritten from the code afterwards (`2b26aaf`), which then found bugs (`6abc158`); `REDIS_URL` vs `REDIS_URI`, `CLIENT_URL` and `NODE_ENV` unset in k8s, `TAVILY_API_KEY` never injected.

**Stage 7. Test plan.** For each acceptance check and each failure-table row: which test (unit, integration, contract, e2e, adversarial, eval), and the gate number for the phase ("an edit made 300 ms before a pod delete survives"). Include one "2 replicas" test for anything stateful and adversarial tests for anything with money or auth.
- *Done when:* every acceptance check and every failure row has a named test.
- *Prevents:* only Payments having real tests for months. The Payments adversarial suite (58 tests) and the `Gate:` lines in `CHECKLIST.md` are the model to copy everywhere.

**Stage 8. Build plan and checklist.** Split into vertical slices, each one usable end to end and each with a gate. Foundations first. Add the lines to `CHECKLIST.md`.
- *Done when:* each slice is small enough for one commit (after squashing) and has a "done when" check.

**Stage 9. Ready to code gate.**
- All docs for this size are written, linked from `docs/plans/README.md`, status `Approved`, and **committed** (one docs commit).
- Open questions are answered or written down as explicit assumptions.
- *Prevents:* 10+ plan files sitting untracked; wireframes and plans getting out of step. Loop: anything missing, back to stage 5.

### Row 3. Build, ship, learn (code)

**Stage 10. Walking skeleton and CI (once per app or service).** The thinnest end-to-end path deployed through the real layers: health and ready routes, structured JSON logs with `requestId`, `/metrics`, the migration runner, `.env.example`, Dockerfile, the k8s manifest in `skaffold.yml`, and CI: lint, unit tests, OpenAPI lint, `kubeconform`, a block on `k8s/secrets.yml` in any diff.
- *Done when:* a pull request runs CI green, and the skeleton runs in `skaffold dev`.
- *Prevents:* no CI at all; config drift found only at deploy; secrets built into images (Auth's `.dockerignore`).

**Stage 11. Build one slice at a time.**
1. Migration, expand only (add columns or tables; never drop or rename in the same release).
2. Backend with its tests, matching the contract. Contract tests check responses against `openapi.yaml`.
3. Frontend on the generated mock while the backend is not ready, then on the real API. No fake success, no fallback paths.
4. Commit as you go; squash into one commit for the slice; tick the checklist line only when its gate passes.

**Loop: the contract must change mid-build.** This will happen. Never just change the code.
- **Additive** (new optional field, new route, new error code): update OpenAPI and the LLD in the same commit as the code, regenerate the mock, carry on.
- **Breaking** (rename, remove, type change, new meaning): stop the slice. Write an ADR. Use expand and contract: add the new shape, move every caller, then remove the old one in a later release. Update the test plan. Back to row 2 for that part.
- A new idea that is not needed for this slice goes to the backlog or the next PRD version, evaluated first (design-idea rule), not into the current slice.

**Stage 12. Gates green.** Unit, integration, contract, e2e for the slice, adversarial where money or auth is involved, offline evals for any prompt or model change, and a **drift check**: do the docs still describe what the code does? Update the status line to `Built`.
- *Loop:* a test fails, fix the code. Never skip, disable or weaken the test to get green. If the failure shows the design is wrong, back to the LLD.

**Stage 13. Release.** Pipeline order: run migrations first, then roll out the services, behind a feature flag where the change is risky; smoke test; know the rollback (previous image tag, and the expand-only migration means the old code still works).
- *Prevents:* Payments migration 0002 left pending on Supabase before deploy.

**Stage 14. Operate and learn.** Dashboards and alerts for errors, latency and cost. Every incident or bug found in use gets a short postmortem, a regression test, and a row in the mistakes table in section 5. That row becomes a new idea at stage 1 if it needs design work.

## 4. Where each document lives

| Document | Stage | Location |
|---|---|---|
| PRD | 1 | `docs/prd/<product>-prd.md` (one per product; features get a PRD section in their plan) |
| Wireframes and screens | 2a | `docs/plans/ui/<feature>/` (`screens.md` + board) |
| HLD | 2b | First sections of `docs/plans/<feature>-plan.md`; system-wide map in `docs/ARCHITECTURE.md` |
| ADRs | 2b, any time | `docs/adr/NNNN-title.md` (new folder) |
| Spike result | 3 | Written into the plan or an ADR |
| LLD | 5 | The plan's LLD section, one subsection per API |
| OpenAPI, events, env | 6 | `docs/openapi.yaml`, Kafka plan topic table, `.env.example`, `k8s/secrets.yml.example` |
| Test plan | 7 | The plan's test section; gates copied into `CHECKLIST.md` |
| Build plan | 8 | The plan's phases section and `docs/plans/CHECKLIST.md` |
| Mistakes table | 14 | Section 5 of this file |

One plan file per feature keeps it simple, with the same section order every time: 1 PRD summary, 2 HLD, 3 ADR links, 4 LLD per API, 5 failure table, 6 test plan, 7 phases and gates, 8 open questions. Your existing plans already follow most of this; the missing pieces are usually the failure table and the test plan.

## 5. Mistakes table (keep adding rows)

| # | Mistake on Taksha | Evidence | Stage that stops it |
|---|---|---|---|
| 1 | Docs and PRD describe unbuilt features as built | Drift report 2026-10-26 | 1 status line, 12 drift check |
| 2 | Features planned before the foundations they need | Audit X1 to X5; F1 to F3 written 2026-11-24 | 2b, 4 rule 6 |
| 3 | Layer bypass: AI to sidecars, git-service to pods, admin to other DBs | Audit G-1, A-1; TTL expired mid-run | 2b, 4 rule 1 |
| 4 | Silent fallbacks and fail-open checks | Drift report item 9; audit X5, K-1 | 5 failure table, 4 rule 3 |
| 5 | Per-process memory state on a service meant to scale | `MemorySaver`, runs `Map`, `setTimeout`, pacing | 4 rule 2, 7 replica test |
| 6 | Missing auth and ownership checks; one shared internal token | Sidecar with no auth, Clio file read, X3 | 4 rule 4, 5, 7 adversarial |
| 7 | Frontend faking success for routes that do not exist | Settings API keys; orderless checkout | 6, 11 step 3 |
| 8 | OpenAPI written from the code afterwards | `2b26aaf`, `6abc158` | 6 |
| 9 | Wireframes after the plans | Settings redesign gaps 2026-11-25 | 2a |
| 10 | Config drift between code, examples and k8s | Drift report, secrets example | 6, 10 |
| 11 | Migration pending before deploy | Payments 0002 | 13 |
| 12 | No CI; CI/CD planned last | `.github/` empty; CHECKLIST Phase 6 | 10 |
| 13 | Plan files left uncommitted | `git status` on 2026-11-25 | 9 |
| 14 | Big decisions changed with no record | RabbitMQ to Kafka, model swaps, admin data access | 2b ADRs, 11 contract loop |

What went right and should stay: the Payments adversarial tests, the `Gate:` lines in `CHECKLIST.md`, the plan ownership table in `docs/plans/README.md`, the audit itself, and one commit per piece of work.

## 6. Applying this to the remaining Taksha plans

1. **Add a CI baseline now** (recommended, needs your OK): pull `C3` (`ci.yml`) and `C6` (`k8s.yml`) from Phase 6 into a new step before Phase 0.5, plus OpenAPI lint. Keep the cloud deploy and the rest of LLMOps last as you decided. Every phase after that gets checked on every push instead of all at once at the end.
2. **Commit the plan files** that are untracked today (one docs commit), so the Ready gate can pass for Phase 0.5.
3. **Before each phase starts**, run stages 4 to 9 on its plan: most plans have HLD and LLD; add the failure table and test plan where missing, and put OpenAPI changes into `docs/openapi.yaml` first. Foundations F1 to F3 are closest to ready (they have gates).
4. **Fix the PRD status line and old claims** (9-node graph, `POST /mcp` gateway wording, "Beta Ready") so the product doc matches the code.
5. **Start `docs/adr/`** with the decisions already made: admin data through internal APIs (2026-11-24), router as the single entry point, LLMOps last, admin client web + PWA then Tauri.
