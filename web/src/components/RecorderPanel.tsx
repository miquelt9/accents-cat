import { useEffect, useRef, useState } from "react";
import {
  SILENCE_DURATION_MS,
  SPEECH_RMS_THRESHOLD,
  hasDetectedSpeech,
  startSilenceMonitor,
} from "../lib/silenceDetector";
import type { SilenceMonitor } from "../lib/silenceDetector";
import { trackUiEvent } from "../lib/telemetry";
import { MicrophoneWaveform } from "./MicrophoneWaveform";

/** Matches backend `MIN_AUDIO_SECONDS`. */
export const MIN_RECORD_SECONDS = 1.5;
/** Matches the backend's default `ORACLE_MAX_AUDIO_SECONDS`. */
export const MAX_RECORD_SECONDS = 25;

interface RecorderPanelProps {
  onRecordingReady: (audio: Blob) => void;
  /** True while the take is being analyzed — shows a progress ring on the mic. */
  analyzing?: boolean;
  disabled?: boolean;
  theme: "light" | "dark";
}

function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

export function RecorderPanel({
  onRecordingReady,
  analyzing = false,
  disabled = false,
  theme,
}: RecorderPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceMonitorRef = useRef<SilenceMonitor | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const maxDurationTimerRef = useRef<number | null>(null);
  const [showRetakeHint, setShowRetakeHint] = useState(false);

  useEffect(() => {
    return () => {
      silenceMonitorRef.current?.stop();
      silenceMonitorRef.current = null;
      if (maxDurationTimerRef.current !== null) {
        window.clearTimeout(maxDurationTimerRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function clearRetakeHint() {
    setShowRetakeHint(false);
  }

  function showSilentTakeHint() {
    setShowRetakeHint(true);
  }

  async function startRecording() {
    setError(null);
    clearRetakeHint();

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(
        "Cal una connexió segura (HTTPS o localhost) per accedir al micròfon. Obre el lloc amb HTTPS.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Aquest navegador no admet la gravació amb micròfon.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const elapsedMs = startedAtRef.current == null ? 0 : performance.now() - startedAtRef.current;
        startedAtRef.current = null;
        const silenceMonitor = silenceMonitorRef.current;
        const silenceSnapshot = silenceMonitor?.getSnapshot() ?? {
          heardSpeech: false,
          qualifiedSpeech: false,
          peakRms: 0,
          noiseFloorRms: null,
        };
        silenceMonitor?.stop();
        silenceMonitorRef.current = null;
        if (maxDurationTimerRef.current !== null) {
          window.clearTimeout(maxDurationTimerRef.current);
          maxDurationTimerRef.current = null;
        }
        recorderRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        setActiveStream(null);

        if (elapsedMs / 1000 < MIN_RECORD_SECONDS) {
          const minSecs = MIN_RECORD_SECONDS.toFixed(1).replace(".", ",");
          setError(`La gravació és massa curta. Calen almenys ${minSecs} segons.`);
          return;
        }

        if (silenceMonitor && !hasDetectedSpeech(silenceSnapshot, SPEECH_RMS_THRESHOLD)) {
          showSilentTakeHint();
          return;
        }

        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        trackUiEvent("recording_completed");
        onRecordingReady(audio);
      };

      recorderRef.current = recorder;
      streamRef.current = stream;
      setActiveStream(stream);
      const startedAtMs = performance.now();
      startedAtRef.current = startedAtMs;
      recorder.start();
      trackUiEvent("recording_started");
      setIsRecording(true);
      if (typeof AudioContext !== "undefined") {
        try {
          silenceMonitorRef.current = startSilenceMonitor(stream, {
            minDurationMs: MIN_RECORD_SECONDS * 1000,
            silenceDurationMs: SILENCE_DURATION_MS,
            speechThreshold: SPEECH_RMS_THRESHOLD,
            startedAtMs,
            onSilence: stopRecording,
          });
        } catch {
          // Recording still works with the manual stop if live monitoring is unavailable.
          silenceMonitorRef.current = null;
        }
      }
      maxDurationTimerRef.current = window.setTimeout(stopRecording, MAX_RECORD_SECONDS * 1000);
    } catch {
      setError("No s'ha pogut accedir al micròfon. Comprova els permisos del navegador.");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }
    recorder.stop();
    setIsRecording(false);
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
      return;
    }

    void startRecording();
  }

  return (
    <div className="recorder-panel" aria-labelledby="recorder-title">
      <h2 id="recorder-title" className="visually-hidden">
        Gravació de veu
      </h2>

      <div className="recorder-stage">
        <MicrophoneWaveform isActive={isRecording} stream={activeStream} theme={theme} />
        <button
          aria-busy={analyzing || undefined}
          aria-label={
            analyzing ? "Analitzant la mostra" : isRecording ? "Atura la gravació" : "Comença a gravar"
          }
          aria-pressed={isRecording}
          className={`mic-button${isRecording ? " recording" : ""}${analyzing ? " analyzing" : ""}`}
          disabled={disabled || analyzing}
          onClick={toggleRecording}
          type="button"
        >
          {analyzing && (
            <svg aria-hidden="true" className="mic-progress-ring" viewBox="0 0 48 48">
              <circle className="mic-progress-ring-track" cx="24" cy="24" r="20" />
              <circle className="mic-progress-ring-arc" cx="24" cy="24" r="20" />
            </svg>
          )}
          <svg aria-hidden="true" className="mic-icon" viewBox="0 0 24 24">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
            <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11Z" />
          </svg>
        </button>
        <p className="visually-hidden" aria-live="polite">
          {analyzing
            ? "Analitzant la mostra…"
            : isRecording
              ? "Gravant… Quan deixis de parlar, la gravació s'aturarà i començarà l'anàlisi."
              : ""}
        </p>
      </div>

      {showRetakeHint && (
        <p className="retake-hint" role="status" aria-live="polite">
          No s&apos;ha detectat una veu prou clara. Potser hi ha massa soroll de fons. Torna a gravar i
          llegeix el text en veu alta.
        </p>
      )}
      {error && <p className="error-message">{error}</p>}
    </div>
  );
}
