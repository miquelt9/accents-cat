import { describe, expect, it } from "vitest";
import type { AccentOracleResult } from "./accentOracleClient";
import {
  aggregateValidationResults,
  calculateTakeDisagreement,
  MAX_TAKE_DISAGREEMENT_FOR_STRONG,
  needsValidation,
  SKIP_VALIDATION_MIN_GAP,
  SKIP_VALIDATION_MIN_TOP_SCORE,
} from "./needsValidation";

function result(
  overrides: Partial<AccentOracleResult> &
    Pick<AccentOracleResult, "evidenceBand" | "isAmbiguousTopTwo">,
): AccentOracleResult {
  return {
    scores: {
      balearic: 0.1,
      central: 0.5,
      northern: 0.15,
      northwestern: 0.15,
      valencian: 0.1,
    },
    topLabel: "central",
    runnerUpLabel: "northern",
    topTwoGap: 0.2,
    confidenceSummary: "test",
    interpretation: "test",
    recordingId: "first-id",
    ...overrides,
  };
}

describe("needsValidation", () => {
  it("returns false when top score and gap clear the skip bar", () => {
    expect(
      needsValidation(
        result({
          evidenceBand: "strong",
          isAmbiguousTopTwo: false,
          scores: {
            balearic: 0.08,
            central: 0.55,
            northern: 0.12,
            northwestern: 0.13,
            valencian: 0.12,
          },
          topTwoGap: 0.42,
        }),
      ),
    ).toBe(false);
  });

  it("returns true when top score is below the threshold", () => {
    expect(
      needsValidation(
        result({
          evidenceBand: "moderate",
          isAmbiguousTopTwo: false,
          scores: {
            balearic: 0.15,
            central: 0.4,
            northern: 0.2,
            northwestern: 0.15,
            valencian: 0.1,
          },
          topTwoGap: 0.2,
        }),
      ),
    ).toBe(true);
  });

  it("returns true when top-two gap is below the threshold", () => {
    expect(
      needsValidation(
        result({
          evidenceBand: "moderate",
          isAmbiguousTopTwo: true,
          scores: {
            balearic: 0.1,
            central: 0.42,
            northern: 0.35,
            northwestern: 0.08,
            valencian: 0.05,
          },
          topTwoGap: 0.07,
        }),
      ),
    ).toBe(true);
  });

  it("uses the documented skip thresholds", () => {
    expect(SKIP_VALIDATION_MIN_TOP_SCORE).toBe(0.5);
    expect(SKIP_VALIDATION_MIN_GAP).toBe(0.15);
  });

  it("returns true when top-two are geographically incoherent with a material runner-up", () => {
    expect(
      needsValidation(
        result({
          evidenceBand: "strong",
          isAmbiguousTopTwo: false,
          topLabel: "northern",
          runnerUpLabel: "valencian",
          scores: {
            balearic: 0.05,
            central: 0.08,
            northern: 0.52,
            northwestern: 0.05,
            valencian: 0.3,
          },
          topTwoGap: 0.22,
        }),
      ),
    ).toBe(true);
  });

  it("returns false for incoherent pairs when the runner-up is weak", () => {
    expect(
      needsValidation(
        result({
          evidenceBand: "strong",
          isAmbiguousTopTwo: false,
          topLabel: "northern",
          runnerUpLabel: "valencian",
          scores: {
            balearic: 0.08,
            central: 0.12,
            northern: 0.58,
            northwestern: 0.1,
            valencian: 0.12,
          },
          topTwoGap: 0.46,
        }),
      ),
    ).toBe(false);
  });

  it("returns false for adjacent top-two that clear the numeric bar", () => {
    expect(
      needsValidation(
        result({
          evidenceBand: "strong",
          isAmbiguousTopTwo: false,
          topLabel: "northwestern",
          runnerUpLabel: "valencian",
          scores: {
            balearic: 0.05,
            central: 0.1,
            northern: 0.05,
            northwestern: 0.55,
            valencian: 0.25,
          },
          topTwoGap: 0.3,
        }),
      ),
    ).toBe(false);
  });
});

