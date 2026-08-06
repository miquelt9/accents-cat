import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockAccentOracleClient } from "./accentOracleClient";
import {
  DEV_TOOLS_STORAGE_KEY,
  MODE_OVERRIDE_STORAGE_KEY,
} from "./devFlags";
import { needsValidation } from "./needsValidation";

const prompt = { promptId: "test", promptText: "Text de prova." };

describe("mock-success profiles", () => {
  beforeEach(() => {
    localStorage.setItem(DEV_TOOLS_STORAGE_KEY, "1");
    localStorage.setItem(MODE_OVERRIDE_STORAGE_KEY, "mock-success");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem(DEV_TOOLS_STORAGE_KEY);
    localStorage.removeItem(MODE_OVERRIDE_STORAGE_KEY);
  });

  it("cycles clear-win winners across successive analyzes", async () => {
    const tops: string[] = [];
    const scoreSnapshots: string[] = [];

    for (let i = 0; i < 5; i += 1) {
      const pending = mockAccentOracleClient.analyzeRecording(new Blob(), prompt);
      await vi.advanceTimersByTimeAsync(700);
      const result = await pending;
      expect(needsValidation(result)).toBe(false);
      tops.push(result.topLabel);
      scoreSnapshots.push(JSON.stringify(result.scores));
    }

    expect(new Set(tops).size).toBe(5);
    expect(new Set(scoreSnapshots).size).toBe(5);
  });
});
