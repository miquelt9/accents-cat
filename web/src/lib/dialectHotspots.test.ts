import { describe, expect, it } from "vitest";
import { DIALECT_ZONES } from "./accentOracleClient";
import { COMARCA_MAP_META } from "./comarcaMapMeta";
import { HOTSPOT_SLUG_BY_DIALECT } from "./dialectHotspots";

describe("HOTSPOT_SLUG_BY_DIALECT", () => {
  it("maps each dialect to a comarca whose macroDialect matches the zone", () => {
    for (const zone of DIALECT_ZONES) {
      const slug = HOTSPOT_SLUG_BY_DIALECT[zone];
      const entry = COMARCA_MAP_META.find((comarca) => comarca.slug === slug);
      expect(entry, `missing comarca for hotspot slug "${slug}" (${zone})`).toBeDefined();
      expect(entry!.macroDialect).toBe(zone);
    }
  });
});
