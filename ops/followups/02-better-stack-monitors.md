# Task 02 — Better Stack uptime monitors (public launch)

Status: `pending`  
Priority: high **when** public URL exists; otherwise blocked  
Depends on: HTTPS public homepage + API `/health`

## Goal

Create two Better Stack uptime monitors for the production Accent Oracle:

1. Public homepage
2. API `GET /health`

Configuration must match the README Observability checklist.

## Context (already done)

- Monitors intentionally **not** created in the first observability pass (no public URL)
- README + Spain public-release checklist document the intended settings
- Better Stack account already has an unrelated `google.com` test monitor — leave it alone or delete only if the human asks
- MCP namespace: `user-betterstack` (`create_monitor`, `monitors`, …)

## Prerequisites (blocking)

Ask the human for both URLs before creating anything:

- `PUBLIC_SITE_URL` — e.g. `https://accents.example.com/`
- `API_HEALTH_URL` — e.g. `https://api.accents.example.com/health`

Also confirm the notification email used by Better Stack (account default is fine if they say so).

## Agent plan

1. Confirm both URLs return success over HTTPS from this environment (`curl -fsS` / WebFetch). If `/health` returns `"ok": false` because the model is missing, still create the monitor but warn that production must ship classifier files.
2. List existing Better Stack monitors; skip create if an identical URL already exists.
3. Create monitor **homepage**:
   - `monitor_type`: `status` (or `expected_status_code` with 200)
   - `check_frequency`: `60` (seconds)
   - `verify_ssl`: `true`
   - `email`: `true`
   - `sms`: `false`, `call`: `false`, `push`: `false`
   - `pronounceable_name`: `Accent Oracle — homepage`
4. Create monitor **health**:
   - URL = `API_HEALTH_URL`
   - same interval / SSL / email-only settings
   - Prefer keyword or JSON check for `"ok"` if easy; otherwise status 200 is enough
   - `pronounceable_name`: `Accent Oracle — /health`
5. Update README Observability “Better Stack” section: mark as configured, list monitor names/URLs (no API tokens).
6. Tick the Spain checklist item in README/AGENTS if still open.
7. Do **not** set up incident management, escalations, or SMS.

## Acceptance criteria

- [ ] Two monitors exist and report healthy (or clearly documented if API not ready)
- [ ] 60s interval, SSL verify on, email only
- [ ] Docs updated; no secrets committed
- [ ] Unrelated google.com monitor not required for acceptance

## Constraints

- Privacy: monitors hit public endpoints only; never send auth headers with research tokens
- No paging / SMS / voice
- If URLs are missing, **stop** and ask — do not invent hosts

## Out of scope

- Status page public branding
- Synthetic multi-step Playwright flows
- Grafana Synthetic Monitoring duplicate
