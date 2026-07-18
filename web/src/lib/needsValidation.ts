import type { AccentOracleResult, AccentScores, EvidenceBand } from "./accentOracleClient";
import { DIALECT_ZONES, buildResultFromScores } from "./accentOracleClient";

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

/** Prefer stronger band, then larger gap; ties keep the earlier take. Always keep first.recordingId. */
export function pickClearerResult(
  first: AccentOracleResult,
  second: AccentOracleResult,
): AccentOracleResult {
  if (isStrongerEvidence(second.evidenceBand, first.evidenceBand)) {
    return { ...second, recordingId: first.recordingId };
  }
  if (isStrongerEvidence(first.evidenceBand, second.evidenceBand)) {
    return first;
  }
  if (second.topTwoGap > first.topTwoGap) {
    return { ...second, recordingId: first.recordingId };
  }
  return first;
}

/**
 * Same topLabel → keep the clearer take.
 * Different tops → average scores and recompute derived fields.
 * Displayed recordingId always comes from `first`.
 */
export function mergeValidationResults(
  first: AccentOracleResult,
  second: AccentOracleResult,
): AccentOracleResult {
  if (first.topLabel === second.topLabel) {
    return pickClearerResult(first, second);
  }
  return buildResultFromAveragedScores(first, second);
}

function buildResultFromAveragedScores(
  first: AccentOracleResult,
  second: AccentOracleResult,
): AccentOracleResult {
  const summed = DIALECT_ZONES.reduce((scores, label) => {
    scores[label] = first.scores[label] + second.scores[label];
    return scores;
  }, {} as AccentScores);

  const total = DIALECT_ZONES.reduce((sum, label) => sum + summed[label], 0);
  const averaged = DIALECT_ZONES.reduce((scores, label) => {
    scores[label] = Number((summed[label] / total).toFixed(3));
    return scores;
  }, {} as AccentScores);

  return buildResultFromScores(averaged, first.recordingId);
}
