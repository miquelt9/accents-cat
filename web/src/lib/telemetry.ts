/** Allowlisted product counters → PostHog EU + backend Grafana (never PII). */

import { capturePostHogEvent } from "./posthog";

export type UiTelemetryEvent =
  | "page_load"
  | "homepage_viewed"
  | "recording_started"
  | "recording_completed"
  | "analyze_pressed"
  | "analysis_completed"
  | "validation_started"
  | "third_take_offered"
  | "third_take_completed"
  | "third_take_skipped"
  | "analysis_finalized"
  | "analysis_unresolved"
  | "share_clicked"
  | "research_consent_accepted";

const API_BASE_URL = import.meta.env.VITE_ACCENT_ORACLE_API_URL ?? "http://localhost:8000";

function telemetryUrl(): string {
  const base = typeof API_BASE_URL === "string" ? API_BASE_URL.replace(/\/$/, "") : "";
  // Empty base → same-origin (Vite proxy / production reverse proxy).
  return `${base}/telemetry/event`;
}

/** Fire-and-forget; never throws into the UI. Event name only — no properties. */
export function trackUiEvent(event: UiTelemetryEvent): void {
  try {
    capturePostHogEvent(event);
    void fetch(telemetryUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => {
      // Telemetry must not affect UX.
    });
  } catch {
    // ignore
  }
}
