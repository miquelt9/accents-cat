import { useState } from "react";
import { ComarcaPicker } from "./ComarcaPicker";
import { submitFeedback } from "../lib/accentOracleClient";
import { trackUiEvent } from "../lib/telemetry";

export function ResultsOriginFeedback() {
  const [selectedComarques, setSelectedComarques] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitOrigin() {
    if (selectedComarques.length === 0 || isSubmitting || submitted) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // Do not send audio, result scores, or any session/recording identifier.
      await submitFeedback({ comarques: selectedComarques });
      setSubmitted(true);
      trackUiEvent("origin_submitted");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No s'ha pogut enviar la comarca. Torna-ho a provar.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card feedback-card" aria-live="polite">
      {submitted ? (
        <>
          <h2>Gràcies per compartir-ho</h2>
          <p>Hem afegit la teva selecció a un recompte agregat per comarca.</p>
        </>
      ) : (
        <>
          <h2>Vols ajudar-nos a millorar?</h2>
          <p>Quina comarca sents com a teva? Aquesta pregunta és opcional.</p>
          <ComarcaPicker
            disabled={isSubmitting}
            selectedSlugs={selectedComarques}
            onChange={setSelectedComarques}
          />
          <p className="quiet-recording-hint">
            En enviar-la, només guardem el recompte per comarca, sense vincular-lo a l&apos;àudio,
            al resultat ni a cap identificador.
          </p>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button
            className="primary feedback-comarca-send"
            disabled={isSubmitting || selectedComarques.length === 0}
            onClick={() => void submitOrigin()}
            type="button"
          >
            {isSubmitting ? "Enviant…" : "Envia la comarca"}
          </button>
        </>
      )}
    </section>
  );
}
