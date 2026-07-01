import { useEffect, useMemo, useState } from "react";
import {
  DIALECT_ZONE_LABELS,
  DIALECT_ZONES,
  type AccentScores,
} from "../lib/accentOracleClient";
import {
  buildComarcaHeatFills,
  dialectZoneFill,
  type ComarcaHeatEntry,
} from "../lib/buildComarcaHeat";

interface GeographicDialectHeatmapProps {
  scores: AccentScores;
}

const MAP_URL = `${import.meta.env.BASE_URL}map-paisos-catalans.svg`;

function applyHeatToSvg(svgText: string, heat: ComarcaHeatEntry[]): string {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const labels = doc.getElementById("map-labels");
  if (labels) {
    labels.setAttribute("display", "none");
  }

  for (const { comarca, fill } of heat) {
    if (!fill) {
      continue;
    }
    const region = doc.getElementById(comarca.id);
    if (region instanceof SVGElement) {
      region.style.setProperty("fill", fill);
    }
  }

  const svg = doc.documentElement;
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Mapa de similitud de les àrees de parla catalana");
  svg.classList.add("geographic-map");
  return new XMLSerializer().serializeToString(svg);
}

export function GeographicDialectHeatmap({ scores }: GeographicDialectHeatmapProps) {
  const [svgTemplate, setSvgTemplate] = useState<string | null>(null);
  const comarcaHeat = useMemo(() => buildComarcaHeatFills(scores), [scores]);
  const rankedZones = [...DIALECT_ZONES].sort((a, b) => scores[b] - scores[a]);
  const [topZone, ...otherZones] = rankedZones;

  useEffect(() => {
    let cancelled = false;
    fetch(MAP_URL)
      .then((response) => response.text())
      .then((text) => {
        if (!cancelled) {
          setSvgTemplate(text);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const coloredSvg = useMemo(() => {
    if (!svgTemplate) {
      return null;
    }
    return applyHeatToSvg(svgTemplate, comarcaHeat);
  }, [svgTemplate, comarcaHeat]);

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
                <span
                  className="legend-swatch"
                  style={{ background: dialectZoneFill(zone, scores) }}
                />
                <span>{DIALECT_ZONE_LABELS[zone]}</span>
                <strong>{Math.round(scores[zone] * 100)}%</strong>
              </div>
            ))}
          </div>
        </div>

        <div
          className="geographic-map-stack"
          dangerouslySetInnerHTML={coloredSvg ? { __html: coloredSvg } : undefined}
        />
      </div>
    </section>
  );
}
