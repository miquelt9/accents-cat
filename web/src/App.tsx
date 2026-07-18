import { useEffect, useState } from "react";
import "./App.css";
import { ResultsMapStage } from "./components/ResultsMapStage";
import { ManageMyData } from "./components/ManageMyData";
import { RecorderPanel } from "./components/RecorderPanel";
import { ResultsFeedback } from "./components/ResultsFeedback";
import {
  DIALECT_ZONE_LABELS,
  getAccentOracleClient,
  getAccentOracleMode,
  type AccentOracleResult,
} from "./lib/accentOracleClient";
import {
  isDevToolsEnabled,
  setModeOverride,
  syncDevFlagFromUrl,
  type AccentOracleMode,
} from "./lib/devFlags";
import { needsValidation, pickBetterResult } from "./lib/needsValidation";
import { PRIMARY_READ_ALOUD_PROMPT, VALIDATION_READ_ALOUD_PROMPT } from "./lib/prompts";
import { appendLedgerEntry } from "./lib/submissionLedger";

type AppPhase = "landing" | "recording" | "validation" | "results" | "manage-data";
type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "accent-oracle-theme";

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
  const [persistConsent, setPersistConsent] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  function openManageData() {
    setReturnPhase(phase === "manage-data" ? "landing" : phase);
    setPhase("manage-data");
  }

  function closeManageData() {
    setPhase(returnPhase === "manage-data" ? "landing" : returnPhase);
  }

  function resetFlow() {
    setPhase("landing");
    setReturnPhase("landing");
    setResult(null);
    setPendingResult(null);
    setIsAnalyzing(false);
    setAnalysisError(null);
    setKeptFirstResult(false);
    setPersistConsent(false);
  }

  function rememberRecording(nextResult: AccentOracleResult) {
    if (nextResult.recordingId) {
      appendLedgerEntry(nextResult.recordingId, "recording");
    }
  }

  function switchOracleMode(nextMode: AccentOracleMode) {
    setModeOverride(nextMode);
    setAccentOracleMode(nextMode);
  }

  async function analyzeRecording(audio: Blob) {
    setAnalysisError(null);
    setIsAnalyzing(true);
    setKeptFirstResult(false);

    try {
      const nextResult = await getAccentOracleClient().analyzeRecording(audio, {
        persist: persistConsent,
      });
      rememberRecording(nextResult);
      const shouldAutoRequestValidation = accentOracleMode === "api" && needsValidation(nextResult);

      if (phase === "recording") {
        if (shouldAutoRequestValidation) {
          setPendingResult(nextResult);
          setResult(null);
          setPhase("validation");
          return;
        }

        setResult(nextResult);
        setPendingResult(null);
        setPhase("results");
        return;
      }

      if (phase === "validation" && pendingResult) {
        const chosen = pickBetterResult(pendingResult, nextResult);
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

  const activePrompt =
    phase === "validation" ? VALIDATION_READ_ALOUD_PROMPT : PRIMARY_READ_ALOUD_PROMPT;

  const showPrivacyFooter = phase === "landing" || phase === "results";
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
            <button className="primary hero-link" onClick={() => setPhase("recording")} type="button">
              Descobreix el resultat
            </button>
          </div>
        </section>
      )}

      {(phase === "recording" || phase === "validation") && (
        <>
          <section className="card prompt-card">
            {phase === "validation" ? (
              <>
                <p className="eyebrow">Segona mostra</p>
                <h2>No n&apos;hem prou segur — volem una segona mostra</h2>
                {pendingResult && (
                  <p className="validation-note">
                    Les zones més properes són{" "}
                    <strong>{DIALECT_ZONE_LABELS[pendingResult.topLabel]}</strong> i{" "}
                    <strong>{DIALECT_ZONE_LABELS[pendingResult.runnerUpLabel]}</strong>. Una segona lectura
                    pot ajudar a afinar el resultat.
                  </p>
                )}
                <p className="read-instruction">Llegeix aquest text en veu alta</p>
                <blockquote>{activePrompt}</blockquote>
                <div className="validation-actions">
                  <button className="secondary" disabled={isAnalyzing} onClick={skipValidation} type="button">
                    Mostra el resultat igualment
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">Primera mostra</p>
                <p className="read-instruction">Llegeix aquest text en veu alta</p>
                <blockquote>{activePrompt}</blockquote>
              </>
            )}

            <label className="persist-consent">
              <input
                checked={persistConsent}
                disabled={isAnalyzing}
                onChange={(event) => setPersistConsent(event.target.checked)}
                type="checkbox"
              />
              <span>
                Desa aquesta gravació al servidor per millorar el model (opcional; desactivat per defecte).
              </span>
            </label>

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
              La segona mostra no ha millorat la confiança; mostrem el resultat de la primera lectura.
            </p>
          )}
          <ResultsMapStage scores={result.scores} />
          <ResultsFeedback recordingId={result.recordingId} />
          <button className="secondary restart-button" onClick={resetFlow} type="button">
            Torna a començar
          </button>
        </>
      )}

      {phase === "manage-data" && <ManageMyData onBack={closeManageData} />}

      {showPrivacyFooter && (
        <footer className="privacy-footer">
          <button className="privacy-link" onClick={openManageData} type="button">
            Gestiona les meves dades
          </button>
        </footer>
      )}
    </main>
  );
}

export default App;
