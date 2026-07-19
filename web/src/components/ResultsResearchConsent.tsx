import { useState } from "react";
import { submitResearchConsent } from "../lib/accentOracleClient";
import { LEGAL_POLICY_VERSION, type LegalDocId } from "../lib/legalDocs";
import { appendLedgerEntry } from "../lib/submissionLedger";

interface ResultsResearchConsentProps {
  recordingId?: string;
  onOpenLegalDoc?: (docId: LegalDocId) => void;
}

type ConsentStep = "ask" | "saved" | "declined" | "hidden";

export function ResultsResearchConsent({
  recordingId,
  onOpenLegalDoc,
}: ResultsResearchConsentProps) {
  const [step, setStep] = useState<ConsentStep>(recordingId ? "ask" : "hidden");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (step === "hidden" || !recordingId) {
    return null;
  }

  async function handleConsent(consent: boolean) {
    if (!recordingId) {
      return;
    }
    if (consent && !ageConfirmed) {
      setError("Cal confirmar que tens 18 anys o més.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await submitResearchConsent({
        recordingId,
        consent,
        ageConfirmed: consent ? ageConfirmed : false,
        policyVersion: LEGAL_POLICY_VERSION,
      });
      if (consent) {
        appendLedgerEntry(recordingId, "recording");
        setStep("saved");
      } else {
        setStep("declined");
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No s'ha pogut desar la teva elecció. Torna-ho a provar.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "saved") {
    return (
      <section className="card research-consent-card" aria-live="polite">
        <p className="eyebrow">Recerca</p>
        <h2>Gràcies per contribuir</h2>
        <p>
          Hem desat aquesta gravació per a recerca i entrenament de models en català. Pots demanar-ne la
          supressió des de «Gestiona les meves dades».
        </p>
      </section>
    );
  }

  if (step === "declined") {
    return (
      <section className="card research-consent-card" aria-live="polite">
        <p className="eyebrow">Recerca</p>
        <h2>D&apos;acord — només el resultat</h2>
        <p>No desarem aquesta gravació per a entrenament. Pots continuar amb el mapa i el comentari.</p>
      </section>
    );
  }

  return (
    <section className="card research-consent-card">
      <p className="eyebrow">Recerca</p>
      <h2>Ajuda els models de català</h2>
      <p>
        Si vols, podem desar aquesta gravació per a recerca i entrenament. És opcional: el resultat ja és
        teu. Més detalls a la{" "}
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
          onClick={() => void handleConsent(true)}
          type="button"
        >
          Desa la gravació
        </button>
        <button
          className="secondary"
          disabled={isSubmitting}
          onClick={() => void handleConsent(false)}
          type="button"
        >
          No, només el resultat
        </button>
      </div>
      {error && <p className="error-message">{error}</p>}
    </section>
  );
}
