# Tool call analytics: screens

UI for [taksha-tool-call-analytics-plan.md](../../taksha-tool-call-analytics-plan.md). Wireframes: [wireframes.html](wireframes.html).

## Where this UI lives

The plan's own version 1 has no app screens: `npm run tools:report` in the terminal and an Atlas Charts page on `toolstatshourly`. The plan says the portal page belongs to the admin platform's P4. So these screens are the **Agent tools tab of AI runs** in the admin portal (AD-24), built when both plans exist. If the admin portal is not built yet, use Atlas Charts with the same four charts: calls per tool, failure rate per tool, p95 per tool, top error codes.

| Screen | Data | Route |
|---|---|---|
| TA-1 Agent tools overview | `toolstatshourly` (rollup), writer counters from `/api/ai/healthz` | `/ai/tools` |
| TA-2 One tool | `toolstatshourly` by tool, error codes, `toolsVersion` | `/ai/tools/:tool` |
| TA-3 Stuck runs, run timeline | `toolcalls` (raw, 30 day TTL) | `/ai/tools/stuck`, `/ai/runs/:runId/tools` |

Grant: `ai.view_runs`. The admin backend reads both collections with its existing read-only `ai` user.

## TA-1 Agent tools overview

- Header: title, one line on what is counted ("test runs left out", "updated every 5 minutes"), filters for agent (Orion, Clio, all), tools version, and range (24 h, 7 d, 14 d).
- Warning strip: the plan's four conditions, worst first, as notices. Error rate over 25% with 20+ calls in the last hour (red), p95 doubled vs 7 day average (amber), writer dropped above 0 or queue above 1,000 (red), no records for 15 minutes while runs are active (red). Hidden when nothing fires.
- KPIs: tool calls, error rate, blocked by guards, writer health (dropped, queue, overhead).
- By tool table, sorted by error rate: calls, error rate with a small meter (red above 10%), blocked, p50, p95 (amber above 5 s), truncated rate (amber above 10%), top error code. Tools with 0 calls in 14 days are greyed and say "Fix description or remove".

## TA-2 One tool

- Calls per day, stacked OK and error (ember and indigo).
- Error code share as a bar list with one line of guidance from plan section 7 (high `TOOL_ERROR` on `patch_file` → better hint; high `GUARD_BLOCKED` → guard too strict).
- Release comparison: error rate and p95 by `toolsVersion`, 7 days each side, with the change. Under 200 calls per side: "Not enough calls yet".

## TA-3 Stuck runs and one run

- Stuck runs: runs with 3 or more failures on the same `tool + inputHash` in 24 hours (the plan's query). Columns run, tool, fails, last error.
- Run timeline: every call in order, IDE tool-step row style: status icon, tool name in mono, redacted target or error code, duration. Link to Trace (AD-33). Footnote: "Inputs are shown redacted, as stored. No file contents."

## Rules

- Never show raw inputs; only what the logger stored after `redactInput`.
- User ids are masked unless the admin's `users` grant shows PII.
