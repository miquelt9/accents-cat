import type { AccentOracleResult, EvidenceBand } from "./accentOracleClient";

const EVIDENCE_BAND_RANK: Record<EvidenceBand, number> = {
  limited: 0,
  moderate: 1,
  strong: 2,
};

/** Skip second take only when top score and top-two gap clear this bar. */
export const SKIP_VALIDATION_MIN_TOP_SCORE = 0.5;
export const SKIP_VALIDATION_MIN_GAP = 0.15;

export function needsValidation(result: AccentOracleResult): boolean {
  const topScore = result.scores[result.topLabel];
  return !(
    topScore >= SKIP_VALIDATION_MIN_TOP_SCORE && result.topTwoGap >= SKIP_VALIDATION_MIN_GAP
  );
}

export function isStrongerEvidence(a: EvidenceBand, b: EvidenceBand): boolean {
  return EVIDENCE_BAND_RANK[a] > EVIDENCE_BAND_RANK[b];
}

export function pickBetterResult(
  first: AccentOracleResult,
  second: AccentOracleResult,
): AccentOracleResult {
  return isStrongerEvidence(second.evidenceBand, first.evidenceBand) ? second : first;
}
