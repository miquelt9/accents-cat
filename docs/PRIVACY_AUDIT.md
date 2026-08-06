# Privacy and telemetry audit

**Review basis:** source and configuration review of the current repository,
6 August 2026. This is an evidence-based implementation audit, not a
certificate that a deployed instance has the same configuration. Runtime
provider settings, access controls, retention periods, and proxy logs must be
verified before launch.

## Scope and overall assessment

The code has a deliberate observability boundary: audio, request bodies,
prompt text, comarca values, consent payloads, recording IDs, and filenames
are not intentionally sent to Sentry, Grafana, or PostHog. The backend also
does not persist the caller IP or User-Agent. The boundary is implemented in
the application, but it depends on deployment configuration and on all
upstream/downstream log collectors preserving the same policy.

The highest remaining risks are:

- pending audio is written before research consent and is only purged when a
  storage operation invokes the pending purge; there is no independent purge
  worker;
- backups replicate audio and deleted records outside the live database and
  therefore need their own encryption, retention, and deletion process;
- Sentry, Grafana, PostHog, reverse-proxy, and host-log retention/access
  settings are not established by this repository;
- the privacy controller/contact values are build-time configuration and remain
  provisional until `VITE_PRIVACY_EMAIL` and `VITE_CONTROLLER_NAME` are set;
- the public API has in-process rate limits, not an authenticated user or
  distributed abuse-control layer.

## Evidence by surface

### Application and proxy logs

`backend/middleware.py` emits JSON access records containing only:

```text
timestamp, request_id, method, path, status, duration_ms, environment
```

The request ID is accepted only when it matches the bounded
`[A-Za-z0-9._-]` format; otherwise the middleware generates a UUID4. The
application log messages contain operational outcomes such as analyze status,
top label, evidence band, inference duration, and generic consent/feedback
messages. The analyze log does not include audio, filename, prompt text,
recording ID, comarca, or request body.

The code does not configure every logger in a deployment. Uvicorn, Caddy,
systemd, container runtimes, or a hosted log collector may add their own
request lines, URLs, error details, or metadata. Those layers must be audited
and configured not to capture request bodies, query strings containing
identifiers, multipart filenames, or uploaded content.

### Backend Sentry

Evidence in `backend/observability.py`:

- `send_default_pii=False`;
- `before_send` removes request data and cookies, clears query strings, strips
  URL query components, removes user identity, filters sensitive `extra`
  mappings, and filters sensitive tags;
- `prompt_id` is intentionally retained as a low-sensitivity allowlisted tag;
- the backend sends errors, Python logs at error level, and sampled traces
  (`traces_sample_rate=0.10`) when a DSN and allowed environment are
  configured;
- `request_id` is added as a correlation tag when Sentry is enabled.

This is a scrubber, not a guarantee against future code attaching sensitive
values under an unrecognized key or an exception message containing user
input. Before launch, inspect representative Sentry events from upload
validation, inference failure, consent, and feedback paths. Verify the Sentry
organization, project, data residency, retention, access control, and
scrubbing rules in the provider console.

The frontend Sentry integration in `web/src/lib/sentry.ts` similarly disables
default PII, strips request data/cookies/query strings and user identity, and
uses masked text plus blocked media for error-only Replay. Replay and event
retention remain deployment/provider settings and require a live verification.

### Grafana Cloud OTLP metrics

When `GRAFANA_OTLP_ENDPOINT` and `GRAFANA_OTLP_API_KEY` are set and the
OpenTelemetry packages are installed, the backend exports metrics only:

- HTTP request count and duration, labelled by route and status class;
- analyze outcome and inference duration;
- consent and feedback counters;
- allowlisted UI event names;
- optional process CPU/memory instrumentation when available.

The UI endpoint accepts one field, an allowlisted event name, and the frontend
posts event names without properties. The current allowlist is:

```text
page_load
homepage_viewed
recording_started
recording_completed
analyze_pressed
analysis_completed
share_clicked
research_consent_accepted
```

The implementation does not export request bodies, audio, comarca, prompt
text, consent content, recording IDs, or filenames to OTLP. Verify the actual
Grafana datasource, metric labels, dashboards, alert annotations, API-key
scope, tenant access, and retention. This repository does not ship application
log forwarding to Grafana; a later log pipeline must preserve the same
scrubbing boundary.

### PostHog Cloud EU

The frontend initializes PostHog only when `VITE_POSTHOG_KEY` is present.
`web/src/lib/posthog.ts` configures:

- default host `https://eu.i.posthog.com`;
- memory persistence rather than persistent browser storage;
- autocapture, automatic pageview/pageleave capture, and session recording
  disabled;
- client IP capture disabled with `ip: false`;
- `person_profiles: "identified_only"` and no `identify` call in this code;
- allowlisted event names only, with no custom event properties;
- removal of query strings from the captured current URL when that property is
  present.

