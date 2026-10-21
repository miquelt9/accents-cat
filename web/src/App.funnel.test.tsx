import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { trackUiEvent } from "./lib/telemetry";

vi.mock("./lib/telemetry", async () => {
  const actual = await vi.importActual<typeof import("./lib/telemetry")>("./lib/telemetry");
  return { ...actual, trackUiEvent: vi.fn() };
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
  if (typeof SVGSVGElement !== "undefined") {
    SVGSVGElement.prototype.getScreenCTM = () => null;
  }
  if (typeof SVGGElement !== "undefined") {
    SVGGElement.prototype.getScreenCTM = () => null;
  }
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

function eventNames(): string[] {
  return vi.mocked(trackUiEvent).mock.calls.map((call) => call[0]);
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
    await vi.advanceTimersByTimeAsync(700);
  });
}

describe("product funnel", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    installMatchMedia();
    installRecorder();
    localStorage.clear();
    vi.mocked(trackUiEvent).mockClear();
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

  it("counts homepage through result once, and a retry only from results", async () => {
    localStorage.setItem("accent-oracle-dev", "1");
    localStorage.setItem("accent-oracle-mode-override", "mock-success");
    await act(async () => {
      root.render(<App />);
    });
    await act(async () => {
      clickButton(container, "Comença");
    });
    await recordTake(container);

    const shown = eventNames();
    expect(shown).toEqual([
      "homepage_viewed",
      "recording_started",
      "recording_completed",
      "analyze_pressed",
      "analysis_completed",
      "result_shown",
    ]);

    await act(async () => {
      clickButton(container, "Tornar a l'inici");
    });
    expect(eventNames().filter((name) => name === "flow_retried")).toEqual(["flow_retried"]);

    await act(async () => {
      clickButton(container, "Comença");
    });
    await act(async () => {
      clickButton(container, "Tornar a l'inici");
    });
    expect(eventNames().filter((name) => name === "flow_retried")).toEqual(["flow_retried"]);
  });

  it("fires result_shown once when a third take finishes the same flow", async () => {
    await act(async () => {
      root.render(<App />);
    });
    await act(async () => {
      clickButton(container, "Comença");
    });
    await recordTake(container);
    await recordTake(container);
    expect(eventNames().filter((name) => name === "result_shown")).toEqual([]);

    await act(async () => {
      clickButton(container, "Sí, llegeix de nou");
    });
    await recordTake(container);

    expect(eventNames().filter((name) => name === "result_shown")).toEqual(["result_shown"]);
    expect(eventNames()).toContain("third_take_completed");
    expect(eventNames().filter((name) => name === "flow_retried")).toEqual([]);
  });
});
