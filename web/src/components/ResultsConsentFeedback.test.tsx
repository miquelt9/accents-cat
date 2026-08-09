import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsConsentFeedback } from "./ResultsConsentFeedback";

vi.mock("../lib/devFlags", async () => {
  const actual = await vi.importActual<typeof import("../lib/devFlags")>("../lib/devFlags");
  return {
    ...actual,
    resolveAccentOracleMode: () => "api",
  };
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ResultsConsentFeedback decline flow", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
  });

  it("keeps consent open after a failed decline and allows retry", async () => {
    let declineAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/feedback")) {
          return Promise.resolve(response({ feedbackId: "feedback-id" }));
        }
        if (url.endsWith("/research-consent")) {
          declineAttempts += 1;
          return Promise.resolve(
            declineAttempts === 1
              ? response({ detail: "temporary failure" }, 500)
              : response({
                  analysisSessionId: "session-id",
                  researchConsent: false,
                }),
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    await act(async () => {
      root.render(
        <ResultsConsentFeedback
          analysisSessionId="session-id"
          preConsented={false}
        />,
      );
    });

    const thumbsDown = container.querySelector(
      'button[aria-label="No"]',
    ) as HTMLButtonElement;
    await act(async () => {
      thumbsDown.click();
      await Promise.resolve();
    });

    const consentNo = Array.from(
      container.querySelectorAll(".feedback-sheet-body .secondary"),
    )[0] as HTMLButtonElement;
    await act(async () => {
      consentNo.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector(".error-message")?.textContent).toMatch(
      /servidor|tornar-ho a provar/i,
    );

    const retryNo = Array.from(
      container.querySelectorAll(".feedback-sheet-body .secondary"),
    )[0] as HTMLButtonElement;
    await act(async () => {
      retryNo.click();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    });

    expect(declineAttempts).toBe(2);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      container.querySelector('button[aria-label="No"]')?.getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
