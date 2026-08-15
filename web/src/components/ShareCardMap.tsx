import { useEffect, useRef, useState } from "react";
import type { DialectZone } from "../lib/accentOracleClient";
import { COMARCA_MAP_META } from "../lib/comarcaMapMeta";
import { loadOracleMap, type ParsedOracleMap } from "../lib/parseOracleMap";

const ZONE_BY_SLUG = new Map(
  COMARCA_MAP_META.map((entry) => [entry.slug, entry.macroDialect]),
);

let shareMapPromise: Promise<ParsedOracleMap> | null = null;

function loadShareMap(): Promise<ParsedOracleMap> {
  shareMapPromise ??= loadOracleMap();
  return shareMapPromise;
}

const MAP_PAINT = {
  light: {
    restFill: "#d5e6ef",
    restStroke: "#ffffff",
    hotFill: "#257cac",
    hotStroke: "#164e6f",
    sea: "#eef4f8",
  },
  dark: {
    restFill: "#1e3544",
    restStroke: "#0f1a22",
    hotFill: "#4ca7d9",
    hotStroke: "#edf3f7",
    sea: "#12202a",
  },
} as const;

interface ShareCardMapProps {
  zone: DialectZone;
  theme: "light" | "dark";
  onReady?: () => void;
}

export function ShareCardMap({ zone, theme, onReady }: ShareCardMapProps) {
  const onReadyRef = useRef(onReady);
  const [map, setMap] = useState<ParsedOracleMap | null | undefined>(undefined);
  const paint = MAP_PAINT[theme];

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    let cancelled = false;
    loadShareMap()
      .then((parsed) => {
        if (!cancelled) {
          setMap(parsed.comarques.length > 0 ? parsed : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMap(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (map === undefined) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        onReadyRef.current?.();
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [map]);

  if (map === null) {
    return null;
  }

  const ordered = map
    ? [...map.comarques].sort((a, b) => {
        const aHot = ZONE_BY_SLUG.get(a.slug) === zone ? 1 : 0;
        const bHot = ZONE_BY_SLUG.get(b.slug) === zone ? 1 : 0;
        return aHot - bHot;
      })
    : [];

  return (
    <div
      className="share-card-map"
      style={{ background: paint.sea }}
      aria-hidden="true"
    >
      {map ? (
        <svg
          viewBox={map.viewBox}
          xmlns="http://www.w3.org/2000/svg"
          role="presentation"
        >
          {ordered.map((comarca) => {
            const hot = ZONE_BY_SLUG.get(comarca.slug) === zone;
            return (
              <g key={comarca.id} transform={comarca.transform}>
                {comarca.parts.map((part, index) => (
                  <path
                    key={`${comarca.id}-${index}`}
                    d={part.d}
                    fill={hot ? paint.hotFill : paint.restFill}
                    stroke={hot ? paint.hotStroke : paint.restStroke}
                    strokeWidth={hot ? 8 : 5.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
