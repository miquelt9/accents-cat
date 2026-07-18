import type { EvidenceBand } from "./accentOracleClient";

/**
 * Mirrored from backend/scoring.py `evidence_band()`.
 * Keep thresholds in sync when changing either side.
 */
export const EVIDENCE_LIMITED_GAP = 0.08;
export const EVIDENCE_LIMITED_CONFIDENCE = 0.32;
export const EVIDENCE_STRONG_GAP = 0.18;
export const EVIDENCE_STRONG_CONFIDENCE = 0.48;

export function getEvidenceBand(topTwoGap: number, confidence: number): EvidenceBand {
  if (topTwoGap < EVIDENCE_LIMITED_GAP || confidence < EVIDENCE_LIMITED_CONFIDENCE) {
    return "limited";
  }

  if (topTwoGap > EVIDENCE_STRONG_GAP && confidence > EVIDENCE_STRONG_CONFIDENCE) {
    return "strong";
  }

  return "moderate";
}
