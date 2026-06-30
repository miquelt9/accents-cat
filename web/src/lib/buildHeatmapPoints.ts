import type { AccentScores, RegionalHeatPoint } from "./accentOracleClient";
import { DIALECT_ZONES } from "./accentOracleClient";
import { DIALECT_GEO_ANCHORS } from "./dialectGeoAnchors";

export interface DialectHeatPoint extends RegionalHeatPoint {
  source: "macro" | "regional";
}

function clampWeight(weight: number): number {
  return Math.max(0, Math.min(1, weight));
}

function getZoneStrengths(scores: AccentScores) {
  const rankedZones = [...DIALECT_ZONES].sort((a, b) => scores[b] - scores[a]);
  const topZone = rankedZones[0];
  const secondZone = rankedZones[1];
  const topScore = scores[topZone];
  const secondScore = scores[secondZone];
  const topTwoGap = topScore - secondScore;
  const closeness = clampWeight((0.09 - topTwoGap) / 0.09);

  return {
    topZone,
    secondZone,
    topWeight: clampWeight(0.52 + topScore * 0.58),
    secondWeight: closeness > 0.08 ? clampWeight(0.08 + closeness * 0.16) : 0,
    regionalWeight: clampWeight(0.7 + closeness * 0.18),
  };
}

export function buildDialectHeatPoints(
  scores: AccentScores,
  regionalHeatPoints: RegionalHeatPoint[] = [],
): DialectHeatPoint[] {
  const { topZone, secondZone, topWeight, secondWeight, regionalWeight } = getZoneStrengths(scores);

  const macroPoints = DIALECT_GEO_ANCHORS.map((anchor) => ({
    lat: anchor.lat,
    lng: anchor.lng,
    weight:
      anchor.dialect === topZone
        ? clampWeight(anchor.share * topWeight * 1.9)
        : anchor.dialect === secondZone
          ? clampWeight(anchor.share * secondWeight * 1.4)
          : 0,
    label: anchor.label,
    source: "macro" as const,
  })).filter((point) => point.weight > 0.035);

  const regionalPoints = regionalHeatPoints.map((point) => ({
    ...point,
    weight: clampWeight(point.weight * regionalWeight),
    source: "regional" as const,
  })).filter((point) => point.weight > 0.12);

  return [...macroPoints, ...regionalPoints];
}
