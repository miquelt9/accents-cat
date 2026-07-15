import type { AccentScores, DialectZone } from "./accentOracleClient";
import { DIALECT_ZONES } from "./accentOracleClient";
import { COMARCA_MAP_META, type ComarcaMapEntry } from "./comarcaMapMeta";
import { hotspotComarcaForZone } from "./dialectHotspots";

export interface ComarcaHeatEntry {
  comarca: ComarcaMapEntry;
  fill: string | null;
}

interface MapPoint {
  x: number;
  y: number;
}

/** When central pairs with one of these in the top two, blend their anchor points. */
const CENTRAL_BLEND_PARTNERS = new Set<DialectZone>([
  "northern",
  "northwestern",
  "valencian",
]);

const DIALECT_HUE: Record<DialectZone, number> = {
  central: 6,
  valencian: 32,
  northwestern: 52,
  northern: 78,
  balearic: 118,
};

const HOTSPOT_COORD_OVERRIDE: Partial<Record<string, { x: number; y: number }>> = {
  valencia: { x: 367, y: 685 },
};

const MAINLAND_MACROS = new Set<DialectZone>(["central", "northwestern", "northern"]);

/** Map units: winner core around its hotspot. */
const CORE_RADIUS = 64;
/** Map units: mainland spillover ring from the winner hotspot. */
const SPILLOVER_RADIUS = 118;
/** Map units: subtle runner-up halo on its own territory only. */
const RUNNER_UP_RADIUS = 76;
/** Minimum score for central/winner hotspot blending with the runner-up. */
const RUNNER_UP_BLEND_MIN_SCORE = 0.12;
/** Runner-up halo only when the model is clearly torn between two dialects. */
const RUNNER_UP_HALO_MIN_SCORE = 0.2;
const RUNNER_UP_HALO_MIN_WINNER_RATIO = 0.55;

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

