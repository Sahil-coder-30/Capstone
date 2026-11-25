# Platform 1: Kubernetes, the dev loop, Notification and observability

> **Shipped:** k8s + Skaffold 2026-06-05 to 2026-06-26; Auth metrics 2026-10-30 (`7b9728c`); NetworkPolicy 2026-11-05 · **Code:** `k8s/`, `skaffold.yml`, `Notification/`, `Auth/src/observability/`
> **One line:** every service runs as a k8s Deployment behind one NGINX ingress, and a single `skaffold dev` runs the whole cluster locally.

## 1. Cluster layout

```
NGINX Ingress (proxy read/send timeout 300 s for long agent streams)
  /api/auth → auth-service      /api/payments → payments-service
  /api/ai   → ai-service        /api/sandbox  → sandbox-service
  /api/mcp  → router-service    host *.preview / *.agent → router-service
/internal/* is never routed by the ingress (cluster only).

Deployments (all replicas: 1 today): auth, payments, ai, notification, sandbox, router
Dynamic: sandbox-pod-<id> + sandbox-service-<id>, created by the Sandbox server (RBAC role)
Secrets: k8s Secrets per service; internal-service and router-session are optional so pods
         start without them and the guarded routes fail closed.
```

- **Skaffold** builds every image and applies `k8s/*.yml`; sandbox pods are not managed by Skaffold (the Sandbox server creates them), so read their logs with `kubectl logs`.
- **RBAC:** only the Sandbox server's service account may create and delete pods and services. Sandbox pods have no token at all.
- **NetworkPolicy** for sandbox pods: in only from the router; out only DNS, Auth and public internet. Docker Desktop does not enforce it; a real CNI (Calico, Cilium) does.
- Validate the sandbox pod manifest without a cluster run: `node scripts/print-pod-manifest.js | kubectl create --dry-run=server -f -`.

## 2. Notification

Consumes two durable RabbitMQ queues, `auth_notification_queue` (welcome, login) and `payment_notification_queue` (receipts, failures), and sends HTML emails with nodemailer. `ack` on success; on failure `nack(msg, false, false)`, which drops the message because no dead-letter exchange is configured.

| Decision | Rejected | Why |
|---|---|---|
| Async queue between Auth/Payments and email | Send mail inside the request | Login and checkout must not wait for, or fail because of, SMTP |
| RabbitMQ now | Kafka now | Simple point-to-point queues were enough. Kafka (outbox, retries, DLQ, fan-out, WhatsApp) is a written plan, not built |

**Known gaps:** no DLQ, no retry, no delivery log; producers publish directly (no outbox), so a crash between the DB write and the publish loses the email.

## 3. Observability (what exists)

- Auth: `prom-client` registry, request middleware, `GET /metrics` (not under an ingress prefix, so cluster-internal). k6 load test in `Auth/src/k6/load-test.js`.
- One log line per MCP tool call on both sides, secrets masked.
- Health and readiness endpoints on every service; Payments `readyz` checks the DB.
- Planned only: kube-prometheus-stack, Grafana, Loki/Alloy, per-service metrics, admin dashboard.

## 4. Engineering workflow (worth mentioning)

- Every service has `.env.example`; real secrets never in git; `k8s/secrets.yml.example` is known to be out of date.
- `docs/openapi.yaml` documents all 76 operations, checked route by route against Express code (`2b26aaf`); writing it found 5 real bugs (`6abc158`).
- Plans are audited against code before building (`docs/plans/AUDIT-2026-11-24.md`).

## 5. Interview questions

**Q1. Why does the ingress need a 300 s timeout?**
A: Agent runs stream over SSE for minutes. NGINX's default read timeout is 60 s, which would cut the stream. The run itself survives a cut (re-attach), but a longer timeout plus a 15 s heartbeat avoids pointless reconnects.

**Q2. How do you stop a sandbox pod from reaching your databases?**
A: A NetworkPolicy on the sandbox pod label: egress only to kube-dns, Auth (for JWKS) and public IPs with private ranges excluded; ingress only from the router. Plus no service account token, so no k8s API.

**Q3. What happens to an email if Notification is down?**
A: The queue is durable, so messages wait in RabbitMQ until it comes back. But if sending fails, the message is nacked without requeue and lost, since there is no DLQ. And if Auth crashes between saving the user and publishing, the event is never sent. The fix is a transactional outbox in the producer plus retry topics and a DLQ in the consumer, which is in the Kafka plan.

**Q4. Everything runs with one replica. What blocks scaling out?**
A: Auth, Payments, Sandbox server and router are close to stateless and could scale with more replicas (Payments' cron already uses a Redis lock; the router caches only proxy objects). The AI service cannot, because its runs and checkpoints are in memory. The Sandbox server's keyspace listener would also fire on every replica, so cleanup must be idempotent or leader-elected.

**Q5. How would you take this to production?**
A: Registry-qualified, digest-pinned images (sandbox images are bare names with `IfNotPresent` today), a CNI that enforces NetworkPolicy, a cap on live sandboxes per node, external secrets, CI that builds and tests each service, and metrics plus logs for every service. Most of this is in the LLMOps/CI plan, which is the last phase.

## 6. Revise in 60 seconds

- NGINX ingress, prefixes per service, host rules for sandboxes, `/internal` never exposed.
- Skaffold for the dev loop; Sandbox server creates pods via RBAC.
- NetworkPolicy: router in; DNS, Auth, internet out.
- Notification: RabbitMQ, nodemailer, no DLQ yet.
- Metrics only in Auth; full observability is planned.
