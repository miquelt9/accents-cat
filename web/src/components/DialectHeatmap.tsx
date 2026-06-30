import {
  DIALECT_ZONE_LABELS,
  DIALECT_ZONES,
  type AccentScores,
  type DialectZone,
} from "../lib/accentOracleClient";

interface DialectHeatmapProps {
  scores: AccentScores;
  topLabel: DialectZone;
}

const ZONE_PATHS: Record<DialectZone, string> = {
  northwestern: "M78 104 L163 82 L212 130 L178 204 L94 190 Z",
  northern: "M205 76 L293 89 L333 145 L281 191 L212 130 Z",
  central: "M184 206 L282 190 L333 247 L284 331 L195 302 Z",
  valencian: "M195 306 L279 336 L250 432 L173 466 L139 381 Z",
  balearic: "M402 283 C422 265 454 271 465 294 C449 319 417 319 402 283 Z M475 348 C491 337 515 343 522 361 C509 377 483 374 475 348 Z",
};

function scoreToFill(score: number): string {
  const clamped = Math.max(0, Math.min(1, score));
  const lightness = 93 - clamped * 43;
  const saturation = 34 + clamped * 46;
  return `hsl(204 ${saturation}% ${lightness}%)`;
}

export function DialectHeatmap({ scores, topLabel }: DialectHeatmapProps) {
  return (
    <section className="card heatmap-card" aria-labelledby="heatmap-title">
      <div className="section-heading">
        <p className="eyebrow">Macro-zone similarity</p>
        <h2 id="heatmap-title">Schematic heatmap</h2>
        <p>
          Stylized regions show calibrated probability-like scores. They are not a map of where
          someone is from.
        </p>
      </div>

      <div className="heatmap-layout">
        <svg className="dialect-map" viewBox="0 0 560 520" role="img" aria-labelledby="map-title map-desc">
          <title id="map-title">Catalan macro-dialect similarity heatmap</title>
          <desc id="map-desc">Five schematic regions colored by the mock similarity score.</desc>
          <rect className="map-sea" x="0" y="0" width="560" height="520" rx="28" />
          <path className="coastline" d="M76 105 L291 75 L336 143 L283 190 L333 248 L282 333 L250 431 L172 468 L139 382 L93 190 Z" />
          {DIALECT_ZONES.map((zone) => (
            <path
              aria-label={`${DIALECT_ZONE_LABELS[zone]} ${Math.round(scores[zone] * 100)} percent`}
              className={zone === topLabel ? "zone top-zone" : "zone"}
              d={ZONE_PATHS[zone]}
              fill={scoreToFill(scores[zone])}
              key={zone}
            />
          ))}
          <text className="map-label" x="97" y="147">NW</text>
          <text className="map-label" x="249" y="135">N</text>
          <text className="map-label" x="244" y="260">C</text>
          <text className="map-label" x="194" y="396">V</text>
          <text className="map-label" x="432" y="306">B</text>
        </svg>

        <div className="legend">
          {DIALECT_ZONES.map((zone) => (
            <div className="legend-row" key={zone}>
              <span className="legend-swatch" style={{ background: scoreToFill(scores[zone]) }} />
              <span>{DIALECT_ZONE_LABELS[zone]}</span>
              <strong>{Math.round(scores[zone] * 100)}%</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
