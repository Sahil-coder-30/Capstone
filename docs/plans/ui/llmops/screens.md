# LLMOps: screens (proposal)

Plan: [llmops-evals-cicd-plan.md](../../llmops-evals-cicd-plan.md). Wireframes: [wireframes.html](wireframes.html).

## Does this plan need UI?

Not for users. Its outputs already have homes:

| Output | Where people look | Built by |
|---|---|---|
| Eval results, regression gate | CI job summary, `Ai_orchestration/evals/results/` | Track E, C4 |
| LLM traces, eval scores on traces | Langfuse | O2, O7 |
| Tokens, latency, error rate dashboards, alerts | Grafana, Alertmanager | O4 to O6 |
| Cost per request, token breakdown | `npm run` reports, Grafana | T1 to T3 |

So the screens here are a **proposal**: one summary tab in the admin portal ("Quality and cost" in AI runs, AD-24) for the maintainer and AI Ops admins, who otherwise have to visit three tools. Build it only if that need shows up in the product testing phase. It reads files and metrics that the plan already produces and adds no new data.

| Screen | Reads |
|---|---|
| LM-1 Quality and cost | Latest eval results on `main`, `baseline.json`, Prometheus counters (no `userId` label), cache hit counter, routing counter |
| LM-2 Eval run compare | One results file vs baseline, the same logic as `npm run eval:compare` |

Grant: `analytics.view` with the `ai` dashboard, or `ai.view_usage`.

## LM-1 Quality and cost

- KPIs: agent task pass rate (with task count and change vs baseline), median cost per request, p95 Orion run latency with time to first token, semantic cache hit rate.
- Eval suites table: router accuracy, planner and reviewer parse rate, context precision and recall, memory recall and leaks, agent task pass rate (holdout), Clio judge score. Columns now, baseline, change, gate badge (`Pass`, `Watch` when it dropped inside the threshold, `Fail`).
- Where the tokens go: share of input tokens by part (tool outputs, history, tool guides, system prompt, memory), the T3 breakdown.
- Cost per request by agent over time (ember Orion, indigo Clio).
- Model routing share: fast model, main model, fallback, plus judge win rate vs its 50% gate.
- Every panel links out to its Grafana panel or Langfuse view.

## LM-2 Eval run compare

- Red gate banner when the regression gate fails, naming the metric, the drop and the threshold, and "The baseline was not changed."
- Task table with changed outcomes first: task, split, baseline result, this run, tokens, cost, trace link.
- No button edits `baseline.json`. Updating it stays a deliberate commit (plan E7).

## Rules

- Prices come from `pricing.js` / config. Never hard-code money in the page.
- No user content: eval cases are redacted datasets.
