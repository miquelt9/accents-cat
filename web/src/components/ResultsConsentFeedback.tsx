import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  createClientId,
  DIALECT_ZONES,
  SELF_REPORTED_DIALECT_LABELS,
  submitFeedback,
  submitResearchConsent,
  type SelfReportedDialect,
} from "../lib/accentOracleClient";
import { LEGAL_POLICY_VERSION, type LegalDocId } from "../lib/legalDocs";
import { appendLedgerEntry } from "../lib/submissionLedger";

const SELF_REPORT_OPTIONS: SelfReportedDialect[] = [...DIALECT_ZONES, "mixed", "unknown"];

type FunnelStep = "promoting" | "ask" | "dialect" | "consent" | "done";

interface ResultsConsentFeedbackProps {
  recordingId?: string;
  preConsented: boolean;
  onOpenLegalDoc?: (docId: LegalDocId) => void;
  onResearchRetained?: () => void;
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

export function ResultsConsentFeedback({
  recordingId,
  preConsented,
  onOpenLegalDoc,
  onResearchRetained,
}: ResultsConsentFeedbackProps) {
  const reduceMotion = useReducedMotion();
  const sheetPanelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<FunnelStep>(preConsented && recordingId ? "promoting" : "ask");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [promoted, setPromoted] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [selectedDialect, setSelectedDialect] = useState<SelfReportedDialect | undefined>();
  const [researchSaved, setResearchSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!preConsented || !recordingId || promoted || step !== "promoting") {
      return;
    }

    const retainedRecordingId = recordingId;
    let cancelled = false;

    async function autoPromote() {
      setIsSubmitting(true);
      setError(null);

      try {
        await submitResearchConsent({
          recordingId: retainedRecordingId,
          consent: true,
          ageConfirmed: true,
          policyVersion: LEGAL_POLICY_VERSION,
        });
        if (cancelled) {
          return;
        }
        appendLedgerEntry(retainedRecordingId, "recording");
        onResearchRetained?.();
        setPromoted(true);
        setResearchSaved(true);
        setStep("ask");
      } catch (submitError) {
        if (cancelled) {
          return;
        }
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No s'ha pogut desar la gravació per a recerca. Torna-ho a provar.",
        );
        setStep("ask");
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
  }, [preConsented, recordingId, promoted, step, onResearchRetained]);

  function dismissSheet() {
    if (isSubmitting) {
      return;
    }
    setSheetOpen(false);
    setStep("ask");
    setWasCorrect(null);
    setSelectedDialect(undefined);
    setError(null);
  }

  useEffect(() => {
    if (!sheetOpen) {
      return;
    }

    sheetPanelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isSubmitting) {
          setSheetOpen(false);
          setStep("ask");
          setWasCorrect(null);
          setSelectedDialect(undefined);
          setError(null);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen, isSubmitting]);

