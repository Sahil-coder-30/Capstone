# Frontend: features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Sandbox access token handling | Required once the router and sidecar check tokens. | Sandbox server tokens | S |
| 2 | Real error states in Settings / Billing | Replace fake-success fallbacks. | none | S |
| 3 | Upgrade flow handoff to payments_frontend | One place to pay; show the real tier from Payments after return. | payments_frontend | S |
| 4 | API keys page (real backend) | UI exists with fake keys. Needs a keys service (Auth or a new route) with hashed keys and scopes. Decide if it is in scope. | backend keys API | M |
| 5 | Inline AI code completion | README lists it; not built. Monaco inline completion provider backed by a fast AI endpoint. | AI endpoint | M |
| 6 | Live logs over a stream | Logs are polled over HTTP today. Use the agent socket or SSE. | Agent auth | S |
| 7 | Plan risk display and approve/reject UX | AI pauses every plan; show the plan, risk and diff summary clearly. | AI #9 | S |
| 8 | Browser agent extension (doc 08) | All six checklist items marked done; nothing exists. Large: Chrome extension + relay + screenshot verifier. Decide if it stays in scope. | AI tester | L |
| 9 | Shared UI package with payments_frontend | Docs claim shared components (CursorGrid, Lightfall); they live only in payments_frontend. | monorepo tooling | M |
| 10 | Yjs collaborative editing | Documented, never imported. Only if multi-user editing is a goal. | Agent Yjs | L |
| 11 | Theme sync across devices | Preference is stored in Auth but never applied on load. | Auth preferences | S |
