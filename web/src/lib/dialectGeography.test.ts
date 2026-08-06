import { describe, expect, it } from "vitest";
import { DIALECT_ZONES, type DialectZone } from "./accentOracleClient";
import { areDialectsAdjacent, isGeographicallyIncoherent } from "./dialectGeography";

describe("areDialectsAdjacent", () => {
  it("treats a zone as adjacent to itself", () => {
    for (const zone of DIALECT_ZONES) {
      expect(areDialectsAdjacent(zone, zone)).toBe(true);
    }
  });

  it("allows the mainland continuum pairs", () => {
    const adjacent: Array<[DialectZone, DialectZone]> = [
      ["central", "northern"],
      ["central", "northwestern"],
      ["central", "valencian"],
      ["northern", "northwestern"],
      ["northwestern", "valencian"],
    ];
    for (const [a, b] of adjacent) {
      expect(areDialectsAdjacent(a, b), `${a}-${b}`).toBe(true);
      expect(areDialectsAdjacent(b, a), `${b}-${a}`).toBe(true);
    }
  });

  it("rejects balearic and northern–valencian contact", () => {
    expect(areDialectsAdjacent("northern", "valencian")).toBe(false);
    expect(areDialectsAdjacent("balearic", "central")).toBe(false);
    expect(areDialectsAdjacent("balearic", "valencian")).toBe(false);
    expect(areDialectsAdjacent("balearic", "northern")).toBe(false);
    expect(areDialectsAdjacent("balearic", "northwestern")).toBe(false);
  });
});

describe("isGeographicallyIncoherent", () => {
  it("flags distant top-two pairs", () => {
    expect(isGeographicallyIncoherent("northern", "valencian")).toBe(true);
    expect(isGeographicallyIncoherent("central", "balearic")).toBe(true);
  });

  it("does not flag adjacent pairs", () => {
    expect(isGeographicallyIncoherent("northwestern", "valencian")).toBe(false);
    expect(isGeographicallyIncoherent("central", "northern")).toBe(false);
  });
});
