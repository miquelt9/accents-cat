import { useEffect, useRef } from "react";

interface MicrophoneWaveformProps {
  stream: MediaStream | null;
  isActive: boolean;
  theme: "light" | "dark";
}

const BAR_COUNT = 32;

export function MicrophoneWaveform({ stream, isActive, theme }: MicrophoneWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const styles = getComputedStyle(document.documentElement);
    const idleColor = styles.getPropertyValue("--waveform-idle").trim() || "#c5d5de";
    const activeColor = styles.getPropertyValue("--waveform-active").trim() || "#257cac";

    if (!stream || !isActive) {
      animationRef.current = null;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = idleColor;
      ctx.fillRect(width * 0.1, height / 2 - 2, width * 0.8, 4);
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const barWidth = width / BAR_COUNT - 2;

      for (let index = 0; index < BAR_COUNT; index += 1) {
        const sampleIndex = Math.floor((index / BAR_COUNT) * bufferLength);
        const value = dataArray[sampleIndex] / 255;
        const barHeight = Math.max(4, value * height * 0.9);
        const x = index * (barWidth + 2);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = activeColor;
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    };

    draw();

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
      source.disconnect();
      void audioContext.close();
    };
  }, [stream, isActive, theme]);

  return (
    <canvas
      ref={canvasRef}
      className="microphone-waveform"
      width={320}
      height={80}
      aria-hidden="true"
    />
  );
}
