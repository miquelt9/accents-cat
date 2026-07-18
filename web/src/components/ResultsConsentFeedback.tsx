import { useEffect, useState } from "react";
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

export function ResultsConsentFeedback({
  recordingId,
  preConsented,
  onOpenLegalDoc,
  onResearchRetained,
}: ResultsConsentFeedbackProps) {
  const [step, setStep] = useState<FunnelStep>(preConsented && recordingId ? "promoting" : "ask");
  const [promoted, setPromoted] = useState(false);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [selectedDialect, setSelectedDialect] = useState<SelfReportedDialect | undefined>();
  const [ageConfirmed, setAgeConfirmed] = useState(false);
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
    if (consent && !ageConfirmed) {
      setError("Cal confirmar que tens 18 anys o més.");
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
          ageConfirmed: consent ? ageConfirmed : false,
          policyVersion: LEGAL_POLICY_VERSION,
        });
      }

      appendLedgerEntry(feedbackId, "feedback");
      if (consent && recordingId) {
        appendLedgerEntry(recordingId, "recording");
        onResearchRetained?.();
      }
      setResearchSaved(consent);
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
    if (answer) {
      if (preConsented) {
        void submitFeedbackOnly(true);
        return;
      }
      setSelectedDialect(undefined);
      setStep("consent");
      return;
    }
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

  if (step === "done") {
    return (
      <section className="card feedback-card" aria-live="polite">
        <p className="eyebrow">Gràcies</p>
        <h2>Gràcies per la teva ajuda</h2>
        {researchSaved ? (
          <p>
            Hem desat la gravació per a recerca i el teu comentari ens ajuda a millorar el model de
            similitud dialectal. Pots demanar-ne la supressió des de «Gestiona les meves dades».
          </p>
        ) : preConsented ? (
          <p>
            El teu comentari ens ajuda a millorar el model de similitud dialectal. Això no identifica
            d&apos;on ets, sinó com sona la teva veu respecte a zones macrodialectals.
          </p>
        ) : (
          <p>
            Hem registrat el teu comentari. No desarem aquesta gravació per a entrenament. El mapa
            mostra similitud acústica, no l&apos;origen geogràfic.
          </p>
        )}
      </section>
    );
  }

  return (
    <>
      {promoted && (
        <section className="card research-consent-card consent-saved-banner" aria-live="polite">
          <p className="eyebrow">Recerca</p>
          <p>Gràcies! Hem desat la teva veu per a la recerca.</p>
        </section>
      )}

      <section className="card feedback-card">
        {step === "promoting" && (
          <>
            <p className="eyebrow">Recerca</p>
            <p>Desant la gravació per a recerca…</p>
          </>
        )}

        {step === "ask" && (
          <>
            <p className="eyebrow">Comentari</p>
            <h2>Hem encertat el teu accent?</h2>
            <p>
              El mapa mostra similitud acústica amb zones dialectals, no l&apos;origen geogràfic. El teu
              comentari ens ajuda a calibrar el prototip.
            </p>
            <div className="feedback-actions">
              <button
                className="secondary"
                disabled={isSubmitting}
                onClick={() => handleAnswer(true)}
                type="button"
              >
                Sí
              </button>
              <button
                className="secondary"
                disabled={isSubmitting}
                onClick={() => handleAnswer(false)}
                type="button"
              >
                No
              </button>
            </div>
          </>
        )}

        {step === "dialect" && (
          <>
            <p className="eyebrow">Comentari</p>
            <h2>Amb quina zona et sents més identificat/da?</h2>
            <p>Tria l&apos;opció que millor descriu com et sents dialectalment.</p>
            <div className="feedback-dialect-grid" role="group" aria-label="Zona d'autoidentificació">
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
          </>
        )}

        {step === "consent" && (
          <>
            <p className="eyebrow">Recerca</p>
            <h2>Ajuda els models de català</h2>
            <p>
              Si vols, podem desar aquesta gravació per a recerca i entrenament. És opcional: el resultat
              ja és teu. Més detalls a la{" "}
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
              )}{" "}
              i als{" "}
              {onOpenLegalDoc ? (
                <button
                  className="privacy-link legal-inline-link"
                  onClick={() => onOpenLegalDoc("terms")}
                  type="button"
                >
                  Termes d&apos;ús
                </button>
              ) : (
                "Termes d'ús"
              )}
              .
            </p>

            <label className="research-consent-check">
              <input
                checked={ageConfirmed}
                disabled={isSubmitting}
                onChange={(event) => {
                  setAgeConfirmed(event.target.checked);
                  setError(null);
                }}
                type="checkbox"
              />
              <span>Tinc 18 anys o més i accepto desar aquesta gravació per a recerca (opcional).</span>
            </label>

            <div className="feedback-actions">
              <button
                className="primary"
                disabled={isSubmitting || !ageConfirmed}
                onClick={() => void finalizeWithConsent(true)}
                type="button"
              >
                Desa la gravació
              </button>
              <button
                className="secondary"
                disabled={isSubmitting}
                onClick={() => void finalizeWithConsent(false)}
                type="button"
              >
                No, només el resultat
              </button>
            </div>
          </>
        )}

        {error && <p className="error-message">{error}</p>}
      </section>
    </>
  );
}
