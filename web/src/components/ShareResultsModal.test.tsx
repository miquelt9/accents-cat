import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareResultsModal } from "./ShareResultsModal";
import type { AccentScores } from "../lib/accentOracleClient";

const sampleScores: AccentScores = {
  balearic: 0.12,
  central: 0.48,
  northern: 0.22,
  northwestern: 0.1,
  valencian: 0.08,
};

describe("ShareResultsModal card copy", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
  });

  it("shows a short kicker and the dialect headline, not the long caption", async () => {
    await act(async () => {
      root.render(
        <ShareResultsModal scores={sampleScores} theme="light" onClose={() => undefined} />,
      );
    });

    expect(container.textContent).toContain("La meva veu s'assembla més a");
    expect(container.textContent).toContain("Central");
    expect(container.textContent).toContain("48%");
    expect(container.textContent).not.toContain("ha calculat que la meva veu");
    expect(container.querySelector(".share-card-hero-pct")?.textContent).toBe("48%");
  });

  it("marks unresolved results on the card", async () => {
    await act(async () => {
      root.render(
        <ShareResultsModal
          scores={sampleScores}
          theme="light"
          unresolved
          onClose={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain("Resultat obert");
    expect(container.textContent).toContain("La meva veu s'assembla més a");
    expect(container.textContent).not.toContain("ha calculat que la meva veu");
  });
});
