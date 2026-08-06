import { describe, expect, it } from "vitest";
import type { DialectZone } from "./accentOracleClient";
import { COMARCA_MAP_META } from "./comarcaMapMeta";
import { DIALECT_GROUP_TO_MACRO, dialectGroupToMacro } from "./mapDialectBridge";

describe("DIALECT_GROUP_TO_MACRO", () => {
  const expected: Record<string, DialectZone> = {
    "ca-central": "central",
    "ca-nwestern": "northwestern",
    "ca-northern": "northern",
    "ca-balear": "balearic",
    "ca-valencia": "valencian",
  };

  it("maps every known dialect group to its macro zone", () => {
    expect(DIALECT_GROUP_TO_MACRO).toEqual(expected);
  });

  it("covers every dialect group used by the generated comarca metadata", () => {
    for (const comarca of COMARCA_MAP_META) {
      expect(
        dialectGroupToMacro(comarca.dialectGroup),
        `dialect group "${comarca.dialectGroup}" of ${comarca.slug}`,
      ).toBe(comarca.macroDialect);
    }
  });
});

describe("dialectGroupToMacro", () => {
  it("returns the mapped macro for known groups", () => {
    expect(dialectGroupToMacro("ca-balear")).toBe("balearic");
    expect(dialectGroupToMacro("ca-nwestern")).toBe("northwestern");
    expect(dialectGroupToMacro("ca-valencia")).toBe("valencian");
  });

  it("falls back to central for unknown groups", () => {
    expect(dialectGroupToMacro("unknown")).toBe("central");
    expect(dialectGroupToMacro("")).toBe("central");
    expect(dialectGroupToMacro("ca-something-else")).toBe("central");
  });
});
