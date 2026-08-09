import type { DialectZone } from "./accentOracleClient";

export function displayedFocusComarcaSlug(
  selectedZone: DialectZone,
  topZone: DialectZone,
  inspectedComarca: string | null,
  comarcaGuessSlug: string | null | undefined,
): string | null {
  return inspectedComarca ?? (selectedZone === topZone ? (comarcaGuessSlug ?? null) : null);
}
