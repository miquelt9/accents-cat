import { describe, expect, it } from "vitest";
import { DIALECT_ZONES } from "./accentOracleClient";

describe("DIALECT_ZONES contract", () => {
  it("matches the fixed five-label order", () => {
    expect([...DIALECT_ZONES]).toEqual([
      "balearic",
      "central",
      "northern",
      "northwestern",
      "valencian",
    ]);
  });
});
