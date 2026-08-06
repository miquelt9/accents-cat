import type { DialectZone } from "./accentOracleClient";

/** Undirected adjacency of macro-dialects for blend / geographic sanity. */
const ADJACENT_PAIRS: ReadonlyArray<readonly [DialectZone, DialectZone]> = [
  ["central", "northern"],
  ["central", "northwestern"],
  ["central", "valencian"],
  ["northern", "northwestern"],
  ["northwestern", "valencian"],
];

const ADJACENCY = new Set<string>();
for (const [a, b] of ADJACENT_PAIRS) {
  ADJACENCY.add(pairKey(a, b));
}

function pairKey(a: DialectZone, b: DialectZone): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** True when the two macros share a geographic continuum (not Balearic). */
export function areDialectsAdjacent(a: DialectZone, b: DialectZone): boolean {
  if (a === b) {
    return true;
  }
  return ADJACENCY.has(pairKey(a, b));
}

/**
 * Top-two pair that does not form a land continuum (e.g. northern+valencian,
 * or any pairing with balearic). Same zone is coherent.
 */
export function isGeographicallyIncoherent(a: DialectZone, b: DialectZone): boolean {
  return !areDialectsAdjacent(a, b);
}
