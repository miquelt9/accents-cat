import type { AccentOracleResult, AccentScores } from "./accentOracleClient";
import { DIALECT_ZONES, buildResultFromScores } from "./accentOracleClient";
import { isGeographicallyIncoherent } from "./dialectGeography";

/** Skip second take only when top score and top-two gap clear this bar. */
export const SKIP_VALIDATION_MIN_TOP_SCORE = 0.5;
export const SKIP_VALIDATION_MIN_GAP = 0.15;

/** Keep a visibly strong band from hiding materially conflicting takes. */
export const MAX_TAKE_DISAGREEMENT_FOR_STRONG = 0.18;

/**
 * Force a second take when top-two macros are geographically distant and the
 * runner-up is still material (same ballpark as legacy runner-up heat halo).
 */
export const GEO_INCOHERENT_MIN_RUNNER_UP = 0.2;

export function needsValidation(result: AccentOracleResult): boolean {
  if (
    result.takeDisagreement !== undefined &&
    result.takeDisagreement > MAX_TAKE_DISAGREEMENT_FOR_STRONG
  ) {
    return true;
  }

  const topScore = result.scores[result.topLabel];
  const runnerUpScore = result.scores[result.runnerUpLabel];
  const numericUnclear = !(
    topScore >= SKIP_VALIDATION_MIN_TOP_SCORE && result.topTwoGap >= SKIP_VALIDATION_MIN_GAP
  );
  if (numericUnclear) {
    return true;
  }

  return (
    isGeographicallyIncoherent(result.topLabel, result.runnerUpLabel) &&
    runnerUpScore >= GEO_INCOHERENT_MIN_RUNNER_UP
  );
}

/**
 * Average the complete score vector from every take.
 *
 * Score-vector disagreement is the mean pairwise L1 distance divided by two,
 * which stays in the [0, 1] range for probability-like score vectors.
 */
export function aggregateValidationResults(
  results: readonly AccentOracleResult[],
): AccentOracleResult {
  if (results.length === 0) {
    throw new Error("Cannot aggregate an empty set of recording results.");
  }

  const summed = DIALECT_ZONES.reduce((scores, label) => {
    scores[label] = results.reduce((sum, result) => sum + result.scores[label], 0);
    return scores;
  }, {} as AccentScores);

  const averaged = DIALECT_ZONES.reduce((scores, label) => {
    scores[label] = summed[label] / results.length;
    return scores;
  }, {} as AccentScores);

  const first = results[0];
  const aggregate = buildResultFromScores(
    averaged,
    first.recordingId,
    first.analysisSessionId ?? results.find((result) => result.analysisSessionId)?.analysisSessionId,
    Math.max(...results.map((result) => result.takeIndex ?? 0)) || undefined,
  );
  const takeDisagreement = calculateTakeDisagreement(results);

  if (
    aggregate.evidenceBand === "strong" &&
    takeDisagreement > MAX_TAKE_DISAGREEMENT_FOR_STRONG
  ) {
    return {
      ...aggregate,
      evidenceBand: "moderate",
      confidenceSummary:
        "Les gravacions no coincideixen prou, així que el resultat es mostra amb més incertesa.",
      takeDisagreement,
    };
  }

  return { ...aggregate, takeDisagreement };
}

export function calculateTakeDisagreement(
  results: readonly AccentOracleResult[],
): number {
  if (results.length < 2) {
    return 0;
  }

  let totalDistance = 0;
  let pairCount = 0;
  for (let firstIndex = 0; firstIndex < results.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < results.length; secondIndex += 1) {
      const first = results[firstIndex];
      const second = results[secondIndex];
      const distance = DIALECT_ZONES.reduce(
        (sum, label) => sum + Math.abs(first.scores[label] - second.scores[label]),
        0,
      );
      totalDistance += distance / 2;
      pairCount += 1;
    }
  }

  return Number((totalDistance / pairCount).toFixed(3));
}