The documented project is [PostHog Cloud EU](https://eu.posthog.com/project/242521/).
The project token and API key must never appear in this repository or in this
document. `VITE_POSTHOG_HOST` is configurable, so a deployment can
accidentally point the browser at a non-EU host; production configuration
must explicitly verify the EU host, project, retention, access, and data
processing terms. Inspect a live event to confirm there are no properties,
autocapture events, recordings, URLs with query strings, audio, scores,
consent payloads, comarca values, or recording IDs.

### Request and telemetry fields

The application receives the following data paths:

- `POST /analyze`: multipart audio plus optional `promptId` (maximum 64
  characters) and `promptText` (maximum 500 characters). Audio is capped at
  20 MB before inference and validated for supported suffixes and content
  types; decoded duration and silence are validated later.
- `POST /research-consent`: `recordingId`, consent boolean, optional policy
  version, and age confirmation. This changes pending storage state.
- `POST /feedback`: optional feedback ID, recording ID, correctness,
  self-reported dialect, self-declared comarca(s), and notes. Comarca values
  are allowlisted when generated metadata is available.
- `POST /telemetry/event`: one event string, validated against the allowlist;
  no other telemetry properties are accepted.

`client_ip()` is used transiently by the in-process rate limiters. The storage
initialization migration also nulls legacy `ip` and `user_agent` columns, and
the current write paths do not populate them. `ORACLE_TRUST_PROXY` must only be
enabled when the reverse proxy is trusted; otherwise forwarded headers can be
spoofed and rate limits can be bypassed. No IP or User-Agent persistence
should be inferred for an arbitrary proxy, access log, or hosting provider.

### Storage and consent

`POST /analyze` saves a pending SQLite row and audio file before the user has
accepted research retention. The default pending TTL is 1,800 seconds, but
`purge_expired_pending()` is invoked as part of storage operations rather than
by a dedicated scheduler. An idle service can therefore retain expired
pending audio until another storage operation runs. Confirm the operational
purge schedule or add one before public launch.

Research retention is opt-in. Consent promotion records `consent_at` and
`policy_version` and requires age confirmation in the API request. The default
research retention period is three years from consent (or creation when
consent time is unavailable), controlled by
`ORACLE_RESEARCH_RETENTION_YEARS`. The retention script performs a full
soft-delete of expired research rows.

Soft-delete clears the stored prompt, scores, consent fields, and audio path,
removes the audio file, and clears linked feedback fields for an operator
deletion. Decline and pending-TTL cleanup preserve calibration fields while
unlinking them from the deleted submission, according to the storage code.
The tombstone row can remain in SQLite. The browser's Manage My Data ledger
contains local IDs; v1 deletion requests are handled manually with the
operator script rather than by an authenticated deletion API.

The voice is personal data even when the database has no name or email.
Backups, filesystem snapshots, disk recovery, model-training exports, and
operator workstations must be included in the data inventory. Training must
filter `research_consent=1 AND deleted_at IS NULL`.

## Pre-launch verification checklist

Record evidence for each item in the release ticket or deployment runbook:

- [ ] Set a real controller name and privacy contact in the web build; confirm
      the Catalan privacy and terms documents no longer show provisional text.
- [ ] Confirm the hosting location, processors, access roles, provider
      retention, and transfer safeguards match the published privacy policy.
- [ ] Serve the SPA and API through HTTPS at one origin. Verify the proxy CSP,
      `Permissions-Policy` (`microphone=(self)` for the SPA), HSTS, clickjacking,
      referrer, and content-type headers.
- [ ] Set exact production `ORACLE_CORS_ORIGINS` only when cross-origin access
      is actually needed. Never use `*`; set `ORACLE_TRUST_PROXY=1` only
      behind the intended proxy.
- [ ] Inspect proxy, uvicorn, systemd/container, and backup logs for a
      controlled upload and failure. Confirm there are no bodies, audio,
      filenames, prompt text, comarca, consent payloads, recording IDs, or
      query identifiers.
- [ ] Run a test analysis and decline path. Confirm pending audio is removed
      and prompt/scores are scrubbed; confirm any retained feedback has the
      documented unlinking behavior.
- [ ] Run an opt-in path with a synthetic recording. Confirm consent time and
      policy version are recorded, IP/User-Agent remain null, and the row is
      eligible only under the documented training filter.
- [ ] Run the retention tool in `--dry-run` mode against a test fixture, then
      verify a real test soft-delete removes audio and clears the intended
      fields.
- [ ] Trigger controlled backend and frontend Sentry events. Inspect event
      payloads, tags, traces, and error-only Replay for request bodies,
      prompt text, IDs, URLs, and media. Confirm release/environment values.
- [ ] Query Grafana metrics and inspect labels and alert annotations. Confirm
      the OTLP key has minimum scope and that retention/access are approved.
- [ ] Inspect the PostHog EU project at
      `https://eu.posthog.com/project/242521/`; verify the EU host, event-name
      allowlist, no properties/autocapture/session recording, retention, and
      access controls.
- [ ] Run a real backup, decrypt it in an isolated environment, execute
      SQLite integrity/foreign-key checks, verify audio hashes, and document
      the restore result. Include a deletion/backup expiry procedure.
- [ ] Confirm pending purge, research retention purge, and backup jobs have
      owners, schedules, failure alerts, and a documented RPO/RTO.
- [ ] Keep the public release label honest: results are dialect similarity,
      never geographic origin or identity detection; complete a legal/privacy
      review before broad public traffic.

Related operational documents:
[`docs/BACKUP.md`](BACKUP.md), [`docs/ANALYTICS_EVENTS.md`](ANALYTICS_EVENTS.md),
and [`docs/PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md).
