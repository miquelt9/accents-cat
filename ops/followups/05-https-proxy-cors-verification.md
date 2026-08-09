# Task 05 — HTTPS, reverse proxy, headers, and CORS verification

Status: `pending`  
Priority: high  
When: before the first public or invite-only deployment, and after changing
the hostname, proxy, TLS certificate, CSP, or API origin

## Goal

Deploy the SPA and API behind a trusted HTTPS reverse proxy, then record
evidence that routing, browser security headers, upload limits, request IDs,
and production CORS behave as intended.

## Prerequisites

- A human-approved production hostname and TLS/certificate strategy
- A deployed `web/dist`, uvicorn process, model artifact, and writable
  `data/user_submissions/`
- A service manager and proxy configuration access
- The actual browser origin(s), if a separate-origin API is required
- A decision about proxy upload and inference timeout limits

Do not invent a hostname or enable cross-origin access just to complete this
task. Same-origin deployment is the default.

## Read first

- [`docs/PRODUCTION_CHECKLIST.md`](../../docs/PRODUCTION_CHECKLIST.md),
  sections 2–5
- [`docs/PRODUCTION_READINESS.md`](../../docs/PRODUCTION_READINESS.md),
  “Deployment configuration”
- [`docs/PRIVACY_AUDIT.md`](../../docs/PRIVACY_AUDIT.md), “Application and
  proxy logs” and “Pre-launch verification checklist”
- [`README.md`](../../README.md), “Production Deployment” and “Observability”
- [`AGENTS.md`](../../AGENTS.md), deployment and privacy constraints
- [`ops/caddy/Caddyfile.example`](../caddy/Caddyfile.example)
- [`backend/middleware.py`](../../backend/middleware.py)
- [`backend/app.py`](../../backend/app.py), route and environment settings
- [`web/.env.example`](../../web/.env.example) and [`.env.example`](../../.env.example)

## Runbook

1. Render a deployment-specific proxy configuration from
   [`ops/caddy/Caddyfile.example`](../caddy/Caddyfile.example). Replace
   placeholders with the approved hostname, document root, and uvicorn
   upstream; do not commit deployment secrets.
2. Configure TLS with HTTP-to-HTTPS redirection. Serve the SPA from `web/dist`
   and proxy `/analyze`, `/analysis-finalize`, `/feedback`,
   `/research-consent`, `/live`, `/ready`, `/version`, `/health`, and
   `/telemetry/event` to the API. Do not publish `/sentry-debug` in production;
   return an explicit 404 rather than an SPA fallback.
3. Set `VITE_ACCENT_ORACLE_MODE=api` and an empty
   `VITE_ACCENT_ORACLE_API_URL` for same-origin builds. If a separate API
   origin is genuinely required, set `ORACLE_CORS_ORIGINS` to exact origins
   only; never use `*`. Set `ORACLE_TRUST_PROXY=1` only when this proxy
   overwrites or sanitizes `X-Forwarded-For`.
4. Set proxy request-body limits to at least 20 MB and choose bounded
   read/inference timeouts that cover a cold CPU model load. Confirm the
   application’s `ORACLE_MAX_AUDIO_SECONDS` agrees with the deployed product
   limits.
5. Verify from the real HTTPS origin:

   ```bash
   export PUBLIC_HTTPS_URL='https://<approved-host>'
   for path in / /live /ready /version /health; do
     curl -fsS -D - -o /dev/null "${PUBLIC_HTTPS_URL%/}${path}"
   done
   curl -sS -o /dev/null -w '%{http_code}\n' \
     "${PUBLIC_HTTPS_URL%/}/sentry-debug"
   ```

   The health routes must not redirect or fall through to `index.html`;
   `/sentry-debug` must be unavailable in production.
6. Confirm the browser-facing responses include HSTS, `X-Content-Type-Options`,
   `Referrer-Policy`, `Permissions-Policy`, a restrictive CSP, and
   `X-Frame-Options`. The SPA policy must allow `microphone=(self)`; API
   responses may use `microphone=()`. Keep `connect-src` limited to the
   same-origin API plus the configured Sentry and PostHog EU hosts.
7. Send a bounded `X-Request-ID` and confirm the response echoes it. Send an
   invalid or overlong value and confirm the API generates a safe replacement.
   Inspect proxy, uvicorn, and host logs during a controlled upload and
   failure; they must contain no body, audio, filename, prompt text, comarca,
   consent payload, recording ID, or query identifier.
8. Complete the browser smoke path on the real HTTPS hostname: microphone
   permission, recording/upload, validation, results, share fallback,
   feedback, consent, privacy/terms, and Manage My Data.

## Privacy constraints

- HTTPS does not make audio anonymous; keep `data/` outside the public root and
  restrict access to the service account.
- Never log multipart bodies, filenames, query strings containing identifiers,
  forwarded IP headers, or uploaded content at the proxy.
- Keep CORS exact and minimal. Do not enable `ORACLE_TRUST_PROXY` behind an
  untrusted or transparent proxy.
- Do not expose `/sentry-debug`, internal model paths, directory listings, or
  deployment credentials.

## Acceptance criteria

- [ ] Public traffic redirects to HTTPS and the certificate is valid and
      renewal is monitored by the deployment owner.
- [ ] SPA and every required API/health route are routed correctly; no health
      route uses an SPA fallback.
- [ ] Required security headers and the microphone/CSP behavior are verified
      from the real hostname.
- [ ] Upload limit, inference timeout, request-ID echo, and invalid-ID
      replacement are tested.
- [ ] Production CORS is empty for same-origin or an exact approved allowlist
      for cross-origin access; `ORACLE_TRUST_PROXY` has an explicit rationale.
- [ ] Controlled proxy/application logs contain no protected submission data.
- [ ] Browser HTTPS smoke test passes and evidence is attached to the release
      record.

## Out of scope

- Better Stack monitors: [`02-better-stack-monitors.md`](02-better-stack-monitors.md)
- Sentry release/source-map setup:
  [`03-sentry-releases-sourcemaps.md`](03-sentry-releases-sourcemaps.md)
- Application-code changes or a new distributed rate limiter
