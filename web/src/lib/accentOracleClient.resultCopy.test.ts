import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildResultFromScores,
  type AccentOracleResult,
  type AccentScores,
} from "./accentOracleClient";
import { DEV_TOOLS_STORAGE_KEY, MODE_OVERRIDE_STORAGE_KEY } from "./devFlags";
import { aggregateValidationResults } from "./needsValidation";

/**
 * Catalan copy mirrored from backend/scoring.py `confidence_summary` /
 * `build_result`. Real-mode results must use these sentences exactly.
 */
const REAL_AMBIGUOUS =
  "Les dues zones principals són properes, així que el mapa mostra intencionadament un patró de similitud més ampli.";
const REAL_STRONG =
  "El senyal del model és relativament concentrat, però encara no és una estimació exacta de l'origen.";
const REAL_MODERATE =
  "El model detecta una zona principal, però hi ha una incertesa significativa al voltant.";
const REAL_LIMITED =
  "La gravació aporta evidència limitada, així que la incertesa és alta.";
const REAL_CENTRAL_INTERPRETATION =
  "Aquesta gravació sona més similar a la zona del català central segons el model actual.";
const REAL_NORTHERN_INTERPRETATION =
  "Aquesta gravació sona més similar a la zona del català septentrional segons el model actual.";

const SIMULATED_STRONG =
  "El senyal simulat és relativament concentrat, però encara no és una estimació exacta d'origen.";

/** Clear central win: gap 0.60, confidence 0.70 → strong. */
const STRONG_CENTRAL: AccentScores = {
  balearic: 0.05,
  central: 0.7,
  northern: 0.1,
  northwestern: 0.08,
  valencian: 0.07,
};

/** Clear northern win, so the zone name must follow scoring.py (`septentrional`). */
const STRONG_NORTHERN: AccentScores = {
  balearic: 0.08,
  central: 0.1,
  northern: 0.64,
  northwestern: 0.1,
  valencian: 0.08,
};

/** Gap 0.10 and confidence 0.30 → limited, not ambiguous. */
const LIMITED: AccentScores = {
  balearic: 0.18,
  central: 0.3,
  northern: 0.2,
  northwestern: 0.16,
  valencian: 0.16,
};

/** Gap 0.14 and confidence 0.42 → moderate. */
const MODERATE: AccentScores = {
  balearic: 0.1,
  central: 0.42,
  northern: 0.28,
  northwestern: 0.1,
  valencian: 0.1,
};

/** Gap 0.04 → ambiguous (and a limited evidence band). */
const AMBIGUOUS: AccentScores = {
  balearic: 0.1,
  central: 0.34,
  northern: 0.3,
  northwestern: 0.14,
  valencian: 0.12,
};

function resultText(result: AccentOracleResult): string {
  return `${result.confidenceSummary}\n${result.interpretation}`;
}

function expectNoSimulatedCopy(result: AccentOracleResult): void {
  expect(resultText(result)).not.toMatch(/simulat/i);
}

function useMode(mode: "api" | "mock-fail"): void {
  localStorage.setItem(DEV_TOOLS_STORAGE_KEY, "1");
  localStorage.setItem(MODE_OVERRIDE_STORAGE_KEY, mode);
}

describe("real-mode result copy", () => {
  beforeEach(() => {
    useMode("api");
  });

  afterEach(() => {
    localStorage.removeItem(DEV_TOOLS_STORAGE_KEY);
    localStorage.removeItem(MODE_OVERRIDE_STORAGE_KEY);
  });

  it("does not say simulat after one reading and uses scoring.py wording", () => {
    const strong = buildResultFromScores(STRONG_CENTRAL);
    expectNoSimulatedCopy(strong);
    expect(strong.evidenceBand).toBe("strong");
    expect(strong.isAmbiguousTopTwo).toBe(false);
    expect(strong.confidenceSummary).toBe(REAL_STRONG);
    expect(strong.interpretation).toBe(REAL_CENTRAL_INTERPRETATION);

    const northern = buildResultFromScores(STRONG_NORTHERN);
    expectNoSimulatedCopy(northern);
    expect(northern.topLabel).toBe("northern");
    expect(northern.interpretation).toBe(REAL_NORTHERN_INTERPRETATION);

    const limited = buildResultFromScores(LIMITED);
    expectNoSimulatedCopy(limited);
    expect(limited.evidenceBand).toBe("limited");
    expect(limited.isAmbiguousTopTwo).toBe(false);
    expect(limited.confidenceSummary).toBe(REAL_LIMITED);
  });

  it("does not say simulat after two readings and uses the moderate scoring.py summary", () => {
    const merged = aggregateValidationResults([
      buildResultFromScores(MODERATE, "take-1", "session", 1),
      buildResultFromScores(MODERATE, "take-2", "session", 2),
    ]);

    expect(merged.takeIndex).toBe(2);
    expectNoSimulatedCopy(merged);
    expect(merged.evidenceBand).toBe("moderate");
    expect(merged.isAmbiguousTopTwo).toBe(false);
    expect(merged.confidenceSummary).toBe(REAL_MODERATE);
    expect(merged.interpretation).toBe(REAL_CENTRAL_INTERPRETATION);
  });

  it("does not say simulat after three readings and uses the ambiguous scoring.py summary", () => {
    const merged = aggregateValidationResults([
      buildResultFromScores(AMBIGUOUS, "take-1", "session", 1),
      buildResultFromScores(AMBIGUOUS, "take-2", "session", 2),
      buildResultFromScores(AMBIGUOUS, "take-3", "session", 3),
    ]);

    expect(merged.takeIndex).toBe(3);
    expectNoSimulatedCopy(merged);
    expect(merged.evidenceBand).toBe("limited");
    expect(merged.isAmbiguousTopTwo).toBe(true);
    expect(merged.confidenceSummary).toBe(REAL_AMBIGUOUS);
    expect(merged.interpretation).toBe(REAL_CENTRAL_INTERPRETATION);
  });
});

describe("fake-mode result copy", () => {
  beforeEach(() => {
    useMode("mock-fail");
  });

  afterEach(() => {
    localStorage.removeItem(DEV_TOOLS_STORAGE_KEY);
    localStorage.removeItem(MODE_OVERRIDE_STORAGE_KEY);
  });

  it("still says simulat", () => {
    const single = buildResultFromScores(STRONG_CENTRAL);
    expect(single.confidenceSummary).toBe(SIMULATED_STRONG);
    expect(single.interpretation).toMatch(/simulat/i);

    const merged = aggregateValidationResults([
      buildResultFromScores(MODERATE, "take-1"),
      buildResultFromScores(MODERATE, "take-2"),
    ]);
    expect(resultText(merged)).toMatch(/simulat/i);
  });
});
