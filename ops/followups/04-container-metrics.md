# Task 04 — Container metrics (only if Dockerized)

Status: `pending` / **blocked until Docker deploy exists**  
Priority: low  
Depends on: a real Dockerfile / compose / orchestrator for the API (none in repo today)

## Goal

When the API runs in Docker (or similar), expose **container-level** CPU and memory alongside the existing process metrics already exported via OpenTelemetry system metrics.

## Context (already done)

- Process CPU/memory via `opentelemetry-instrumentation-system-metrics` when `GRAFANA_OTLP_*` is set
- Dashboard panels for CPU/memory already exist (may show process metrics only)
- Explicitly out of scope in the first observability pass: cAdvisor / Docker exporters

## Prerequisites (blocking)

- Human confirms container deploy is happening
- Choose one approach (pick the lightest that fits the host):
  1. **Grafana Alloy / Agent** scraping cAdvisor or kubelet metrics → Grafana Cloud (preferred if infra already uses Alloy)
  2. **cAdvisor** sidecar + Prometheus remote write
  3. Orchestrator-native metrics (Fly/Railway/K8s) already in Grafana — then only **update dashboard panels**, no new exporters

## Agent plan

1. Confirm deploy target and whether metrics already appear in Grafana Cloud (ask before adding agents).
2. If metrics already exist: update [`ops/grafana/accent-oracle-operations.json`](../grafana/accent-oracle-operations.json) + live dashboard panels to query container metrics; document PromQL.
3. If not: add the smallest exporter/Alloy config under `ops/` (e.g. `ops/alloy/` or compose snippet), with clear README — do not invent a full k8s chart unless the repo already has one.
4. Keep application OTLP path unchanged; do not duplicate Sentry.
5. Update README Observability with “container metrics” subsection and env/compose pointers.
6. Privacy: no request bodies, no volume mounts of `data/user_submissions` into metric scrapers beyond what the app already needs.

## Acceptance criteria

- [ ] Dashboard CPU/Memory panels show container (or clear process-vs-container labeling)
- [ ] Config lives in-repo under `ops/` with no secrets
- [ ] README documents how to enable
- [ ] No change to Sentry privacy scrubbers

## Constraints

- Skip this entire task if there is still no container deploy — update status to `blocked` and stop
- Prefer configuration over custom metric code in `backend/app.py`
- Avoid multiple dashboards; extend the existing operations dashboard only

## Out of scope

- Full APM trace export to Grafana Tempo
- Log shipping to Loki (Sentry already covers app logs for errors)
- Autoscaling policies
