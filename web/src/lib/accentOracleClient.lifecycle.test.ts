import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./devFlags", async () => {
  const actual = await vi.importActual<typeof import("./devFlags")>("./devFlags");
  return {
    ...actual,
    resolveAccentOracleMode: () => "api",
  };
});

import { apiAccentOracleClient } from "./accentOracleClient";

const prompt = {
  promptId: "pluja-vinya",
  promptText: "La pluja fina cau sobre la vinya vella.",
};

const apiResult = {
  scores: {
    balearic: 0.08,
    central: 0.55,
    northern: 0.12,
    northwestern: 0.13,
    valencian: 0.12,
  },
  topLabel: "central",
  runnerUpLabel: "northwestern",
  topTwoGap: 0.42,
  isAmbiguousTopTwo: false,
  evidenceBand: "strong",
  confidenceSummary: "strong",
  interpretation: "test",
  recordingId: "recording-id",
  analysisSessionId: "server-session-id",
  takeIndex: 1,
};

describe("API session handshake", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(apiResult), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("omits analysisSessionId from the first API request", async () => {
    await apiAccentOracleClient.analyzeRecording(new Blob(["audio"]), prompt);

    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(request?.body).toBeInstanceOf(FormData);
    expect((request?.body as FormData).has("analysisSessionId")).toBe(false);
  });

  it("sends the adopted server ID on the next take", async () => {
    await apiAccentOracleClient.analyzeRecording(
      new Blob(["audio"]),
      prompt,
      apiResult.analysisSessionId,
    );

    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect((request?.body as FormData).get("analysisSessionId")).toBe(
      apiResult.analysisSessionId,
    );
  });
});
