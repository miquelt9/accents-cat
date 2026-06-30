import type { DialectZone } from "./accentOracleClient";

export interface DialectGeoAnchor {
  dialect: DialectZone;
  label: string;
  lat: number;
  lng: number;
  share: number;
}

export const DIALECT_GEO_ANCHORS: DialectGeoAnchor[] = [
  { dialect: "central", label: "Barcelona area", lat: 41.39, lng: 2.17, share: 0.34 },
  { dialect: "central", label: "Girona area", lat: 41.98, lng: 2.82, share: 0.22 },
  { dialect: "central", label: "Tarragona area", lat: 41.12, lng: 1.25, share: 0.22 },
  { dialect: "central", label: "Central coast", lat: 41.58, lng: 2.28, share: 0.22 },

  { dialect: "valencian", label: "Castello area", lat: 39.99, lng: -0.04, share: 0.22 },
  { dialect: "valencian", label: "Valencia area", lat: 39.47, lng: -0.38, share: 0.38 },
  { dialect: "valencian", label: "Alacant area", lat: 38.35, lng: -0.49, share: 0.24 },
  { dialect: "valencian", label: "Elx area", lat: 38.27, lng: -0.7, share: 0.1 },
  { dialect: "valencian", label: "El Carxe", lat: 38.18, lng: -1.25, share: 0.06 },

  { dialect: "northwestern", label: "Lleida area", lat: 41.62, lng: 0.62, share: 0.34 },
  { dialect: "northwestern", label: "Andorra area", lat: 42.51, lng: 1.52, share: 0.24 },
  { dialect: "northwestern", label: "Fraga area", lat: 41.52, lng: 0.35, share: 0.16 },
  { dialect: "northwestern", label: "Western Catalonia", lat: 41.36, lng: 0.5, share: 0.12 },
  { dialect: "northwestern", label: "Ebre interior", lat: 40.82, lng: 0.52, share: 0.14 },

  { dialect: "northern", label: "Perpinya area", lat: 42.7, lng: 2.9, share: 0.48 },
  { dialect: "northern", label: "Northern Catalonia coast", lat: 42.52, lng: 3.08, share: 0.26 },
  { dialect: "northern", label: "Vallespir area", lat: 42.45, lng: 2.62, share: 0.26 },

  { dialect: "balearic", label: "Mallorca", lat: 39.57, lng: 2.65, share: 0.46 },
  { dialect: "balearic", label: "Menorca", lat: 39.95, lng: 4.08, share: 0.2 },
  { dialect: "balearic", label: "Eivissa", lat: 38.91, lng: 1.43, share: 0.2 },
  { dialect: "balearic", label: "Formentera", lat: 38.7, lng: 1.45, share: 0.14 },
];
