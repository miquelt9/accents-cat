import {
  DIALECT_ZONE_LABELS,
  DIALECT_ZONES,
  type AccentScores,
  type DialectZone,
} from "./accentOracleClient";

const SHARE_CARD_BG_LIGHT = "#ffffff";
const SHARE_CARD_BG_DARK = "#0f1a22";

/** PNG capture fill — mirrors `--share-card-bg` for the active theme. */
export function getShareCardBackgroundColor(
  theme: "light" | "dark" | null | undefined = undefined,
): string {
  if (theme === "dark") {
    return SHARE_CARD_BG_DARK;
  }
  if (theme === "light") {
    return SHARE_CARD_BG_LIGHT;
  }
  if (typeof document !== "undefined") {
    const fromVar = getComputedStyle(document.documentElement)
      .getPropertyValue("--share-card-bg")
      .trim();
    if (fromVar) {
      return fromVar;
    }
    if (document.documentElement.dataset.theme === "dark") {
      return SHARE_CARD_BG_DARK;
    }
  }
  return SHARE_CARD_BG_LIGHT;
}

/** True when the Web Share API can share files (typical mobile browsers on HTTPS). */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  if (typeof window === "undefined" || !window.isSecureContext) {
    return false;
  }
  if (typeof navigator.canShare !== "function" || typeof File === "undefined") {
    return false;
  }
  try {
    const dummyFile = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [dummyFile] });
  } catch {
    return false;
  }
}

/** Rank dialects by score descending; default top 3 for the share card. */
export function rankTopDialects(scores: AccentScores, count = 3): DialectZone[] {
  return [...DIALECT_ZONES].sort((a, b) => scores[b] - scores[a]).slice(0, count);
}

/** Public URL for the promo footer (env override, else current host). */
export function getPublicSiteUrl(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.host) {
    return window.location.host;
  }
  return "oracle-accents";
}

/** Absolute https URL for social intents (Facebook/Telegram need a full URL). */
export function getPublicSiteHref(siteUrl = getPublicSiteUrl()): string {
  if (/^https?:\/\//i.test(siteUrl)) {
    return siteUrl.replace(/\/$/, "");
  }
  return `https://${siteUrl.replace(/\/$/, "")}`;
}

export type SocialShareLinks = {
  whatsapp: string;
  x: string;
  telegram: string;
  facebook: string;
};

/** Text/link share intents for networks that support them on the open web. */
export function getSocialShareLinks(
  caption: string,
  siteUrl = getPublicSiteUrl(),
): SocialShareLinks {
  const href = getPublicSiteHref(siteUrl);
  const encodedCaption = encodeURIComponent(caption);
  const encodedHref = encodeURIComponent(href);
  return {
    whatsapp: `https://wa.me/?text=${encodedCaption}`,
    x: `https://twitter.com/intent/tweet?text=${encodedCaption}`,
    telegram: `https://t.me/share/url?url=${encodedHref}&text=${encodedCaption}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedHref}`,
  };
}

export function openSocialShareUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Catalan similarity caption for native share text (no recordingId). */
export function getShareCaption(topLabel: DialectZone, siteUrl = getPublicSiteUrl()): string {
  const label = DIALECT_ZONE_LABELS[topLabel];
  return (
    `L'Oracle d'accents catalans ha calculat que el meu accent s'assembla més al ${label}.\n\n` +
    `Prova-ho: ${siteUrl}`
  );
}

/** Short in-card sentence (same framing as caption, without promo). */
export function getShareCardSentence(topLabel: DialectZone): string {
  const label = DIALECT_ZONE_LABELS[topLabel];
  return `L'Oracle d'accents catalans ha calculat que el meu accent s'assembla més al ${label}.`;
}

export function getShareFilename(topLabel: DialectZone): string {
  return `oracle-accents-${topLabel}.png`;
}

/** Synchronous data-URL → File conversion (preserves user activation for navigator.share). */
export function dataUrlToPngFile(dataUrl: string, fileName: string): File {
  const [header, base64] = dataUrl.split(",", 2);
  const mime = header?.match(/data:(.*?);base64/)?.[1] ?? "image/png";
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mime });
}

export function isCaptureAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function throwIfCaptureAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Capture aborted", "AbortError");
  }
}

/**
 * Capture the share card DOM node to a PNG data URL.
 * `skipFonts` avoids hanging on cross-origin font fetches (jutge-wrapped pattern).
 */
export async function captureShareCard(
  node: HTMLElement,
  options?: { signal?: AbortSignal; theme?: "light" | "dark" },
): Promise<string> {
  throwIfCaptureAborted(options?.signal);
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    skipFonts: true,
    backgroundColor: getShareCardBackgroundColor(options?.theme),
  });
  throwIfCaptureAborted(options?.signal);
  return dataUrl;
}

export function downloadPng(dataUrl: string, fileName: string): void {
  const file = dataUrlToPngFile(dataUrl, fileName);
  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.download = file.name;
  link.href = objectUrl;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
