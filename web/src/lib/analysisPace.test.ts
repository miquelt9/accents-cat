import { describe, expect, it, vi, afterEach } from "vitest";
import {
  ANALYSIS_SLOW_MESSAGE,
  AnalysisFailure,
  calmFailureMessage,
  latencyBucket,
} from "./analysisPace";
import { ANALYZE_TIMEOUT_MS, apiAccentOracleClient } from "./accentOracleClient";

const prompt = {
  promptId: "prompt-1",
  promptText: "Bon dia.",
  sentenceIds: [] as string[],
};

describe("analysis pace copy and buckets", () => {
  it("uses calm Catalan copy", () => {
    expect(ANALYSIS_SLOW_MESSAGE).toMatch(/despertant/);
    expect(calmFailureMessage("timeout")).toMatch(/tornar-ho a provar/);
    expect(calmFailureMessage("5xx")).toMatch(/servidor/);
    expect(calmFailureMessage("network")).toMatch(/connexió/);
  });

  it("buckets the full wait, including a long wake-up", () => {
    expect(latencyBucket(1_000)).toBe("under_15s");
    expect(latencyBucket(15_000)).toBe("15_to_45s");
    expect(latencyBucket(45_000)).toBe("45_to_90s");
    expect(latencyBucket(120_000)).toBe("over_90s");
  });
});

describe("api analyze failure classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("classifies a client abort as timeout with the full elapsed wait", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }),
    );
    const pending = apiAccentOracleClient.analyzeRecording(new Blob(["x"]), prompt);
    const captured = pending.then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(ANALYZE_TIMEOUT_MS);
    const thrown = await captured;
    expect(thrown).toBeInstanceOf(AnalysisFailure);
    if (thrown instanceof AnalysisFailure) {
      expect(thrown.reason).toBe("timeout");
      expect(latencyBucket(thrown.elapsedMs)).toBe("over_90s");
      expect(thrown.elapsedMs).toBeGreaterThanOrEqual(ANALYZE_TIMEOUT_MS);
    }
  });

  it("classifies HTTP 5xx separately from client errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("no", { status: 503 }))),
    );
    await expect(apiAccentOracleClient.analyzeRecording(new Blob(["x"]), prompt)).rejects.toMatchObject({
      reason: "5xx",
    });
  });

  it("classifies network failures and leaves 4xx as ordinary errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(apiAccentOracleClient.analyzeRecording(new Blob(["x"]), prompt)).rejects.toMatchObject({
      reason: "network",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: "La gravació és massa curta." }), {
            status: 422,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    let thrown: unknown;
    try {
      await apiAccentOracleClient.analyzeRecording(new Blob(["x"]), prompt);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(AnalysisFailure);
    expect((thrown as Error).message).toMatch(/massa curta/);
  });
});
