import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { trackUiEvent } from "./telemetry";
import { shouldInitSentry } from "./sentry";
import { sentryRelease, buildInfo } from "./buildInfo";
import {
  friendlyHttpFallback,
  isNetworkFetchError,
  mapTransportError,
  resolveApiErrorMessage,
  submitResearchConsent,
} from "./accentOracleClient";

vi.mock("./posthog", () => ({
  capturePostHogEvent: vi.fn(),
  initPostHog: vi.fn(() => false),
  shouldInitPostHog: vi.fn(() => false),
}));

vi.mock("./devFlags", async () => {
  const actual = await vi.importActual<typeof import("./devFlags")>("./devFlags");
  return {
    ...actual,
    resolveAccentOracleMode: () => "api",
  };
});

import { capturePostHogEvent } from "./posthog";

describe("trackUiEvent", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
    vi.mocked(capturePostHogEvent).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts allowlisted event JSON without extra fields", () => {
    trackUiEvent("homepage_viewed");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/telemetry\/event$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ event: "homepage_viewed" }),
      }),
    );
    expect(capturePostHogEvent).toHaveBeenCalledWith("homepage_viewed");
  });

  it("dual-fires new allowlisted events by name only", () => {
    for (const event of [
      "analysis_completed",
      "recording_press_hold",
      "recording_too_short",
      "recording_no_speech",
      "share_clicked",
      "research_consent_accepted",
    ] as const) {
      trackUiEvent(event);
      expect(capturePostHogEvent).toHaveBeenCalledWith(event);
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: JSON.stringify({ event }) }),
      );
    }
  });
});

describe("shouldInitSentry", () => {
  it("is false without DSN in vitest env", () => {
    expect(shouldInitSentry()).toBe(false);
  });
});

describe("buildInfo / sentryRelease", () => {
  it("exposes a version string", () => {
    expect(buildInfo.version.length).toBeGreaterThan(0);
    expect(sentryRelease().length).toBeGreaterThan(0);
  });
});

describe("client error mapping", () => {
  it("maps Failed to fetch to Catalan network copy", () => {
    expect(isNetworkFetchError(new TypeError("Failed to fetch"))).toBe(true);
    const mapped = mapTransportError(new TypeError("Failed to fetch"));
    expect(mapped?.message).toMatch(/connectar|connexió/i);
  });

  it("maps AbortError to timeout copy", () => {
    const mapped = mapTransportError(new DOMException("Aborted", "AbortError"));
    expect(mapped?.message).toMatch(/trigat massa/i);
  });

  it("uses status fallbacks instead of English validation dumps", () => {
    expect(friendlyHttpFallback(429, "fallback")).toMatch(/massa peticions/i);
    expect(friendlyHttpFallback(503, "fallback")).toMatch(/saturat/i);
    expect(friendlyHttpFallback(500, "fallback")).toMatch(/servidor/i);
    expect(
      resolveApiErrorMessage(422, [{ loc: ["body"], msg: "field required" }], "fallback"),
    ).toBe("fallback");
    expect(resolveApiErrorMessage(500, "Internal Server Error", "fallback")).toMatch(/servidor/i);
    expect(resolveApiErrorMessage(400, "La gravació és massa curta.", "fallback")).toBe(
      "La gravació és massa curta.",
    );
  });
});

describe("pending cleanup transport", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              analysisSessionId: "session-id",
              researchConsent: false,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses keepalive for page-exit consent cleanup", async () => {
    await submitResearchConsent({ analysisSessionId: "session-id", consent: false });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/research-consent$/),
      expect.objectContaining({
        keepalive: true,
        body: JSON.stringify({
          recordingId: undefined,
          analysisSessionId: "session-id",
          consent: false,
          ageConfirmed: false,
          policyVersion: undefined,
        }),
      }),
    );
  });
});
