import type { AccentScores, DialectZone, EvidenceBand } from "./accentOracleClient";
import { DIALECT_ZONES } from "./accentOracleClient";
import { COMARCA_MAP_META, type ComarcaMapEntry } from "./comarcaMapMeta";
import { areDialectsAdjacent } from "./dialectGeography";
import { hotspotComarcaForZone, hotspotSlugForZone } from "./dialectHotspots";
import { getEvidenceBand } from "./evidenceBand";

interface MapPoint {
  x: number;
  y: number;
}

/** Absolute floor before a partner can pull the blend. */
const BLEND_MIN_PARTNER_SCORE = 0.12;
/** Partner must also be at least this fraction of the top score (blocks 55%/13% drift). */
const BLEND_MIN_PARTNER_RATIO = 0.45;
/** Population pull decays with distance so it only breaks near-ties. */
const POP_TIE_SCALE = 48;

/** Map units: soft neighborhood around the focus pin (same idea as heat core). */
export const FOCUS_NEIGHBORHOOD_RADIUS = 64;

const HOTSPOT_COORD_OVERRIDE: Partial<Record<string, { x: number; y: number }>> = {
  valencia: { x: 367, y: 685 },
};

/**
 * Editorial relative population / recognizability pull for snap near-ties.
 * Default weight is 1; hotspots and metro cores are higher so the pin prefers
 * the "wow" comarca without overriding a strong score blend.
 */
const COMARCA_POP_WEIGHT: Readonly<Record<string, number>> = {
  barcelones: 4,
  "baix-llobregat": 1.4,
  "valles-occidental": 1.5,
  "valles-oriental": 1.3,
  maresme: 1.2,
  segria: 3.5,
  rossello: 3.5,
  "horta-oest": 3.8,
  valencia: 4,
  "horta-nord": 1.6,
  "horta-sud": 1.6,
  palma: 4,
};

const DEFAULT_POP_WEIGHT = 1;

export interface DialectFocusPin {
  slug: string;
  /** Evidence band of the overall top-two (gates whether a focus pin is shown). */
  evidenceBand: EvidenceBand;
}

type ResolvedAnchor =
  | { kind: "hotspot"; zone: DialectZone }
  | { kind: "blend"; point: MapPoint; snapZones: DialectZone[] };

function comarcaCoords(comarca: ComarcaMapEntry): MapPoint {
  return (
    HOTSPOT_COORD_OVERRIDE[comarca.slug] ?? {
      x: comarca.centroidX,
      y: comarca.centroidY,
    }
  );
}

function zoneAnchorPoint(zone: DialectZone): MapPoint | undefined {
  const comarca = hotspotComarcaForZone(zone);
  return comarca ? comarcaCoords(comarca) : undefined;
}

function populationWeight(slug: string): number {
  return COMARCA_POP_WEIGHT[slug] ?? DEFAULT_POP_WEIGHT;
}

function blendAnchorPoints(
  zoneA: DialectZone,
  zoneB: DialectZone,
  scores: AccentScores,
): MapPoint | undefined {
  const pointA = zoneAnchorPoint(zoneA);
  const pointB = zoneAnchorPoint(zoneB);
  if (!pointA || !pointB) {
    return undefined;
  }

  const weightA = scores[zoneA];
  const weightB = scores[zoneB];
  const total = weightA + weightB;
  if (total <= 0) {
    return undefined;
  }

  return {
    x: (pointA.x * weightA + pointB.x * weightB) / total,
    y: (pointA.y * weightA + pointB.y * weightB) / total,
  };
}

function rankedZones(scores: AccentScores): DialectZone[] {
  return [...DIALECT_ZONES].sort((a, b) => scores[b] - scores[a]);
}

function overallEvidenceBand(scores: AccentScores): EvidenceBand {
  const ranked = rankedZones(scores);
  const top = ranked[0];
  const runnerUp = ranked[1];
  const gap = Number((scores[top] - scores[runnerUp]).toFixed(3));
  return getEvidenceBand(gap, scores[top]);
}

