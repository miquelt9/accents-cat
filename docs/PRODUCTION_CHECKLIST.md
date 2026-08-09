# Production launch checklist

Use this checklist for every public deployment. Mark an item complete only
after recording the value, command output, screenshot, or ticket link that
proves it. Items marked **deployment** are not supplied by the repository.

## 1. Release scope and ownership

- [ ] **Deployment** Name the operator, service owner, privacy contact, and
      incident contact.
- [ ] Confirm the release is still described as a research prototype that
      estimates acoustic similarity to five macro-dialect areas, not origin,
      residence, or identity.
- [ ] Confirm the intended traffic level and abuse response. The in-process
      rate limiters are not shared across multiple workers or hosts.
- [ ] Record the commit SHA, release/version string, build timestamp, deploy
      time, rollback target, and model artifact version.

## 2. Build and environment

- [ ] Build the web app from a clean checkout with Node.js 20+ and
      `npm ci`; no `.env` files or secrets are included in the artifact.
- [ ] Set `VITE_APP_VERSION`, `VITE_GIT_SHA`, and `VITE_BUILD_TIME` in the web
      build. Set `VITE_SENTRY_RELEASE` only when it matches the release
      convention.
- [ ] Set `ORACLE_APP_VERSION`, `ORACLE_GIT_SHA`, and `ORACLE_BUILT_AT` for the
      API, or document the intentional fallback values.
- [ ] Set `VITE_PRIVACY_EMAIL` and `VITE_CONTROLLER_NAME`; rebuild and inspect
      the rendered privacy and terms documents for provisional placeholders.
- [ ] Set `VITE_ACCENT_ORACLE_MODE=api` and leave
      `VITE_ACCENT_ORACLE_API_URL` empty for a same-origin deployment.
- [ ] Set production `VITE_SENTRY_ENVIRONMENT` and `SENTRY_ENVIRONMENT`; keep
      development-only Sentry debug behavior disabled.
- [ ] Set `ORACLE_POLICY_VERSION` to the same value as
      `web/src/lib/legalDocs.ts` (`6 d'agost de 2026` in this revision), or
      update both intentionally and review the consent copy.
- [ ] Confirm the model directory contains the expected `model.joblib` and
      `metadata.json`, and that the five labels remain in the fixed order.
- [ ] Install system `ffmpeg` and verify the service account can read model
      files and write `data/user_submissions/`.
- [ ] Keep `data/`, `models/`, `embeddings/`, and `.env` outside version
      control and outside the public web root.

## 3. HTTPS and reverse proxy

- [ ] Terminate TLS at Caddy/nginx or an equivalent trusted proxy and redirect
      HTTP to HTTPS.
- [ ] Serve `web/dist` and proxy the API paths
      `/analyze`, `/analysis-finalize`, `/feedback`, `/research-consent`, `/live`, `/ready`,
      `/version`, `/health`, `/telemetry/event`, and `/sentry-debug` as
      appropriate. Do not expose `/sentry-debug` in production.
- [ ] Use the checked-in [`ops/caddy/Caddyfile.example`](../ops/caddy/Caddyfile.example)
      as a starting point, replacing the host, paths, and upstream.
- [ ] Verify browser-facing headers: HSTS, `X-Content-Type-Options`,
      `Referrer-Policy`, `Permissions-Policy`,
      `Content-Security-Policy`, and `X-Frame-Options`.
- [ ] Ensure the SPA policy allows `microphone=(self)` while API responses may
      deliberately use `microphone=()`. Keep `connect-src` limited to the
      same origin plus the configured Sentry and PostHog EU hosts.
- [ ] Confirm microphone and Web Share work from the real HTTPS hostname, and
      that plain HTTP is not presented as a supported production path.
- [ ] Set proxy upload/body limits to at least the application cap (20 MB) and
      choose inference/read timeouts that cover a cold CPU model load without
      allowing unbounded connections.
- [ ] Preserve or generate `X-Request-ID`; confirm the API response echoes a
      valid request ID without accepting unbounded or unsafe values.

## 4. CORS, trust, and upload controls

- [ ] Set `ORACLE_CORS_ORIGINS` to exact browser origins only if a separate
      origin is required. Never set it to `*`; same-origin production can leave
      it empty.
- [ ] Set `ORACLE_TRUST_PROXY=1` only when the configured proxy overwrites or
      sanitizes `X-Forwarded-For`. Confirm the rate limiter sees the intended
      client address without persisting it.
- [ ] Confirm `ORACLE_MAX_AUDIO_SECONDS` and the 20 MB upload cap match the
      proxy and product copy.
- [ ] Test rejection of oversized `Content-Length`, oversized bodies,
      unsupported suffixes/content types, empty files, short audio, long
      audio, and silence. Confirm Catalan client-safe errors.
- [ ] Set and review `ORACLE_WORKERS`, `ORACLE_MAX_QUEUE_SIZE`,
      `ORACLE_ENCODE_RETRY_AFTER`, and all analyze/feedback/telemetry rate
      limits for expected traffic. `ORACLE_ENCODE_CONCURRENCY` is only a
      deprecated compatibility fallback. Document the single-process
      limitation and benchmark the worker count for the VPS.
- [ ] Confirm no access log, error page, proxy trace, or Sentry event includes
      the upload body or filename.

