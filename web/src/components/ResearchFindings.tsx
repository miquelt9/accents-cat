import type { ReactNode } from "react";

type Metric = {
  label: string;
  baseline: string;
  candidate: string;
};

const metrics: Metric[] = [
  { label: "Macro F1 — CV26 dev/test", baseline: "51,04%", candidate: "51,59%" },
  { label: "Macro F1 — benchmark AINA", baseline: "49,77%", candidate: "51,57%" },
  { label: "Accuracy — benchmark AINA", baseline: "49,60%", candidate: "52,02%" },
  { label: "Top-2 — CV26 dev/test", baseline: "72,37%", candidate: "73,50%" },
  { label: "Log loss — benchmark AINA", baseline: "1,2392", candidate: "1,2199" },
];

const modelStatuses = [
  ["SVM lineal calibrat", "Històric", "Millor cap documentat"],
  ["Regressió logística", "Històric", "No supera Macro F1"],
  ["SVM RBF", "Històric", "Pitjor en la comparació"],
  ["MLP petit", "Històric", "Pitjor en la comparació"],
  ["Extra Trees / Random Forest", "No executat", "Calen embeddings canònics"],
  ["Fine-tuning / fusió d’encoders", "No executat", "Fase posterior"],
];

function EvidenceCard({ title, children, tone = "default" }: { title: string; children: ReactNode; tone?: "default" | "positive" | "caution" }) {
  return (
    <article className={`research-evidence-card research-evidence-card-${tone}`}>
      <h3>{title}</h3>
      <div>{children}</div>
    </article>
  );
}

function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" }) {
  return <span className={`research-status-badge research-status-badge-${tone}`}>{children}</span>;
}

