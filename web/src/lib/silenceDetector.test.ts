import { describe, expect, it } from "vitest";
import {
  AudioFrameFeatures,
  calculateRms,
  calculateSpeechBandRatio,
  calculateSpectralFlatness,
  createSilenceDetectorState,
  hasDetectedSpeech,
  isSpeechLikeFrame,
  updateSilenceDetector,
} from "./silenceDetector";

const detectorOptions = {
  minDurationMs: 1_500,
  silenceDurationMs: 1_000,
  speechThreshold: 0.1,
  ambientCalibrationMs: 0,
};

function speechFeatures(rms: number): AudioFrameFeatures {
  return {
    rms,
    speechBandRatio: 0.55,
    spectralFlatness: 0.25,
    zeroCrossingRate: 0.06,
  };
}

function roomNoiseFeatures(rms: number): AudioFrameFeatures {
  return {
    rms,
    speechBandRatio: 0.12,
    spectralFlatness: 0.95,
    zeroCrossingRate: 0.4,
  };
}

describe("silence detector", () => {
  it("calculates normalized RMS from time-domain samples", () => {
    expect(calculateRms(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(calculateRms(new Uint8Array([0, 255]))).toBeCloseTo(1);
  });

  it("extracts speech-band ratio and spectral flatness", () => {
    const frequencyData = new Float32Array([-20, -20, -80, -80]);
    expect(calculateSpeechBandRatio(frequencyData, 8_000, 0, 1_000)).toBeCloseTo(1);
    expect(calculateSpectralFlatness(new Float32Array([-20, -20]))).toBeCloseTo(1);
  });

  it("arms after sustained, varying speech and stops after continuous silence", () => {
    let state = createSilenceDetectorState(0);

    ({ state } = updateSilenceDetector(state, speechFeatures(0.2), 100, detectorOptions));
    let update = updateSilenceDetector(state, roomNoiseFeatures(0), 200, detectorOptions);
    expect(update.shouldStop).toBe(false);

    for (const [nowMs, rms] of [
      [300, 0.2],
      [320, 0.202],
      [340, 0.205],
      [360, 0.21],
      [380, 0.215],
    ] as const) {
      update = updateSilenceDetector(update.state, speechFeatures(rms), nowMs, detectorOptions);
    }
    expect(update.state.heardSpeech).toBe(true);

    update = updateSilenceDetector(update.state, roomNoiseFeatures(0), 1_199, detectorOptions);
    expect(update.shouldStop).toBe(false);
    update = updateSilenceDetector(update.state, roomNoiseFeatures(0), 1_200, detectorOptions);
    expect(update.shouldStop).toBe(false);
    update = updateSilenceDetector(update.state, roomNoiseFeatures(0), 2_200, detectorOptions);
    expect(update.shouldStop).toBe(true);
    expect(update.state.hasFired).toBe(true);
  });

  it("does not arm for constant room noise", () => {
    let state = createSilenceDetectorState(0);

    for (const nowMs of [100, 200, 300, 400, 500, 600, 700]) {
      const update = updateSilenceDetector(state, roomNoiseFeatures(0.2), nowMs, detectorOptions);
      state = update.state;
      expect(update.shouldStop).toBe(false);
    }
    expect(state.heardSpeech).toBe(false);
  });

  it("does not arm for an isolated loud noise spike", () => {
    let state = createSilenceDetectorState(0);
    ({ state } = updateSilenceDetector(state, speechFeatures(0.2), 100, detectorOptions));

    let update = updateSilenceDetector(state, roomNoiseFeatures(0), 200, detectorOptions);
    expect(update.shouldStop).toBe(false);
    update = updateSilenceDetector(update.state, roomNoiseFeatures(0), 500, detectorOptions);
    expect(update.state.heardSpeech).toBe(false);
  });

  it("waits for the minimum recording duration", () => {
    let state = createSilenceDetectorState(0);
    const minDurationOptions = { ...detectorOptions, silenceDurationMs: 300 };
    ({ state } = updateSilenceDetector(state, speechFeatures(0.2), 100, minDurationOptions));
    for (const [nowMs, rms] of [
      [200, 0.2],
      [220, 0.202],
      [240, 0.205],
      [260, 0.21],
      [280, 0.215],
    ] as const) {
      ({ state } = updateSilenceDetector(
        state,
        speechFeatures(rms),
        nowMs,
        minDurationOptions,
      ));
    }
    let update = updateSilenceDetector(state, roomNoiseFeatures(0), 1_200, minDurationOptions);
    expect(update.state.heardSpeech).toBe(true);
    expect(update.shouldStop).toBe(false);
    update = updateSilenceDetector(update.state, roomNoiseFeatures(0), 1_500, minDurationOptions);
    expect(update.shouldStop).toBe(true);
  });

  it("rejects snapshots that never reached the speech threshold", () => {
    expect(
      hasDetectedSpeech({
        heardSpeech: false,
        qualifiedSpeech: false,
        peakRms: 0,
        noiseFloorRms: null,
      }),
    ).toBe(false);
    expect(
      hasDetectedSpeech({
        heardSpeech: true,
        qualifiedSpeech: false,
        peakRms: 0.2,
        noiseFloorRms: 0.01,
      }),
    ).toBe(false);
    expect(
      hasDetectedSpeech({
        heardSpeech: true,
        qualifiedSpeech: true,
        peakRms: 0.15,
        noiseFloorRms: 0.01,
      }),
    ).toBe(true);
  });

  it("requires speech-like features beyond loudness", () => {
    expect(isSpeechLikeFrame(roomNoiseFeatures(0.2), 0.01, detectorOptions)).toBe(false);
    expect(isSpeechLikeFrame(speechFeatures(0.2), 0.01, detectorOptions)).toBe(true);
  });
});
