import { useState } from "react";
import {
  createClientId,
  DIALECT_ZONES,
  SELF_REPORTED_DIALECT_LABELS,
  submitFeedback,
  type SelfReportedDialect,
} from "../lib/accentOracleClient";
import { appendLedgerEntry } from "../lib/submissionLedger";

const SELF_REPORT_OPTIONS: SelfReportedDialect[] = [...DIALECT_ZONES, "mixed", "unknown"];

type FeedbackStep = "ask" | "dialect" | "done";

interface ResultsFeedbackProps {
  recordingId?: string;
}

export function ResultsFeedback({ recordingId }: ResultsFeedbackProps) {
  const [step, setStep] = useState<FeedbackStep>("ask");
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(nextWasCorrect: boolean, dialect?: SelfReportedDialect) {
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

  function handleAnswer(answer: boolean) {
    setWasCorrect(answer);
    if (answer) {
      void finish(true);
      return;
    }
    setStep("dialect");
  }

  function handleDialect(dialect: SelfReportedDialect) {
    if (wasCorrect === null) {
      return;
    }
    void finish(wasCorrect, dialect);
  }

  if (step === "done") {
    return (
      <section className="card feedback-card" aria-live="polite">
        <p className="eyebrow">Gràcies</p>
        <h2>Gràcies pel teu comentari</h2>
        <p>
          Ens ajuda a millorar el model de similitud dialectal. Això no identifica d&apos;on ets, sinó com
          sona la teva veu respecte a zones macrodialectals.
        </p>
      </section>
    );
  }

  return (
    <section className="card feedback-card">
      <p className="eyebrow">Comentari</p>
      {step === "ask" ? (
        <>
          <h2>Hem encertat la zona amb què et sents més identificat/da?</h2>
          <p>
            El mapa mostra similitud acústica amb zones dialectals, no l&apos;origen geogràfic. El teu
            comentari ens ajuda a calibrar el prototip.
          </p>
          <div className="feedback-actions">
            <button className="secondary" disabled={isSubmitting} onClick={() => handleAnswer(true)} type="button">
              Sí
            </button>
            <button className="secondary" disabled={isSubmitting} onClick={() => handleAnswer(false)} type="button">
              No
            </button>
          </div>
        </>
      ) : (
        <>
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
      {error && <p className="error-message">{error}</p>}
    </section>
  );
}
