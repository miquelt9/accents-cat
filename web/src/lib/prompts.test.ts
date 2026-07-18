import { describe, expect, it } from "vitest";
import { READ_ALOUD_PROMPTS, pickReadAloudPrompt } from "./prompts";

describe("pickReadAloudPrompt", () => {
  it("returns a prompt from the pool", () => {
    const prompt = pickReadAloudPrompt();
    expect(READ_ALOUD_PROMPTS.some((entry) => entry.id === prompt.id)).toBe(true);
    expect(prompt.text.length).toBeGreaterThan(0);
  });

  it("never returns an excluded id when alternatives exist", () => {
    const excluded = READ_ALOUD_PROMPTS[0].id;
    for (let index = 0; index < 40; index += 1) {
      const prompt = pickReadAloudPrompt([excluded]);
      expect(prompt.id).not.toBe(excluded);
    }
  });

  it("falls back to the full pool when every id is excluded", () => {
    const allIds = READ_ALOUD_PROMPTS.map((prompt) => prompt.id);
    const prompt = pickReadAloudPrompt(allIds);
    expect(allIds).toContain(prompt.id);
  });
});

describe("READ_ALOUD_PROMPTS", () => {
  it("has unique ids and short texts", () => {
    const ids = READ_ALOUD_PROMPTS.map((prompt) => prompt.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const prompt of READ_ALOUD_PROMPTS) {
      expect(prompt.text.length).toBeLessThan(280);
      expect(prompt.text.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(3);
    }
  });
});