## 5. Health, readiness, and version

- [ ] `GET /live` returns success while the process is up.
- [ ] `GET /ready` returns success only when model file, metadata, and
      submission storage are ready; confirm a missing model produces `503`.
- [ ] Keep `GET /health` available for the Better Stack compatibility monitor.
- [ ] `GET /version` reports the intended version, SHA, and build timestamp.
- [ ] Configure Better Stack homepage and `/health` monitors at the public
      HTTPS URL, with 60-second intervals, SSL verification, and email-only
      notifications. Monitor creation is deployment work; see
      [`ops/followups/02-better-stack-monitors.md`](../ops/followups/02-better-stack-monitors.md).
- [ ] Confirm the proxy routes health endpoints without a redirect or SPA
      fallback.

## 6. Observability

- [ ] Configure backend `SENTRY_DSN`, frontend `VITE_SENTRY_DSN`, environments,
      and release values. Verify backend and frontend events in the intended
      projects.
- [ ] Inspect a controlled error and trace for absence of audio, bodies,
      prompt text, comarca, consent payloads, recording IDs, filenames, user
      identity, and query strings. Keep Replay error-only, masked, and
      media-blocked.
- [ ] Configure `GRAFANA_OTLP_ENDPOINT` and
      `GRAFANA_OTLP_API_KEY` only through secret management. Verify metric
      ingestion, route/status labels, alert rules, retention, and dashboard
      access. Configure email routing separately if required; see
      [`ops/followups/01-grafana-contact-points.md`](../ops/followups/01-grafana-contact-points.md).
- [ ] Verify the UI event catalog in
      [`docs/ANALYTICS_EVENTS.md`](ANALYTICS_EVENTS.md) matches the backend
      allowlist and contains event names only.
- [ ] Configure `VITE_POSTHOG_KEY` through the deploy secret store and set
      `VITE_POSTHOG_HOST=https://eu.i.posthog.com`. Verify the documented EU
      project, no autocapture, no session recording, memory persistence, no
      `identify`, and no custom properties.
- [ ] Confirm collector/provider retention and access settings are compatible
      with the privacy policy. Do not put provider tokens in the repository,
      frontend source outside the intended public project key, or logs.

## 7. Storage, consent, and backups

- [ ] Confirm `data/user_submissions/` is on encrypted storage with restricted
      ownership and sufficient free space.
- [ ] Confirm pending TTL and research retention settings:
      `ORACLE_PENDING_CONSENT_TTL_SECONDS` and
      `ORACLE_RESEARCH_RETENTION_YEARS`.
- [ ] Assign an owner and schedule for pending purge and
      `python scripts/purge_expired_research.py`; remember pending cleanup is
      not an independent background worker.
- [ ] Test a two- or three-take decline/abandonment path and an opt-in path.
      Verify every session take's audio, prompt, scores, consent fields,
      final-result snapshot, feedback linkage, and policy version match the
      documented behavior.
- [ ] Run `python scripts/purge_expired_research.py --dry-run` against the
      intended database and record the result.
- [ ] Run a soft-delete test with
      `python scripts/soft_delete_submission.py <session-or-recording-uuid>`;
      verify every linked audio file is removed and the expected database
      scrubbing occurs.
- [ ] Install the backup procedure in [`docs/BACKUP.md`](BACKUP.md), including
      SQLite sidecars, complete audio, encryption, off-box retention, and a
      failure alert. The application does not create backups.
- [ ] Complete a restore drill into an isolated environment. Run SQLite
      integrity and foreign-key checks, verify audio hashes, start the service,
      and check `/live`, `/ready`, `/version`, and `/health`.
- [ ] Record the actual backup frequency and measured restore time. Do not
      claim the example one-hour RPO/four-hour RTO unless the deployment can
      meet them.

## 8. CI and release validation

- [ ] Run the repository CI-equivalent checks from the required environments:

  ```bash
  cd web && npm ci && npm run lint && npm run build && npm test
  cd .. && pytest -q
  ```

- [ ] If CI adds `ruff`, run `ruff check` and `ruff format --check` for the
      backend and scripts.
- [ ] Confirm build metadata is injected in CI rather than copied from a
      developer shell.
- [ ] Confirm the production artifact has no source maps or private source
      material unless the Sentry release upload process is configured. See
      [`ops/followups/03-sentry-releases-sourcemaps.md`](../ops/followups/03-sentry-releases-sourcemaps.md).
- [ ] Perform a browser smoke test on the real HTTPS host: landing, permission,
      recording, upload, mandatory validation, optional third take, unresolved
      result treatment, share fallback, feedback, consent, privacy/terms, and
      Manage My Data.
- [ ] Save the deployed `/version` response, health probe results, release
      SHA, model metadata, and rollback instructions.

## 9. Go/no-go

- [ ] No unresolved privacy, secret, backup-restore, HTTPS, or data-loss
      blocker remains.
- [ ] Monitoring alerts have an owner and a tested notification route.
- [ ] The public privacy/terms copy matches the actual host, processors,
      retention, deletion process, and contact details.
- [ ] A release owner records the go/no-go decision and next review date.

For the evidence-based data-flow review, see
[`docs/PRIVACY_AUDIT.md`](PRIVACY_AUDIT.md). For the current assessment and
known gaps, see [`docs/PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md).
