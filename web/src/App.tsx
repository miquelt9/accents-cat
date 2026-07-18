import { useEffect, useRef, useState } from "react";
import "./App.css";
import { LegalDocument } from "./components/LegalDocument";
import { ResultsMapStage } from "./components/ResultsMapStage";
import { ManageMyData } from "./components/ManageMyData";
import { RecorderPanel } from "./components/RecorderPanel";
import { ResultsConsentFeedback } from "./components/ResultsConsentFeedback";
import { ShareResultsModal } from "./components/ShareResultsModal";
import {
  DIALECT_ZONE_LABELS,
  getAccentOracleClient,
  getAccentOracleMode,
  resetMockAnalyzeOrdinal,
  submitResearchConsent,
  type AccentOracleResult,
} from "./lib/accentOracleClient";
import {
  accentOracleModeLabel,
  cycleAccentOracleMode,
  isApiMode,
  isDevToolsEnabled,
  setModeOverride,
  syncDevFlagFromUrl,
  type AccentOracleMode,
} from "./lib/devFlags";
import type { LegalDocId } from "./lib/legalDocs";
import { mergeValidationResults, needsValidation } from "./lib/needsValidation";
import {
  pickPrimaryReadAloudPrompt,
  pickReadAloudPrompt,
  rememberLastPromptId,
  type ReadAloudPrompt,
} from "./lib/prompts";

type AppPhase =
  | "landing"
  | "recording"
  | "validation"
  | "offer-third"
  | "refine"
  | "results"
  | "manage-data"
  | "privacy"
  | "terms";
type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "accent-oracle-theme";
const OVERLAY_PHASES = new Set<AppPhase>(["manage-data", "privacy", "terms"]);

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialDevToolsEnabled(): boolean {
  syncDevFlagFromUrl();
  return isDevToolsEnabled();
}

