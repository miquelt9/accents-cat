import { describe, expect, it } from "vitest";
import type { DialectZone } from "./accentOracleClient";
import { DIALECT_GROUP_TO_MACRO, dialectGroupToMacro } from "./mapDialectBridge";

describe("DIALECT_GROUP_TO_MACRO", () => {
  const expected: Record<string, DialectZone> = {
    "ca-central": "central",
    "ca-nwestern": "northwestern",
    "ca-northern": "northern",
    "ca-balear": "balearic",
    "ca-valencia-northern": "valencian",
    "ca-valencia-central": "valencian",
    "ca-valencia-southern": "valencian",
    "ca-valencia-alacant": "valencian",
    "ca-valencia-tortosi": "valencian",
  };

  it("maps every known dialect group to its macro zone", () => {
    expect(DIALECT_GROUP_TO_MACRO).toEqual(expected);
  });
});

describe("dialectGroupToMacro", () => {
  it("returns the mapped macro for known groups", () => {
    expect(dialectGroupToMacro("ca-balear")).toBe("balearic");
    expect(dialectGroupToMacro("ca-nwestern")).toBe("northwestern");
    expect(dialectGroupToMacro("ca-valencia-central")).toBe("valencian");
  });

  it("falls back to central for unknown groups", () => {
    expect(dialectGroupToMacro("unknown")).toBe("central");
    expect(dialectGroupToMacro("")).toBe("central");
    expect(dialectGroupToMacro("ca-something-else")).toBe("central");
  });
});
