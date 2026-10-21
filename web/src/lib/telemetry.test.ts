import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { trackUiEvent } from "./telemetry";
import { shouldInitSentry } from "./sentry";
import { releaseFromParts, sentryRelease, buildInfo } from "./buildInfo";
import { sentrySourcemapUpload } from "./sentryBuild";
import {
  friendlyHttpFallback,
  isNetworkFetchError,
  mapTransportError,
  resolveApiErrorMessage,
  submitResearchConsent,
} from "./accentOracleClient";

vi.mock("./devFlags", async () => {
  const actual = await vi.importActual<typeof import("./devFlags")>("./devFlags");
  return {
    ...actual,
    resolveAccentOracleMode: () => "api",
  };
});

describe("trackUiEvent", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_PRODUCT_ANALYTICS_ENABLED", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts allowlisted event JSON without cookies or extra fields", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    trackUiEvent("homepage_viewed");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/telemetry\/event$/),
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        body: JSON.stringify({ event: "homepage_viewed" }),
      }),
    );
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("sends new allowlisted events by name only", () => {
    for (const event of [
      "analysis_completed",
      "result_shown",
      "flow_retried",
      "recording_press_hold",
      "recording_too_short",
      "recording_no_speech",
      "share_clicked",
      "research_consent_accepted",
      "origin_submitted",
    ] as const) {
      trackUiEvent(event);
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: "omit",
          body: JSON.stringify({ event }),
        }),
      );
    }
  });

  it("adds a coarse reason and latency bucket only for analysis_failed", () => {
    trackUiEvent("analysis_failed", { reason: "timeout", latencyBucket: "over_90s" });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          event: "analysis_failed",
          reason: "timeout",
          latencyBucket: "over_90s",
        }),
      }),
    );
    trackUiEvent("homepage_viewed", { reason: "network", latencyBucket: "under_15s" });
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ event: "homepage_viewed" }),
      }),
    );
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

  it("tags the release with the full git SHA", () => {
    expect(releaseFromParts("0.1.0", "abcdef1234567890")).toBe("abcdef1234567890");
    expect(releaseFromParts("0.1.0", "dev")).toBe("0.1.0");
    expect(releaseFromParts("0.1.0", "abcdef1234567890", "explicit")).toBe("explicit");
  });
});

describe("sentry source map upload", () => {
  it("skips unless the token, org, and project are all set", () => {
    expect(sentrySourcemapUpload({})).toBeNull();
    expect(sentrySourcemapUpload({ SENTRY_AUTH_TOKEN: "token" })).toBeNull();
    expect(
      sentrySourcemapUpload({
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_ORG: "org",
        SENTRY_PROJECT: "web",
        VITE_GIT_SHA: "abc123def456",
      }),
    ).toEqual({
      authToken: "token",
      org: "org",
      project: "web",
      release: "abc123def456",
    });
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
