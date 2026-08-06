# Task 08 — Production privacy identity, legal, and vendor configuration

Status: `pending`  
Priority: high  
When: before any public traffic, and whenever the controller, hosting region,
processor, retention policy, deletion process, or observability provider changes

## Goal

Replace provisional legal identity with approved production values and verify
that the deployed privacy/terms copy, hosting and processor inventory,
retention/deletion promises, and telemetry-provider settings describe reality.

## Why this is still missing

The application has privacy-aware defaults and scrubbers, but controller
identity, contact, hosting, provider retention/access, and deployment
credentials are operator configuration. Source review cannot prove that a
deployed instance has the approved values.

## Prerequisites

- The human-approved controller name, privacy contact, and deletion-request
  workflow
- Confirmed hosting/data regions, processors, backup location, access roles,
  provider retention periods, and research/legal basis
- A privacy/legal reviewer, with the decision recorded before launch
- Sentry, Grafana Cloud, and PostHog projects selected for production
- A deployment secret/build-variable store; never place provider credentials in
  this repository

Do not guess an identity, email address, provider, region, or legal claim.

## Read first

- [`docs/PRODUCTION_CHECKLIST.md`](../../docs/PRODUCTION_CHECKLIST.md),
  sections 1, 2, 6, 7, and 9
- [`docs/PRODUCTION_READINESS.md`](../../docs/PRODUCTION_READINESS.md),
  “Deployment configuration” and “Data protection and operations”
- [`docs/PRIVACY_AUDIT.md`](../../docs/PRIVACY_AUDIT.md), in full
- [`README.md`](../../README.md), “Observability”, “Production Deployment”,
  and the public-release checklist
- [`AGENTS.md`](../../AGENTS.md), consent, retention, deletion, and privacy
  constraints
- [`web/src/lib/legalDocs.ts`](../../web/src/lib/legalDocs.ts)
- [`web/.env.example`](../../web/.env.example) and [`.env.example`](../../.env.example)
- [`web/src/lib/sentry.ts`](../../web/src/lib/sentry.ts)
- [`web/src/lib/posthog.ts`](../../web/src/lib/posthog.ts)
- [`backend/observability.py`](../../backend/observability.py)
- [`docs/ANALYTICS_EVENTS.md`](../../docs/ANALYTICS_EVENTS.md)
- [`ops/followups/01-grafana-contact-points.md`](01-grafana-contact-points.md),
  [`02-better-stack-monitors.md`](02-better-stack-monitors.md), and
  [`03-sentry-releases-sourcemaps.md`](03-sentry-releases-sourcemaps.md) to
  keep their scopes separate

## Runbook

1. Create a deployment data-flow inventory covering audio, SQLite, backups,
   model/training exports, proxy/host logs, Sentry, Grafana, PostHog, and
   support/deletion records. For each, record the actual operator, location,
   access group, retention, deletion handling, and processor terms.
2. Set `VITE_PRIVACY_EMAIL` and `VITE_CONTROLLER_NAME` in the approved web
   build environment. Set `ORACLE_POLICY_VERSION` to the exact
   `LEGAL_POLICY_VERSION` in [`web/src/lib/legalDocs.ts`](../../web/src/lib/legalDocs.ts),
   unless both are intentionally changed and reviewed together. Rebuild the
   web app and inspect the rendered Catalan privacy and terms pages for
   provisional placeholders.
3. Configure production observability through the deployment environment:
   `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `SENTRY_DSN`,
   `SENTRY_ENVIRONMENT`, `GRAFANA_OTLP_ENDPOINT`, and
   `GRAFANA_OTLP_API_KEY`. Set `VITE_POSTHOG_KEY` and explicitly use
   `VITE_POSTHOG_HOST=https://eu.i.posthog.com`. Keep Grafana credentials and
   any provider-management tokens in the secret store; do not commit them.
4. In each provider console, verify the production project, residency,
   retention, access roles, and deletion/export process. For Sentry, inspect
   controlled backend and frontend errors plus error-only Replay. For Grafana,
   inspect metric labels, dashboard access, alert annotations, and API-key
   scope. For PostHog, verify EU ingestion, no autocapture, no session
   recording, memory persistence, no `identify`, and event names/properties
   match [`docs/ANALYTICS_EVENTS.md`](../../docs/ANALYTICS_EVENTS.md).
5. Inspect controlled provider payloads and logs for absence of audio,
   request bodies, prompt text, comarca, scores, consent payloads, recording
   IDs, filenames, user identity, and query strings. Keep the application
   scrubbers unchanged unless a separate code change is reviewed.
6. Reconcile the legal copy with the real deployment: controller/contact,
   hosting and processor locations, research-consent behavior, three-year
   default/approved retention, pending TTL, manual deletion-by-email flow,
   backup retention/deletion, and the fact that model output is dialect
   similarity rather than geographic-origin or identity detection.
7. Obtain the intended privacy/legal sign-off and attach evidence to the
   release record. Record only configuration status, provider project names,
   retention/access decisions, and test-event references; do not copy payloads,
   email addresses, keys, or personal recordings into the repository.

## Privacy constraints

- The voice remains personal data even without a name, email, IP, or
  User-Agent. Include live storage, backups, snapshots, restore hosts, and
  training exports in the data inventory.
- The frontend privacy contact, Sentry DSN, and PostHog project key are
  build-time values; use the approved values but never commit deployment
  configuration or provider-management credentials.
- Keep PostHog on the configured EU host and preserve its no-autocapture,
  no-session-recording, no-identify, no-custom-properties boundary.
- Do not inspect or export real audio to providers for verification. Use
  controlled synthetic errors/metrics and aggregate evidence.
- Do not enable a new notification channel or provider retention policy that
  contradicts the approved legal review.

## Acceptance criteria

- [ ] Rendered privacy and terms pages show the approved controller/contact and
      no provisional placeholder.
- [ ] `ORACLE_POLICY_VERSION` and the web legal policy version match, or an
      intentional reviewed change is documented.
- [ ] Actual hosting, processors, provider regions, access roles, retention,
      backup expiry, and deletion workflow match the published copy.
- [ ] Sentry, Grafana, and PostHog production configuration is verified with
      controlled evidence and no sensitive payloads.
- [ ] PostHog uses the approved EU host and documented event boundary; provider
      credentials are absent from git and frontend bundles where they would be
      secrets.
- [ ] Privacy/legal sign-off, data-flow inventory, and deployment evidence are
      recorded before public traffic.

## Scope boundaries

- Grafana email contact points remain
  [`01-grafana-contact-points.md`](01-grafana-contact-points.md).
- Better Stack monitor creation remains
  [`02-better-stack-monitors.md`](02-better-stack-monitors.md).
- Sentry release IDs and source-map upload remain
  [`03-sentry-releases-sourcemaps.md`](03-sentry-releases-sourcemaps.md).
- HTTPS, proxy headers, and CORS verification remain
  [`05-https-proxy-cors-verification.md`](05-https-proxy-cors-verification.md).
