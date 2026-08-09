import { useEffect, useMemo, useRef, useState } from "react";
import {
  DIALECT_ZONE_LABELS,
  DIALECT_ZONES,
  type AccentScores,
  type DialectZone,
} from "../lib/accentOracleClient";
import {
  focusNeighborhoodSlugs,
  resolveFocusComarca,
} from "../lib/dialectFocusComarca";
import { zoneForComarcaSlug } from "../lib/dialectRegions";
import { accordionEase } from "../lib/mapMotion";
import { displayedFocusComarcaSlug } from "../lib/resultsMapFocus";
import { DialectMap } from "./map/DialectMap";

interface ResultsMapStageProps {
  scores: AccentScores;
  unresolved?: boolean;
}

export function ResultsMapStage({
  scores,
  unresolved = false,
}: ResultsMapStageProps) {
  const rankedZones = useMemo(
    () => [...DIALECT_ZONES].sort((a, b) => scores[b] - scores[a]),
    [scores],
  );
  const topZone = rankedZones[0];
  const [selectedZone, setSelectedZone] = useState<DialectZone>(topZone);
  const [inspectedComarca, setInspectedComarca] = useState<string | null>(null);
  const prevTopZoneRef = useRef(topZone);

  useEffect(() => {
    if (prevTopZoneRef.current !== topZone && selectedZone === prevTopZoneRef.current) {
      setSelectedZone(topZone);
      setInspectedComarca(null);
    }
    prevTopZoneRef.current = topZone;
  }, [topZone, selectedZone]);

  /** One illustrative comarca guess for the overall result — not recomputed per sidebar accent. */
  const comarcaGuess = useMemo(
    () => resolveFocusComarca(scores, topZone),
    [scores, topZone],
  );

  const showingGuess = selectedZone === topZone && !inspectedComarca;
  const pinComarca = displayedFocusComarcaSlug(
    selectedZone,
    topZone,
    inspectedComarca,
    comarcaGuess?.slug,
  );

  const nearFocusSlugs = useMemo(() => {
    if (!showingGuess || !comarcaGuess) {
      return [];
    }
    return focusNeighborhoodSlugs(comarcaGuess.slug, topZone);
  }, [showingGuess, comarcaGuess, topZone]);

  function selectZone(zone: DialectZone) {
    setSelectedZone(zone);
    setInspectedComarca(null);
  }

  function onMapSelect(slug: string) {
    if (!slug) {
      return;
    }
    const zone = zoneForComarcaSlug(slug);
    if (!zone) {
      return;
    }
    if (zone !== selectedZone) {
      setSelectedZone(zone);
      setInspectedComarca(slug);
      return;
    }
    // Toggle inspect; on the top accent, clearing returns to the comarca guess.
    setInspectedComarca((prev) => (prev === slug ? null : slug));
  }

  return (
    <section
      className={`card heatmap-card results-map-stage${unresolved ? " is-unresolved" : ""}`}
      aria-label="Resultat del mapa de similitud"
    >
      <div className="heatmap-layout geographic-heatmap-layout results-map-layout">
        <div className="results-ranking" aria-label="Percentatges per accent">
          <article className="top-result-card">
            <span className="top-result-label">
              {unresolved ? "Zona amb més similitud" : "Coincidència principal"}
            </span>
            <strong>{DIALECT_ZONE_LABELS[topZone]}</strong>
            <span className="top-result-score">{Math.round(scores[topZone] * 100)}%</span>
          </article>

          <div className="dialect-rank-list" role="list">
            {rankedZones.map((zone) => {
              const pct = Math.round(scores[zone] * 100);
              const isActive = zone === selectedZone;
              return (
                <div
                  key={zone}
                  className={`dialect-rank-item${isActive ? " is-active" : ""}`}
                  role="listitem"
                >
                  <button
                    type="button"
                    className="dialect-rank-button"
                    aria-pressed={isActive}
                    onClick={() => selectZone(zone)}
                  >
                    <span className="dialect-rank-name">{DIALECT_ZONE_LABELS[zone]}</span>
                    <span className="dialect-rank-pct">{pct}%</span>
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
                </div>
              );
            })}
          </div>
        </div>

        <DialectMap
          selectedZone={selectedZone}
          pinComarca={pinComarca}
          nearFocusSlugs={nearFocusSlugs}
          onSelect={onMapSelect}
          playEntrance
        />
      </div>
    </section>
  );
}
