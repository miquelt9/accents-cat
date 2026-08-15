import { describe, expect, it } from "vitest";
import type { AccentScores } from "./accentOracleClient";
import {
  dataUrlToPngFile,
  getPublicSiteHref,
  getShareCaption,
  getShareCardBackgroundColor,
  getShareCardSentence,
  getShareFilename,
  getSocialShareLinks,
  isCaptureAbortError,
  rankTopDialects,
  relativeShareBarWidth,
} from "./shareExport";

const sampleScores: AccentScores = {
  balearic: 0.12,
  central: 0.48,
  northern: 0.22,
  northwestern: 0.1,
  valencian: 0.08,
};

describe("rankTopDialects", () => {
  it("returns top three dialects by descending score", () => {
    expect(rankTopDialects(sampleScores)).toEqual(["central", "northern", "balearic"]);
  });

  it("respects custom count", () => {
    expect(rankTopDialects(sampleScores, 2)).toEqual(["central", "northern"]);
  });
});

describe("getShareCardSentence / getShareCaption", () => {
  it("uses a short kicker without repeating the dialect name", () => {
    const sentence = getShareCardSentence();
    expect(sentence).toBe("La meva veu s'assembla més a");
    expect(sentence.toLowerCase()).not.toContain("origen");
    expect(sentence.toLowerCase()).not.toContain("nascut");
  });

  it("uses an unresolved caption while the card kicker stays short", () => {
    const sentence = getShareCardSentence();
    const caption = getShareCaption("northern", "example.com", true);
    expect(sentence).toBe("La meva veu s'assembla més a");
    expect(caption).toContain("no n'està del tot segur");
    expect(caption).toContain("català septentrional");
  });

  it("frames similarity (not origin) with the full dialect name in the caption", () => {
    const caption = getShareCaption("central");
    expect(caption).toContain("s'assembla més al català central");
    expect(caption).not.toContain("s'assembla més al Central");
    expect(caption).not.toContain("s'assembla més al Nord");
  });

  it("appends promo URL without recordingId", () => {
    const caption = getShareCaption("valencian", "example.com");
    expect(caption).toContain("s'assembla més al valencià");
    expect(caption).toContain("Prova-ho: example.com");
    expect(caption).not.toMatch(/recording/i);
    expect(caption).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });
});

describe("relativeShareBarWidth", () => {
  it("scales bars so the winner fills the track", () => {
    expect(relativeShareBarWidth(0.48, 0.48)).toBe(100);
    expect(relativeShareBarWidth(0.24, 0.48)).toBe(50);
  });

  it("keeps a visible nub for very small scores", () => {
    expect(relativeShareBarWidth(0.01, 0.8)).toBe(8);
  });
});

describe("getShareFilename", () => {
  it("includes dialect id", () => {
    expect(getShareFilename("northwestern")).toBe("oracle-accents-northwestern.png");
  });
});

describe("getShareCardBackgroundColor", () => {
  it("falls back by theme when CSS vars are unset", () => {
    expect(getShareCardBackgroundColor("light")).toBe("#ffffff");
    expect(getShareCardBackgroundColor("dark")).toBe("#0f1a22");
  });
});

describe("getPublicSiteHref / getSocialShareLinks", () => {
  it("adds https when the promo host has no protocol", () => {
    expect(getPublicSiteHref("example.com")).toBe("https://example.com");
    expect(getPublicSiteHref("https://example.com/")).toBe("https://example.com");
  });

  it("builds text share intents without recording ids", () => {
    const caption = getShareCaption("central", "example.com");
    const links = getSocialShareLinks(caption, "example.com");
    expect(links.whatsapp).toContain("https://wa.me/?text=");
    expect(links.whatsapp).toContain(encodeURIComponent("s'assembla més al català central"));
    expect(links.x).toContain("https://twitter.com/intent/tweet?text=");
    expect(links.telegram).toContain("https://t.me/share/url?");
    expect(links.telegram).toContain(encodeURIComponent("https://example.com"));
    expect(links.facebook).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent("https://example.com"),
    );
    expect(JSON.stringify(links)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });
});

describe("dataUrlToPngFile", () => {
  it("converts a tiny PNG data URL to a File synchronously", () => {
    // 1x1 transparent PNG
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const file = dataUrlToPngFile(dataUrl, "oracle-accents-central.png");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("oracle-accents-central.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBeGreaterThan(0);
  });
});

describe("isCaptureAbortError", () => {
  it("detects AbortError DOMExceptions", () => {
    expect(isCaptureAbortError(new DOMException("Capture aborted", "AbortError"))).toBe(true);
    expect(isCaptureAbortError(new Error("other"))).toBe(false);
  });
});