function App() {
  const [phase, setPhase] = useState<AppPhase>("landing");
  const [returnPhase, setReturnPhase] = useState<AppPhase>("landing");
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [result, setResult] = useState<AccentOracleResult | null>(null);
  const [pendingResult, setPendingResult] = useState<AccentOracleResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [devToolsEnabled] = useState(() => getInitialDevToolsEnabled());
  const [accentOracleMode, setAccentOracleMode] = useState<AccentOracleMode>(() => getAccentOracleMode());
  const [activePrompt, setActivePrompt] = useState<ReadAloudPrompt | null>(null);
  const [primaryPromptId, setPrimaryPromptId] = useState<string | null>(null);
  const [usedPromptIds, setUsedPromptIds] = useState<string[]>([]);
  const [preConsented, setPreConsented] = useState(false);
  const [researchRetained, setResearchRetained] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const leavePurgeRef = useRef({ phase, result, researchRetained, accentOracleMode });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    leavePurgeRef.current = { phase, result, researchRetained, accentOracleMode };
  }, [phase, result, researchRetained, accentOracleMode]);

  useEffect(() => {
    function purgePendingOnLeave() {
      const { phase: currentPhase, result: currentResult, researchRetained: retained, accentOracleMode: mode } =
        leavePurgeRef.current;
      if (
        (currentPhase !== "results" &&
          currentPhase !== "offer-third" &&
          currentPhase !== "refine") ||
        retained ||
        !isApiMode(mode) ||
        !currentResult?.recordingId
      ) {
        return;
      }
      void submitResearchConsent({ recordingId: currentResult.recordingId, consent: false }).catch(() => {
        // Best-effort purge when the user abandons results without opting in.
      });
    }

    function handlePageHide() {
      purgePendingOnLeave();
    }

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        purgePendingOnLeave();
      }
    });

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  function declinePendingRecording(recordingId: string | undefined) {
    if (!recordingId || !isApiMode(accentOracleMode) || researchRetained) {
      return;
    }
    void submitResearchConsent({ recordingId, consent: false }).catch(() => {
      // Best-effort purge of pending audio when research was not retained.
    });
  }

  function discardPendingRecording(recordingId: string | undefined) {
    if (!recordingId || !isApiMode(accentOracleMode)) {
      return;
    }
    void submitResearchConsent({ recordingId, consent: false }).catch(() => {
      // Best-effort cleanup of unused validation / refine samples.
    });
  }

  function openOverlay(next: AppPhase) {
    const holdingPending =
      phase === "results" || phase === "offer-third" || phase === "refine";
    if (holdingPending && next !== "privacy" && next !== "terms") {
      declinePendingRecording(result?.recordingId);
    }
    setReturnPhase(OVERLAY_PHASES.has(phase) ? returnPhase : phase);
    setPhase(next);
  }

  function closeOverlay() {
    setPhase(OVERLAY_PHASES.has(returnPhase) ? "landing" : returnPhase);
  }

  function openLegalDoc(docId: LegalDocId) {
    openOverlay(docId);
  }

  function resetFlow() {
    declinePendingRecording(result?.recordingId);
    resetMockAnalyzeOrdinal();
    setPhase("landing");
    setReturnPhase("landing");
    setResult(null);
    setPendingResult(null);
    setIsAnalyzing(false);
    setAnalysisError(null);
    setActivePrompt(null);
    setPrimaryPromptId(null);
    setUsedPromptIds([]);
    setPreConsented(false);
    setResearchRetained(false);
    setShareOpen(false);
  }

  function goToResultsOrOfferThird(next: AccentOracleResult) {
    setResult(next);
    setPendingResult(null);
    setPhase(needsValidation(next) ? "offer-third" : "results");
  }

  function startRecording() {
    resetMockAnalyzeOrdinal();
    const prompt = pickPrimaryReadAloudPrompt();
    setActivePrompt(prompt);
    setPrimaryPromptId(prompt.id);
    setUsedPromptIds([prompt.id]);
    setPendingResult(null);
    setResult(null);
    setAnalysisError(null);
    setPhase("recording");
  }

  function startValidation(firstResult: AccentOracleResult) {
    const excludeIds = usedPromptIds.length
      ? usedPromptIds
      : primaryPromptId
        ? [primaryPromptId]
        : activePrompt
          ? [activePrompt.id]
          : [];
    const prompt = pickReadAloudPrompt(excludeIds);
    rememberLastPromptId(prompt.id);
    setActivePrompt(prompt);
    setUsedPromptIds((ids) => [...ids, prompt.id]);
    setPendingResult(firstResult);
    setResult(null);
    setPhase("validation");
  }

  function startRefine() {
    const excludeIds = usedPromptIds.length
      ? usedPromptIds
      : primaryPromptId
        ? [primaryPromptId]
        : activePrompt
          ? [activePrompt.id]
          : [];
    const prompt = pickReadAloudPrompt(excludeIds);
    rememberLastPromptId(prompt.id);
    setActivePrompt(prompt);
    setUsedPromptIds((ids) => [...ids, prompt.id]);
    setAnalysisError(null);
    setPhase("refine");
  }

  function skipThird() {
    setPhase("results");
  }

  function switchOracleMode() {
    const nextMode = cycleAccentOracleMode(accentOracleMode);
    setModeOverride(nextMode);
    setAccentOracleMode(nextMode);
    resetMockAnalyzeOrdinal();
  }

  async function analyzeRecording(audio: Blob) {
    if (!activePrompt) {
      setAnalysisError("No s'ha pogut carregar el text a llegir. Torna a començar.");
      return;
    }

    setAnalysisError(null);
    setIsAnalyzing(true);

    try {
      const nextResult = await getAccentOracleClient().analyzeRecording(audio, {
        promptId: activePrompt.id,
        promptText: activePrompt.text,
      });

      if (phase === "recording") {
        if (needsValidation(nextResult)) {
          startValidation(nextResult);
          return;
        }

        goToResultsOrOfferThird(nextResult);
        return;
      }

      if (phase === "validation" && pendingResult) {
        const merged = mergeValidationResults(pendingResult, nextResult);
        if (nextResult.recordingId && nextResult.recordingId !== merged.recordingId) {
          discardPendingRecording(nextResult.recordingId);
        }
        goToResultsOrOfferThird(merged);
        return;
      }

      if (phase === "refine" && result) {
        const merged = mergeValidationResults(result, nextResult);
        if (nextResult.recordingId && nextResult.recordingId !== merged.recordingId) {
          discardPendingRecording(nextResult.recordingId);
        }
        setResult(merged);
        setPhase("results");
      }
    } catch (error) {
      setAnalysisError(
        error instanceof Error ? error.message : "L'anàlisi ha fallat. Prova de gravar una altra mostra.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function skipValidation() {
    if (!pendingResult) {
      return;
    }

    goToResultsOrOfferThird(pendingResult);
  }

  const showPrivacyFooter =
    phase === "landing" ||
    phase === "recording" ||
    phase === "validation" ||
    phase === "offer-third" ||
    phase === "refine" ||
    phase === "results";
  const analysisStatusText =
    devToolsEnabled && isApiMode(accentOracleMode)
      ? "Analitzant la mostra… La inferència pot trigar una mica en CPU."
      : "Analitzant la mostra…";
  const showRecorder =
    (phase === "recording" || phase === "validation" || phase === "refine") && activePrompt;

  return (
    <main className={`app-shell ${phase === "landing" ? "landing-main" : ""}`.trim()}>
      <div className="theme-toggle-row">
        {devToolsEnabled && (
          <div className="dev-tools-bar" role="group" aria-label="Eines de desenvolupament">
            <span className="dev-tools-label">Dev</span>
            <button
              aria-pressed={!isApiMode(accentOracleMode)}
              className="dev-mode-toggle"
              onClick={switchOracleMode}
              type="button"
            >
              Mode: {accentOracleModeLabel(accentOracleMode)}
            </button>
          </div>
        )}
        <button
          aria-label={`Canvia al mode ${theme === "light" ? "fosc" : "clar"}`}
          aria-pressed={theme === "dark"}
          className="theme-toggle"
          onClick={() => setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"))}
          type="button"
        >
          <span className={`theme-toggle-indicator theme-toggle-indicator-${theme}`} aria-hidden="true" />
          <span>{theme === "light" ? "Mode fosc" : "Mode clar"}</span>
        </button>
      </div>
      {phase === "landing" && (
        <section className="hero landing-hero">
          <div className="hero-copy landing-copy">
            <p className="eyebrow">Oracle d&apos;accents catalans</p>
            <h1>Quin és el meu accent en català?</h1>
            <p>
              Llegeix un text en veu alta i descobreix amb quines zones dialectals del català la teva veu
              sona més similar.
            </p>
            <button className="primary hero-link" onClick={startRecording} type="button">
              Descobreix el resultat
            </button>
            <label className="research-consent-check landing-preconsent">
              <input
                checked={preConsented}
                onChange={(event) => setPreConsented(event.target.checked)}
                type="checkbox"
              />
              <span>
                Vull col·laborar a la millora de models en català amb la meva gravació (tinc 18 anys o més).{" "}
                <button
                  className="privacy-link legal-inline-link"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openLegalDoc("privacy");
                  }}
                  type="button"
                >
                  Política de privadesa
                </button>
              </span>
            </label>
          </div>
        </section>
      )}

      {phase === "offer-third" && result && (
        <section className="card prompt-card offer-third-card" aria-label="Tercera lectura opcional">
          <h2>Ens dones una última oportunitat?</h2>
          <p>
            Pots fer una tercera lectura per refinar el mapa, o continuar amb el resultat actual.
          </p>
          {devToolsEnabled && (
            <p className="validation-note">
              <span className="dev-only-hint">*dev mode</span> Zones més properes:{" "}
              <strong>{DIALECT_ZONE_LABELS[result.topLabel]}</strong> (
              {Math.round(result.scores[result.topLabel] * 100)}%) i{" "}
              <strong>{DIALECT_ZONE_LABELS[result.runnerUpLabel]}</strong> (
              {Math.round(result.scores[result.runnerUpLabel] * 100)}%).
            </p>
          )}
          <div className="validation-actions">
            <button className="primary" onClick={startRefine} type="button">
              Sí, llegeix de nou
            </button>
            <button className="secondary" onClick={skipThird} type="button">
              No, veure resultats
            </button>
          </div>
        </section>
      )}

      {showRecorder && (
        <>
          <section className="card prompt-card">
            {phase === "validation" ? (
              <>
                <h2>Encara no n&apos;estem del tot segurs</h2>
                {devToolsEnabled && pendingResult && (
                  <p className="validation-note">
                    <span className="dev-only-hint">*dev mode</span> Les zones més properes són{" "}
                    <strong>{DIALECT_ZONE_LABELS[pendingResult.topLabel]}</strong> (
                    {Math.round(pendingResult.scores[pendingResult.topLabel] * 100)}%) i{" "}
                    <strong>{DIALECT_ZONE_LABELS[pendingResult.runnerUpLabel]}</strong> (
                    {Math.round(pendingResult.scores[pendingResult.runnerUpLabel] * 100)}%).
                  </p>
                )}
                <p className="read-instruction">Llegeix aquest text en veu alta</p>
                <blockquote>{activePrompt.text}</blockquote>
                {devToolsEnabled && (
                  <div className="validation-actions">
                    <button className="secondary" disabled={isAnalyzing} onClick={skipValidation} type="button">
                      <span className="dev-only-hint">*dev mode</span> Mostra el resultat igualment
                    </button>
                  </div>
                )}
              </>
            ) : phase === "refine" ? (
              <>
                <h2>Ens dones una última oportunitat?</h2>
                <p className="read-instruction">Llegeix aquest text en veu alta</p>
                <blockquote>{activePrompt.text}</blockquote>
              </>
            ) : (
              <>
                <p className="read-instruction">Llegeix aquest text en veu alta</p>
                <blockquote>{activePrompt.text}</blockquote>
              </>
            )}

            <RecorderPanel disabled={isAnalyzing} onRecordingReady={analyzeRecording} theme={theme} />
            {isAnalyzing && (
              <p className="analysis-status" aria-live="polite">
                {analysisStatusText}
              </p>
            )}
            {analysisError && <p className="error-message">{analysisError}</p>}
          </section>
        </>
      )}

      {phase === "results" && result && (
        <>
          <ResultsMapStage scores={result.scores} />
          <ResultsConsentFeedback
            preConsented={preConsented}
            recordingId={result.recordingId}
            onOpenLegalDoc={openLegalDoc}
            onResearchRetained={() => setResearchRetained(true)}
          />
          <div className="results-share-row">
            <button
              className="secondary results-share-button"
              onClick={() => setShareOpen(true)}
              type="button"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="18" cy="5" r="3" fill="currentColor" />
                <circle cx="6" cy="12" r="3" fill="currentColor" />
                <circle cx="18" cy="19" r="3" fill="currentColor" />
                <path
                  d="M8.6 13.5 15.4 17.1M15.4 6.9 8.6 10.5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.75"
                />
              </svg>
              Comparteix
            </button>
          </div>
          <button className="secondary restart-button" onClick={resetFlow} type="button">
            Torna a començar
          </button>
          {shareOpen && (
            <ShareResultsModal
              scores={result.scores}
              theme={theme}
              onClose={() => setShareOpen(false)}
            />
          )}
        </>
      )}

      {phase === "manage-data" && (
        <ManageMyData
          onBack={closeOverlay}
          onOpenPrivacy={() => openLegalDoc("privacy")}
          onOpenTerms={() => openLegalDoc("terms")}
        />
      )}

      {(phase === "privacy" || phase === "terms") && (
        <LegalDocument docId={phase} onBack={closeOverlay} onOpenOther={openLegalDoc} />
      )}

      {showPrivacyFooter && (
        <footer className="privacy-footer">
          <button className="privacy-link" onClick={() => openOverlay("manage-data")} type="button">
            Gestiona les meves dades
          </button>
          <span className="privacy-footer-sep" aria-hidden="true">
            ·
          </span>
          <button className="privacy-link" onClick={() => openLegalDoc("privacy")} type="button">
            Privadesa
          </button>
          <span className="privacy-footer-sep" aria-hidden="true">
            ·
          </span>
          <button className="privacy-link" onClick={() => openLegalDoc("terms")} type="button">
            Termes
          </button>
        </footer>
      )}
    </main>
  );
}

export default App;
