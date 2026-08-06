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

No notification integrations are wired in-repo (email/SMS/paging are out of scope for this pass). Configure contact points in Grafana Cloud UI if desired.

## Metrics (OTLP from API)

Require `GRAFANA_OTLP_ENDPOINT` + `GRAFANA_OTLP_API_KEY` on the backend.

## Follow-ups

Agent-ready deferred tasks (contact points, Better Stack, Sentry releases, container metrics): [`../followups/`](../followups/).
