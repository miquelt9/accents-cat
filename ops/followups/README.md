# Operational follow-ups

Deferred deployment/operator work after the production-readiness implementation
(Sentry + Grafana OTLP + Better Stack documentation).

These tasks are **agent-ready**: open one file in Cursor and ask the agent to implement that task. Do not invent extra scope.

| ID | Task | When |
| --- | --- | --- |
| [01](01-grafana-contact-points.md) | Wire Grafana alert contact points (email only) | When you want alerts delivered |
| [02](02-better-stack-monitors.md) | Create Better Stack homepage + `/health` monitors | When a public HTTPS URL exists |
| [03](03-sentry-releases-sourcemaps.md) | Sentry release tagging + web source maps | Before or at public launch |
| [04](04-container-metrics.md) | Container CPU/memory if Dockerized | Only if/when Docker deploy exists |
| [05](05-https-proxy-cors-verification.md) | Verify HTTPS proxy, headers, upload limits, and CORS | Before public traffic |
| [06](06-encrypted-backup-restore-drill.md) | Install encrypted SQLite/audio backups and run a restore drill | Before accepting production recordings |
| [07](07-retention-purge-scheduling.md) | Schedule pending and research-retention purges | Before accepting production recordings |
| [08](08-privacy-identity-vendor-configuration.md) | Configure production privacy identity, legal copy, and vendor controls | Before public traffic |

## How an agent should use these

1. Read this folder’s task file fully.
2. Read linked repo docs (`README.md` Observability, `ops/grafana/README.md`, `AGENTS.md`).
3. Follow the **Agent plan** or **Runbook** steps in order.
4. Respect each task’s **Constraints** / **Privacy constraints** (no secret commits).
5. Stop when **Acceptance criteria** are met; do not expand scope.

## Already done (do not redo)

- Sentry FE/BE init, scrubbers, `/sentry-debug`, error-only replay
- Grafana OTLP metrics + dashboard `accent-oracle-operations` + three alert rules
- Allowlisted `POST /telemetry/event`
- Better Stack documented as pre-prod checklist only

Tasks 05–08 are intentionally separate from the existing observability
follow-ups: they cover deployment verification, durable data operations, and
privacy/vendor configuration that the repository documents but cannot perform.
Do not redo Better Stack monitor creation, Grafana contact-point routing, or
Sentry release/source-map work outside tasks 02, 01, and 03 respectively.

The release gate is not complete merely because these runbooks exist. Attach
deployment evidence for the selected owner, schedule, last successful run,
notification route, retention/access decision, and restore/deletion drill to
the release record; keep each task `pending` until that evidence exists.
