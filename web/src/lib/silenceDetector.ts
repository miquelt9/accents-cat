export const SPEECH_RMS_THRESHOLD = 0.015;
export const SILENCE_DURATION_MS = 1_400;
export const AMBIENT_CALIBRATION_MS = 450;
export const SPEECH_QUALIFICATION_MS = 320;
export const MIN_SPEECH_FRAMES = 6;
export const SPEECH_LOSS_GRACE_MS = 220;

export interface SilenceDetectorOptions {
  minDurationMs: number;
  silenceDurationMs?: number;
  speechThreshold?: number;
  ambientCalibrationMs?: number;
  speechQualificationMs?: number;
  minSpeechFrames?: number;
}

export interface SilenceDetectorState {
  startedAtMs: number;
  heardSpeech: boolean;
  peakRms: number;
  noiseFloorRms: number | null;
  speechEvidenceStartedAtMs: number | null;
  lastSpeechLikeAtMs: number | null;
  speechFrameCount: number;
  speechEvidenceMinRms: number | null;
  speechEvidenceMaxRms: number;
  silenceStartedAtMs: number | null;
  hasFired: boolean;
}

export interface SilenceDetectorUpdate {
  state: SilenceDetectorState;
  shouldStop: boolean;
}

export interface SilenceMonitorSnapshot {
  heardSpeech: boolean;
  qualifiedSpeech: boolean;
  peakRms: number;
  noiseFloorRms: number | null;
}

export interface SilenceMonitor {
  getSnapshot: () => SilenceMonitorSnapshot;
  stop: () => void;
}

export interface AudioFrameFeatures {
  rms: number;
  speechBandRatio: number;
  spectralFlatness: number;
  zeroCrossingRate: number;
}

function linearPowerFromDecibels(decibels: number): number {
  return Number.isFinite(decibels) ? 10 ** (decibels / 10) : 0;
}

export function calculateZeroCrossingRate(data: Uint8Array): number {
  if (data.length < 2) {
    return 0;
  }

  let crossings = 0;
  let previous = data[0] - 128;
  for (let index = 1; index < data.length; index += 1) {
    const current = data[index] - 128;
    if ((previous < 0 && current >= 0) || (previous >= 0 && current < 0)) {
      crossings += 1;
    }
    previous = current;
  }
  return crossings / (data.length - 1);
}

export function calculateSpeechBandRatio(
  frequencyData: Float32Array,
  sampleRate: number,
  minFrequencyHz = 250,
  maxFrequencyHz = 4_000,
): number {
  if (frequencyData.length === 0 || sampleRate <= 0) {
    return 0;
  }

  const binWidth = sampleRate / (frequencyData.length * 2);
  let totalPower = 0;
  let speechBandPower = 0;
  for (let index = 0; index < frequencyData.length; index += 1) {
    const power = linearPowerFromDecibels(frequencyData[index]);
    totalPower += power;
    const frequency = index * binWidth;
    if (frequency >= minFrequencyHz && frequency <= maxFrequencyHz) {
      speechBandPower += power;
    }
  }
  return totalPower > 0 ? speechBandPower / totalPower : 0;
}

export function calculateSpectralFlatness(frequencyData: Float32Array): number {
  const powers = Array.from(frequencyData, linearPowerFromDecibels).filter((power) => power > 0);
  if (powers.length === 0) {
    return 0;
  }

  const arithmeticMean = powers.reduce((sum, power) => sum + power, 0) / powers.length;
  const geometricMean = Math.exp(
    powers.reduce((sum, power) => sum + Math.log(power), 0) / powers.length,
  );
  return arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;
}

export function calculateFrameFeatures(
  timeDomainData: Uint8Array,
  frequencyData: Float32Array,
  sampleRate: number,
): AudioFrameFeatures {
  return {
    rms: calculateRms(timeDomainData),
    speechBandRatio: calculateSpeechBandRatio(frequencyData, sampleRate),
    spectralFlatness: calculateSpectralFlatness(frequencyData),
    zeroCrossingRate: calculateZeroCrossingRate(timeDomainData),
  };
}

