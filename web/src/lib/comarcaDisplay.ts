import { DIALECT_ZONE_LABELS, type DialectZone } from "./accentOracleClient";
import { COMARCA_MAP_META } from "./comarcaMapMeta";

export interface Comarca {
  id: string;
  displayName: string;
  dialect: string;
  confidence?: number;
}

const DISPLAY_NAMES: Record<string, string> = {
  vielha: "Vielha",
  "pallars-sobira": "Pallars Sobirà",
  "alta-ribagorca": "Alta Ribagorça",
  cerdanya: "Cerdanya",
  "alt-urgell": "Alt Urgell",
  "pallars-jussa": "Pallars Jussà",
  noguera: "Noguera",
  solsones: "Solsonès",
  bergueda: "Berguedà",
  andorra: "Andorra",
  ardemuz: "Ardemuz",
  segria: "Segrià",
  urgell: "Urgell",
  "pla-urgell": "Pla d'Urgell",
  garrigues: "Garrigues",
  "terra-alta": "Terra Alta",
  "baix-ebre": "Baix Ebre",
  montsia: "Montsià",
  "rebera-ebre": "Ribera d'Ebre",
  "alt-emporda": "Alt Empordà",
  "baix-emporda": "Baix Empordà",
  garrotxa: "Garrotxa",
  ripolles: "Ripollès",
  girones: "Gironès",
  "la-selva": "La Selva",
  "pla-de-estany": "Pla de l'Estany",
  osona: "Osona",
  segarra: "Segarra",
  bages: "Bages",
  "valles-oriental": "Vallès Oriental",
  "valles-occidental": "Vallès Occidental",
  maresme: "Maresme",
  barcelones: "Barcelonès",
  "baix-llobregat": "Baix Llobregat",
  garraf: "Garraf",
  anoia: "Anoia",
  "alt-penedes": "Alt Penedès",
  "baix-penedes": "Baix Penedès",
  "alt-camp": "Alt Camp",
  "baix-camp": "Baix Camp",
  "conca-de-barbera": "Conca de Barberà",
  priorat: "Priorat",
  tarragones: "Tarragonès",
  "catalunya-nord": "Catalunya Nord",
  "catalunya-nord-2": "Catalunya Nord",
  mallorca: "Mallorca",
  menorca: "Menorca",
  eivissa: "Eivissa",
  formentera: "Formentera",
  cabrera: "Cabrera",
  valencia: "País Valencià",
};

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function comarcaDisplayName(slug: string): string {
  return DISPLAY_NAMES[slug] ?? titleFromSlug(slug);
}

export function getComarca(slug: string, confidence?: number): Comarca | null {
  const meta = COMARCA_MAP_META.find((entry) => entry.slug === slug);
  if (!meta) {
    return null;
  }
  return {
    id: meta.slug,
    displayName: comarcaDisplayName(meta.slug),
    dialect: DIALECT_ZONE_LABELS[meta.macroDialect as DialectZone] ?? meta.macroDialect,
    confidence,
  };
}

export function comarcaCentroid(slug: string): { x: number; y: number } | null {
  const meta = COMARCA_MAP_META.find((entry) => entry.slug === slug);
  if (!meta) {
    return null;
  }
  return { x: meta.centroidX, y: meta.centroidY };
}