function isCentralBlendPair(first: DialectZone, second: DialectZone): boolean {
  if (first === "central" && CENTRAL_BLEND_PARTNERS.has(second)) {
    return true;
  }
  return second === "central" && CENTRAL_BLEND_PARTNERS.has(first);
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

function resolveWinnerHotspot(
  winnerZone: DialectZone,
  runnerUpZone: DialectZone,
  scores: AccentScores,
): MapPoint | undefined {
  if (
    scores[runnerUpZone] >= RUNNER_UP_BLEND_MIN_SCORE &&
    isCentralBlendPair(winnerZone, runnerUpZone)
  ) {
    return blendAnchorPoints(winnerZone, runnerUpZone, scores);
  }
  return zoneAnchorPoint(winnerZone);
}

function shouldPaintRunnerUpHalo(
  scores: AccentScores,
  winnerZone: DialectZone,
  runnerUpZone: DialectZone,
): boolean {
  const runnerScore = scores[runnerUpZone];
  return (
    runnerScore >= RUNNER_UP_HALO_MIN_SCORE &&
    runnerScore >= scores[winnerZone] * RUNNER_UP_HALO_MIN_WINNER_RATIO
  );
}

function distanceToPoint(comarca: ComarcaMapEntry, point: MapPoint): number {
  const origin = comarcaCoords(comarca);
  return Math.hypot(origin.x - point.x, origin.y - point.y);
}

function belongsToWinnerTerritory(comarca: ComarcaMapEntry, winnerZone: DialectZone): boolean {
  if (winnerZone === "balearic") {
    return comarca.macroDialect === "balearic";
  }
  if (winnerZone === "valencian") {
    return comarca.macroDialect === "valencian";
  }
  return MAINLAND_MACROS.has(comarca.macroDialect);
}

function heatToFill(heat: number, hue: number, subtle = false): string {
  const clamped = Math.max(0, Math.min(1, heat));
  const saturation = subtle ? 20 + clamped * 22 : 40 + clamped * 46;
  const lightness = subtle ? 88 - clamped * 10 : 84 - clamped * 32;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function dialectZoneFill(zone: DialectZone, scores: AccentScores): string {
  const ranked = [...DIALECT_ZONES].sort((a, b) => scores[b] - scores[a]);
  const rank = ranked.indexOf(zone);
  const rankBoost = rank === 0 ? 1 : rank === 1 ? 0.72 : rank === 2 ? 0.48 : 0.28;
  return heatToFill(scores[zone] * rankBoost, DIALECT_HUE[zone]);
}

function winnerCoreFill(
  comarca: ComarcaMapEntry,
  winnerZone: DialectZone,
  hotspot: MapPoint,
): string | null {
  const distance = distanceToPoint(comarca, hotspot);
  if (comarca.macroDialect !== winnerZone || distance > CORE_RADIUS) {
    return null;
  }

  const coreBlend = 1 - distance / CORE_RADIUS;

  if (winnerZone === "balearic") {
    const heat = 0.22 + Math.max(0, coreBlend) * 0.28;
    return heatToFill(heat, 116, true);
  }

  const heat = 0.62 + Math.max(0, coreBlend) * 0.38;
  const hue = 8 + (1 - Math.max(0, coreBlend)) * 18;
  return heatToFill(heat, hue);
}

function winnerSpilloverFill(
  comarca: ComarcaMapEntry,
  winnerZone: DialectZone,
  hotspot: MapPoint,
): string | null {
  const distance = distanceToPoint(comarca, hotspot);
  if (distance <= CORE_RADIUS || distance > SPILLOVER_RADIUS) {
    return null;
  }
  if (!belongsToWinnerTerritory(comarca, winnerZone)) {
    return null;
  }

  const spillT = (distance - CORE_RADIUS) / (SPILLOVER_RADIUS - CORE_RADIUS);

  if (winnerZone === "balearic") {
    const heat = (1 - spillT) * 0.18;
    return heat < 0.04 ? null : heatToFill(heat, 112 + spillT * 12, true);
  }

  const heat = (1 - spillT) * 0.5 + 0.1;
  const hue = 28 + spillT * 72;
  return heatToFill(heat, hue);
}

function runnerUpFill(
  comarca: ComarcaMapEntry,
  runnerUpZone: DialectZone,
  hotspot: MapPoint,
  score: number,
): string | null {
  if (comarca.macroDialect !== runnerUpZone) {
    return null;
  }

  const distance = distanceToPoint(comarca, hotspot);
  if (distance > RUNNER_UP_RADIUS) {
    return null;
  }

  const blend = 1 - distance / RUNNER_UP_RADIUS;
  const heat = score * (0.18 + blend * 0.22);
  if (heat < 0.03) {
    return null;
  }

  return heatToFill(heat, DIALECT_HUE[runnerUpZone], runnerUpZone === "balearic");
}

export function buildComarcaHeatFills(scores: AccentScores): ComarcaHeatEntry[] {
  const ranked = [...DIALECT_ZONES].sort((a, b) => scores[b] - scores[a]);
  const [winnerZone, runnerUpZone] = ranked;

  const winnerHotspot = resolveWinnerHotspot(winnerZone, runnerUpZone, scores);
  const runnerUpHotspot = shouldPaintRunnerUpHalo(scores, winnerZone, runnerUpZone)
    ? zoneAnchorPoint(runnerUpZone)
    : undefined;

  if (!winnerHotspot) {
    return COMARCA_MAP_META.map((comarca) => ({ comarca, fill: null }));
  }

  return COMARCA_MAP_META.map((comarca) => {
    const fill =
      winnerCoreFill(comarca, winnerZone, winnerHotspot) ??
      winnerSpilloverFill(comarca, winnerZone, winnerHotspot) ??
      (runnerUpHotspot
        ? runnerUpFill(comarca, runnerUpZone, runnerUpHotspot, scores[runnerUpZone])
        : null);

    return { comarca, fill };
  });
}
