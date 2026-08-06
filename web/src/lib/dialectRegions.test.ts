import { describe, expect, it } from "vitest";
import { DIALECT_ZONES } from "./accentOracleClient";
import { COMARCA_MAP_META } from "./comarcaMapMeta";
import {
  cameraForZone,
  comarquesForZone,
  regionBoundsForZone,
  zoneForComarcaSlug,
} from "./dialectRegions";

const VIEW = { w: 854, h: 1005 };

describe("dialectRegions", () => {
  it("lists every map comarca under exactly one macro zone", () => {
    const seen = new Set<string>();
    for (const zone of DIALECT_ZONES) {
      for (const entry of comarquesForZone(zone)) {
        expect(entry.macroDialect).toBe(zone);
        expect(seen.has(entry.slug)).toBe(false);
        seen.add(entry.slug);
      }
    }
    expect(seen.size).toBe(COMARCA_MAP_META.length);
  });

  it("resolves zone from comarca slug", () => {
    expect(zoneForComarcaSlug("barcelones")).toBe("central");
    expect(zoneForComarcaSlug("palma")).toBe("balearic");
    expect(zoneForComarcaSlug("no-such")).toBeNull();
  });

  it("frames each zone with a finite camera inside scale clamps", () => {
    for (const zone of DIALECT_ZONES) {
      const bounds = regionBoundsForZone(zone);
      expect(bounds).not.toBeNull();
      const camera = cameraForZone(zone, VIEW);
      expect(camera.focusX).toBeGreaterThan(0);
      expect(camera.focusY).toBeGreaterThan(0);
      expect(camera.scale).toBeGreaterThanOrEqual(0.95);
      expect(camera.scale).toBeLessThanOrEqual(2.35);
    }
  });

  it("zooms northern more tightly than central", () => {
    const northern = cameraForZone("northern", VIEW);
    const central = cameraForZone("central", VIEW);
    expect(northern.scale).toBeGreaterThan(central.scale);
  });
});
