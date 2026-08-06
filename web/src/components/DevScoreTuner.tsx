import {
  DIALECT_ZONE_LABELS,
  DIALECT_ZONES,
  normalizeScores,
  type AccentScores,
  type DialectZone,
} from "../lib/accentOracleClient";

interface DevScoreTunerProps {
  scores: AccentScores;
  onChange: (scores: AccentScores) => void;
  onReset?: () => void;
}

type Preset = { id: string; label: string; weights: AccentScores };

const PRESETS: Preset[] = [
  {
    id: "central",
    label: "Central",
    weights: { balearic: 8, central: 55, northern: 12, northwestern: 13, valencian: 12 },
  },
  {
    id: "valencian",
    label: "Valencià",
    weights: { balearic: 7, central: 11, northern: 10, northwestern: 12, valencian: 60 },
  },
  {
    id: "balearic",
    label: "Balear",
    weights: { balearic: 58, central: 12, northern: 10, northwestern: 10, valencian: 10 },
  },
  {
    id: "ambiguous",
    label: "Ambigu",
    weights: { balearic: 10, central: 38, northern: 32, northwestern: 10, valencian: 10 },
  },
  {
    id: "central-valencian",
    label: "Cent./Val.",
    weights: { balearic: 10, central: 28, northern: 10, northwestern: 12, valencian: 40 },
  },
  {
    id: "nw-valencian",
    label: "N.-occ./Val.",
    weights: { balearic: 5, central: 10, northern: 5, northwestern: 48, valencian: 32 },
  },
  {
    id: "northwestern",
    label: "N.-occ.",
    weights: { balearic: 8, central: 12, northern: 14, northwestern: 54, valencian: 12 },
  },
  {
    id: "nord-valencian",
    label: "Nord/Val.",
    weights: { balearic: 5, central: 8, northern: 52, northwestern: 5, valencian: 30 },
  },
];

function applySliderChange(current: AccentScores, zone: DialectZone, nextPct: number): AccentScores {
  const target = Math.min(100, Math.max(0, nextPct)) / 100;
  const old = current[zone];
  const othersTotal = 1 - old;

  const next: AccentScores = { ...current };
  next[zone] = target;

  if (othersTotal <= 1e-6) {
    const others = DIALECT_ZONES.filter((z) => z !== zone);
    const share = others.length ? (1 - target) / others.length : 0;
    for (const z of others) {
      next[z] = share;
    }
  } else {
    const scale = (1 - target) / othersTotal;
    for (const z of DIALECT_ZONES) {
      if (z !== zone) {
        next[z] = current[z] * scale;
      }
    }
  }

  return normalizeScores(next);
}

function weightsToScores(weights: AccentScores): AccentScores {
  return normalizeScores(weights);
}

export function DevScoreTuner({ scores, onChange, onReset }: DevScoreTunerProps) {
  const sumPct = DIALECT_ZONES.reduce((sum, z) => sum + Math.round(scores[z] * 100), 0);

  return (
    <section className="dev-scores-panel" aria-label="Dev: ajust de percentatges">
      <div className="dev-scores-header">
        <span className="dev-tools-label">Dev scores</span>
        <span className="dev-scores-sum" aria-live="polite">
          Σ {sumPct}%
        </span>
        {onReset && (
          <button className="dev-scores-reset" onClick={onReset} type="button">
            Restaura
          </button>
        )}
      </div>

      <div className="dev-scores-presets" role="group" aria-label="Presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            className="dev-scores-preset"
            onClick={() => onChange(weightsToScores(preset.weights))}
            type="button"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <ul className="dev-scores-sliders">
        {DIALECT_ZONES.map((zone) => {
          const pct = Math.round(scores[zone] * 100);
          return (
            <li key={zone} className="dev-scores-row">
              <label className="dev-scores-label" htmlFor={`dev-score-${zone}`}>
                {DIALECT_ZONE_LABELS[zone]}
              </label>
              <input
                className="dev-scores-range"
                id={`dev-score-${zone}`}
                max={100}
                min={0}
                onChange={(event) => onChange(applySliderChange(scores, zone, Number(event.target.value)))}
                type="range"
                value={pct}
              />
              <input
                aria-label={`${DIALECT_ZONE_LABELS[zone]} percentatge`}
                className="dev-scores-number"
                max={100}
                min={0}
                onChange={(event) => {
                  const raw = Number(event.target.value);
                  if (Number.isFinite(raw)) {
                    onChange(applySliderChange(scores, zone, raw));
                  }
                }}
                type="number"
                value={pct}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
