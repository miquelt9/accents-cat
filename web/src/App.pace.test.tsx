import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AnalysisFailure, ANALYSIS_SLOW_MESSAGE, calmFailureMessage } from "./lib/analysisPace";

const { analyzeRecording } = vi.hoisted(() => ({
  analyzeRecording: vi.fn(),
}));

vi.mock("./lib/accentOracleClient", async () => {
  const actual = await vi.importActual<typeof import("./lib/accentOracleClient")>(
    "./lib/accentOracleClient",
  );
  return {
    ...actual,
    getAccentOracleClient: () => ({ analyzeRecording }),
  };
});

vi.mock("./lib/silenceDetector", async () => {
  const actual = await vi.importActual<typeof import("./lib/silenceDetector")>("./lib/silenceDetector");
  return {
    ...actual,
    startSilenceMonitor: () => {
      throw new Error("skip the audio graph in tests");
    },
  };
});

class FakeAudioContext {
  state = "running";
  sampleRate = 48000;
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
  createAnalyser() {
    return {
      fftSize: 256,
      frequencyBinCount: 16,
      getByteFrequencyData() {},
      getByteTimeDomainData() {},
      getFloatFrequencyData() {},
    };
  }
  createMediaStreamSource() {
    return { connect() {} };
  }
}

class FakeMediaRecorder {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = "recording";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
  }

  stop() {
    this.state = "inactive";
    this.onstop?.();
  }

  static isTypeSupported() {
    return true;
  }
}

function installMatchMedia() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

function installRecorder() {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {} }],
      }),
    },
  });
}

function clickButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.getAttribute("aria-label") === label || node.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(`missing button ${label}`);
  }
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function recordTake(container: HTMLElement) {
  await act(async () => {
    clickButton(container, "Comença a gravar");
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_200);
  });
  await act(async () => {
    clickButton(container, "Atura la gravació");
    await Promise.resolve();
  });
}

describe("analysis pace messages", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    installMatchMedia();
    installRecorder();
    localStorage.clear();
    analyzeRecording.mockReset();
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the calm slow line after 12s and clears it when the flow restarts", async () => {
    analyzeRecording.mockImplementation(() => new Promise(() => undefined));
    await act(async () => {
      root.render(<App />);
    });
    await act(async () => {
      clickButton(container, "Comença");
    });
    await recordTake(container);
    expect(container.querySelector("[data-analysis-pace='slow']")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(container.querySelector("[data-analysis-pace='slow']")?.textContent).toBe(
      ANALYSIS_SLOW_MESSAGE,
    );

    await act(async () => {
      clickButton(container, "Tornar a l'inici");
    });
    expect(container.querySelector("[data-analysis-pace]")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(container.querySelector("[data-analysis-pace]")).toBeNull();
  });

  it("shows the calm failure line instead of the old error", async () => {
    analyzeRecording.mockRejectedValue(new AnalysisFailure("timeout", 120_000, "old timeout"));
    await act(async () => {
      root.render(<App />);
    });
    await act(async () => {
      clickButton(container, "Comença");
    });
    await recordTake(container);

    const notice = container.querySelector("[data-analysis-pace='fail']");
    expect(notice?.textContent).toBe(calmFailureMessage("timeout"));
    expect(notice?.className).toContain("quiet-recording-hint");
    expect(container.querySelector(".error-message")).toBeNull();
  });

  it("shows the calm busy line when the service is saturated", async () => {
    analyzeRecording.mockRejectedValue(new AnalysisFailure("saturated", 1_000, "El servei està saturat."));
    await act(async () => {
      root.render(<App />);
    });
    await act(async () => {
      clickButton(container, "Comença");
    });
    await recordTake(container);

    expect(container.querySelector("[data-analysis-pace='fail']")?.textContent).toBe(
      calmFailureMessage("saturated"),
    );
    expect(container.textContent).not.toContain("El servei està saturat.");
  });
});