export default function ResearchFindings({ onBack }: { onBack: () => void }) {
  return (
    <section className="legal-doc-card research-findings-card" aria-labelledby="research-title">
      <div className="legal-doc-header">
        <div>
          <p className="legal-doc-kicker">Recerca i transparència</p>
          <h2 id="research-title">Resultats del model, sense maquillatge</h2>
        </div>
        <button className="legal-doc-back" onClick={onBack} type="button">Torna enrere</button>
      </div>

      <p className="research-lede">
        Aquesta pàgina resumeix què fa el model, quines alternatives s’han comparat, quina millora té més suport
        i què s’ha pogut reproduir realment en aquesta màquina. Les mètriques marcades com a històriques provenen
        d’artefactes del repositori; no són una nova execució d’aquesta visita.
      </p>

      <div className="research-trust-banner">
        <span className="research-trust-icon" aria-hidden="true">i</span>
        <p><strong>Conclusió curta:</strong> conservem l’SVM calibrat com a baseline. La millora més prometedora és combinar diverses preses de veu, no fer el cap classificador més complex.</p>
      </div>

      <div className="research-pipeline" aria-label="Pipeline del model">
        <span>Àudio</span><span aria-hidden="true">→</span>
        <span>HuBERT en català</span><span aria-hidden="true">→</span>
        <span>mitjana + desviació</span><span aria-hidden="true">→</span>
        <span>normalització</span><span aria-hidden="true">→</span>
        <span>SVM calibrat</span><span aria-hidden="true">→</span>
        <span>5 zones macro</span>
      </div>

      <div className="research-evidence-grid">
        <EvidenceCard title="Encoder actual">
          <p><strong>BSC-LT/hubert-base-ca-2k</strong>, un encoder HuBERT entrenat per al català. De cada àudio s’extreu una representació temporal i se’n calculen la mitjana i la desviació estàndard, amb 1.536 dimensions finals.</p>
        </EvidenceCard>
        <EvidenceCard title="Cap de decisió">
          <p>El cap és un <strong>LinearSVC calibrat amb sigmoid</strong>, amb normalització abans de l’entrenament. La calibració permet convertir marges en scores comparables per ordenar les zones.</p>
        </EvidenceCard>
        <EvidenceCard title="Què prediu — i què no">
          <p>Estima similitud acústica amb cinc zones dialectals macro: central, valencià, nord-occidental, nord i balear. No identifica l’origen, la identitat ni el lloc de procedència d’una persona.</p>
        </EvidenceCard>
      </div>

      <section className="research-section" aria-labelledby="research-results-title">
        <div className="research-section-heading">
          <div>
            <p className="legal-doc-kicker">Evidència històrica del repositori</p>
            <h3 id="research-results-title">La millora més prometedora: diverses preses</h3>
          </div>
          <StatusBadge tone="success">Candidat recomanat</StatusBadge>
        </div>
        <p>La variant de fins a cinc clips per parlant aplica un filtre de qualitat basat en vots i combina diverses preses. La diferència és especialment útil al benchmark AINA, però encara cal repetir-la amb prediccions aparellades per provar-ne la significació estadística.</p>
        <div className="research-metric-table" role="table" aria-label="Comparació de mètriques històriques">
          <div className="research-metric-row research-metric-header" role="row"><span>Mètrica</span><span>SVM d’un clip</span><span>5 clips + vots</span></div>
          {metrics.map((metric) => <div className="research-metric-row" role="row" key={metric.label}><span>{metric.label}</span><span>{metric.baseline}</span><strong>{metric.candidate}</strong></div>)}
        </div>
        <div className="research-delta-grid">
          <div><strong>+1,80 pp</strong><span>Macro F1 AINA</span></div>
          <div><strong>+2,42 pp</strong><span>Accuracy AINA</span></div>
          <div><strong>−0,0203</strong><span>Log loss AINA</span></div>
        </div>
        <p className="research-caption">Font: artefactes `cv26-hubert-svm-calibrated` i `cv26-hubert-svm-clips5-votes`. Valors històrics; no reexecutats en aquesta VM.</p>
      </section>

      <section className="research-section" aria-labelledby="research-classifiers-title">
        <div className="research-section-heading"><div><p className="legal-doc-kicker">Alternatives al SVM</p><h3 id="research-classifiers-title">Què sabem i què encara falta provar</h3></div><StatusBadge>Comparació honesta</StatusBadge></div>
        <p>La cerca documentada va comparar caps sobre les mateixes representacions congelades i particions agrupades per parlant. No té sentit triar un model nou amb una partició o un dataset diferent.</p>
        <div className="research-status-table" role="table" aria-label="Estat de les alternatives de model">
          <div className="research-status-row research-status-header" role="row"><span>Opció</span><span>Estat</span><span>Lectura</span></div>
          {modelStatuses.map(([model, status, reading]) => <div className="research-status-row" role="row" key={model}><span>{model}</span><span><StatusBadge tone={status === "Històric" ? "success" : status === "No executat" ? "warning" : "neutral"}>{status}</StatusBadge></span><span>{reading}</span></div>)}
        </div>
      </section>

      <section className="research-section" aria-labelledby="research-limitations-title">
        <p className="legal-doc-kicker">Interpretació</p>
        <h3 id="research-limitations-title">El coll d’ampolla sembla ser la cobertura, no el cap</h3>
        <div className="research-two-column">
          <div><h4>Senyal favorable</h4><p>El top-2 és clarament millor que el top-1, cosa que indica que el model sovint situa la zona correcta entre les primeres opcions.</p></div>
          <div><h4>Risc principal</h4><p>Les zones no tenen la mateixa cobertura de parlants. Cal prioritzar diversitat i més mostres del nord i nord-occidental abans de fer fine-tuning.</p></div>
          <div><h4>Decisió actual</h4><p><strong>NOT YET:</strong> no substituïm l’SVM calibrat. La fusió d’encoders, RBF, MLP i fine-tuning són opcions de recerca, no recomanacions de producció.</p></div>
          <div><h4>Què provar després</h4><p>Repetir la comparació amb embeddings canònics, seleccionar en validació i tocar el test només una vegada al final.</p></div>
        </div>
      </section>

      <section className="research-section research-runtime-note" aria-labelledby="research-runtime-title">
        <p className="legal-doc-kicker">Reproduïbilitat executada</p>
        <h3 id="research-runtime-title">Què s’ha pogut executar en aquesta VM?</h3>
        <p>Es va inspeccionar l’historial complet, els fitxers ignorats, les caches locals i els remots públics. Es van instal·lar scikit-learn i joblib i es va executar el comandament baseline. La càrrega va fallar de manera controlada perquè falta el fitxer canònic:</p>
        <code className="research-block-code">embeddings/cv26-train-1440/embedding_index.csv</code>
        <div className="research-runtime-facts"><span><strong>CPU:</strong> 6 lògiques</span><span><strong>RAM:</strong> 3,8 GB</span><span><strong>GPU:</strong> cap</span><span><strong>Disc lliure:</strong> ~32 GB</span><span><strong>Estat:</strong> benchmark nou bloquejat per dades absents</span></div>
        <p className="research-warning-copy">L’arxiu Common Voice documentat és d’aproximadament 79–85 GB, per sobre del disc disponible. No s’ha descarregat a cegues ni s’han creat embeddings sintètics. Per això les mètriques noves de SVM, logística, RBF, arbres o MLP consten com a <strong>NO EXECUTADES</strong>.</p>
      </section>

      <section className="research-section" aria-labelledby="research-next-title">
        <p className="legal-doc-kicker">Pròxim desbloqueig</p>
        <h3 id="research-next-title">L’artefacte més petit que falta</h3>
        <p>Per completar el benchmark cal aportar el bundle d’embeddings canònic i els directoris de validació/test:</p>
        <ul className="research-next-list"><li><code>embeddings/cv26-train-1440/</code></li><li><code>embedding_index.csv</code></li><li>tots els fitxers <code>.npz</code> referenciats</li><li>embeddings dels held-out splits</li></ul>
        <p>Amb aquest bundle es poden executar seqüencialment SVM calibrat, regressió logística, SVM RBF, Extra Trees, Random Forest i MLP, sempre amb els mateixos parlants, particions i features.</p>
      </section>

      <div className="research-links"><a href="https://github.com/miquelt9/accents-cat" target="_blank" rel="noreferrer">Veure el repositori</a><a href="https://huggingface.co/BSC-LT/hubert-base-ca-2k" target="_blank" rel="noreferrer">Veure l’encoder</a></div>
    </section>
  );
}
