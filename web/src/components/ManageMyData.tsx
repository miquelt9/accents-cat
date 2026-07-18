import { useEffect, useState } from "react";
import { fetchClientInfo, getAccentOracleMode } from "../lib/accentOracleClient";
import { isDevToolsEnabled } from "../lib/devFlags";
import { getFeedbackIds, getRecordingIds } from "../lib/submissionLedger";

const PRIVACY_EMAIL = "privacy@example.com";

interface ManageMyDataProps {
  onBack: () => void;
}

function unavailableIpLabel(mode: "api" | "mock"): string {
  if (mode === "mock" && isDevToolsEnabled()) {
    return "no disponible (mode mock)";
  }
  return "no disponible";
}

export function ManageMyData({ onBack }: ManageMyDataProps) {
  const mode = getAccentOracleMode();
  const [ip, setIp] = useState(mode === "mock" ? unavailableIpLabel(mode) : "Carregant…");
  const [recordingIds] = useState(() => getRecordingIds());
  const [feedbackIds] = useState(() => getFeedbackIds());
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

  useEffect(() => {
    let cancelled = false;
    void fetchClientInfo()
      .then((info) => {
        if (!cancelled) {
          setIp(info.ip);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIp(unavailableIpLabel(mode));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const mailtoBody = [
    "Sol·licito la supressió de les meves dades de l'Oracle d'accents catalans.",
    "",
    `IP: ${ip}`,
    `User-Agent: ${userAgent}`,
    "",
    "IDs de gravació:",
    ...(recordingIds.length > 0 ? recordingIds.map((id) => `- ${id}`) : ["- (cap)"]),
    "",
    "IDs de comentari:",
    ...(feedbackIds.length > 0 ? feedbackIds.map((id) => `- ${id}`) : ["- (cap)"]),
  ].join("\n");

  const mailtoHref = `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(
    "Sol·licitud de supressió de dades — Oracle d'accents",
  )}&body=${encodeURIComponent(mailtoBody)}`;

  return (
    <section className="card manage-data-card">
      <p className="eyebrow">Privadesa</p>
      <h2>Gestiona les meves dades</h2>
      <p>
        L&apos;àudio només es desa al servidor si ho autoritzes explícitament abans d&apos;analitzar. Si
        vols demanar la supressió de les teves gravacions (quan n&apos;hi hagi) o comentaris, copia la
        informació següent i envia-la a{" "}
        <a className="inline-link" href={mailtoHref}>
          {PRIVACY_EMAIL}
        </a>{" "}
        <span className="manage-data-placeholder">(adreça provisional)</span>. Processarem les
        sol·licituds manualment.
      </p>

      <dl className="manage-data-list">
        <div>
          <dt>Adreça IP</dt>
          <dd>
            <code>{ip}</code>
          </dd>
        </div>
        <div>
          <dt>User-Agent</dt>
          <dd>
            <code>{userAgent || "—"}</code>
          </dd>
        </div>
        <div>
          <dt>IDs de gravació</dt>
          <dd>
            {recordingIds.length > 0 ? (
              <ul className="id-list">
                {recordingIds.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="manage-data-empty">Cap ID en aquest navegador.</span>
            )}
          </dd>
        </div>
        <div>
          <dt>IDs de comentari</dt>
          <dd>
            {feedbackIds.length > 0 ? (
              <ul className="id-list">
                {feedbackIds.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="manage-data-empty">Cap ID en aquest navegador.</span>
            )}
          </dd>
        </div>
      </dl>

      <p className="manage-data-note">
        Aquesta pàgina no s&apos;actualitza automàticament després d&apos;una supressió al servidor. Si
        continues utilitzant l&apos;aplicació, poden aparèixer IDs nous.
      </p>

      <button className="secondary" onClick={onBack} type="button">
        Torna enrere
      </button>
    </section>
  );
}
