import {
  ANALYSIS_SLOW_MESSAGE,
  calmFailureMessage,
  type AnalysisFailureReason,
} from "../lib/analysisPace";

/** Calm status line. Reuses the existing quiet hint style. */
export function AnalysisPaceNotice({
  mode,
  reason,
}: {
  mode: "slow" | "fail";
  reason?: AnalysisFailureReason;
}) {
  const message = mode === "slow" ? ANALYSIS_SLOW_MESSAGE : calmFailureMessage(reason ?? "network");
  return (
    <p className="quiet-recording-hint" data-analysis-pace={mode} role={mode === "fail" ? "alert" : "status"}>
      {message}
    </p>
  );
}
