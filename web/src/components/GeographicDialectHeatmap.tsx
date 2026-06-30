import {
  DIALECT_ZONE_LABELS,
  DIALECT_ZONES,
  type AccentScores,
  type RegionalHeatPoint,
} from "../lib/accentOracleClient";
import { buildDialectHeatPoints, type DialectHeatPoint } from "../lib/buildHeatmapPoints";

interface GeographicDialectHeatmapProps {
  scores: AccentScores;
  regionalHeatPoints?: RegionalHeatPoint[];
}

const MAP_BOUNDS = {
  north: 43.2,
  south: 38.05,
  west: -1.35,
  east: 4.45,
};

const HEAT_CLIP_PATHS = [
  "M964 183 L1124 246 L1360 176 L1516 247 L1696 247 L1888 168 L2056 272 L2012 488 L2148 548 L2116 840 L2000 1088 L1772 1348 L1516 1556 L1264 1676 L1008 1668 L848 1560 L716 1328 L660 1104 L548 900 L624 680 L832 528 L920 356 Z",
  "M832 528 L660 760 L576 1020 L480 1288 L368 1552 L232 1860 L120 1968 L72 2160 L148 2308 L272 2288 L336 2448 L376 2732 L460 2840 L604 2852 L540 2628 L604 2400 L736 2204 L856 2028 L916 1804 L1008 1668 L848 1560 L716 1328 L660 1104 L548 900 L624 680 Z",
  "M1008 1668 L1264 1676 L1516 1556 L1772 1348 L2000 1088 L2116 840 L2148 548 L2248 900 L2212 1248 L2056 1644 L1908 1972 L1684 2188 L1456 2132 L1340 1844 Z",
  "M1876 1804 C2024 1636 2256 1696 2356 1864 C2324 2068 2072 2116 1908 1988 C1856 1948 1836 1876 1876 1804 Z",
  "M2248 1684 C2356 1648 2468 1676 2532 1744 C2468 1856 2324 1856 2240 1788 C2216 1752 2220 1712 2248 1684 Z",
  "M1324 2128 C1412 2056 1536 2064 1608 2148 C1576 2260 1420 2300 1328 2228 C1292 2196 1292 2160 1324 2128 Z",
  "M2212 852 L2604 848 L2604 1492 L2180 1484 Z",
  "M156 1668 L276 1612 L352 1668 L272 1736 L148 1736 Z",
];

function projectPoint(point: DialectHeatPoint) {
  const x = ((point.lng - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * 2660;
  const y = ((MAP_BOUNDS.north - point.lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * 3016;

  return { x, y };
}

function heatColor(weight: number): string {
  if (weight > 0.44) {
    return "rgba(208, 72, 48, 0.54)";
  }

  if (weight > 0.2) {
    return "rgba(234, 174, 77, 0.32)";
  }

  return "rgba(134, 194, 99, 0.18)";
}

function scoreToFill(score: number): string {
  const clamped = Math.max(0, Math.min(1, score));
  const lightness = 93 - clamped * 43;
  const saturation = 34 + clamped * 46;
  return `hsl(204 ${saturation}% ${lightness}%)`;
}

export function GeographicDialectHeatmap({
  scores,
  regionalHeatPoints,
}: GeographicDialectHeatmapProps) {
  const heatPoints = buildDialectHeatPoints(scores, regionalHeatPoints);
  const rankedZones = [...DIALECT_ZONES].sort((a, b) => scores[b] - scores[a]);
  const [topZone, ...otherZones] = rankedZones;

  return (
    <section className="card heatmap-card" aria-label="Resultat del mapa de similitud">
      <div className="heatmap-layout geographic-heatmap-layout">
        <div className="results-ranking" aria-label="Percentatges per accent">
          <article className="top-result-card">
            <span className="top-result-label">Coincidència principal</span>
            <strong>{DIALECT_ZONE_LABELS[topZone]}</strong>
            <span className="top-result-score">{Math.round(scores[topZone] * 100)}%</span>
          </article>

          <div className="legend">
            {otherZones.map((zone) => (
              <div className="legend-row" key={zone}>
                <span className="legend-swatch" style={{ background: scoreToFill(scores[zone]) }} />
                <span>{DIALECT_ZONE_LABELS[zone]}</span>
                <strong>{Math.round(scores[zone] * 100)}%</strong>
              </div>
            ))}
          </div>
        </div>

        <svg
          aria-labelledby="geo-map-title geo-map-desc"
          className="geographic-map"
          role="img"
          viewBox="0 0 2660 3016"
        >
          <title id="geo-map-title">Mapa de similitud de les àrees de parla catalana</title>
          <desc id="geo-map-desc">
            Mapa de similitud dialectal amb la calor restringida a les zones terrestres.
          </desc>

          <defs>
            <filter id="heat-blur" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="62" />
            </filter>
            <clipPath id="heat-land-clip">
              {HEAT_CLIP_PATHS.map((path) => (
                <path d={path} key={path} />
              ))}
            </clipPath>
            <mask id="heat-land-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="2660" height="3016">
              <rect fill="black" height="3016" width="2660" x="0" y="0" />
              {HEAT_CLIP_PATHS.map((path) => (
                <path d={path} fill="white" key={`mask-${path}`} />
              ))}
            </mask>
          </defs>

          <image
            className="geo-reference-map"
            height="3016"
            href="/catalan-speaking-regions.svg"
            preserveAspectRatio="xMidYMid meet"
            width="2660"
          />

          <g clipPath="url(#heat-land-clip)" mask="url(#heat-land-mask)">
            <g className="heat-layer" filter="url(#heat-blur)">
              {heatPoints.map((point) => {
                const { x, y } = projectPoint(point);
                const radius = point.source === "regional" ? 170 : 220;

                return (
                  <circle
                    aria-label={`${point.label ?? "Heat point"} ${Math.round(point.weight * 100)} percent`}
                    cx={x}
                    cy={y}
                    fill={heatColor(point.weight)}
                    key={`${point.source}-${point.label ?? "point"}-${point.lat}-${point.lng}`}
                    r={radius * (0.4 + point.weight * 0.72)}
                  />
                );
              })}
            </g>
          </g>

          <g className="heat-core-layer" clipPath="url(#heat-land-clip)" mask="url(#heat-land-mask)">
            {heatPoints
              .filter((point) => point.weight > 0.28)
              .map((point) => {
                const { x, y } = projectPoint(point);
                return (
                  <circle
                    className="heat-core"
                    cx={x}
                    cy={y}
                    fill={heatColor(point.weight)}
                    key={`core-${point.source}-${point.label ?? "point"}-${point.lat}-${point.lng}`}
                    r={22 + point.weight * 30}
                  />
                );
              })}
          </g>
        </svg>
      </div>
    </section>
  );
}
