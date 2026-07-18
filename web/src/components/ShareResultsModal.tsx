import { useEffect, useRef, useState } from "react";
import { useWebImageShare } from "../hooks/useWebImageShare";
import {
  DIALECT_ZONE_LABELS,
  type AccentScores,
  type DialectZone,
} from "../lib/accentOracleClient";
import {
  captureShareCard,
  downloadPng,
  getPublicSiteUrl,
  getShareCaption,
  getShareCardSentence,
  getShareFilename,
  getSocialShareLinks,
  isCaptureAbortError,
  openSocialShareUrl,
  rankTopDialects,
} from "../lib/shareExport";

interface ShareResultsModalProps {
  scores: AccentScores;
  theme: "light" | "dark";
  onClose: () => void;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M17.47 14.38c-.28-.14-1.66-.82-1.92-.91-.26-.1-.45-.14-.64.14-.19.28-.73.91-.9 1.1-.16.19-.33.21-.61.07-.28-.14-1.18-.44-2.25-1.39-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.12.28-.33.42-.49.14-.16.19-.28.28-.47.1-.19.05-.35-.02-.49-.07-.14-.64-1.54-.88-2.11-.23-.55-.47-.48-.64-.48h-.55c-.19 0-.49.07-.75.35-.26.28-1 1-1 2.43s1.02 2.82 1.16 3.01c.14.19 2.01 3.07 4.87 4.3.68.29 1.21.47 1.62.6.68.21 1.3.18 1.79.11.55-.08 1.66-.68 1.9-1.34.23-.66.23-1.22.16-1.34-.07-.12-.26-.19-.54-.33Z"
      />
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.15 6.42 2.15 11.87c0 1.75.46 3.45 1.34 4.95L2 22l5.33-1.4a9.9 9.9 0 0 0 4.71 1.2h.01c5.46 0 9.89-4.42 9.89-9.87C21.94 6.42 17.5 2 12.04 2Zm0 18.05h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.16.83.84-3.08-.2-.32a8.17 8.17 0 0 1-1.25-4.35c0-4.52 3.69-8.2 8.24-8.2 4.54 0 8.24 3.68 8.24 8.2 0 4.52-3.7 8.25-8.22 8.25Z"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M18.24 3H21l-6.52 7.45L22 21h-6.17l-4.83-6.31L5.6 21H2.84l6.97-7.97L2 3h6.32l4.36 5.77L18.24 3Zm-1.08 16.2h1.71L7.01 4.7H5.18l11.98 14.5Z"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M21.94 4.35 18.9 19.2c-.22 1.01-.81 1.26-1.64.78l-4.54-3.35-2.19 2.11c-.24.24-.45.45-.92.45l.33-4.64 8.45-7.64c.37-.33-.08-.51-.57-.19l-10.45 6.58-4.5-1.4c-.98-.31-.99-.98.2-1.45L20.4 3.6c.82-.3 1.54.19 1.54.75Z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M14.5 22v-8.1h2.72l.41-3.16H14.5V8.72c0-.91.25-1.54 1.56-1.54h1.67V4.35c-.29-.04-1.28-.12-2.44-.12-2.41 0-4.06 1.47-4.06 4.18v2.33H8.4v3.16h2.83V22h3.27Z"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 7.3A4.7 4.7 0 1 0 16.7 12 4.71 4.71 0 0 0 12 7.3Zm0 7.75A3.05 3.05 0 1 1 15.05 12 3.05 3.05 0 0 1 12 15.05Z"
      />
      <path
        fill="currentColor"
        d="M16.9 2H7.1A5.1 5.1 0 0 0 2 7.1v9.8A5.1 5.1 0 0 0 7.1 22h9.8A5.1 5.1 0 0 0 22 16.9V7.1A5.1 5.1 0 0 0 16.9 2Zm3.45 14.9a3.46 3.46 0 0 1-3.45 3.45H7.1a3.46 3.46 0 0 1-3.45-3.45V7.1A3.46 3.46 0 0 1 7.1 3.65h9.8a3.46 3.46 0 0 1 3.45 3.45Z"
      />
      <circle cx="17.5" cy="6.5" r="1.15" fill="currentColor" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16 3H6.5A2.5 2.5 0 0 0 4 5.5V16h1.6V5.5a.9.9 0 0 1 .9-.9H16V3Zm3.5 4H10A2.5 2.5 0 0 0 7.5 9.5v11A2.5 2.5 0 0 0 10 23h9.5A2.5 2.5 0 0 0 22 20.5v-11A2.5 2.5 0 0 0 19.5 7ZM20.4 20.5a.9.9 0 0 1-.9.9H10a.9.9 0 0 1-.9-.9v-11a.9.9 0 0 1 .9-.9h9.5a.9.9 0 0 1 .9.9v11Z"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        d="M6 6l12 12M18 6 6 18"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
        d="M12 4v10m0 0 4-4m-4 4-4-4M5 16.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5"
      />
    </svg>
  );
}

