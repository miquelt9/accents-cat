import {
  ANALYSIS_SLOW_MESSAGE,
  calmFailureMessage,
  type AnalysisFailureReason,
} from "../lib/analysisPace";

/** Calm status line. Reuses the existing quiet hint style. */
export function AnalysisPaceNotice({
  mode,
  reason,
  message: detail,
}: {
  mode: "slow" | "fail";
  reason?: AnalysisFailureReason;
  /** Specific Catalan detail for a 4xx rejection. Other failures use the calm line. */
  message?: string;
}) {
  const fallback = calmFailureMessage(reason ?? "network");
  const message = mode === "slow" ? ANALYSIS_SLOW_MESSAGE : detail?.trim() || fallback;
  return (
    <p className="quiet-recording-hint" data-analysis-pace={mode} role={mode === "fail" ? "alert" : "status"}>
      {message}
    </p>
  );
}
