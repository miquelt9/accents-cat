import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecorderPanel } from "./RecorderPanel";

/**
 * Chrome event order on the mic control (live QA, 2026-10-22):
 * pointerdown hits the inner icon, setPointerCapture retargets pointerup to the
 * button, and preventDefault on that pointerdown drops the mouse/pen click.
 * Touch still emits click. The second mouse click is then pointerdown →
 * pointerup → click, and a stale ignore-next-click flag swallows it.
 */
class FakeMediaRecorder {
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  static isTypeSupported(): boolean {
    return true;
  }
  start(): void {
    this.state = "recording";
    startCount += 1;
  }
  stop(): void {
    this.state = "inactive";
    this.onstop?.();
  }
}

let startCount = 0;

function installMediaMocks(): void {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  const stream = {
    getTracks: () => [{ stop: () => undefined }],
    getAudioTracks: () => [{ stop: () => undefined }],
  } as unknown as MediaStream;
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn(async () => stream),
    },
  });
  vi.stubGlobal("AudioContext", undefined);
}

function recordButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector("button");
  if (!button) {
    throw new Error("missing record button");
  }
  return button;
}

function iconOf(button: HTMLButtonElement): Element {
  return button.querySelector("path, rect") ?? button;
}

function isRecording(button: HTMLButtonElement): boolean {
  return button.getAttribute("aria-pressed") === "true";
}

function pointerEvent(type: "pointerdown" | "pointerup", pointerType: string): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "pointerdown" ? 1 : 0,
    pointerId: 1,
    pointerType,
    isPrimary: true,
  });
}

function clickEvent(): MouseEvent {
  return new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
}

async function gesture(
  button: HTMLButtonElement,
  pointerType: "mouse" | "touch" | "pen",
  withClick: boolean,
): Promise<void> {
  await act(async () => {
    iconOf(button).dispatchEvent(pointerEvent("pointerdown", pointerType));
    button.dispatchEvent(pointerEvent("pointerup", pointerType));
    if (withClick) {
      iconOf(button).dispatchEvent(clickEvent());
    }
  });
}

async function keyActivate(button: HTMLButtonElement, key: "Enter" | " "): Promise<void> {
  const code = key === "Enter" ? "Enter" : "Space";
  await act(async () => {
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }),
    );
    if (key === " ") {
      button.dispatchEvent(
        new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }),
      );
    }
    button.dispatchEvent(clickEvent());
  });
}

describe("RecorderPanel record button", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    startCount = 0;
    installMediaMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderPanel(): Promise<HTMLButtonElement> {
    await act(async () => {
      root.render(<RecorderPanel onRecordingReady={() => undefined} theme="light" />);
    });
    return recordButton(container);
  }

  it.each(["mouse", "pen"] as const)(
    "%s: pointerdown → pointerup, then pointerdown → pointerup → click starts then stops",
    async (pointerType) => {
      const button = await renderPanel();

      await gesture(button, pointerType, false);
      expect(isRecording(button)).toBe(true);
      expect(startCount).toBe(1);

      await gesture(button, pointerType, true);
      expect(isRecording(button)).toBe(false);
      expect(startCount).toBe(1);
    },
  );

  it("touch: pointerdown → pointerup → click twice starts then stops", async () => {
    const button = await renderPanel();

    await gesture(button, "touch", true);
    expect(isRecording(button)).toBe(true);
    expect(startCount).toBe(1);

    await gesture(button, "touch", true);
    expect(isRecording(button)).toBe(false);
    expect(startCount).toBe(1);
  });

  it("touch: pointerdown → pointerup twice starts then stops when click is omitted", async () => {
    const button = await renderPanel();

    await gesture(button, "touch", false);
    expect(isRecording(button)).toBe(true);
    expect(startCount).toBe(1);

    await gesture(button, "touch", false);
    expect(isRecording(button)).toBe(false);
    expect(startCount).toBe(1);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    await keyActivate(button, "Enter");
    expect(isRecording(button)).toBe(true);
    expect(startCount).toBe(2);
  });

  it("does not stop on the click that belongs to the press which started recording", async () => {
    const button = await renderPanel();

    await gesture(button, "mouse", true);
    expect(isRecording(button)).toBe(true);
    expect(startCount).toBe(1);

    await gesture(button, "mouse", true);
    expect(isRecording(button)).toBe(false);
    expect(startCount).toBe(1);
  });

  it.each(["Enter", " "] as const)(
    "keyboard %s starts once and the next activation stops",
    async (key) => {
      const button = await renderPanel();

      await keyActivate(button, key);
      expect(isRecording(button)).toBe(true);
      expect(startCount).toBe(1);

      await keyActivate(button, key);
      expect(isRecording(button)).toBe(false);
      expect(startCount).toBe(1);
    },
  );

  it("holding the record button does not stop on release", async () => {
    const button = await renderPanel();
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    await act(async () => {
      iconOf(button).dispatchEvent(pointerEvent("pointerdown", "mouse"));
    });
    expect(isRecording(button)).toBe(true);

    now += 450;
    await act(async () => {
      button.dispatchEvent(pointerEvent("pointerup", "mouse"));
      iconOf(button).dispatchEvent(clickEvent());
    });
    expect(isRecording(button)).toBe(true);
    expect(startCount).toBe(1);

    await gesture(button, "mouse", true);
    expect(isRecording(button)).toBe(false);
  });
});