export function ShareResultsModal({ scores, theme, onClose }: ShareResultsModalProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const imageCacheRef = useRef<string | null>(null);
  const captureAbortRef = useRef<AbortController | null>(null);
  const { shareImage, isSharing, canShare } = useWebImageShare();
  const [isBusy, setIsBusy] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const topThree = rankTopDialects(scores, 3);
  const topLabel = topThree[0] as DialectZone;
  const siteUrl = getPublicSiteUrl();
  const sentence = getShareCardSentence(topLabel);
  const fileName = getShareFilename(topLabel);
  const caption = getShareCaption(topLabel, siteUrl);
  const socialLinks = getSocialShareLinks(caption, siteUrl);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    imageCacheRef.current = null;

    if (!canShare) {
      return;
    }

    const node = captureRef.current;
    if (!node) {
      return;
    }

    captureAbortRef.current?.abort();
    const controller = new AbortController();
    captureAbortRef.current = controller;

    void captureShareCard(node, { signal: controller.signal, theme })
      .then((dataUrl) => {
        if (!controller.signal.aborted) {
          imageCacheRef.current = dataUrl;
        }
      })
      .catch((err) => {
        if (!isCaptureAbortError(err)) {
          console.error("Share precompute failed:", err);
        }
      })
      .finally(() => {
        if (captureAbortRef.current === controller) {
          captureAbortRef.current = null;
        }
      });

    return () => {
      controller.abort();
      if (captureAbortRef.current === controller) {
        captureAbortRef.current = null;
      }
    };
  }, [canShare, scores, theme]);

  async function ensureCaptured(): Promise<string | null> {
    if (imageCacheRef.current) {
      return imageCacheRef.current;
    }
    const node = captureRef.current;
    if (!node) {
      return null;
    }

    captureAbortRef.current?.abort();
    const controller = new AbortController();
    captureAbortRef.current = controller;

    try {
      const dataUrl = await captureShareCard(node, { signal: controller.signal, theme });
      if (controller.signal.aborted) {
        return null;
      }
      imageCacheRef.current = dataUrl;
      return dataUrl;
    } catch (err) {
      if (isCaptureAbortError(err)) {
        return null;
      }
      throw err;
    } finally {
      if (captureAbortRef.current === controller) {
        captureAbortRef.current = null;
      }
    }
  }

  async function handleShare() {
    if (!canShare || isBusy || isSharing) {
      return;
    }
    setIsBusy(true);
    setCaptureError(null);
    setActionHint(null);
    try {
      const imageUrl = await ensureCaptured();
      if (!imageUrl) {
        return;
      }
      await shareImage(imageUrl, "Oracle d'accents", caption, {
        fileName,
      });
    } catch (err) {
      if (!isCaptureAbortError(err)) {
        console.error("Share failed:", err);
        setCaptureError("No s'ha pogut preparar la imatge. Torna-ho a provar.");
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDownload() {
    if (isBusy || isSharing) {
      return;
    }
    setIsBusy(true);
    setCaptureError(null);
    setActionHint(null);
    try {
      const imageUrl = await ensureCaptured();
      if (imageUrl) {
        downloadPng(imageUrl, fileName);
      }
    } catch (err) {
      if (!isCaptureAbortError(err)) {
        console.error("Download failed:", err);
        setCaptureError("No s'ha pogut desar la imatge. Torna-ho a provar.");
      }
    } finally {
      setIsBusy(false);
    }
  }

  function handleTextSocial(network: keyof typeof socialLinks) {
    setActionHint(null);
    openSocialShareUrl(socialLinks[network]);
  }

  async function handleInstagram() {
    if (isBusy || isSharing) {
      return;
    }
    setIsBusy(true);
    setCaptureError(null);
    try {
      const imageUrl = await ensureCaptured();
      if (!imageUrl) {
        return;
      }
      if (canShare) {
        await shareImage(imageUrl, "Oracle d'accents", caption, { fileName });
        setActionHint("Tria Instagram a la fulla de compartir (o desa la imatge per a una història).");
      } else {
        downloadPng(imageUrl, fileName);
        setActionHint("Imatge desada. Obre Instagram i afegeix-la a una història.");
      }
    } catch (err) {
      if (!isCaptureAbortError(err)) {
        console.error("Instagram share failed:", err);
        setCaptureError("No s'ha pogut preparar la imatge per a Instagram.");
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCopy() {
    setCaptureError(null);
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setActionHint("Text copiat al porta-retalls.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
      setCaptureError("No s'ha pogut copiar el text.");
    }
  }

  const busy = isBusy || isSharing;

  return (
    <div
      className="share-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Comparteix el resultat"
    >
      <button
        type="button"
        className="share-modal-backdrop"
        aria-label="Tanca"
        onClick={onClose}
      />
      <div className="share-modal-panel">
        <div className="share-modal-header">
          <button
            type="button"
            className="share-modal-close"
            onClick={onClose}
            aria-label="Tanca"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="share-card" data-theme={theme} ref={captureRef}>
          <div className="share-card-accent" aria-hidden="true" />
          <p className="share-card-brand">Oracle d&apos;accents</p>
          <p className="share-card-top">{DIALECT_ZONE_LABELS[topLabel]}</p>
          <p className="share-card-sentence">{sentence}</p>
          <ul className="share-card-rows" aria-label="Tres accents més similars">
            {topThree.map((zone) => {
              const pct = Math.round(scores[zone] * 100);
              return (
                <li key={zone} className="share-card-row">
                  <div className="share-card-row-meta">
                    <span className="share-card-row-name">{DIALECT_ZONE_LABELS[zone]}</span>
                    <span className="share-card-row-pct">{pct}%</span>
                  </div>
                  <div className="share-card-bar-track" aria-hidden="true">
                    <div className="share-card-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="share-card-footer">Prova-ho a {siteUrl}</p>
        </div>

        {!canShare && (
          <div className="share-social" role="group" aria-label="Xarxes socials">
            <button
              type="button"
              className="share-social-button is-whatsapp"
              disabled={busy}
              onClick={() => handleTextSocial("whatsapp")}
              aria-label="Comparteix a WhatsApp"
            >
              <WhatsAppIcon />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              className="share-social-button is-x"
              disabled={busy}
              onClick={() => handleTextSocial("x")}
              aria-label="Comparteix a X"
            >
              <XIcon />
              <span>X</span>
            </button>
            <button
              type="button"
              className="share-social-button is-telegram"
              disabled={busy}
              onClick={() => handleTextSocial("telegram")}
              aria-label="Comparteix a Telegram"
            >
              <TelegramIcon />
              <span>Telegram</span>
            </button>
            <button
              type="button"
              className="share-social-button is-facebook"
              disabled={busy}
              onClick={() => handleTextSocial("facebook")}
              aria-label="Comparteix a Facebook"
            >
              <FacebookIcon />
              <span>Facebook</span>
            </button>
            <button
              type="button"
              className="share-social-button is-instagram"
              disabled={busy}
              onClick={() => void handleInstagram()}
              aria-label="Comparteix a Instagram"
            >
              <InstagramIcon />
              <span>Instagram</span>
            </button>
            <button
              type="button"
              className="share-social-button is-copy"
              disabled={busy}
              onClick={() => void handleCopy()}
              aria-label="Copia el text"
            >
              <CopyIcon />
              <span>{copied ? "Copiat" : "Copia"}</span>
            </button>
          </div>
        )}

        <div className={`share-modal-actions${canShare ? " is-native" : ""}`}>
          {canShare ? (
            <>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void handleShare()}
              >
                {busy ? "Preparant…" : "Comparteix"}
              </button>
              <button
                type="button"
                className="secondary share-modal-download"
                disabled={busy}
                onClick={() => void handleDownload()}
                aria-label="Desa la imatge"
              >
                <DownloadIcon />
              </button>
              <button
                type="button"
                className="secondary share-modal-copy"
                disabled={busy}
                onClick={() => void handleCopy()}
                aria-label="Copia el text"
              >
                <span>
                  <CopyIcon />
                  {copied ? "Copiat" : "Copia el text"}
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="secondary share-modal-download"
              disabled={busy}
              onClick={() => void handleDownload()}
            >
              {busy ? "Preparant…" : "Desa la imatge"}
            </button>
          )}
        </div>
        {actionHint && <p className="share-modal-hint">{actionHint}</p>}
        {captureError && <p className="error-message">{captureError}</p>}
      </div>
    </div>
  );
}
