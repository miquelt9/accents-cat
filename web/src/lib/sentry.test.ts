import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  browserTracingIntegration: () => "tracing",
  replayIntegration: () => "replay",
  setTag: vi.fn(),
  ErrorBoundary: ({ children }: { children: unknown }) => children,
}));

import * as Sentry from "@sentry/react";
import { initSentry } from "./sentry";

describe("initSentry", () => {
  beforeEach(() => {
    vi.mocked(Sentry.init).mockClear();
    vi.stubEnv("VITE_DIAGNOSTICS_ENABLED", "1");
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@sentry.example/1");
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "production");
    vi.stubEnv("VITE_SENTRY_ENABLE_DEV", "");
  });

  it("does not install session replay", () => {
    expect(initSentry()).toBe(true);
    const options = vi.mocked(Sentry.init).mock.calls[0][0];
    expect(options.integrations).toEqual(["tracing"]);
    expect(JSON.stringify(options)).not.toMatch(/replay/i);
    expect(options.release).toBeTruthy();
  });
});
