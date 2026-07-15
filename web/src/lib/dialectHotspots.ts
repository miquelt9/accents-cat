import type { DialectZone } from "./accentOracleClient";
import { COMARCA_MAP_META, type ComarcaMapEntry } from "./comarcaMapMeta";

/** Representative comarca slug for each macro-dialect (map focus / pin). */
export const HOTSPOT_SLUG_BY_DIALECT: Record<DialectZone, string> = {
  central: "barcelones",
  northwestern: "osona",
  northern: "catalunya-nord",
  valencian: "valencia",
  balearic: "mallorca",
};

export function hotspotComarcaForZone(zone: DialectZone): ComarcaMapEntry | undefined {
  const slug = HOTSPOT_SLUG_BY_DIALECT[zone];
  return (
    COMARCA_MAP_META.find((entry) => entry.slug === slug) ??
    COMARCA_MAP_META.find((entry) => entry.macroDialect === zone)
  );
}

export function hotspotSlugForZone(zone: DialectZone): string {
  return hotspotComarcaForZone(zone)?.slug ?? HOTSPOT_SLUG_BY_DIALECT[zone];
}
