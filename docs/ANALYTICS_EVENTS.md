# Analytics event catalog

Allowlisted product events for Accent Oracle. The browser sends each event to
`POST /telemetry/event`. The API increments Grafana OTLP counters when OTLP is
configured. There is no third-party product-analytics SDK.

## Privacy rules

- No cookies and no browser storage for these events
- Event name only, except `analysis_failed`, which may add `reason` (`timeout`, `5xx`, `saturated`, `4xx`, `network`) and `latencyBucket` (`under_15s`, `15_to_45s`, `45_to_90s`, `over_90s`)
- The latency bucket is the whole wait, including a sleeping Space waking up
- Never send: audio, request/response bodies, recording IDs, comarca, consent payloads, scores, prompts, or notes
- Backend allowlist must stay in sync with `UI_TELEMETRY_EVENTS` in `backend/observability.py`
- Unknown HTTP routes are labeled `other` on `accent_oracle_http_requests_total`

## Funnel

`accent_oracle_funnel_total` counts these steps, in order. The operations
dashboard shows the count and the step-to-step percentage. Counts are events,
not unique browsers.

| Step label | Source events |
| --- | --- |
| `01_homepage` | `homepage_viewed` |
| `02_recording_started` | `recording_started` |
| `03_recording_completed` | `recording_completed` |
| `04_analyze_pressed` | `analyze_pressed` |
| `05_analysis_completed` | `analysis_completed` |
| `06_result` | `result_shown` |
| `07_retry` | `flow_retried` from the results screen |

## Events

| Event | When | Notes |
| --- | --- | --- |
| `homepage_viewed` | App shell mounts (landing) | Preferred page view signal |
| `page_load` | Legacy alias | Prefer `homepage_viewed`; kept for older Grafana series |
| `recording_started` | Mic `MediaRecorder.start` | After permission granted |
| `recording_press_hold` | Start pointer was held ≥ ~400 ms | Name only; recording starts on pointer-down. Keyboard is not a hold. |
| `recording_too_short` | `onstop` with elapsed &lt; 3.0 s | Same path as the too-short error copy |
| `recording_no_speech` | Retake hint (silence / no qualified speech) | Event name only |
| `recording_completed` | Recording meets min duration and is handed to analyze | |
| `analyze_pressed` | User submits a take for `/analyze` | Before the request completes |
| `analysis_completed` | `/analyze` (or mock) returns successfully | No scores / labels attached |
| `analysis_failed` | `/analyze` times out, returns 5xx, 503, 4xx, or the network fails | `reason` + coarse `latencyBucket` only |
| `validation_started` | A mandatory second take is shown | Event name only |
| `third_take_offered` | The merged result remains uncertain after two takes | Event name only |
| `third_take_completed` | The optional third take returns successfully | Event name only |
| `third_take_skipped` | User continues without the optional third take | Event name only |
| `result_shown` | The results screen is shown the first time in a flow | Event name only |
| `analysis_finalized` | The final result snapshot is persisted | Not a funnel step; only when research retention is on |
| `flow_retried` | «Tornar a l'inici» from the results screen | Funnel step `07_retry` |
| `analysis_unresolved` | The terminal result remains uncertain after the available takes | Event name only |
| `share_clicked` | User opens the results share UI | Not per social network |
| `research_consent_accepted` | Research consent `consent: true` succeeds | No recording ID |
| `origin_submitted` | Optional comarca aggregate is submitted | No session id |

## Configuration

See `web/.env.example`: `VITE_PRODUCT_ANALYTICS_ENABLED=1`. Grafana needs
`GRAFANA_OTLP_ENDPOINT` and `GRAFANA_OTLP_API_KEY` on the API.
