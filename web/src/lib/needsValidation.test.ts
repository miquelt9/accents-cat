import { describe, expect, it } from "vitest";
import type { AccentOracleResult, EvidenceBand } from "./accentOracleClient";
import {
  isStrongerEvidence,
  mergeValidationResults,
  needsValidation,
  pickClearerResult,
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
});

describe("isStrongerEvidence", () => {
  const cases: Array<[EvidenceBand, EvidenceBand, boolean]> = [
    ["strong", "moderate", true],
    ["strong", "limited", true],
    ["moderate", "limited", true],
    ["moderate", "strong", false],
    ["limited", "moderate", false],
    ["strong", "strong", false],
    ["limited", "limited", false],
  ];

  it.each(cases)("%s vs %s → %s", (a, b, expected) => {
    expect(isStrongerEvidence(a, b)).toBe(expected);
  });
});

describe("pickClearerResult", () => {
  it("prefers the stronger evidence band and keeps first recordingId", () => {
    const first = result({
      evidenceBand: "limited",
      isAmbiguousTopTwo: true,
      recordingId: "a",
    });
    const second = result({
      evidenceBand: "moderate",
      isAmbiguousTopTwo: false,
      recordingId: "b",
      topTwoGap: 0.25,
    });
    const chosen = pickClearerResult(first, second);
    expect(chosen.evidenceBand).toBe("moderate");
    expect(chosen.recordingId).toBe("a");
  });

  it("keeps the first when the second is not stronger", () => {
    const first = result({ evidenceBand: "strong", isAmbiguousTopTwo: false, recordingId: "a" });
    const second = result({ evidenceBand: "moderate", isAmbiguousTopTwo: false, recordingId: "b" });
    expect(pickClearerResult(first, second)).toBe(first);
  });

  it("on equal bands prefers the larger topTwoGap", () => {
    const first = result({
      evidenceBand: "moderate",
      isAmbiguousTopTwo: false,
      topTwoGap: 0.12,
      recordingId: "a",
    });
    const second = result({
      evidenceBand: "moderate",
      isAmbiguousTopTwo: false,
      topTwoGap: 0.22,
      recordingId: "b",
    });
    const chosen = pickClearerResult(first, second);
    expect(chosen.topTwoGap).toBe(0.22);
    expect(chosen.recordingId).toBe("a");
  });

  it("keeps the first on equal bands and equal gap", () => {
    const first = result({
      evidenceBand: "moderate",
      isAmbiguousTopTwo: false,
      topTwoGap: 0.2,
      recordingId: "a",
    });
    const second = result({
      evidenceBand: "moderate",
      isAmbiguousTopTwo: true,
      topTwoGap: 0.2,
      recordingId: "b",
    });
    expect(pickClearerResult(first, second)).toBe(first);
  });
});

describe("mergeValidationResults", () => {
  it("same top keeps the clearer take with first recordingId", () => {
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
    const merged = mergeValidationResults(first, second);
    expect(merged.evidenceBand).toBe("strong");
    expect(merged.scores.central).toBe(0.58);
    expect(merged.recordingId).toBe("first-id");
  });

  it("different tops averages scores and keeps first recordingId", () => {
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
      topLabel: "valencian",
      runnerUpLabel: "central",
      evidenceBand: "moderate",
      isAmbiguousTopTwo: false,
      topTwoGap: 0.12,
      scores: {
        balearic: 0.1,
        central: 0.28,
        northern: 0.1,
        northwestern: 0.12,
        valencian: 0.4,
      },
      recordingId: "second-id",
    });
    const merged = mergeValidationResults(first, second);
    expect(merged.recordingId).toBe("first-id");
    expect(merged.scores.central).toBeCloseTo(0.33, 2);
    expect(merged.scores.valencian).toBeCloseTo(0.25, 2);
    expect(merged.topLabel === "central" || merged.topLabel === "valencian").toBe(true);
  });
});
