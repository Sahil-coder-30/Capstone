# Taksha learning notes

Interview revision notes for what is **built and committed** in Taksha CodeSpace. Each note explains how a part works, the decisions behind it (and what was rejected), how it fails, and interview questions with model answers. Planned work is only mentioned as a known limit, never described as built.

## Study path

Read in this order. Each file ends with a "Revise in 60 seconds" list for quick review before an interview.

| # | File | Covers | Shipped |
|---|---|---|---|
| 0 | [00-overview/system-overview.md](00-overview/system-overview.md) | The whole system, the rules behind it, timeline, biggest gaps | Jun–Nov 2026 |
| 1 | [01-sandbox/01-pods-and-lifecycle.md](01-sandbox/01-pods-and-lifecycle.md) | Pod per project, Redis TTL idle cleanup, S3 sync agent, pod hardening | Jun–Jul, Nov 5 |
| 2 | [01-sandbox/02-sidecar-auth-and-mcp.md](01-sandbox/02-sidecar-auth-and-mcp.md) | Owner auth in the sidecar, sandbox tokens, the 9-tool MCP server and client | Nov 5–16 |
| 3 | [01-sandbox/03-router-and-edge-access.md](01-sandbox/03-router-and-edge-access.md) | Router as the single door: external agents, internal MCP path, owner-only edge, share links | Oct 30–Nov 25 |
| 4 | [02-auth/01-login-and-tokens.md](02-auth/01-login-and-tokens.md) | Google login, RS256 + JWKS, refresh rotation, logout, service tokens | Jun 29, Nov |
| 5 | [03-ai/01-orion-agent.md](03-ai/01-orion-agent.md) | LangGraph graph, own tool loop, plan review, SSE streaming, models, tests | Oct 30, Nov 3 |
| 6 | [03-ai/02-chat-sessions-and-memory.md](03-ai/02-chat-sessions-and-memory.md) | Chat sessions, context window, background memory agent | Nov 12 |
| 7 | [04-payments/01-billing-model.md](04-payments/01-billing-model.md) | Postgres, Razorpay checkout, subscription slots, 5-hour credit window | Jul 24, Nov 3 |
| 8 | [04-payments/02-money-safety-tests.md](04-payments/02-money-safety-tests.md) | 58 adversarial tests and the 14 money bugs they found | Nov 9 |
| 9 | [05-platform/01-k8s-notification-observability.md](05-platform/01-k8s-notification-observability.md) | Ingress, Skaffold, RBAC, NetworkPolicy, Notification, metrics | Jun, Oct 30 |
| 10 | [05-platform/02-frontend.md](05-platform/02-frontend.md) | IDE and billing apps, SSE client, perf fix, billing cache | Jun–Nov |

Short on time? Read 0, 3, 4, 5 and 8. They carry the questions interviewers ask most: system design, auth, agents, and money correctness.

## Adding a note when a feature ships

1. Find the area folder. **Add to an existing file** if the feature extends something already covered (a new section, new rows in the decision table, new questions). Create a new file only for a new area, numbered in reading order.
2. Add or update its row in the study path above.
3. Keep it short: facts from the code and the commit, no filler. Name the commit hashes and files.

Template for a new file (drop any section that has nothing real to say):

```markdown
# Area N: title

> **Shipped:** YYYY-MM-DD · **Commits:** `abc1234` · **Code:** `Service/src/file.js`
> **One line:** what this gives the user.

## 1. How it flows
Small diagram + numbered steps.

## 2. Decisions
| Decision | Rejected | Why |

## 3. Failure cases and known limits
| Case | Result |  plus gaps not fixed yet, and which plan fixes them.

## 4. Interview questions
**Q1. ...**  A: 3–6 sentences in plain words.
(cover: design, trade-off / why not X, failure, scaling, security, "what next")

## 5. Revise in 60 seconds
- 4–6 bullets.
```
