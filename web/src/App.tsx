import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, MoonStar, RotateCcw, Sun } from "lucide-react";
import "./App.css";
import { LegalDocument } from "./components/LegalDocument";
import { ResultsMapStage } from "./components/ResultsMapStage";
import { ResultsOriginFeedback } from "./components/ResultsOriginFeedback";
import { DevScoreTuner } from "./components/DevScoreTuner";
import { ManageMyData } from "./components/ManageMyData";
import { RecorderPanel } from "./components/RecorderPanel";
import { ResultsConsentFeedback } from "./components/ResultsConsentFeedback";
import { ShareResultsModal } from "./components/ShareResultsModal";
import {
  createClientId,
  DIALECT_ZONE_LABELS,
  finalizeAnalysis,
  getAccentOracleClient,
  getAccentOracleMode,
  resetMockAnalyzeOrdinal,
  submitResearchConsent,
  type AccentOracleResult,
  type AccentScores,
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
import { useFocusTrap } from "./hooks/useFocusTrap";
import type { LegalDocId } from "./lib/legalDocs";
import { aggregateValidationResults, needsValidation } from "./lib/needsValidation";
import {
  pickPrimaryReadAloudPrompt,
  pickReadAloudPrompt,
  rememberLastPromptId,
  type ReadAloudPrompt,
} from "./lib/prompts";
import {
  ANALYZE_UNAVAILABLE_MESSAGE,
  RESEND_RECORDING_LABEL,
  warmBackend,
} from "./lib/coldStart";
import { trackUiEvent } from "./lib/telemetry";

type AppPhase = "landing" | "recording" | "validation" | "offer-third" | "refine" | "results";
type ChromeOverlay = "manage-data" | LegalDocId;
type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "accent-oracle-theme";
// Re-enable only together with ORACLE_RETAIN_USER_DATA=1 on the API backend.
const RESEARCH_RETENTION_ENABLED = import.meta.env.VITE_RESEARCH_RETENTION_ENABLED === "1";
/** Slightly longer than `--theme-crossfade-duration` so the class outlives the CSS transition. */
const THEME_CROSSFADE_CLASS_MS = 500;

function applyThemeToDocument(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

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

function overlayTitle(overlay: ChromeOverlay): string {
  if (overlay === "manage-data") {
    return "Gestiona les meves dades";
  }
  return overlay === "privacy" ? "Política de privadesa" : "Termes d'ús";
}

function App() {
  const [phase, setPhase] = useState<AppPhase>("landing");
  const [chromeOverlay, setChromeOverlay] = useState<ChromeOverlay | null>(null);
  const overlayOriginRef = useRef<ChromeOverlay | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = getInitialTheme();
    if (typeof document !== "undefined") {
      applyThemeToDocument(initial);
    }
    return initial;
  });
  const [result, setResult] = useState<AccentOracleResult | null>(null);
  const [pendingResult, setPendingResult] = useState<AccentOracleResult | null>(null);
  const [takeResults, setTakeResults] = useState<AccentOracleResult[]>([]);
  const [analysisSessionId, setAnalysisSessionId] = useState<string | null>(null);
  const [terminalUnresolved, setTerminalUnresolved] = useState(false);
  const [terminalTakeCount, setTerminalTakeCount] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  /** Last take kept so a cold-start failure can be resent without re-recording. */
  const [retryAudio, setRetryAudio] = useState<Blob | null>(null);
  const [devToolsEnabled] = useState(() => getInitialDevToolsEnabled());
  const [accentOracleMode, setAccentOracleMode] = useState<AccentOracleMode>(() => getAccentOracleMode());
  const [activePrompt, setActivePrompt] = useState<ReadAloudPrompt | null>(null);
  const [primaryPromptId, setPrimaryPromptId] = useState<string | null>(null);
  const [usedPromptIds, setUsedPromptIds] = useState<string[]>([]);
  const [preConsented, setPreConsented] = useState(false);
  const [researchRetained, setResearchRetained] = useState(false);
  /** Affirmative research consent earlier in this browser visit (survives «Tornar a l'inici»). */
  const [visitResearchConsented, setVisitResearchConsented] = useState(false);
  const [rememberedComarques, setRememberedComarques] = useState<string[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [devResultsScores, setDevResultsScores] = useState<AccentScores | null>(null);
  const flowGenerationRef = useRef(0);
  const leavePurgeRef = useRef({
    phase,
    result,
    analysisSessionId,
    researchRetained,
    accentOracleMode,
  });
  useFocusTrap(overlayRef, chromeOverlay != null, chromeOverlay);

  useEffect(() => {
    trackUiEvent("homepage_viewed");
  }, []);

  function syncDevResultsScores(next: AccentOracleResult) {
    if (devToolsEnabled) {
      setDevResultsScores({ ...next.scores });
    }
  }

  useLayoutEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  function toggleTheme() {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) {
      root.classList.add("theme-transition");
      window.setTimeout(() => {
        root.classList.remove("theme-transition");
      }, THEME_CROSSFADE_CLASS_MS);
    }
    applyThemeToDocument(nextTheme);
    setTheme(nextTheme);
  }

  useEffect(() => {
    leavePurgeRef.current = {
      phase,
      result,
      analysisSessionId,
      researchRetained,
      accentOracleMode,
    };
  }, [phase, result, analysisSessionId, researchRetained, accentOracleMode]);

  useEffect(() => {
    function purgePendingOnLeave() {
      const {
        phase: currentPhase,
        analysisSessionId: currentSessionId,
        researchRetained: retained,
        accentOracleMode: mode,
      } = leavePurgeRef.current;
      if (
        !RESEARCH_RETENTION_ENABLED ||
        (currentPhase !== "results" &&
          currentPhase !== "validation" &&
          currentPhase !== "offer-third" &&
          currentPhase !== "refine") ||
        retained ||
        !isApiMode(mode) ||
        !currentSessionId
      ) {
        return;
      }
      void submitResearchConsent({
        analysisSessionId: currentSessionId,
        consent: false,
      }).catch(() => {
        // Best-effort purge when the user abandons results without opting in.
      });
    }

    function handlePageHide() {
      purgePendingOnLeave();
    }

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  function declinePendingAnalysis(sessionId: string | null) {
    if (!RESEARCH_RETENTION_ENABLED || !sessionId || !isApiMode(accentOracleMode) || researchRetained) {
      return;
    }
    void submitResearchConsent({ analysisSessionId: sessionId, consent: false }).catch(() => {
      // Best-effort purge of pending audio when research was not retained.
    });
  }

  function openOverlay(next: ChromeOverlay) {
    overlayOriginRef.current = null;
    setChromeOverlay(next);
  }

  function closeOverlay() {
    if (
      (chromeOverlay === "privacy" || chromeOverlay === "terms") &&
      overlayOriginRef.current === "manage-data"
    ) {
      overlayOriginRef.current = null;
      setChromeOverlay("manage-data");
      return;
    }
    overlayOriginRef.current = null;
    setChromeOverlay(null);
  }

  function openLegalDoc(docId: LegalDocId) {
    if (chromeOverlay === "manage-data") {
      overlayOriginRef.current = "manage-data";
    } else if (chromeOverlay !== "privacy" && chromeOverlay !== "terms") {
      overlayOriginRef.current = null;
    }
    setChromeOverlay(docId);
  }

  useEffect(() => {
    if (!chromeOverlay) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
    // closeOverlay only depends on chromeOverlay / origin ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- overlay identity
  }, [chromeOverlay]);

  function resetFlow() {
    flowGenerationRef.current += 1;
    declinePendingAnalysis(analysisSessionId);
    resetMockAnalyzeOrdinal();
    // Only carry consent after an affirmative retain earlier in this visit
    // (landing auto-promote or results Sí) — not a bare unchecked→checked checkbox.
    const keepConsent = visitResearchConsented || researchRetained;
    setPhase("landing");
    setChromeOverlay(null);
    overlayOriginRef.current = null;
    setResult(null);
    setPendingResult(null);
    setTakeResults([]);
    setAnalysisSessionId(null);
    setTerminalUnresolved(false);
    setTerminalTakeCount(0);
    setIsAnalyzing(false);
    setAnalysisError(null);
    setRetryAudio(null);
    setActivePrompt(null);
    setPrimaryPromptId(null);
    setUsedPromptIds([]);
    // Carry affirmative consent into the next run so landing can skip re-ask and
    // the results funnel auto-promotes the new analysis session. Comarca memory
    // is kept separately (only set after a successful comarca submit).
    setVisitResearchConsented(keepConsent);
    setPreConsented(keepConsent);
    setResearchRetained(false);
    setShareOpen(false);
    setDevResultsScores(null);
  }

  function markResearchRetained() {
    setResearchRetained(true);
    setVisitResearchConsented(true);
    setPreConsented(true);
  }

  function clearVisitResearchConsent() {
    setVisitResearchConsented(false);
    setPreConsented(false);
    setResearchRetained(false);
    setRememberedComarques([]);
  }

  async function finalizeDisplayedResult(
    next: AccentOracleResult,
    takeCount: number,
    terminalState: "results" | "skipped-third" | "unresolved",
    sessionId: string | null = analysisSessionId,
  ) {
    const generation = flowGenerationRef.current;
    setResult(next);
    setPendingResult(null);
    const unresolved = terminalState === "unresolved" || needsValidation(next);
    setTerminalUnresolved(unresolved);
    setTerminalTakeCount(takeCount);
    syncDevResultsScores(next);
    setPhase("results");

    if (RESEARCH_RETENTION_ENABLED && sessionId) {
      try {
        await finalizeAnalysis({
          analysisSessionId: sessionId,
          finalResult: next,
          takeCount,
          terminalState: unresolved ? "unresolved" : terminalState,
        });
        if (generation !== flowGenerationRef.current) {
          return;
        }
        trackUiEvent("analysis_finalized");
        if (unresolved) {
          trackUiEvent("analysis_unresolved");
        }
      } catch {
        if (generation !== flowGenerationRef.current) {
          return;
        }
        setAnalysisError("No s'ha pogut desar el resultat de la sessió.");
      }
    }
  }

  async function goToResultsOrOfferThird(
    next: AccentOracleResult,
    takeCount: number,
    sessionId: string | null = analysisSessionId,
  ) {
    if (needsValidation(next)) {
      setResult(next);
      setPendingResult(null);
      setTerminalUnresolved(true);
      setTerminalTakeCount(takeCount);
      trackUiEvent("third_take_offered");
      setPhase("offer-third");
      return;
    }
    await finalizeDisplayedResult(next, takeCount, "results", sessionId);
  }

  function startRecording() {
    warmBackend();
    resetMockAnalyzeOrdinal();
    const prompt = pickPrimaryReadAloudPrompt();
    setAnalysisSessionId(isApiMode(accentOracleMode) ? null : createClientId());
    setActivePrompt(prompt);
    setPrimaryPromptId(prompt.id);
    setUsedPromptIds([prompt.id]);
    setPendingResult(null);
    setResult(null);
    setTakeResults([]);
    setTerminalUnresolved(false);
    setTerminalTakeCount(0);
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
    trackUiEvent("validation_started");
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

  async function skipThird() {
    if (result) {
      const generation = flowGenerationRef.current;
      setIsAnalyzing(true);
      trackUiEvent("third_take_skipped");
      await finalizeDisplayedResult(result, terminalTakeCount || 2, "skipped-third");
      if (generation === flowGenerationRef.current) {
        setIsAnalyzing(false);
      }
    }
  }

  function switchOracleMode() {
    const nextMode = cycleAccentOracleMode(accentOracleMode);
    setModeOverride(nextMode);
    setAccentOracleMode(nextMode);
    resetMockAnalyzeOrdinal();
  }

  async function analyzeRecording(audio: Blob) {
    if (!activePrompt) {
      setAnalysisError("No s'ha pogut carregar el text a llegir. Torna a l'inici.");
      return;
    }

    setRetryAudio(audio);
    setAnalysisError(null);
    setIsAnalyzing(true);
    const generation = flowGenerationRef.current;
    trackUiEvent("analyze_pressed");

    try {
      const nextResult = await getAccentOracleClient().analyzeRecording(audio, {
        promptId: activePrompt.id,
        promptText: activePrompt.text,
        sentenceIds: activePrompt.sentenceIds,
      }, analysisSessionId ?? undefined);
      if (generation !== flowGenerationRef.current) {
        return;
      }
      setRetryAudio(null);
      trackUiEvent("analysis_completed");
      if (nextResult.analysisSessionId && !analysisSessionId) {
        setAnalysisSessionId(nextResult.analysisSessionId);
      }
      const sessionIdForResult = nextResult.analysisSessionId ?? analysisSessionId;
      const allTakeResults = [...takeResults, nextResult];
      setTakeResults(allTakeResults);

      if (phase === "recording") {
        if (needsValidation(nextResult)) {
          startValidation(nextResult);
          return;
        }

        await goToResultsOrOfferThird(
          nextResult,
          nextResult.takeIndex ?? 1,
          sessionIdForResult,
        );
        return;
      }

      if (phase === "validation" && pendingResult) {
        const merged = aggregateValidationResults(allTakeResults);
        await goToResultsOrOfferThird(
          merged,
          allTakeResults.length,
          sessionIdForResult,
        );
        return;
      }

      if (phase === "refine" && result) {
        const merged = aggregateValidationResults(allTakeResults);
        trackUiEvent("third_take_completed");
        await finalizeDisplayedResult(
          merged,
          allTakeResults.length,
          needsValidation(merged) ? "unresolved" : "results",
          sessionIdForResult,
        );
      }
    } catch (error) {
      if (generation !== flowGenerationRef.current) {
        return;
      }
      setAnalysisError(
        error instanceof Error ? error.message : "L'anàlisi ha fallat. Prova de gravar una altra mostra.",
      );
    } finally {
      if (generation === flowGenerationRef.current) {
        setIsAnalyzing(false);
      }
    }
  }

  function skipValidation() {
    if (!pendingResult) {
      return;
    }

    void finalizeDisplayedResult(
      pendingResult,
      pendingResult.takeIndex ?? 1,
      "unresolved",
      analysisSessionId ?? pendingResult.analysisSessionId ?? null,
    );
  }

  const showRecorder =
    (phase === "recording" || phase === "validation" || phase === "refine") && activePrompt;
  const showRestartControl =
    Boolean(showRecorder) || phase === "offer-third" || phase === "results";

  const resultsScores =
    phase === "results" && result
      ? devToolsEnabled && devResultsScores
        ? devResultsScores
        : result.scores
      : null;

  return (
    <main
      className={`app-shell ${phase === "landing" ? "landing-main" : ""} ${showRecorder || phase === "offer-third" ? "recording-main" : ""}`.trim()}
    >
      <div className="theme-toggle-row">
        <div className="header-nav-side">
          {showRestartControl && (
            <button
              aria-label="Tornar a l'inici"
              className="nav-restart-btn"
              onClick={resetFlow}
              type="button"
            >
              <span className="nav-restart-knob" aria-hidden="true">
                <RotateCcw className="nav-restart-icon" />
              </span>
              <span className="nav-restart-label">Tornar a l&apos;inici</span>
            </button>
          )}
        </div>
        <div className="header-actions-side">
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
            className={`theme-switch theme-switch-${theme}`}
            onClick={toggleTheme}
            type="button"
          >
            <span className="theme-switch-label theme-switch-label-day" aria-hidden="true">
              Mode clar
            </span>
            <span className="theme-switch-label theme-switch-label-night" aria-hidden="true">
              Mode fosc
            </span>
            <span className="theme-switch-knob" aria-hidden="true">
              {theme === "light" ? (
                <Sun className="theme-switch-icon" />
              ) : (
                <MoonStar className="theme-switch-icon" />
              )}
            </span>
          </button>
        </div>
      </div>
      {phase === "landing" && (
        <section className="hero landing-hero">
          <div className="hero-copy landing-copy">
            <p className="eyebrow">Oracle d&apos;accents catalans</p>
            <h1>A quin accent s&apos;assembla la teva veu?</h1>
            <p>
              Llegeix un text en veu alta i descobreix amb quines zones dialectals del català la teva veu
              sona més similar.
            </p>
            <button className="primary hero-link" onClick={startRecording} type="button">
              Comença
              <ChevronRight aria-hidden="true" className="hero-link-icon" />
            </button>
            {RESEARCH_RETENTION_ENABLED ? visitResearchConsented ? (
              <p className="landing-preconsent-retained">
                <button
                  className="privacy-link legal-inline-link"
                  onClick={() => openLegalDoc("privacy")}
                  type="button"
                >
                  Política de privadesa
                </button>
              </p>
            ) : (
              <label className="research-consent-check landing-preconsent">
                <input
                  checked={preConsented}
                  onChange={(event) => setPreConsented(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Vull col·laborar a la millora de models en català amb totes les gravacions
                  d&apos;aquesta sessió{" "}
                  <span className="consent-age-clause">(tinc 18 anys o més).</span>{" "}
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
            ) : (
              <p className="landing-preconsent-retained">
                No desem gravacions, resultats ni dades vinculades a l&apos;anàlisi. Les gravacions
                s&apos;esborren en acabar l&apos;anàlisi.
              </p>
            )}
          </div>
        </section>
      )}

      {phase === "offer-third" && result && (
        <section className="card prompt-card offer-third-card" aria-label="Tercera lectura opcional">
          <h2>Tercera lectura</h2>
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
            <button
              className="secondary"
              disabled={isAnalyzing}
              onClick={() => void skipThird()}
              type="button"
            >
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
            ) : (
              <>
                <p className="read-instruction">Llegeix aquest text en veu alta</p>
                <blockquote>{activePrompt.text}</blockquote>
              </>
            )}

            <p className="quiet-recording-hint">Procura gravar en un lloc tranquil.</p>
            <RecorderPanel
              analyzing={isAnalyzing}
              disabled={isAnalyzing}
              onRecordingReady={analyzeRecording}
              theme={theme}
            />
            {analysisError && (
              <p className="error-message" role="alert">
                {analysisError}
              </p>
            )}
            {analysisError === ANALYZE_UNAVAILABLE_MESSAGE && retryAudio && (
              <div className="validation-actions">
                <button
                  className="secondary"
                  disabled={isAnalyzing}
                  onClick={() => {
                    void analyzeRecording(retryAudio);
                  }}
                  type="button"
                >
                  {RESEND_RECORDING_LABEL}
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {phase === "results" && result && resultsScores && (
        <>
          {devToolsEnabled && devResultsScores && (
            <DevScoreTuner
              scores={devResultsScores}
              onChange={setDevResultsScores}
              onReset={() => setDevResultsScores({ ...result.scores })}
            />
          )}
          <ResultsMapStage
            scores={resultsScores}
            unresolved={terminalUnresolved}
            confidenceSummary={result.confidenceSummary}
          />
          {analysisError && (
            <p className="error-message" role="alert">
              {analysisError}
            </p>
          )}
          {RESEARCH_RETENTION_ENABLED ? (
            <ResultsConsentFeedback
              preConsented={preConsented}
              initialComarques={rememberedComarques}
              recordingId={result.recordingId}
              analysisSessionId={analysisSessionId ?? result.analysisSessionId}
              onResearchRetained={markResearchRetained}
              onResearchDeclined={clearVisitResearchConsent}
              onComarquesSaved={setRememberedComarques}
            />
          ) : (
            <ResultsOriginFeedback />
          )}
          {shareOpen && (
            <ShareResultsModal
              scores={resultsScores}
              theme={theme}
              unresolved={terminalUnresolved}
              onClose={() => setShareOpen(false)}
            />
          )}
        </>
      )}

      {phase === "results" && (
        <div className="results-share-row">
          <button
            className="secondary results-share-button"
            onClick={() => {
              trackUiEvent("share_clicked");
              setShareOpen(true);
            }}
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
      )}

      {chromeOverlay && (
        <div
          ref={overlayRef}
          className="chrome-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={overlayTitle(chromeOverlay)}
          tabIndex={-1}
        >
          {RESEARCH_RETENTION_ENABLED && chromeOverlay === "manage-data" && (
            <ManageMyData
              onBack={closeOverlay}
              onOpenPrivacy={() => openLegalDoc("privacy")}
              onOpenTerms={() => openLegalDoc("terms")}
            />
          )}
          {(chromeOverlay === "privacy" || chromeOverlay === "terms") && (
            <LegalDocument docId={chromeOverlay} onBack={closeOverlay} onOpenOther={openLegalDoc} />
          )}
        </div>
      )}

      <footer className="privacy-footer">
        {RESEARCH_RETENTION_ENABLED && (
          <>
            <button className="privacy-link" onClick={() => openOverlay("manage-data")} type="button">
              Gestiona les meves dades
            </button>
            <span className="privacy-footer-sep" aria-hidden="true">·</span>
            <button className="privacy-link" onClick={() => openLegalDoc("privacy")} type="button">
              Privadesa
            </button>
            <span className="privacy-footer-sep" aria-hidden="true">·</span>
            <button className="privacy-link" onClick={() => openLegalDoc("terms")} type="button">
              Termes
            </button>
            <span className="privacy-footer-sep" aria-hidden="true">·</span>
          </>
        )}
        <a
          className="privacy-link open-source-link"
          href="https://github.com/miquelt9/accents-cat"
          rel="noreferrer"
          target="_blank"
        >
          <svg aria-hidden="true" height="15" viewBox="0 0 24 24" width="15">
            <path
              d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.11.82-.26.82-.577v-2.234c-3.338.726-4.042-1.416-4.042-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.42-1.305.763-1.605-2.665-.303-5.466-1.333-5.466-5.93 0-1.31.468-2.38 1.236-3.22-.124-.303-.536-1.523.117-3.176 0 0 1.008-.323 3.3 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.29-1.553 3.295-1.23 3.295-1.23.655 1.653.243 2.873.12 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.804 5.624-5.475 5.92.43.372.814 1.102.814 2.222v3.293c0 .32.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
              fill="currentColor"
            />
          </svg>
          Projecte de codi obert
        </a>
      </footer>
    </main>
  );
}

export default App;
