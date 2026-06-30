import type { AccentOracleResult, EvidenceBand } from "./accentOracleClient";

const EVIDENCE_BAND_RANK: Record<EvidenceBand, number> = {
  limited: 0,
  moderate: 1,
  strong: 2,
};

export function needsValidation(result: AccentOracleResult): boolean {
  return result.evidenceBand === "limited" || result.isAmbiguousTopTwo;
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
