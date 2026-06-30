import { useEffect, useRef, useState } from "react";
import { MicrophoneWaveform } from "./MicrophoneWaveform";

interface RecorderPanelProps {
  onRecordingReady: (audio: Blob) => void;
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

export function RecorderPanel({ onRecordingReady, disabled = false, theme }: RecorderPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startRecording() {
    setError(null);

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
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        onRecordingReady(audio);
        stream.getTracks().forEach((track) => track.stop());
        setActiveStream(null);
      };

      recorderRef.current = recorder;
      streamRef.current = stream;
      setActiveStream(stream);
      recorder.start();
      setIsRecording(true);
    } catch {
      setError("No s'ha pogut accedir al micròfon. Comprova els permisos del navegador.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
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
    <section className="card recorder-card" aria-labelledby="recorder-title">
      <div className="recorder-copy">
        <h2 id="recorder-title" className="visually-hidden">
          Gravació de veu
        </h2>
        <p>Llegeix el text amb veu natural i prem el micròfon per començar.</p>
      </div>

      <div className="recorder-stage">
        <MicrophoneWaveform isActive={isRecording} stream={activeStream} theme={theme} />
        <button
          aria-label={isRecording ? "Atura la gravació" : "Comença a gravar"}
          aria-pressed={isRecording}
          className={`mic-button${isRecording ? " recording" : ""}`}
          disabled={disabled}
          onClick={toggleRecording}
          type="button"
        >
          <svg aria-hidden="true" className="mic-icon" viewBox="0 0 24 24">
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
            <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11Z" />
          </svg>
        </button>
        {isRecording && <p className="recording-pill">Gravant…</p>}
      </div>

      {error && <p className="error-message">{error}</p>}
    </section>
  );
}
