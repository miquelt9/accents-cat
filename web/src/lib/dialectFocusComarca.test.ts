import { describe, expect, it } from "vitest";
import type { AccentScores } from "./accentOracleClient";
import { hotspotSlugForZone } from "./dialectHotspots";
import {
  focusNeighborhoodSlugs,
  resolveFocusComarca,
} from "./dialectFocusComarca";
import { COMARCA_MAP_META } from "./comarcaMapMeta";

function scores(partial: Partial<AccentScores>): AccentScores {
  return {
    balearic: 0.05,
    central: 0.05,
    northern: 0.05,
    northwestern: 0.05,
    valencian: 0.05,
    ...partial,
  };
}

function metaFor(slug: string) {
  return COMARCA_MAP_META.find((c) => c.slug === slug)!;
}

describe("resolveFocusComarca", () => {
  it("always guesses even when evidence is limited", () => {
    const pin = resolveFocusComarca(
      scores({
        central: 0.39,
        northern: 0.37,
        northwestern: 0.1,
        valencian: 0.09,
        balearic: 0.05,
      }),
      "central",
    );
    expect(pin).not.toBeNull();
    expect(pin!.evidenceBand).toBe("limited");
    expect(pin!.slug.length).toBeGreaterThan(0);
  });

  it("keeps a mild central win on Barcelonès (not Baix Llobregat)", () => {
    const pin = resolveFocusComarca(
      scores({
        central: 0.55,
        northwestern: 0.13,
        northern: 0.12,
        valencian: 0.12,
        balearic: 0.08,
      }),
      "central",
    );
    expect(pin).not.toBeNull();
    expect(pin!.slug).toBe("barcelones");
  });

  it("snaps a clear central win to the central hotspot", () => {
    const pin = resolveFocusComarca(
      scores({
        central: 0.58,
        balearic: 0.12,
        northern: 0.11,
        northwestern: 0.1,
        valencian: 0.09,
      }),
      "central",
    );
    expect(pin).not.toBeNull();
    expect(pin!.evidenceBand).not.toBe("limited");
    expect(pin!.slug).toBe(hotspotSlugForZone("central"));
  });

  it("keeps a clear valencian win on Horta Oest", () => {
    const pin = resolveFocusComarca(
      scores({
        valencian: 0.6,
        central: 0.15,
        northwestern: 0.1,
        northern: 0.08,
        balearic: 0.07,
      }),
      "valencian",
    );
    expect(pin).not.toBeNull();
    expect(pin!.slug).toBe(hotspotSlugForZone("valencian"));
  });

  it("drifts the central pin south when valencian is a strong runner-up", () => {
    const clear = resolveFocusComarca(
      scores({
        central: 0.58,
        balearic: 0.12,
        northern: 0.11,
        northwestern: 0.1,
        valencian: 0.09,
      }),
      "central",
    );
    const torn = resolveFocusComarca(
      scores({
        central: 0.48,
        valencian: 0.32,
        northwestern: 0.1,
        northern: 0.06,
        balearic: 0.04,
      }),
      "central",
    );
    expect(clear).not.toBeNull();
    expect(torn).not.toBeNull();
    expect(torn!.slug).not.toBe(clear!.slug);

    const clearY = metaFor(clear!.slug).centroidY;
    const tornY = metaFor(torn!.slug).centroidY;
    expect(tornY).toBeGreaterThan(clearY);
  });

  it("blends northwestern and valencian toward a contact midpoint", () => {
    const clearNw = resolveFocusComarca(
      scores({
        northwestern: 0.58,
        balearic: 0.12,
        central: 0.11,
        northern: 0.1,
        valencian: 0.09,
      }),
      "northwestern",
    );
    const torn = resolveFocusComarca(
      scores({
        northwestern: 0.48,
        valencian: 0.32,
        central: 0.1,
        northern: 0.05,
        balearic: 0.05,
      }),
      "northwestern",
    );
    expect(clearNw).not.toBeNull();
    expect(torn).not.toBeNull();
    expect(torn!.slug).not.toBe(clearNw!.slug);
    expect(metaFor(torn!.slug).macroDialect).toBe("northwestern");

    const valHotspot = metaFor(hotspotSlugForZone("valencian"));
    const tornMeta = metaFor(torn!.slug);
    const clearMeta = metaFor(clearNw!.slug);
    const distToVal = Math.hypot(
      tornMeta.centroidX - valHotspot.centroidX,
      tornMeta.centroidY - valHotspot.centroidY,
    );
    const clearDistToVal = Math.hypot(
      clearMeta.centroidX - valHotspot.centroidX,
      clearMeta.centroidY - valHotspot.centroidY,
    );
    expect(distToVal).toBeLessThan(clearDistToVal);
  });

  it("keeps the pin inside the winner macro zone when blending", () => {
    const pin = resolveFocusComarca(
      scores({
        central: 0.48,
        valencian: 0.32,
        northwestern: 0.1,
        northern: 0.06,
        balearic: 0.04,
      }),
      "central",
    );
    expect(pin).not.toBeNull();
    expect(metaFor(pin!.slug).macroDialect).toBe("central");
  });

  it("does not blend northern with valencian", () => {
    const pin = resolveFocusComarca(
      scores({
        northern: 0.48,
        valencian: 0.35,
        central: 0.08,
        northwestern: 0.05,
        balearic: 0.04,
      }),
      "northern",
    );
    expect(pin).not.toBeNull();
    expect(pin!.slug).toBe(hotspotSlugForZone("northern"));
    expect(metaFor(pin!.slug).macroDialect).toBe("northern");
  });
});

describe("focusNeighborhoodSlugs", () => {
  it("returns same-zone neighbors around the focus", () => {
    const neighbors = focusNeighborhoodSlugs("barcelones", "central");
    expect(neighbors.length).toBeGreaterThan(0);
    expect(neighbors).not.toContain("barcelones");
    for (const slug of neighbors) {
      const meta = COMARCA_MAP_META.find((c) => c.slug === slug);
      expect(meta?.macroDialect).toBe("central");
    }
  });
});