function shouldBlendZones(
  zoneA: DialectZone,
  zoneB: DialectZone,
  partnerScore: number,
  topScore: number,
): boolean {
  if (!areDialectsAdjacent(zoneA, zoneB)) {
    return false;
  }
  const minPartner = Math.max(BLEND_MIN_PARTNER_SCORE, topScore * BLEND_MIN_PARTNER_RATIO);
  return partnerScore >= minPartner;
}

/**
 * Blend toward a strong geographically adjacent partner; otherwise stay on the
 * selected zone hotspot. Balearic never blends with mainland.
 */
function resolveAnchorPoint(
  selectedZone: DialectZone,
  scores: AccentScores,
): ResolvedAnchor | undefined {
  const ranked = rankedZones(scores);
  const top = ranked[0];
  const runnerUp = ranked[1];
  const topScore = scores[top];

  if (selectedZone === top) {
    if (shouldBlendZones(top, runnerUp, scores[runnerUp], topScore)) {
      const blended = blendAnchorPoints(top, runnerUp, scores);
      if (blended) {
        // Snap only inside the winner zone so region highlight and pin always match.
        return { kind: "blend", point: blended, snapZones: [top] };
      }
    }
    return { kind: "hotspot", zone: top };
  }

  if (shouldBlendZones(selectedZone, top, scores[selectedZone], topScore)) {
    const blended = blendAnchorPoints(selectedZone, top, scores);
    if (blended) {
      return { kind: "blend", point: blended, snapZones: [selectedZone] };
    }
  }

  return { kind: "hotspot", zone: selectedZone };
}

/** Nearest allowed comarca; population only breaks near-ties (scores set the anchor). */
function nearestComarcaInZones(
  point: MapPoint,
  zones: readonly DialectZone[],
): ComarcaMapEntry | undefined {
  const allowed = new Set(zones);
  let best: ComarcaMapEntry | undefined;
  let bestCost = Infinity;
  for (const entry of COMARCA_MAP_META) {
    if (!allowed.has(entry.macroDialect)) {
      continue;
    }
    const coords = comarcaCoords(entry);
    const dist = Math.hypot(coords.x - point.x, coords.y - point.y);
    const pop = populationWeight(entry.slug);
    const near = Math.exp(-dist / POP_TIE_SCALE);
    const effectiveWeight = 1 + (pop - 1) * near;
    const cost = dist / effectiveWeight;
    if (cost < bestCost) {
      bestCost = cost;
      best = entry;
    }
  }
  return best;
}

/**
 * Illustrative comarca guess for the map pin (overall top accent).
 * Always returns a guess when geometry exists — even if evidence is limited —
 * so the UI never leaves the map without a pin. Still reports evidenceBand.
 * Never claim this as geographic origin.
 */
export function resolveFocusComarca(
  scores: AccentScores,
  selectedZone: DialectZone,
): DialectFocusPin | null {
  const evidenceBand = overallEvidenceBand(scores);

  const resolved = resolveAnchorPoint(selectedZone, scores);
  if (!resolved) {
    return null;
  }

  if (resolved.kind === "hotspot") {
    return { slug: hotspotSlugForZone(resolved.zone), evidenceBand };
  }

  const snapped = nearestComarcaInZones(resolved.point, resolved.snapZones);
  if (!snapped) {
    return null;
  }

  return { slug: snapped.slug, evidenceBand };
}

/** Comarca slugs in the same macro zone within {@link FOCUS_NEIGHBORHOOD_RADIUS} of the focus. */
export function focusNeighborhoodSlugs(
  focusSlug: string,
  zone: DialectZone,
  radius = FOCUS_NEIGHBORHOOD_RADIUS,
): string[] {
  const focus = COMARCA_MAP_META.find((entry) => entry.slug === focusSlug);
  if (!focus || focus.macroDialect !== zone) {
    return [];
  }
  const origin = comarcaCoords(focus);
  return COMARCA_MAP_META.filter((entry) => {
    if (entry.macroDialect !== zone || entry.slug === focusSlug) {
      return false;
    }
    const coords = comarcaCoords(entry);
    return Math.hypot(coords.x - origin.x, coords.y - origin.y) <= radius;
  }).map((entry) => entry.slug);
}
