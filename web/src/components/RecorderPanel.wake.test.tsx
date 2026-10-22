import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecorderPanel } from "./RecorderPanel";
import { ANALYZE_WAKE_NOTICE_MS, SERVER_WAKE_NOTICE } from "../lib/coldStart";

describe("analyze wake notice", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("appears after the threshold and before 10s, not earlier", async () => {
    expect(ANALYZE_WAKE_NOTICE_MS).toBe(6_000);
    expect(ANALYZE_WAKE_NOTICE_MS).toBeLessThan(10_000);

    await act(async () => {
      root.render(
        <RecorderPanel analyzing onRecordingReady={() => undefined} theme="light" />,
      );
    });

    expect(container.querySelector(".mic-progress-ring")).not.toBeNull();
    expect(container.textContent).toContain("Analitzant");
    expect(container.textContent).not.toContain(SERVER_WAKE_NOTICE);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ANALYZE_WAKE_NOTICE_MS - 1);
    });
    expect(container.textContent).not.toContain(SERVER_WAKE_NOTICE);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(container.textContent).toContain(SERVER_WAKE_NOTICE);
    expect(container.querySelector(".mic-progress-ring")).not.toBeNull();
  });
});
