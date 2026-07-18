import { describe, expect, it } from "vitest";
import type { AccentOracleResult, EvidenceBand } from "./accentOracleClient";
import {
  isStrongerEvidence,
  needsValidation,
  pickBetterResult,
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

describe("pickBetterResult", () => {
  it("prefers the stronger evidence band", () => {
    const first = result({ evidenceBand: "limited", isAmbiguousTopTwo: true });
    const second = result({ evidenceBand: "moderate", isAmbiguousTopTwo: false });
    expect(pickBetterResult(first, second)).toBe(second);
  });

  it("keeps the first when the second is not stronger", () => {
    const first = result({ evidenceBand: "strong", isAmbiguousTopTwo: false });
    const second = result({ evidenceBand: "moderate", isAmbiguousTopTwo: false });
    expect(pickBetterResult(first, second)).toBe(first);
  });

  it("keeps the first on equal bands", () => {
    const first = result({ evidenceBand: "moderate", isAmbiguousTopTwo: false });
    const second = result({ evidenceBand: "moderate", isAmbiguousTopTwo: true });
    expect(pickBetterResult(first, second)).toBe(first);
  });
});
