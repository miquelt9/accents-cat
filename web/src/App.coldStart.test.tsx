import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  ANALYZE_UNAVAILABLE_MESSAGE,
  RESEND_RECORDING_LABEL,
  resetBackendWarmup,
} from "./lib/coldStart";
import * as oracle from "./lib/accentOracleClient";

const BLAMES_CONNECTION = /connexi[oó]|connectar|internet/i;

const harness = vi.hoisted(() => ({
  blob: new Blob(["same-recording"], { type: "audio/webm" }),
  analyze: vi.fn(),
}));

vi.mock("./components/RecorderPanel", () => ({
  RecorderPanel: (props: { onRecordingReady: (audio: Blob) => void }) => (
    <button onClick={() => props.onRecordingReady(harness.blob)} type="button">
      Gravar prova
    </button>
  ),
}));

function buttonByText(container: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  );
  if (!found) {
    throw new Error(`Missing button: ${text}`);
  }
  return found;
}

describe("cold-start analyze recovery", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    sessionStorage.clear();
    resetBackendWarmup();
    harness.analyze.mockReset();
    harness.analyze.mockRejectedValue(new Error(ANALYZE_UNAVAILABLE_MESSAGE));
    vi.spyOn(oracle, "getAccentOracleClient").mockReturnValue({
      analyzeRecording: harness.analyze,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderApp() {
    await act(async () => {
      root.render(<App />);
    });
  }

  async function clickAndFlush(text: string) {
    await act(async () => {
      buttonByText(container, text).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function liveGets(): unknown[][] {
    return vi.mocked(fetch).mock.calls.filter((call) => {
      const url = String(call[0]);
      const init = call[1] as RequestInit | undefined;
      return url.endsWith("/live") && (init?.method ?? "GET") === "GET";
    });
  }

  it("shows a non-blaming error and resends the same recording", async () => {
    await renderApp();
    await clickAndFlush("Comença");
    await clickAndFlush("Gravar prova");

    const error = container.querySelector(".error-message");
    expect(error?.textContent).toBe(ANALYZE_UNAVAILABLE_MESSAGE);
    expect(error?.textContent ?? "").not.toMatch(BLAMES_CONNECTION);

    await clickAndFlush(RESEND_RECORDING_LABEL);

    expect(harness.analyze).toHaveBeenCalledTimes(2);
    expect(harness.analyze.mock.calls[0]?.[0]).toBe(harness.blob);
    expect(harness.analyze.mock.calls[1]?.[0]).toBe(harness.blob);
  });

  it("warms the backend once when Comença is tapped again inside the window", async () => {
    await renderApp();
    await clickAndFlush("Comença");
    await clickAndFlush("Tornar a l'inici");
    await clickAndFlush("Comença");

    expect(liveGets()).toHaveLength(1);
  });
});
