import { useMemo, useState } from "react";
import {
  DIALECT_ZONE_LABELS,
  DIALECT_ZONES,
  type AccentScores,
  type DialectZone,
} from "../lib/accentOracleClient";
import { COMARCA_MAP_META } from "../lib/comarcaMapMeta";
import { hotspotSlugForZone } from "../lib/dialectHotspots";
import { accordionEase } from "../lib/mapMotion";
import { DialectMap } from "./map/DialectMap";

interface ResultsMapStageProps {
  scores: AccentScores;
}

function zoneForComarcaSlug(slug: string): DialectZone | null {
  const meta = COMARCA_MAP_META.find((entry) => entry.slug === slug);
  return meta?.macroDialect ?? null;
}

export function ResultsMapStage({ scores }: ResultsMapStageProps) {
  const rankedZones = useMemo(
    () => [...DIALECT_ZONES].sort((a, b) => scores[b] - scores[a]),
    [scores],
  );
  const topZone = rankedZones[0];
  const [selectedZone, setSelectedZone] = useState<DialectZone>(topZone);
  const [selectedComarca, setSelectedComarca] = useState(() => hotspotSlugForZone(topZone));
  const [expandedZone, setExpandedZone] = useState<DialectZone | null>(topZone);

  const confidence = scores[selectedZone];

  function selectZone(zone: DialectZone) {
    setSelectedZone(zone);
    setSelectedComarca(hotspotSlugForZone(zone));
    setExpandedZone(zone);
  }

  function onMapSelect(slug: string) {
    if (!slug) {
      return;
    }
    setSelectedComarca(slug);
    const zone = zoneForComarcaSlug(slug);
    if (zone) {
      setSelectedZone(zone);
      setExpandedZone(zone);
    }
  }

  return (
    <section className="card heatmap-card results-map-stage" aria-label="Resultat del mapa de similitud">
      <div className="heatmap-layout geographic-heatmap-layout results-map-layout">
        <div className="results-ranking" aria-label="Percentatges per accent">
          <article className="top-result-card">
            <span className="top-result-label">Coincidència principal</span>
            <strong>{DIALECT_ZONE_LABELS[topZone]}</strong>
            <span className="top-result-score">{Math.round(scores[topZone] * 100)}%</span>
          </article>

          <div className="dialect-rank-list" role="list">
            {rankedZones.map((zone) => {
              const pct = Math.round(scores[zone] * 100);
              const isActive = zone === selectedZone;
              const isExpanded = zone === expandedZone;
              return (
                <div
                  key={zone}
                  className={`dialect-rank-item${isActive ? " is-active" : ""}`}
                  role="listitem"
                >
                  <button
                    type="button"
                    className="dialect-rank-button"
                    aria-expanded={isExpanded}
                    onClick={() => {
                      if (isExpanded && isActive) {
                        setExpandedZone(null);
                      } else {
                        selectZone(zone);
                      }
                    }}
                  >
                    <span className="dialect-rank-name">{DIALECT_ZONE_LABELS[zone]}</span>
                    <span className="dialect-rank-pct">{pct}%</span>
                    <span className={`dialect-rank-chevron${isExpanded ? " is-open" : ""}`} aria-hidden>
                      ▾
                    </span>
                  </button>
                  <div className="dialect-rank-bar-track" aria-hidden>
                    <div
                      className="dialect-rank-bar-fill"
                      style={{
                        width: `${pct}%`,
                        transition: `width 190ms cubic-bezier(${accordionEase.join(",")})`,
                      }}
                    />
                  </div>
                  <div
                    className={`dialect-rank-detail${isExpanded ? " is-open" : ""}`}
                    style={{
                      transition: `grid-template-rows 190ms cubic-bezier(${accordionEase.join(",")})`,
                    }}
                  >
                    <div className="dialect-rank-detail-inner">
                      <p>
                        El mapa mostra la comarca representativa d&apos;aquest accent.
                        {isActive ? " Seleccionat al mapa." : " Fes clic per enfocar-la."}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialectMap
          selectedComarca={selectedComarca}
          confidence={confidence}
          onSelect={onMapSelect}
          playEntrance
        />
      </div>
    </section>
  );
}