export function hasDetectedSpeech(
  snapshot: SilenceMonitorSnapshot,
  speechThreshold = SPEECH_RMS_THRESHOLD,
): boolean {
  return (
    snapshot.qualifiedSpeech &&
    snapshot.heardSpeech &&
    snapshot.peakRms >= speechThreshold
  );
}

export interface SilenceMonitorOptions extends SilenceDetectorOptions {
  startedAtMs: number;
  onSilence: () => void;
}

export function calculateRms(data: Uint8Array): number {
  if (data.length === 0) {
    return 0;
  }

  let sumSquares = 0;
  for (const sample of data) {
    const normalized = (sample - 128) / 128;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / data.length);
}

export function isSpeechLikeFrame(
  features: AudioFrameFeatures,
  noiseFloorRms: number | null,
  options: SilenceDetectorOptions,
): boolean {
  const speechThreshold = options.speechThreshold ?? SPEECH_RMS_THRESHOLD;
  const ambientThreshold = (noiseFloorRms ?? 0) * 1.8;
  return (
    features.rms >= Math.max(speechThreshold, ambientThreshold) &&
    features.speechBandRatio >= 0.25 &&
    features.spectralFlatness <= 0.85 &&
    features.zeroCrossingRate >= 0.002 &&
    features.zeroCrossingRate <= 0.45
  );
}

function updateNoiseFloor(
  previousNoiseFloorRms: number | null,
  rms: number,
  speechLike: boolean,
  speechThreshold: number,
): number {
  if (speechLike) {
    return previousNoiseFloorRms ?? Math.min(rms, speechThreshold);
  }
  if (previousNoiseFloorRms === null) {
    return Math.min(rms, speechThreshold);
  }

  const quietLimit = Math.max(previousNoiseFloorRms * 1.8, speechThreshold);
  if (rms > quietLimit) {
    return previousNoiseFloorRms;
  }
  return previousNoiseFloorRms * 0.96 + rms * 0.04;
}

function silenceThreshold(
  noiseFloorRms: number | null,
  speechThreshold: number,
): number {
  return Math.max(speechThreshold * 0.8, (noiseFloorRms ?? 0) * 1.6);
}

export function createSilenceDetectorState(startedAtMs: number): SilenceDetectorState {
  return {
    startedAtMs,
    heardSpeech: false,
    peakRms: 0,
    noiseFloorRms: null,
    speechEvidenceStartedAtMs: null,
    lastSpeechLikeAtMs: null,
    speechFrameCount: 0,
    speechEvidenceMinRms: null,
    speechEvidenceMaxRms: 0,
    silenceStartedAtMs: null,
    hasFired: false,
  };
}

