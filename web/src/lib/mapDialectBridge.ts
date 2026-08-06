import type { DialectZone } from "./accentOracleClient";

export const DIALECT_GROUP_TO_MACRO: Record<string, DialectZone> = {
  "ca-central": "central",
  "ca-nwestern": "northwestern",
  "ca-northern": "northern",
  "ca-balear": "balearic",
  "ca-valencia": "valencian",
};

export function dialectGroupToMacro(dialectGroup: string): DialectZone {
  return DIALECT_GROUP_TO_MACRO[dialectGroup] ?? "central";
}
