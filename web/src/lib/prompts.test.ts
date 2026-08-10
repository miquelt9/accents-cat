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
  it("has unique ids and 15–20 second-length texts", () => {
    const ids = READ_ALOUD_PROMPTS.map((prompt) => prompt.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const prompt of READ_ALOUD_PROMPTS) {
      expect(prompt.id).toMatch(/^cv26-[0-9a-f]{16}$/);
      expect(prompt.text.length).toBeGreaterThanOrEqual(200);
      expect(prompt.text.length).toBeLessThanOrEqual(220);
      expect(prompt.text.split(/\s+/).length).toBeGreaterThanOrEqual(28);
      expect(prompt.text.split(/\s+/).length).toBeLessThanOrEqual(36);
      expect(prompt.sentenceIds.length).toBeGreaterThanOrEqual(1);
      expect(prompt.sentenceIds.length).toBeLessThanOrEqual(4);
      const sentences = prompt.text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
      expect(new Set(sentences).size).toBe(sentences.length);
      for (const sentenceId of prompt.sentenceIds) {
        expect(sentenceId).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });
});