export function updateSilenceDetector(
  state: SilenceDetectorState,
  features: AudioFrameFeatures,
  nowMs: number,
  options: SilenceDetectorOptions,
): SilenceDetectorUpdate {
  const speechThreshold = options.speechThreshold ?? SPEECH_RMS_THRESHOLD;
  const silenceDurationMs = options.silenceDurationMs ?? SILENCE_DURATION_MS;
  const ambientCalibrationMs = options.ambientCalibrationMs ?? AMBIENT_CALIBRATION_MS;
  const speechQualificationMs = options.speechQualificationMs ?? SPEECH_QUALIFICATION_MS;
  const minSpeechFrames = options.minSpeechFrames ?? MIN_SPEECH_FRAMES;
  const noiseFloorRms = updateNoiseFloor(
    state.noiseFloorRms,
    features.rms,
    isSpeechLikeFrame(features, state.noiseFloorRms, options),
    speechThreshold,
  );
  const isCalibrating = nowMs - state.startedAtMs < ambientCalibrationMs;
  const speechLike = !isCalibrating && isSpeechLikeFrame(features, noiseFloorRms, options);

  let speechEvidenceStartedAtMs = state.speechEvidenceStartedAtMs;
  let lastSpeechLikeAtMs = state.lastSpeechLikeAtMs;
  let speechFrameCount = state.speechFrameCount;
  let speechEvidenceMinRms = state.speechEvidenceMinRms;
  let speechEvidenceMaxRms = state.speechEvidenceMaxRms;
  if (
    speechLike &&
    (lastSpeechLikeAtMs === null ||
      nowMs - lastSpeechLikeAtMs > SPEECH_LOSS_GRACE_MS ||
      speechEvidenceStartedAtMs === null ||
      nowMs - speechEvidenceStartedAtMs > speechQualificationMs)
  ) {
    speechEvidenceStartedAtMs = nowMs;
    lastSpeechLikeAtMs = nowMs;
    speechFrameCount = 1;
    speechEvidenceMinRms = features.rms;
    speechEvidenceMaxRms = features.rms;
  } else if (speechLike) {
    lastSpeechLikeAtMs = nowMs;
    speechFrameCount += 1;
    speechEvidenceMinRms =
      speechEvidenceMinRms === null ? features.rms : Math.min(speechEvidenceMinRms, features.rms);
    speechEvidenceMaxRms = Math.max(speechEvidenceMaxRms, features.rms);
  } else if (
    lastSpeechLikeAtMs !== null &&
    nowMs - lastSpeechLikeAtMs > SPEECH_LOSS_GRACE_MS
  ) {
    speechEvidenceStartedAtMs = null;
    lastSpeechLikeAtMs = null;
    speechFrameCount = 0;
    speechEvidenceMinRms = null;
    speechEvidenceMaxRms = 0;
  }

  const speechRmsVariation =
    speechEvidenceMinRms === null ? 0 : speechEvidenceMaxRms - speechEvidenceMinRms;
  const speechQualified =
    speechFrameCount >= minSpeechFrames &&
    speechEvidenceStartedAtMs !== null &&
    nowMs - speechEvidenceStartedAtMs <= speechQualificationMs &&
    speechRmsVariation >= Math.max(0.0025, noiseFloorRms * 0.12);
  const heardSpeech = state.heardSpeech || speechQualified;
  const isQuiet = features.rms <= silenceThreshold(noiseFloorRms, speechThreshold);
  const silenceStartedAtMs = heardSpeech
    ? isQuiet
      ? state.silenceStartedAtMs === null
        ? nowMs
        : state.silenceStartedAtMs
      : null
    : null;
  const nextState: SilenceDetectorState = {
    ...state,
    heardSpeech,
    peakRms: Math.max(state.peakRms, features.rms),
    noiseFloorRms,
    speechEvidenceStartedAtMs,
    lastSpeechLikeAtMs,
    speechFrameCount,
    speechEvidenceMinRms,
    speechEvidenceMaxRms,
    silenceStartedAtMs,
  };
  const shouldStop =
    !state.hasFired &&
    heardSpeech &&
    silenceStartedAtMs !== null &&
    nowMs - silenceStartedAtMs >= silenceDurationMs &&
    nowMs - state.startedAtMs >= options.minDurationMs;

  return {
    state: shouldStop ? { ...nextState, hasFired: true } : nextState,
    shouldStop,
  };
}

export function startSilenceMonitor(
  stream: MediaStream,
  options: SilenceMonitorOptions,
): SilenceMonitor {
  const audioContext = new AudioContext();
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);
  const frequencyData = new Float32Array(analyser.frequencyBinCount);
  let state = createSilenceDetectorState(options.startedAtMs);
  let animationFrame: number | null = null;
  let stopped = false;

  const sample = () => {
    if (stopped) {
      return;
    }

    analyser.getByteTimeDomainData(data);
    analyser.getFloatFrequencyData(frequencyData);
    const update = updateSilenceDetector(
      state,
      calculateFrameFeatures(data, frequencyData, audioContext.sampleRate),
      performance.now(),
      options,
    );
    state = update.state;
    if (update.shouldStop) {
      options.onSilence();
      return;
    }
    animationFrame = requestAnimationFrame(sample);
  };

  sample();

  return {
    getSnapshot: () => ({
      heardSpeech: state.heardSpeech,
      qualifiedSpeech: state.heardSpeech,
      peakRms: state.peakRms,
      noiseFloorRms: state.noiseFloorRms,
    }),
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      source.disconnect();
      void audioContext.close();
    },
  };
}
