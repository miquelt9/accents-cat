import { describe, expect, it } from "vitest";
import type { AccentOracleResult, EvidenceBand } from "./accentOracleClient";
import {
  isStrongerEvidence,
  needsValidation,
  pickBetterResult,
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
  it("returns true when evidenceBand is limited", () => {
    expect(
      needsValidation(result({ evidenceBand: "limited", isAmbiguousTopTwo: false })),
    ).toBe(true);
  });

  it("returns true when isAmbiguousTopTwo even if band is moderate", () => {
    expect(
      needsValidation(result({ evidenceBand: "moderate", isAmbiguousTopTwo: true })),
    ).toBe(true);
  });

  it("returns false for clear moderate/strong results", () => {
    expect(
      needsValidation(result({ evidenceBand: "moderate", isAmbiguousTopTwo: false })),
    ).toBe(false);
    expect(
      needsValidation(result({ evidenceBand: "strong", isAmbiguousTopTwo: false })),
    ).toBe(false);
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
