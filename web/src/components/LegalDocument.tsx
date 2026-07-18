import { LEGAL_DOCS, type LegalDocId } from "../lib/legalDocs";
import { PRIVACY_EMAIL, PRIVACY_EMAIL_IS_PLACEHOLDER } from "../lib/privacyContact";

interface LegalDocumentProps {
  docId: LegalDocId;
  onBack: () => void;
  onOpenOther?: (docId: LegalDocId) => void;
}

export function LegalDocument({ docId, onBack, onOpenOther }: LegalDocumentProps) {
  const doc = LEGAL_DOCS[docId];
  const otherId: LegalDocId = docId === "privacy" ? "terms" : "privacy";
  const otherTitle = LEGAL_DOCS[otherId].title;

  return (
    <section className="card legal-doc-card">
      <p className="eyebrow">{doc.eyebrow}</p>
      <h2>{doc.title}</h2>
      <p className="legal-doc-meta">En vigor: {doc.effectiveDate}</p>
      <p>{doc.intro}</p>

      {doc.sections.map((section) => (
        <div className="legal-doc-section" key={section.heading}>
          <h3>{section.heading}</h3>
          {section.paragraphs.map((paragraph, index) => (
            <p key={`${section.heading}-${index}`}>{paragraph}</p>
          ))}
        </div>
      ))}

      <p className="legal-doc-contact">
        Contacte:{" "}
        <a className="inline-link" href={`mailto:${PRIVACY_EMAIL}`}>
          {PRIVACY_EMAIL}
        </a>
        {PRIVACY_EMAIL_IS_PLACEHOLDER ? (
          <>
            {" "}
            <span className="manage-data-placeholder">(adreça provisional)</span>
          </>
        ) : null}
      </p>

      {onOpenOther ? (
        <p className="legal-doc-crosslink">
          També pots consultar{" "}
          <button className="privacy-link legal-inline-link" onClick={() => onOpenOther(otherId)} type="button">
            {otherTitle}
          </button>
          .
        </p>
      ) : null}

      <button className="secondary" onClick={onBack} type="button">
        Torna enrere
      </button>
    </section>
  );
}
