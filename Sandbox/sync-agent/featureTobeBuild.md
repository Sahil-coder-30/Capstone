# Sandbox/sync-agent: features to be built

| # | Feature | Why it matters | Depends on | Size |
|---|---|---|---|---|
| 1 | Secret-file exclusion (`.env`, keys) | PRD promise; today secrets reach S3. | none | S |
| 2 | Project-scoped credentials (STS / IRSA) | Each pod should only reach its own prefix. | Sandbox server + AWS IAM | M |
| 3 | Snapshot / version history | S3 versioning or periodic snapshots so a bad agent run can be rolled back (PRD mentions rollback; none exists). | S3 versioning | M |
| 4 | Size and file-count quotas per plan | Storage cost control, tier-aware. | Payments tier | S |
| 5 | Sync status reporting to the frontend | "Saved / syncing / failed" indicator in the editor. | Agent socket | S |
