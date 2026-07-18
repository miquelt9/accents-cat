import { useEffect, useRef, useState } from "react";
import "./App.css";
import { LegalDocument } from "./components/LegalDocument";
import { ResultsMapStage } from "./components/ResultsMapStage";
import { ManageMyData } from "./components/ManageMyData";
import { RecorderPanel } from "./components/RecorderPanel";
import { ResultsConsentFeedback } from "./components/ResultsConsentFeedback";
import {
  DIALECT_ZONE_LABELS,
  getAccentOracleClient,
  getAccentOracleMode,
  submitResearchConsent,
  type AccentOracleResult,
} from "./lib/accentOracleClient";
import {
  isDevToolsEnabled,
  setModeOverride,
  syncDevFlagFromUrl,
  type AccentOracleMode,
} from "./lib/devFlags";
import type { LegalDocId } from "./lib/legalDocs";
import { needsValidation, pickBetterResult } from "./lib/needsValidation";
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
  const [keptFirstResult, setKeptFirstResult] = useState(false);
  const [devToolsEnabled] = useState(() => getInitialDevToolsEnabled());
  const [accentOracleMode, setAccentOracleMode] = useState<AccentOracleMode>(() => getAccentOracleMode());
  const [activePrompt, setActivePrompt] = useState<ReadAloudPrompt | null>(null);
  const [primaryPromptId, setPrimaryPromptId] = useState<string | null>(null);
  const [preConsented, setPreConsented] = useState(false);
  const [researchRetained, setResearchRetained] = useState(false);
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
      if (currentPhase !== "results" || retained || mode !== "api" || !currentResult?.recordingId) {
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
    if (!recordingId || accentOracleMode !== "api" || researchRetained) {
      return;
    }
    void submitResearchConsent({ recordingId, consent: false }).catch(() => {
      // Best-effort purge of pending audio when research was not retained.
    });
  }

  function openOverlay(next: AppPhase) {
    if (phase === "results" && next !== "privacy" && next !== "terms") {
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
    setPhase("landing");
    setReturnPhase("landing");
    setResult(null);
    setPendingResult(null);
    setIsAnalyzing(false);
    setAnalysisError(null);
    setKeptFirstResult(false);
    setActivePrompt(null);
    setPrimaryPromptId(null);
    setPreConsented(false);
    setResearchRetained(false);
  }

  function startRecording() {
    const prompt = pickPrimaryReadAloudPrompt();
    setActivePrompt(prompt);
    setPrimaryPromptId(prompt.id);
    setPendingResult(null);
    setResult(null);
    setAnalysisError(null);
    setKeptFirstResult(false);
    setPhase("recording");
  }

  function startValidation(firstResult: AccentOracleResult) {
    const excludeIds = primaryPromptId ? [primaryPromptId] : activePrompt ? [activePrompt.id] : [];
    const prompt = pickReadAloudPrompt(excludeIds);
    rememberLastPromptId(prompt.id);
    setActivePrompt(prompt);
    setPendingResult(firstResult);
    setResult(null);
    setPhase("validation");
  }

  function discardPendingRecording(recordingId: string | undefined) {
    if (!recordingId || accentOracleMode !== "api") {
      return;
    }
    void submitResearchConsent({ recordingId, consent: false }).catch(() => {
      // Best-effort cleanup of the unused validation sample.
    });
  }

  function switchOracleMode(nextMode: AccentOracleMode) {
    setModeOverride(nextMode);
    setAccentOracleMode(nextMode);
  }

  async function analyzeRecording(audio: Blob) {
    if (!activePrompt) {
      setAnalysisError("No s'ha pogut carregar el text a llegir. Torna a començar.");
      return;
    }

    setAnalysisError(null);
    setIsAnalyzing(true);
    setKeptFirstResult(false);

    try {
      const nextResult = await getAccentOracleClient().analyzeRecording(audio, {
        promptId: activePrompt.id,
        promptText: activePrompt.text,
      });
      const shouldAutoRequestValidation = accentOracleMode === "api" && needsValidation(nextResult);

      if (phase === "recording") {
        if (shouldAutoRequestValidation) {
          startValidation(nextResult);
          return;
        }

        setResult(nextResult);
        setPendingResult(null);
        setPhase("results");
        return;
      }

      if (phase === "validation" && pendingResult) {
        const chosen = pickBetterResult(pendingResult, nextResult);
        const discarded = chosen === pendingResult ? nextResult : pendingResult;
        if (discarded.recordingId && discarded.recordingId !== chosen.recordingId) {
          discardPendingRecording(discarded.recordingId);
        }
        setKeptFirstResult(chosen === pendingResult && nextResult !== pendingResult);
        setResult(chosen);
        setPendingResult(null);
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

    setResult(pendingResult);
    setPendingResult(null);
    setKeptFirstResult(false);
    setPhase("results");
  }

  const showPrivacyFooter =
    phase === "landing" || phase === "recording" || phase === "validation" || phase === "results";
  const analysisStatusText =
    accentOracleMode === "api" && devToolsEnabled
      ? "Analitzant la mostra… La inferència pot trigar una mica en CPU."
      : "Analitzant la mostra…";

  return (
    <main className={`app-shell ${phase === "landing" ? "landing-main" : ""}`.trim()}>
      <div className="theme-toggle-row">
        {devToolsEnabled && (
          <div className="dev-tools-bar" role="group" aria-label="Eines de desenvolupament">
            <span className="dev-tools-label">Dev</span>
            <button
              aria-pressed={accentOracleMode === "mock"}
              className="dev-mode-toggle"
              onClick={() => switchOracleMode(accentOracleMode === "mock" ? "api" : "mock")}
              type="button"
            >
              Mode: {accentOracleMode === "mock" ? "mock" : "API"}
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
                Tinc 18 anys o més i accepto desar la meva gravació per a recerca, sense compte (opcional).
              </span>
            </label>
            <p className="landing-hint">
              Si ho marques, podem guardar l&apos;àudio i metadades (incloent-hi l&apos;IP) per entrenar models.
              Detalls a la{" "}
              <button className="privacy-link legal-inline-link" onClick={() => openLegalDoc("privacy")} type="button">
                Política de privadesa
              </button>
              .
            </p>
          </div>
        </section>
      )}

      {(phase === "recording" || phase === "validation") && activePrompt && (
        <>
          <section className="card prompt-card">
            {phase === "validation" ? (
              <>
                <p className="eyebrow">Segona mostra</p>
                <h2>No n&apos;hem prou segur — volem una segona mostra</h2>
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
            ) : (
              <>
                <p className="eyebrow">Primera mostra</p>
                <p className="read-instruction">Llegeix aquest text en veu alta</p>
                <blockquote>{activePrompt.text}</blockquote>
              </>
            )}

            <RecorderPanel disabled={isAnalyzing} onRecordingReady={analyzeRecording} theme={theme} />
          </section>

          {isAnalyzing && (
            <section className="analysis-status" aria-live="polite">
              {analysisStatusText}
            </section>
          )}
          {analysisError && <p className="error-message">{analysisError}</p>}
        </>
      )}

      {phase === "results" && result && (
        <>
          {devToolsEnabled && keptFirstResult && (
            <p className="validation-kept-note">
              <span className="dev-only-hint">*dev mode</span> La segona mostra no ha millorat la
              confiança; mostrem el resultat de la primera lectura.
            </p>
          )}
          <ResultsMapStage scores={result.scores} />
          <ResultsConsentFeedback
            preConsented={preConsented}
            recordingId={result.recordingId}
            onOpenLegalDoc={openLegalDoc}
            onResearchRetained={() => setResearchRetained(true)}
          />
          <button className="secondary restart-button" onClick={resetFlow} type="button">
            Torna a començar
          </button>
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
