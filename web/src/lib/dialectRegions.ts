import type { DialectZone } from "./accentOracleClient";
import { COMARCA_MAP_META, type ComarcaMapEntry } from "./comarcaMapMeta";

export interface RegionBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  spanX: number;
  spanY: number;
}

/** Padding around the centroid hull so coastlines aren't clipped at the edges. */
const REGION_PADDING = 1.28;
/** Soft floor so tiny zones (e.g. northern) still get a readable frame. */
const MIN_SPAN = 120;

const BY_ZONE = new Map<DialectZone, ComarcaMapEntry[]>();
for (const entry of COMARCA_MAP_META) {
  const list = BY_ZONE.get(entry.macroDialect);
  if (list) {
    list.push(entry);
  } else {
    BY_ZONE.set(entry.macroDialect, [entry]);
  }
}

export function comarquesForZone(zone: DialectZone): ComarcaMapEntry[] {
  return BY_ZONE.get(zone) ?? [];
}

export function slugBelongsToZone(slug: string, zone: DialectZone): boolean {
  return COMARCA_MAP_META.some(
    (entry) => entry.slug === slug && entry.macroDialect === zone,
  );
}

export function zoneForComarcaSlug(slug: string): DialectZone | null {
  return COMARCA_MAP_META.find((entry) => entry.slug === slug)?.macroDialect ?? null;
}

export function regionBoundsForZone(zone: DialectZone): RegionBounds | null {
  const members = comarquesForZone(zone);
  if (!members.length) {
    return null;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const entry of members) {
    minX = Math.min(minX, entry.centroidX);
    maxX = Math.max(maxX, entry.centroidX);
    minY = Math.min(minY, entry.centroidY);
    maxY = Math.max(maxY, entry.centroidY);
  }

  const spanX = Math.max(MIN_SPAN, (maxX - minX) * REGION_PADDING);
  const spanY = Math.max(MIN_SPAN, (maxY - minY) * REGION_PADDING);
  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    spanX,
    spanY,
  };
}

export function regionCentroid(zone: DialectZone): { x: number; y: number } | null {
  const bounds = regionBoundsForZone(zone);
  if (!bounds) {
    return null;
  }
  return { x: bounds.centerX, y: bounds.centerY };
}

/**
 * Camera that frames a macro-dialect's comarca centroids inside the SVG viewBox.
 * Scale is clamped so huge zones (central) stay overview-like and small ones zoom in.
 */
export function cameraForZone(
  zone: DialectZone,
  view: { w: number; h: number },
  options?: { minScale?: number; maxScale?: number; defaultScale?: number },
): { focusX: number; focusY: number; scale: number } {
  const minScale = options?.minScale ?? 0.95;
  const maxScale = options?.maxScale ?? 2.35;
  const defaultScale = options?.defaultScale ?? 1.05;
  const bounds = regionBoundsForZone(zone);
  if (!bounds) {
    return {
      focusX: view.w / 2,
      focusY: view.h / 2,
      scale: defaultScale,
    };
  }

  const fit = Math.min(view.w / bounds.spanX, view.h / bounds.spanY);
  const scale = Math.min(maxScale, Math.max(minScale, fit * 0.92));
  return {
    focusX: bounds.centerX,
    focusY: bounds.centerY,
    scale,
  };
}
