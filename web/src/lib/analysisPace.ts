/** Calm copy and coarse timing for a slow or failed analysis.

There is no es/en catalog in this app; the strings are Catalan.
The latency bucket covers the whole wait, including a sleeping Space waking up.
*/

export type AnalysisFailureReason = "timeout" | "5xx" | "4xx" | "network";

export type LatencyBucket = "under_15s" | "15_to_45s" | "45_to_90s" | "over_90s";

/** Show the slow notice once the request has been in flight this long. */
export const ANALYSIS_SLOW_AFTER_MS = 12_000;

export const ANALYSIS_SLOW_MESSAGE =
  "L'anàlisi està trigant més del compte. Si el servidor s'està despertant, pot tardar una mica més.";

const FAILURE_MESSAGES: Record<AnalysisFailureReason, string> = {
  timeout: "L'anàlisi ha trigat massa estona. Quan vulguis, pots tornar-ho a provar.",
  "5xx": "El servidor no ha pogut acabar l'anàlisi. Pots tornar-ho a provar d'aquí a un moment.",
  "4xx": "No hem pogut fer servir aquesta gravació. Quan vulguis, pots tornar-ho a provar.",
  network: "No hem pogut connectar amb el servidor. Quan tinguis connexió, pots tornar-ho a provar.",
};

export function calmFailureMessage(reason: AnalysisFailureReason): string {
  return FAILURE_MESSAGES[reason];
}

/** Coarse duration bucket. Includes Space wake-up time, not only model inference. */
export function latencyBucket(elapsedMs: number): LatencyBucket {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 15_000) {
    return "under_15s";
  }
  if (elapsedMs < 45_000) {
    return "15_to_45s";
  }
  if (elapsedMs < 90_000) {
    return "45_to_90s";
  }
  return "over_90s";
}

export class AnalysisFailure extends Error {
  readonly reason: AnalysisFailureReason;
  readonly elapsedMs: number;

  constructor(reason: AnalysisFailureReason, elapsedMs: number, message: string) {
    super(message);
    this.name = "AnalysisFailure";
    this.reason = reason;
    this.elapsedMs = elapsedMs;
  }
}
