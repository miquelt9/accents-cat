import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

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

describe("theme storage", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    installMatchMedia();
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("writes the theme to localStorage only when the user toggles it", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => {
      root.render(<App />);
    });
    expect(setItem.mock.calls.filter(([key]) => key === "accent-oracle-theme")).toEqual([]);
    expect(document.documentElement.dataset.theme).toBe("light");

    const button = container.querySelector("button.theme-switch");
    expect(button).toBeTruthy();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(localStorage.getItem("accent-oracle-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    setItem.mockRestore();
  });

  it("reads a saved theme on load without writing it again", async () => {
    localStorage.setItem("accent-oracle-theme", "dark");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => {
      root.render(<App />);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(setItem.mock.calls.filter(([key]) => key === "accent-oracle-theme")).toEqual([]);
    setItem.mockRestore();
  });
});