describe("aggregateValidationResults", () => {
  it("averages same-winner takes instead of keeping only the clearer one", () => {
    const first = result({
      topLabel: "central",
      evidenceBand: "limited",
      isAmbiguousTopTwo: true,
      topTwoGap: 0.05,
      recordingId: "first-id",
    });
    const second = result({
      topLabel: "central",
      evidenceBand: "strong",
      isAmbiguousTopTwo: false,
      topTwoGap: 0.3,
      scores: {
        balearic: 0.05,
        central: 0.58,
        northern: 0.12,
        northwestern: 0.13,
        valencian: 0.12,
      },
      recordingId: "second-id",
    });
    const merged = aggregateValidationResults([first, second]);
    expect(merged.scores.central).toBeCloseTo(0.54, 2);
    expect(merged.recordingId).toBe("first-id");
  });

  it("keeps the runner-up that two takes agree on over a single distant third take", () => {
    const centralNorthern = result({
      topLabel: "central",
      runnerUpLabel: "northern",
      evidenceBand: "limited",
      isAmbiguousTopTwo: true,
      topTwoGap: 0.07,
      scores: {
        balearic: 0.05,
        central: 0.42,
        northern: 0.35,
        northwestern: 0.1,
        valencian: 0.08,
      },
    });
    const centralBalearic = result({
      topLabel: "central",
      runnerUpLabel: "balearic",
      evidenceBand: "strong",
      isAmbiguousTopTwo: false,
      topTwoGap: 0.4,
      scores: {
        balearic: 0.15,
        central: 0.55,
        northern: 0.1,
        northwestern: 0.1,
        valencian: 0.1,
      },
    });

    const merged = aggregateValidationResults([
      centralNorthern,
      centralNorthern,
      centralBalearic,
    ]);

    expect(merged.topLabel).toBe("central");
    expect(merged.runnerUpLabel).toBe("northern");
    expect(merged.scores.northern).toBeGreaterThan(merged.scores.balearic);
  });

  it("averages all three takes with equal weight", () => {
    const first = result({
      topLabel: "central",
      runnerUpLabel: "northern",
      evidenceBand: "limited",
      isAmbiguousTopTwo: true,
      topTwoGap: 0.06,
      scores: {
        balearic: 0.1,
        central: 0.38,
        northern: 0.32,
        northwestern: 0.1,
        valencian: 0.1,
      },
      recordingId: "first-id",
    });
    const second = result({
      topLabel: "central",
      runnerUpLabel: "northern",
      evidenceBand: "moderate",
      isAmbiguousTopTwo: false,
      topTwoGap: 0.12,
      scores: {
        balearic: 0.05,
        central: 0.28,
        northern: 0.32,
        northwestern: 0.15,
        valencian: 0.2,
      },
      recordingId: "second-id",
    });
    const third = result({
      topLabel: "central",
      runnerUpLabel: "northern",
      evidenceBand: "strong",
      isAmbiguousTopTwo: false,
      topTwoGap: 0.3,
      scores: {
        balearic: 0.05,
        central: 0.58,
        northern: 0.15,
        northwestern: 0.12,
        valencian: 0.1,
      },
      recordingId: "third-id",
    });
    const merged = aggregateValidationResults([first, second, third]);
    expect(merged.recordingId).toBe("first-id");
    expect(merged.scores.central).toBeCloseTo((0.38 + 0.28 + 0.58) / 3, 2);
    expect(merged.scores.valencian).toBeCloseTo((0.1 + 0.2 + 0.1) / 3, 2);
  });

  it("tracks disagreement and prevents a conflicting average from staying strong", () => {
    const centralTake = result({
      evidenceBand: "strong",
      isAmbiguousTopTwo: false,
      scores: {
        balearic: 0.05,
        central: 0.7,
        northern: 0.1,
        northwestern: 0.1,
        valencian: 0.05,
      },
    });
    const balearicTake = result({
      topLabel: "balearic",
      runnerUpLabel: "central",
      evidenceBand: "strong",
      isAmbiguousTopTwo: false,
      scores: {
        balearic: 0.7,
        central: 0.1,
        northern: 0.05,
        northwestern: 0.05,
        valencian: 0.1,
      },
    });
    const merged = aggregateValidationResults([centralTake, centralTake, balearicTake]);

    expect(merged.takeDisagreement).toBeGreaterThan(MAX_TAKE_DISAGREEMENT_FOR_STRONG);
    expect(merged.evidenceBand).toBe("moderate");
    expect(needsValidation(merged)).toBe(true);
  });

  it("keeps the analysis session and highest take index across merges", () => {
    const first = result({
      topLabel: "central",
      evidenceBand: "limited",
      isAmbiguousTopTwo: true,
      topTwoGap: 0.04,
      analysisSessionId: "session-id",
      takeIndex: 1,
    });
    const second = result({
      topLabel: "central",
      evidenceBand: "strong",
      isAmbiguousTopTwo: false,
      topTwoGap: 0.3,
      recordingId: "second-id",
      analysisSessionId: "session-id",
      takeIndex: 2,
    });

    const merged = aggregateValidationResults([first, second]);

    expect(merged.analysisSessionId).toBe("session-id");
    expect(merged.takeIndex).toBe(2);
    expect(merged.recordingId).toBe("first-id");
  });
});

describe("calculateTakeDisagreement", () => {
  it("returns zero for one take and a normalized pair distance for two", () => {
    const first = result({
      evidenceBand: "moderate",
      isAmbiguousTopTwo: false,
      recordingId: "first-id",
    });
    const second = result({
      evidenceBand: "moderate",
      isAmbiguousTopTwo: false,
      recordingId: "second-id",
      scores: {
        balearic: 0.2,
        central: 0.4,
        northern: 0.2,
        northwestern: 0.1,
        valencian: 0.1,
      },
    });

    expect(calculateTakeDisagreement([first])).toBe(0);
    expect(calculateTakeDisagreement([first, second])).toBeCloseTo(0.15, 2);
  });
});
