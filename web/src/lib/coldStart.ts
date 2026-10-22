/**
 * Hugging Face Space cold-start helpers.
 * The classifier often takes several seconds to wake; the UI should say so
 * and retry the same take instead of blaming the visitor's connection.
 */

/** Show the waking notice once `/analyze` has been in flight this long. */
export const ANALYZE_WAKE_NOTICE_MS = 6_000;

export const SERVER_WAKE_NOTICE = "El servidor s'està despertant...";

/** Timeout, dropped connection, and 5xx — the Space may still be waking. */
export const ANALYZE_UNAVAILABLE_MESSAGE =
  "El servidor no ha respost. Pot ser que encara s'estigui despertant. Torna-ho a provar.";

export const RESEND_RECORDING_LABEL = "Reenvia la gravació";

/** Ignore repeated Comença taps inside this window. */
export const BACKEND_WARM_WINDOW_MS = 10_000;

const API_BASE_URL = import.meta.env.VITE_ACCENT_ORACLE_API_URL ?? "http://localhost:8000";

let lastWarmAt = 0;

function liveUrl(): string {
  const base = typeof API_BASE_URL === "string" ? API_BASE_URL.replace(/\/$/, "") : "";
  return `${base}/live`;
}

/** Fire-and-forget GET /live. Failures are ignored and do not change the UI. */
export function warmBackend(): void {
  const now = Date.now();
  if (now - lastWarmAt < BACKEND_WARM_WINDOW_MS) {
    return;
  }
  lastWarmAt = now;
  try {
    void fetch(liveUrl(), { method: "GET" }).catch(() => {
      // A cold or unreachable backend must not surface during warmup.
    });
  } catch {
    // Ignore synchronous fetch failures (offline, blocked).
  }
}

export function resetBackendWarmup(): void {
  lastWarmAt = 0;
}
