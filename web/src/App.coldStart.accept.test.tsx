import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  ANALYZE_WAKE_NOTICE_MS,
  SERVER_WAKE_NOTICE,
  resetBackendWarmup,
} from "./lib/coldStart";

const ANALYZE_DELAY_MS = 40_000;
const BLAMES_CONNECTION = /connexi[oó]|connectar|internet|comprova la connex/i;

const appendedAudio: Blob[] = [];
let recorderStarts = 0;
let mediaSources = 0;
const originalAppend = FormData.prototype.append as (
  this: FormData,
  name: string,
  value: string | Blob,
  filename?: string,
) => void;

class FakeAnalyser {
  fftSize = 256;

  get frequencyBinCount(): number {
    return this.fftSize / 2;
  }

  getByteFrequencyData(buffer: Uint8Array): void {
    buffer.fill(0);
  }

  getByteTimeDomainData(buffer: Uint8Array): void {
    buffer.fill(128);
  }

  getFloatFrequencyData(buffer: Float32Array): void {
    buffer.fill(-100);
  }

  connect(): void {}

  disconnect(): void {}
}

class FakeAudioContext {
  state = "running";
  sampleRate = 48_000;

  resume(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  createAnalyser(): FakeAnalyser {
    return new FakeAnalyser();
  }

  createMediaStreamSource(): { connect(): void; disconnect(): void } {
    mediaSources += 1;
    // The silence monitor is the first graph. Letting it throw keeps the take
    // (no speech gate) while the waveform still gets a usable source.
    if (mediaSources === 1) {
      throw new Error("silence graph unavailable");
    }
    return { connect() {}, disconnect() {} };
  }
}

class FakeMediaRecorder {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  static isTypeSupported(): boolean {
    return true;
  }

  start(): void {
    this.state = "recording";
    recorderStarts += 1;
  }

  stop(): void {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["cold-start-take"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

function liveGets(): unknown[][] {
  return vi.mocked(fetch).mock.calls.filter((call) => {
    const url = String(call[0]);
    const init = call[1] as RequestInit | undefined;
    return url.endsWith("/live") && (init?.method ?? "GET") === "GET";
  });
}

function analyzePosts(): unknown[][] {
  return vi.mocked(fetch).mock.calls.filter((call) => {
    const url = String(call[0]);
    const init = call[1] as RequestInit | undefined;
    return url.endsWith("/analyze") && init?.method === "POST";
  });
}

describe("cold-start /analyze acceptance", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    sessionStorage.clear();
    resetBackendWarmup();
    appendedAudio.length = 0;
    recorderStarts = 0;
    mediaSources = 0;
    vi.stubEnv("VITE_ACCENT_ORACLE_MODE", "api");
    vi.stubEnv("VITE_PRODUCT_ANALYTICS_ENABLED", "");
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }],
          getAudioTracks: () => [{ stop() {} }],
        }),
      },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: async () => ({
          state: "granted",
          addEventListener() {},
          removeEventListener() {},
        }),
      },
    });
    FormData.prototype.append = function append(
      name: string,
      value: string | Blob,
      filename?: string,
    ) {
      if (name === "audio" && value instanceof Blob) {
        appendedAudio.push(value);
      }
      originalAppend.call(this, name, value, filename);
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/live")) {
          return Promise.resolve(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        if (url.endsWith("/analyze")) {
          return new Promise<Response>((resolve) => {
            setTimeout(() => {
              resolve(
                new Response(JSON.stringify({ detail: "cold" }), {
                  status: 500,
                  headers: { "Content-Type": "application/json" },
                }),
              );
            }, ANALYZE_DELAY_MS);
          });
        }
        return Promise.resolve(new Response(null, { status: 204 }));
      }),
    );
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
        "performance",
        "requestAnimationFrame",
        "cancelAnimationFrame",
      ],
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    FormData.prototype.append = originalAppend;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  function buttonByText(text: string): HTMLButtonElement {
    const found = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text),
    );
    if (!found) {
      throw new Error(`Missing button: ${text}\n${container.textContent}`);
    }
    return found;
  }

  it(
    "shows the wake notice before 10s when /analyze takes 40s and then fails",
    async () => {
      expect(ANALYZE_WAKE_NOTICE_MS).toBeLessThan(10_000);

      await act(async () => {
        root.render(<App />);
      });

      expect(liveGets()).toHaveLength(0);
      await act(async () => {
        buttonByText("Comença").click();
      });
      expect(liveGets()).toHaveLength(1);

      const mic = container.querySelector("button.mic-button");
      if (!(mic instanceof HTMLButtonElement)) {
        throw new Error("Missing mic button");
      }
      await act(async () => {
        mic.click();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(container.textContent).toContain("Gravant");

      await advance(3_100);
      await act(async () => {
        mic.click();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(analyzePosts()).toHaveLength(1);
      expect(recorderStarts).toBe(1);
      expect(container.textContent).not.toContain(SERVER_WAKE_NOTICE);
      expect(container.querySelector(".error-message")).toBeNull();

      await advance(ANALYZE_WAKE_NOTICE_MS - 1);
      expect(container.textContent).not.toContain(SERVER_WAKE_NOTICE);

      await advance(1);
      expect(container.textContent).toContain(SERVER_WAKE_NOTICE);
      expect(container.querySelector(".mic-progress-ring")).not.toBeNull();
      expect(container.querySelector(".error-message")).toBeNull();
      expect(analyzePosts()).toHaveLength(1);

      await advance(ANALYZE_DELAY_MS - ANALYZE_WAKE_NOTICE_MS);
      const error = container.querySelector(".error-message");
      expect(error?.textContent ?? "").not.toMatch(BLAMES_CONNECTION);
      expect(error?.textContent).toMatch(/servidor/i);
      expect(error?.textContent).toMatch(/despertant/i);

      await act(async () => {
        buttonByText("Reenvia la gravació").click();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(recorderStarts).toBe(1);
      expect(analyzePosts()).toHaveLength(2);
      expect(appendedAudio).toHaveLength(2);
      expect(appendedAudio[0]).toBe(appendedAudio[1]);
      expect(appendedAudio[0]?.size).toBeGreaterThan(0);
    },
    20_000,
  );
});
