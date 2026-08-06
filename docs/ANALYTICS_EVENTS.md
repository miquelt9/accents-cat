# Analytics event catalog

Allowlisted product events for Accent Oracle. The browser dual-fires each event to:

1. **PostHog Cloud EU** (`posthog-js`, cookieless / memory persistence) when `VITE_POSTHOG_KEY` is set
2. **`POST /telemetry/event`** → Grafana OTLP counters when the API has OTLP configured

## Privacy rules

- Event **name only** — no custom properties
- Never send: audio, request/response bodies, recording IDs, comarca, consent payloads, scores, prompts, or notes
- PostHog: autocapture off, session recording off, no `identify`
- Backend allowlist must stay in sync with `UI_TELEMETRY_EVENTS` in `backend/observability.py`

## Events

| Event | When | Notes |
| --- | --- | --- |
| `homepage_viewed` | App shell mounts (landing) | Preferred page view signal |
| `page_load` | Legacy alias | Prefer `homepage_viewed`; kept for older Grafana series |
| `recording_started` | Mic `MediaRecorder.start` | After permission granted |
| `recording_completed` | Recording meets min duration and is handed to analyze | |
| `analyze_pressed` | User submits a take for `/analyze` | Before the request completes |
| `analysis_completed` | `/analyze` (or mock) returns successfully | No scores / labels attached |
| `share_clicked` | User opens the results share UI | Not per social network |
| `research_consent_accepted` | Research consent `consent: true` succeeds | No recording ID |

## Configuration

See `web/.env.example`: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` (default `https://eu.i.posthog.com`).
