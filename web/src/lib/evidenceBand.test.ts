import { describe, expect, it } from "vitest";
import {
  EVIDENCE_LIMITED_CONFIDENCE,
  EVIDENCE_LIMITED_GAP,
  EVIDENCE_STRONG_CONFIDENCE,
  EVIDENCE_STRONG_GAP,
  getEvidenceBand,
} from "./evidenceBand";

describe("getEvidenceBand", () => {
  it("returns limited when gap is below the limited threshold", () => {
    expect(getEvidenceBand(EVIDENCE_LIMITED_GAP - 0.001, 0.9)).toBe("limited");
  });

  it("returns limited when confidence is below the limited threshold", () => {
    expect(getEvidenceBand(0.2, EVIDENCE_LIMITED_CONFIDENCE - 0.001)).toBe("limited");
  });

  it("returns strong when gap and confidence both exceed strong thresholds", () => {
    expect(getEvidenceBand(EVIDENCE_STRONG_GAP + 0.001, EVIDENCE_STRONG_CONFIDENCE + 0.001)).toBe(
      "strong",
    );
  });

  it("returns moderate otherwise", () => {
    expect(getEvidenceBand(0.1, 0.4)).toBe("moderate");
    expect(getEvidenceBand(EVIDENCE_STRONG_GAP + 0.01, EVIDENCE_STRONG_CONFIDENCE)).toBe("moderate");
    expect(getEvidenceBand(EVIDENCE_STRONG_GAP, EVIDENCE_STRONG_CONFIDENCE + 0.01)).toBe("moderate");
  });
});
