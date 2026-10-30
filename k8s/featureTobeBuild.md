# k8s and platform: features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Separate `sandboxes` namespace + NetworkPolicy + ResourceQuota | Tenant isolation for user code. | Sandbox server namespace config | M |
| 2 | Monitoring stack (Prometheus, Grafana, Loki, Alloy) | Docs mark ServiceMonitors, alerts, Loki and `k8s/monitoring/` as done; none exist. | service `/metrics` | M |
| 3 | `/metrics` on every service | Only Auth has prom-client. | none | M |
| 4 | Alerts | Queue depth (`payment_notification_queue`), 5xx rate, sandbox start failures, AI run errors. | #2, #3 | S |
| 5 | HPA for stateless services | Auth, Payments, Sandbox server, router can scale now; AI after persistent checkpointing. | AI feature #1 | S |
| 6 | Secrets management (External Secrets / Sealed Secrets) | Removes hand-made `secrets.yml`. | cloud provider | M |
| 7 | CI pipeline | Lint, unit tests against a disposable Mongo, image build, secret scanning, manifest validation. | none | M |
| 8 | Production overlay (Kustomize/Helm) | Dev vs prod values (`NODE_ENV`, hosts, TLS, replicas). | none | M |
| 9 | TLS on ingress (cert-manager) | Required for `Secure` cookies to be meaningful. | domain | S |
