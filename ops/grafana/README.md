# Grafana Cloud — Accent Oracle

Imported dashboard + alerts live in folder **Accent Oracle** (`ffudveos2n94wb`).

## Dashboard

- Title: Accent Oracle — Operations
- UID: `accent-oracle-operations`
- Source of truth in-repo: [`accent-oracle-operations.json`](accent-oracle-operations.json)

## Alert rules (group `accent-oracle`)

| Title | Intent |
| --- | --- |
| Backend error rate spike | 5xx share of requests > 5% for 5m |
| Inference latency spike | Inference p95 > 30s for 10m |
| Application unavailable | No process memory metrics for 10m (`noDataState=Alerting`) |

No notification integrations are wired in-repo (email/SMS/paging are out of
scope for this pass). This is a deployment gate, not an optional control:
before public traffic, assign an alert owner, configure the approved email
contact point in Grafana Cloud, test delivery, and record the contact point,
last successful test, escalation target, and retention/access review. Do not
add SMS, voice, push, OnCall, or Slack without an explicit decision.

## Metrics (OTLP from API)

Require `GRAFANA_OTLP_ENDPOINT` + `GRAFANA_OTLP_API_KEY` on the backend.

## Follow-ups

Agent-ready deferred tasks (contact points, Better Stack, Sentry releases, container metrics): [`../followups/`](../followups/).
