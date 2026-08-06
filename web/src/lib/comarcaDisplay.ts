import {
  DIALECT_ZONE_LABELS,
  type DialectZone,
  type SelfReportedDialect,
} from "./accentOracleClient";
import { COMARCA_MAP_META, type ComarcaMapEntry } from "./comarcaMapMeta";

export interface Comarca {
  id: string;
  displayName: string;
  dialect: string;
  confidence?: number;
}

/** Definite article used in running Catalan text for selected comarques. */
export type ComarcaDefiniteArticle = "el" | "la" | "l'" | "les";

/**
 * Comarques that take a definite article in running text.
 * Only these accept that article as a searchable prefix (e.g. "La Selva", not "La Bages").
 */
export const COMARCA_DEFINITE_ARTICLE: Readonly<Record<string, ComarcaDefiniteArticle>> = {
  // Amb el
  bages: "el",
  bergueda: "el",
  maresme: "el",
  priorat: "el",
  "valles-occidental": "el",
  "valles-oriental": "el",
  comtat: "el",
  // Amb la
  garrotxa: "la",
  selva: "la",
  noguera: "la",
  cerdanya: "la",
  llitera: "la",
  // Amb l'
  "alt-emporda": "l'",
  anoia: "l'",
  "horta-nord": "l'",
  "horta-oest": "l'",
  "horta-sud": "l'",
  alacanti: "l'",
  // Amb les
  garrigues: "les",
  // "les Valls d'Àneu" is not a separate picker slug (Pallars Sobirà).
};

const BY_SLUG = new Map<string, ComarcaMapEntry>(
  COMARCA_MAP_META.map((entry) => [entry.slug, entry]),
);

function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’]/g, "'")
    .toLowerCase();
}

/** Searchable strings for a comarca: bare name, plus article+name when applicable. */
export function comarcaSearchAliases(name: string, slug: string): string[] {
  const foldedName = foldDiacritics(name.trim());
  if (!foldedName) {
    return [];
  }
  const aliases = [foldedName];
  const article = COMARCA_DEFINITE_ARTICLE[slug];
  if (article === "l'") {
    aliases.push(`l'${foldedName}`);
  } else if (article) {
    aliases.push(`${article} ${foldedName}`);
  }
  return aliases;
}

/**
 * Case- and accent-insensitive substring match.
 * Leading articles only match for comarques that take that article
 * (see {@link COMARCA_DEFINITE_ARTICLE}).
 */
export function comarcaNameMatchesQuery(name: string, query: string, slug = ""): boolean {
  const needle = foldDiacritics(query.trim());
  if (!needle) {
    return true;
  }
  return comarcaSearchAliases(name, slug).some((alias) => alias.includes(needle));
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function comarcaDisplayName(slug: string): string {
  return BY_SLUG.get(slug)?.name ?? titleFromSlug(slug);
}

export function getComarca(slug: string, confidence?: number): Comarca | null {
  const meta = BY_SLUG.get(slug);
  if (!meta) {
    return null;
  }
  return {
    id: meta.slug,
    displayName: meta.name,
    dialect: DIALECT_ZONE_LABELS[meta.macroDialect as DialectZone] ?? meta.macroDialect,
    confidence,
  };
}

export function comarcaCentroid(slug: string): { x: number; y: number } | null {
  const meta = BY_SLUG.get(slug);
  if (!meta) {
    return null;
  }
  return { x: meta.centroidX, y: meta.centroidY };
}

/** Macro dialect for feedback: one shared zone, or ``mixed`` when they disagree. */
export function selfReportedDialectFromComarques(
  slugs: string[],
): Extract<SelfReportedDialect, DialectZone | "mixed"> | null {
  const macros: DialectZone[] = [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    const macro = BY_SLUG.get(slug)?.macroDialect;
    if (!macro || seen.has(macro)) {
      continue;
    }
    seen.add(macro);
    macros.push(macro);
  }
  if (macros.length === 0) {
    return null;
  }
  if (macros.length === 1) {
    return macros[0];
  }
  return "mixed";
}
