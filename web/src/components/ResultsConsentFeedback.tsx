import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react";
import {
  createClientId,
  submitFeedback,
  submitResearchConsent,
  type SelfReportedDialect,
} from "../lib/accentOracleClient";
import { selfReportedDialectFromComarques } from "../lib/comarcaDisplay";
import { LEGAL_POLICY_VERSION, type LegalDocId } from "../lib/legalDocs";
import { appendLedgerEntry } from "../lib/submissionLedger";
import { trackUiEvent } from "../lib/telemetry";
import { ComarcaPicker } from "./ComarcaPicker";
import { LegalDocument } from "./LegalDocument";
import { useFocusTrap } from "../hooks/useFocusTrap";

const SHEET_DISMISS_OFFSET_PX = 110;
const SHEET_DISMISS_VELOCITY = 720;

type FunnelStep = "promoting" | "ask" | "consent" | "comarca" | "done";

interface ResultsConsentFeedbackProps {
  recordingId?: string;
  analysisSessionId?: string;
  preConsented: boolean;
  /** Comarques declared on a prior run in this visit; pre-fills the picker. */
  initialComarques?: string[];
  onResearchRetained?: () => void;
  onResearchDeclined?: () => void;
  onComarquesSaved?: (comarques: string[]) => void;
}

function ThumbUpIcon() {
  return (
    <svg aria-hidden="true" className="feedback-thumb-icon" viewBox="0 0 24 24">
      <path
        d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h10.28a2 2 0 0 0 2-1.7l1.38-9A2 2 0 0 0 18.72 9H14Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
      <path
        d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg aria-hidden="true" className="feedback-thumb-icon" viewBox="0 0 24 24">
      <path
        d="M10 15v4a3 3 0 0 0 3 3l4-9V2H6.72a2 2 0 0 0-2 1.7l-1.38 9A2 2 0 0 0 5.28 15H10Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
      <path
        d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

export function ResultsConsentFeedback({
  recordingId,
  analysisSessionId,
  preConsented,
  initialComarques = [],
  onResearchRetained,
  onResearchDeclined,
  onComarquesSaved,
}: ResultsConsentFeedbackProps) {
  const reduceMotion = useReducedMotion();
  const sheetPanelRef = useRef<HTMLDivElement>(null);
  const legalLayerRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const sheetY = useMotionValue(0);
  const backdropOpacity = useTransform(sheetY, [0, 260], [1, 0.2]);
  const [visualViewportStyle, setVisualViewportStyle] = useState<CSSProperties>({});
  const [isCompact, setIsCompact] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false,
  );
  const [step, setStep] = useState<FunnelStep>(
    preConsented && (analysisSessionId || recordingId) ? "promoting" : "ask",
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null);
  const [promoted, setPromoted] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | undefined>();
  const [researchSaved, setResearchSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedComarques, setSelectedComarques] = useState<string[]>([]);
  const initialComarquesRef = useRef(initialComarques);

  useEffect(() => {
    initialComarquesRef.current = initialComarques;
  }, [initialComarques]);

  function seedComarquesFromMemory() {
    const remembered = initialComarquesRef.current;
    setSelectedComarques(remembered.length > 0 ? [...remembered] : []);
  }

  const canDragSheet = isCompact && !reduceMotion && !isSubmitting && step !== "comarca";
  useFocusTrap(sheetPanelRef, sheetOpen && !legalDoc);
  useFocusTrap(legalLayerRef, legalDoc != null, legalDoc);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const syncCompact = () => setIsCompact(mediaQuery.matches);

    syncCompact();
    mediaQuery.addEventListener("change", syncCompact);
    return () => mediaQuery.removeEventListener("change", syncCompact);
  }, []);

  useEffect(() => {
    if (!sheetOpen) {
      sheetY.set(0);
      return;
    }
    if (reduceMotion || step === "comarca") {
      sheetY.set(0);
      return;
    }
    sheetY.set(36);
    const controls = animate(sheetY, 0, {
      type: "spring",
      stiffness: 420,
      damping: 38,
      mass: 0.85,
    });
    return () => controls.stop();
  }, [sheetOpen, reduceMotion, sheetY, step]);

  useEffect(() => {
    if (!sheetOpen || step !== "comarca") {
      return;
    }

    const visualViewport = window.visualViewport;
    const syncViewport = () => {
      const height = visualViewport?.height ?? window.innerHeight;
      const offsetTop = visualViewport?.offsetTop ?? 0;
      const keyboardInset = Math.max(0, window.innerHeight - height - offsetTop);
      setVisualViewportStyle({
        "--feedback-viewport-top": `${offsetTop}px`,
        "--feedback-viewport-height": `${height}px`,
        "--feedback-keyboard-inset": `${keyboardInset}px`,
      } as CSSProperties);
    };

    syncViewport();
    visualViewport?.addEventListener("resize", syncViewport);
    visualViewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      visualViewport?.removeEventListener("resize", syncViewport);
      visualViewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, [sheetOpen, step]);

  useEffect(() => {
    if (!preConsented || (!analysisSessionId && !recordingId) || promoted || step !== "promoting") {
      return;
    }

    const retainedSessionId = analysisSessionId;
    const retainedRecordingId = recordingId;
    let cancelled = false;

    async function autoPromote() {
      setIsSubmitting(true);
      setError(null);

      try {
        await submitResearchConsent({
          ...(retainedSessionId
            ? { analysisSessionId: retainedSessionId }
            : { recordingId: retainedRecordingId }),
          consent: true,
          ageConfirmed: true,
          policyVersion: LEGAL_POLICY_VERSION,
        });
        if (cancelled) {
          return;
        }
        trackUiEvent("research_consent_accepted");
        if (retainedSessionId) {
          appendLedgerEntry(retainedSessionId, "analysis-session");
        } else if (retainedRecordingId) {
          appendLedgerEntry(retainedRecordingId, "recording");
        }
        onResearchRetained?.();
        setPromoted(true);
        setResearchSaved(true);
        setStep("ask");
      } catch {
        if (cancelled) {
          return;
        }
        // Landing pre-consent failed (network / expired pending). Re-open the
        // consent sheet instead of a sticky red banner under the thumbs.
        setStep("consent");
        setSheetOpen(true);
      } finally {
        if (!cancelled) {
          setIsSubmitting(false);
        }
      }
    }

    void autoPromote();

    return () => {
      cancelled = true;
    };
  }, [analysisSessionId, preConsented, recordingId, promoted, step, onResearchRetained]);

  async function submitComarcaFeedback(
    payload: {
      comarques: string[];
      selfReportedDialect: SelfReportedDialect;
    },
  ) {
    setIsSubmitting(true);
    setError(null);

    try {
      if (analysisSessionId || recordingId) {
        const response = await submitFeedback({
          ...(feedbackId ? { feedbackId } : {}),
          ...(analysisSessionId ? { analysisSessionId } : {}),
          recordingId,
          ...(payload.comarques.length > 0 ? { comarques: payload.comarques } : {}),
          selfReportedDialect: payload.selfReportedDialect,
        });
        if (!feedbackId) {
          setFeedbackId(response.feedbackId);
          appendLedgerEntry(response.feedbackId, "feedback");
        }
      }

      setSheetOpen(false);
      setStep("done");
      setSelectedComarques([]);
      if (payload.comarques.length > 0) {
        onComarquesSaved?.(payload.comarques);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No s'ha pogut enviar el comentari. Torna-ho a provar.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitSelectedComarques(slugs: string[]) {
    if (slugs.length === 0) {
      return;
    }
    const dialect = selfReportedDialectFromComarques(slugs) ?? "mixed";
    await submitComarcaFeedback({ comarques: slugs, selfReportedDialect: dialect });
  }

  function dismissSheet() {
    if (isSubmitting || legalDoc) {
      return;
    }
    // Match research-consent "No": clear thumb selection so dismiss (backdrop /
    // close / Escape / drag) invites another thumb click to reopen the funnel.
    setWasCorrect(null);
    setSheetOpen(false);
    setStep("ask");
    setError(null);
  }

  function handleSheetDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (!canDragSheet) {
      return;
    }
    if (info.offset.y > SHEET_DISMISS_OFFSET_PX || info.velocity.y > SHEET_DISMISS_VELOCITY) {
      dismissSheet();
      return;
    }
    void animate(sheetY, 0, {
      type: "spring",
      stiffness: 460,
      damping: 40,
      mass: 0.8,
    });
  }

  function startSheetDrag(event: ReactPointerEvent) {
    if (!canDragSheet || legalDoc) {
      return;
    }
    if ((event.target as HTMLElement | null)?.closest(".feedback-sheet-close")) {
      return;
    }
    dragControls.start(event);
  }

  useEffect(() => {
    if (!sheetOpen && !legalDoc) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (legalDoc) {
        setLegalDoc(null);
        return;
      }
      if (!isSubmitting) {
        dismissSheet();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Dismiss closes without submitting a partial comarca pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sheet open / step / busy only
  }, [sheetOpen, legalDoc, isSubmitting, step]);

  useEffect(() => {
    if (sheetOpen && !legalDoc) {
      sheetPanelRef.current?.focus();
    }
  }, [sheetOpen, legalDoc]);

  useEffect(() => {
    if (!sheetOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sheetOpen]);

  async function handleAnswer(answer: boolean) {
    setWasCorrect(answer);
    setError(null);
    setIsSubmitting(true);

    try {
      let nextFeedbackId = feedbackId ?? createClientId();
      if (analysisSessionId || recordingId) {
        const response = await submitFeedback({
          ...(feedbackId ? { feedbackId } : {}),
          ...(analysisSessionId ? { analysisSessionId } : {}),
          recordingId,
          wasCorrect: answer,
        });
        nextFeedbackId = response.feedbackId;
      }

      setFeedbackId(nextFeedbackId);
      appendLedgerEntry(nextFeedbackId, "feedback");
      seedComarquesFromMemory();
      setSheetOpen(true);
      setStep(preConsented || researchSaved ? "comarca" : "consent");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No s'ha pogut enviar el comentari. Torna-ho a provar.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConsent(consent: boolean) {
    if (!consent) {
      setIsSubmitting(true);
      setError(null);

      try {
        if (analysisSessionId || recordingId) {
          await submitResearchConsent({
            ...(analysisSessionId ? { analysisSessionId } : { recordingId }),
            consent: false,
          });
        }
        setResearchSaved(false);
        setWasCorrect(null);
        setSelectedComarques([]);
        setSheetOpen(false);
        setStep("ask");
        onResearchDeclined?.();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No s'han pogut esborrar les gravacions pendents. Torna-ho a provar.",
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (analysisSessionId || recordingId) {
        await submitResearchConsent({
          ...(analysisSessionId ? { analysisSessionId } : { recordingId }),
          consent: true,
          // Affirmative Sí on this step confirms 18+ (same as landing pre-consent).
          ageConfirmed: true,
          policyVersion: LEGAL_POLICY_VERSION,
        });
        trackUiEvent("research_consent_accepted");
        if (analysisSessionId) {
          appendLedgerEntry(analysisSessionId, "analysis-session");
        } else if (recordingId) {
          appendLedgerEntry(recordingId, "recording");
        }
        onResearchRetained?.();
      }

      setResearchSaved(true);
      seedComarquesFromMemory();
      setStep("comarca");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No s'ha pogut desar la teva resposta. Torna-ho a provar.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasComarcaSelection = selectedComarques.length > 0;

  const sheetTitleId =
    step === "comarca" ? "feedback-sheet-comarca-title" : "feedback-sheet-consent-title";

  if (step === "done") {
    return (
      <section className="card feedback-card" aria-live="polite">
        <h2>
          {researchSaved
            ? "Gràcies! Hem desat la teva veu per a la recerca."
            : "Gràcies per la teva ajuda"}
        </h2>
        {researchSaved ? (
          <p>Ens ajudes a millorar la intel·ligència artificial en català.</p>
        ) : preConsented ? (
          <p>El teu comentari ens ajuda a millorar el model de similitud dialectal.</p>
        ) : (
          <p>Hem registrat el teu comentari. No desarem aquestes gravacions per a entrenament.</p>
        )}
      </section>
    );
  }

  return (
    <>
      {step === "promoting" ? (
        <section className="feedback-prompt" aria-live="polite">
          <p className="feedback-prompt-label">Desant les gravacions de la sessió per a recerca…</p>
        </section>
      ) : (
        <section className="feedback-prompt" aria-label="Comentari sobre el resultat">
          <p className="feedback-prompt-label" id="feedback-prompt-label">
            S&apos;assembla al que esperaves?
          </p>
          <div className="feedback-thumbs" role="group" aria-labelledby="feedback-prompt-label">
            <button
              aria-label="Sí"
              aria-pressed={wasCorrect === true}
              className={`feedback-thumb${wasCorrect === true ? " selected" : ""}`}
              disabled={isSubmitting}
              onClick={() => void handleAnswer(true)}
              type="button"
            >
              <ThumbUpIcon />
            </button>
            <button
              aria-label="No"
              aria-pressed={wasCorrect === false}
              className={`feedback-thumb${wasCorrect === false ? " selected" : ""}`}
              disabled={isSubmitting}
              onClick={() => void handleAnswer(false)}
              type="button"
            >
              <ThumbDownIcon />
            </button>
          </div>
          {error && !sheetOpen && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      <AnimatePresence>
        {sheetOpen && (step === "consent" || step === "comarca") && (
          <motion.div
            key="feedback-sheet"
            className={`feedback-sheet${step === "comarca" ? " feedback-sheet--modal" : ""}`}
            role="presentation"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={visualViewportStyle}
          >
            <motion.button
              aria-label="Tanca"
              className="feedback-sheet-backdrop"
              onClick={dismissSheet}
              style={{ opacity: backdropOpacity }}
              type="button"
            />
            <motion.div
              ref={sheetPanelRef}
              className={`feedback-sheet-panel${
                step === "comarca" ? " feedback-sheet-panel--comarca" : ""
              }`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              tabIndex={-1}
              style={{ y: sheetY }}
              drag={canDragSheet ? "y" : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.62 }}
              onDragEnd={handleSheetDragEnd}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className={`feedback-sheet-chrome${canDragSheet ? " is-draggable" : ""}${
                  step === "comarca" ? " feedback-sheet-chrome--modal" : ""
                }`}
                onPointerDown={startSheetDrag}
              >
                <div className="feedback-sheet-handle" aria-hidden="true" />
                <button
                  aria-label="Tanca"
                  className="feedback-sheet-close"
                  disabled={isSubmitting}
                  onClick={dismissSheet}
                  type="button"
                >
                  <CloseIcon />
                </button>
              </div>

              {step === "consent" && (
                <div className="feedback-sheet-body">
                  <h2 id="feedback-sheet-consent-title">Ens ajudes a millorar?</h2>
                  <p>
                    Vull col·laborar a la millora de models en català amb totes les gravacions de la sessió{" "}
                    <span className="consent-age-clause">(tinc 18 anys o més).</span>{" "}
                    <button
                      className="privacy-link legal-inline-link"
                      onClick={() => setLegalDoc("privacy")}
                      type="button"
                    >
                      Política de privadesa
                    </button>
                  </p>

                  <div className="feedback-actions">
                    <button
                      className="primary"
                      disabled={isSubmitting}
                      onClick={() => void handleConsent(true)}
                      type="button"
                    >
                      Sí
                    </button>
                    <button
                      className="secondary"
                      disabled={isSubmitting}
                      onClick={() => void handleConsent(false)}
                      type="button"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {step === "comarca" && (
                <div className="feedback-sheet-body feedback-sheet-body--comarca">
                  <h2 id="feedback-sheet-comarca-title">Quina comarca consideres teva?</h2>
                  <ComarcaPicker
                    disabled={isSubmitting}
                    selectedSlugs={selectedComarques}
                    onChange={setSelectedComarques}
                  />
                  <div className="feedback-comarca-actions">
                    <button
                      className="primary feedback-comarca-send"
                      disabled={isSubmitting || !hasComarcaSelection}
                      onClick={() => void submitSelectedComarques(selectedComarques)}
                      type="button"
                    >
                      Envia
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {legalDoc && (
        <div
          ref={legalLayerRef}
          className="feedback-legal-layer"
          role="dialog"
          aria-modal="true"
          aria-label={legalDoc === "privacy" ? "Política de privadesa" : "Termes d'ús"}
          tabIndex={-1}
        >
          <LegalDocument
            docId={legalDoc}
            onBack={() => setLegalDoc(null)}
            onOpenOther={setLegalDoc}
          />
        </div>
      )}
    </>
  );
}