  async function submitFeedbackOnly(nextWasCorrect: boolean, dialect?: SelfReportedDialect) {
    setIsSubmitting(true);
    setError(null);

    try {
      let feedbackId = createClientId();
      if (recordingId) {
        const response = await submitFeedback({
          recordingId,
          wasCorrect: nextWasCorrect,
          selfReportedDialect: dialect,
        });
        feedbackId = response.feedbackId;
      }

      appendLedgerEntry(feedbackId, "feedback");
      setSheetOpen(false);
      setStep("done");
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

  async function finalizeWithConsent(consent: boolean) {
    if (wasCorrect === null) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let feedbackId = createClientId();
      if (recordingId) {
        const feedbackResponse = await submitFeedback({
          recordingId,
          wasCorrect,
          selfReportedDialect: wasCorrect ? undefined : selectedDialect,
        });
        feedbackId = feedbackResponse.feedbackId;
        await submitResearchConsent({
          recordingId,
          consent,
          // Affirmative Sí on this step confirms 18+ (same as landing pre-consent).
          ageConfirmed: consent,
          policyVersion: LEGAL_POLICY_VERSION,
        });
      }

      appendLedgerEntry(feedbackId, "feedback");
      if (consent && recordingId) {
        appendLedgerEntry(recordingId, "recording");
        onResearchRetained?.();
      }
      setResearchSaved(consent);
      setSheetOpen(false);
      setStep("done");
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

  function handleAnswer(answer: boolean) {
    setWasCorrect(answer);
    setError(null);
    if (answer) {
      if (preConsented) {
        void submitFeedbackOnly(true);
        return;
      }
      setSelectedDialect(undefined);
      setSheetOpen(true);
      setStep("consent");
      return;
    }
    setSheetOpen(true);
    setStep("dialect");
  }

  function handleDialect(dialect: SelfReportedDialect) {
    setSelectedDialect(dialect);
    if (preConsented) {
      void submitFeedbackOnly(false, dialect);
      return;
    }
    setStep("consent");
  }

  const sheetTitleId =
    step === "dialect" ? "feedback-sheet-dialect-title" : "feedback-sheet-consent-title";

  if (step === "done") {
    return (
      <section className="card feedback-card" aria-live="polite">
        <h2>Gràcies per la teva ajuda</h2>
        {researchSaved ? (
          <p>
            Hem desat la gravació per a recerca i el teu comentari ens ajuda a millorar el model de
            similitud dialectal. Pots demanar-ne la supressió des de «Gestiona les meves dades».
          </p>
        ) : preConsented ? (
          <p>El teu comentari ens ajuda a millorar el model de similitud dialectal.</p>
        ) : (
          <p>Hem registrat el teu comentari. No desarem aquesta gravació per a entrenament.</p>
        )}
      </section>
    );
  }

  return (
    <>
      {promoted && (
        <section className="card research-consent-card consent-saved-banner" aria-live="polite">
          <p>Gràcies! Hem desat la teva veu per a la recerca.</p>
        </section>
      )}

      {step === "promoting" ? (
        <section className="feedback-prompt" aria-live="polite">
          <p className="feedback-prompt-label">Desant la gravació per a recerca…</p>
        </section>
      ) : (
        <section className="feedback-prompt" aria-label="Comentari sobre el resultat">
          <p className="feedback-prompt-label" id="feedback-prompt-label">
            Hem encertat el teu accent?
          </p>
          <div className="feedback-thumbs" role="group" aria-labelledby="feedback-prompt-label">
            <button
              aria-label="Sí"
              aria-pressed={wasCorrect === true}
              className={`feedback-thumb${wasCorrect === true ? " selected" : ""}`}
              disabled={isSubmitting}
              onClick={() => handleAnswer(true)}
              type="button"
            >
              <ThumbUpIcon />
            </button>
            <button
              aria-label="No"
              aria-pressed={wasCorrect === false}
              className={`feedback-thumb${wasCorrect === false ? " selected" : ""}`}
              disabled={isSubmitting}
              onClick={() => handleAnswer(false)}
              type="button"
            >
              <ThumbDownIcon />
            </button>
          </div>
          {error && !sheetOpen && <p className="error-message">{error}</p>}
        </section>
      )}

      <AnimatePresence>
        {sheetOpen && (step === "dialect" || step === "consent") && (
          <motion.div
            key="feedback-sheet"
            className="feedback-sheet"
            role="presentation"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              aria-label="Tanca"
              className="feedback-sheet-backdrop"
              onClick={dismissSheet}
              type="button"
            />
            <motion.div
              ref={sheetPanelRef}
              className="feedback-sheet-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              tabIndex={-1}
              initial={reduceMotion ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 28 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === "dialect" && (
                <div className="feedback-sheet-body">
                  <h2 id="feedback-sheet-dialect-title">
                    Amb quina zona et sents més identificat/da?
                  </h2>
                  <p>Tria l&apos;opció que millor descriu com et sents dialectalment.</p>
                  <div
                    className="feedback-dialect-grid"
                    role="group"
                    aria-label="Zona d'autoidentificació"
                  >
                    {SELF_REPORT_OPTIONS.map((option) => (
                      <button
                        key={option}
                        className="secondary feedback-dialect-option"
                        disabled={isSubmitting}
                        onClick={() => handleDialect(option)}
                        type="button"
                      >
                        {SELF_REPORTED_DIALECT_LABELS[option]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "consent" && (
                <div className="feedback-sheet-body">
                  <h2 id="feedback-sheet-consent-title">Ens ajudes a millorar?</h2>
                  <p>
                    Vull col·laborar a la millora de models en català amb la meva gravació (tinc 18
                    anys o més).{" "}
                    {onOpenLegalDoc ? (
                      <button
                        className="privacy-link legal-inline-link"
                        onClick={() => onOpenLegalDoc("privacy")}
                        type="button"
                      >
                        Política de privadesa
                      </button>
                    ) : (
                      "Política de privadesa"
                    )}
                  </p>

                  <div className="feedback-actions">
                    <button
                      className="primary"
                      disabled={isSubmitting}
                      onClick={() => void finalizeWithConsent(true)}
                      type="button"
                    >
                      Sí
                    </button>
                    <button
                      className="secondary"
                      disabled={isSubmitting}
                      onClick={() => void finalizeWithConsent(false)}
                      type="button"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="error-message">{error}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
