# Production readiness assessment

**Assessment date:** 6 August 2026
**Scope:** the production-readiness work in the current repository state,
including the documentation deliverables in this directory.

## Executive assessment

Accent Oracle is better prepared for a controlled deployment than the original
local prototype: it has explicit request correlation, privacy-oriented
observability scrubbers, allowlisted product telemetry, upload and load guards,
health/readiness/version endpoints, and a same-origin proxy example.

It is **not ready for an unqualified public launch as-is**. Public traffic is
reasonable only as a clearly labelled, limited research beta after the
deployment checklist is completed and the remaining operational, privacy, and
backup controls below are evidenced. The model itself remains a research
baseline with roughly 50% top-1 accuracy, so operational readiness must not be
presented as model validation.

## Changes made in the current tree

The implementation and supporting work now include:

- API security headers, optional HSTS, exact-origin CORS parsing, request IDs,
  JSON access logs, and Sentry request correlation;
- early upload `Content-Length`, suffix, and soft MIME validation while
  retaining duration, silence, 20 MB, and 25-second default guards;
- `/live`, `/ready`, `/version`, and the existing `/health` compatibility
  endpoint, plus Vite and Caddy proxy routes;
- build/release metadata helpers for API and web Sentry releases;
- privacy-scrubbed backend/frontend Sentry setup and metrics-only Grafana OTLP
  instrumentation;
- PostHog Cloud EU support configured for memory persistence, no autocapture,
  no session recording, no identify, and allowlisted event names;
- dual-fire UI counters to PostHog and the backend Grafana counter endpoint;
- documented pending/consented storage behavior, retention tools, and
  same-origin HTTPS deployment guidance;
- this backup runbook, privacy audit, repeatable launch checklist, and this
  assessment.

The source review confirms these controls exist in code. It does not confirm
that a deployed process has the right environment variables, proxy headers,
provider retention, access controls, or schedules.

## Remaining launch risks and blockers

### Deployment configuration

- A public HTTPS hostname, reverse proxy, certificate renewal, SPA security
  headers, API routing, body limits, timeouts, and restrictive CSP still need
  to be configured and tested.
- `VITE_PRIVACY_EMAIL` and `VITE_CONTROLLER_NAME` must be set before launch.
  Until then, the in-app legal copy intentionally shows provisional identity
  or contact text.
- Sentry DSNs/releases, Grafana OTLP credentials, PostHog EU project
  configuration, and production CORS/trusted-proxy settings are deployment
  secrets and have not been proven here.
- Better Stack monitors and Grafana email contact points are documented
  follow-ups, not resources created by this repository.

### CI and release process

- The current CI workflow runs web lint/build/test and lightweight pytest,
  injects web and API build metadata, and runs the planned Ruff checks. A
  release still needs to retain those checks and verify that the injected
  values match the deployed release.
- Sentry web source-map upload/release finalization remains a follow-up. Without
  it, production frontend stack traces may be less actionable.
- No deployment pipeline, image, infrastructure-as-code, or rollback
  automation is included.

### Data protection and operations

- No cloud backup implementation exists. Operators must install and monitor
  the procedure in [`BACKUP.md`](BACKUP.md), including encryption, off-box
  copies, SQLite WAL/SHM handling, restore drills, and deletion-aware archive
  retention.
- Pending cleanup is invoked by storage activity and is not an independent
  scheduler. An idle service can retain expired pending audio longer than the
  nominal TTL unless an operator schedules a purge or adds a worker.
- Soft deletion is an operator script/email workflow, not an authenticated
  self-service deletion API. Backups and filesystem snapshots can still
  contain data after a live-row deletion.
- Rate limiting and the inference worker pool are in-process. The pool is
  fixed-size with a bounded FIFO queue, but multiple uvicorn workers or hosts
  can multiply capacity and limit windows; there is no shared limiter or queue.
- `/ready` verifies model files, metadata, and writable storage, but does not
  load the full HuBERT encoder. A first-request model failure or cold-start
  latency remains possible.
- Production provider retention, log forwarding, access control, data
  residency, and incident response are not enforceable from this repository
  alone.

### Research and product risk

- The classifier is a research snapshot with speaker imbalance and limited
  real-user validation. Results must remain framed as acoustic similarity to
  dialect areas, not geographic origin or identity.
- Public feedback and uploaded audio can attract abuse, unexpected content, or
  traffic beyond the CPU inference capacity. The current controls reduce
  obvious load but are not a complete abuse-prevention system.
- Legal text is an implementation baseline, not legal advice. A privacy review
  should confirm the controller, processors, hosting location, consent wording,
  retention, backup deletion, and research/training basis before broad launch.

## Recommended readiness gates

Treat these as blockers for public traffic, not optional polish:

1. Set the real legal identity/contact and verify the rendered privacy and
   terms documents.
2. Deploy behind HTTPS and the same-origin proxy, then verify microphone,
   CSP, headers, CORS, trusted proxy behavior, upload limits, and timeout
   behavior.
3. Configure Sentry, Grafana, PostHog EU, and Better Stack with approved
   retention/access settings; inspect real payloads for the privacy boundary.
4. Install encrypted backups, complete an isolated restore drill, and assign
   owners for backup, pending purge, research retention purge, and deletion
   requests.
5. Record a release SHA/model version and complete the CI, browser smoke, and
   health/readiness/version checks in
   [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md).
6. Decide whether the remaining Sentry source-map follow-up is a launch blocker
   for the chosen beta. It is not silently assumed complete by this assessment.
7. Obtain the intended privacy/legal review and publish an honest research-beta
   description with a contact and deletion process.

## Public-beta suitability

**Current status: conditional, not go.** The codebase can support a small,
invite-only or time-boxed research beta after the gates above are evidenced.
It should not be advertised as a general public production service while
privacy identity, backups/restore, HTTPS deployment, provider configuration,
and monitoring ownership remain unverified.

Even after those gates, keep traffic limited until inference latency, model
error rates, consent completion, deletion handling, and support load have been
observed on real but authorized users. Reassess the beta decision after the
first restore drill and an initial operational review.

## Future improvements

- Add a dedicated pending-expiry worker and durable, multi-instance rate-limit
  strategy.
- Add an authenticated self-service deletion flow and an auditable
  backup-generation deletion workflow.
- Keep CI build metadata/Ruff checks aligned with release tooling, and complete
  Sentry release/source-map automation and deployment rollback automation.
- Add provider-independent alert delivery and infrastructure/container
  metrics once the hosting target is selected.
- Add load testing, synthetic probes, and controlled end-to-end tests without
  downloading the ML stack in normal CI.
- Gather more speaker-diverse, research-consented data and recalibrate model
  thresholds before expanding the audience.
