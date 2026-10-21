/** Allowlisted product counters → backend Grafana OTLP (never PII, no cookies). */

import type { AnalysisFailureReason, LatencyBucket } from "./analysisPace";

export type UiTelemetryEvent =
  | "page_load"
  | "homepage_viewed"
  | "recording_started"
  | "recording_press_hold"
  | "recording_too_short"
  | "recording_no_speech"
  | "recording_completed"
  | "analyze_pressed"
  | "analysis_completed"
  | "analysis_failed"
  | "validation_started"
  | "third_take_offered"
  | "third_take_completed"
  | "third_take_skipped"
  | "analysis_finalized"
  | "analysis_unresolved"
  | "result_shown"
  | "flow_retried"
  | "share_clicked"
  | "research_consent_accepted"
  | "origin_submitted";

export type AnalysisFailedDetails = {
  reason: AnalysisFailureReason;
  latencyBucket: LatencyBucket;
};

const API_BASE_URL = import.meta.env.VITE_ACCENT_ORACLE_API_URL ?? "http://localhost:8000";

function telemetryUrl(): string {
  const base = typeof API_BASE_URL === "string" ? API_BASE_URL.replace(/\/$/, "") : "";
  // Empty base → same-origin (Vite proxy / production reverse proxy).
  return `${base}/telemetry/event`;
}

/**
 * Fire-and-forget; never throws into the UI.
 * No cookies and no browser storage. Only `analysis_failed` may add a coarse
 * reason and latency bucket.
 */
export function trackUiEvent(event: UiTelemetryEvent, details?: AnalysisFailedDetails): void {
  if (import.meta.env.VITE_PRODUCT_ANALYTICS_ENABLED !== "1") {
    return;
  }
  const payload: Record<string, string> = { event };
  if (event === "analysis_failed" && details) {
    payload.reason = details.reason;
    payload.latencyBucket = details.latencyBucket;
  }
  try {
    void fetch(telemetryUrl(), {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Telemetry must not affect UX.
    });
  } catch {
    // ignore
  }
}
