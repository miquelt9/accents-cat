import type { DialectZone } from "./accentOracleClient";

export function displayedFocusComarcaSlug(
  selectedZone: DialectZone,
  topZone: DialectZone,
  inspectedComarca: string | null,
  comarcaGuessSlug: string | null | undefined,
): string | null {
  return inspectedComarca ?? (selectedZone === topZone ? (comarcaGuessSlug ?? null) : null);
}

/** Affinity callout only for the illustrative focus pin — not for inspect-only clicks. */
export function shouldShowAffinityCallout(
  pinComarca: string | null,
  comarcaGuessSlug: string | null | undefined,
): boolean {
  return pinComarca != null && pinComarca === comarcaGuessSlug;
}
