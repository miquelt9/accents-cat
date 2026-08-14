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

  it("clears thumb selection when the sheet is dismissed via backdrop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/feedback")) {
          return Promise.resolve(response({ feedbackId: "feedback-id" }));
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

    const thumbsUp = container.querySelector(
      'button[aria-label="Sí"]',
    ) as HTMLButtonElement;
    await act(async () => {
      thumbsUp.click();
      await Promise.resolve();
    });

    expect(thumbsUp.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const backdrop = container.querySelector(
      ".feedback-sheet-backdrop",
    ) as HTMLButtonElement;
    await act(async () => {
      backdrop.click();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      container.querySelector('button[aria-label="Sí"]')?.getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      container.querySelector('button[aria-label="No"]')?.getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("prefills remembered comarques and reports them when sent", async () => {
    const onComarquesSaved = vi.fn();
    const fetchMock = vi.fn((...args: [RequestInfo | URL, RequestInit?]) => {
      const [input, init] = args;
      const url = String(input);
      if (url.endsWith("/feedback")) {
        return Promise.resolve(response({ feedbackId: "feedback-id" }));
      }
      if (url.endsWith("/research-consent")) {
        return Promise.resolve(
          response({
            analysisSessionId: "session-id",
            researchConsent: true,
          }),
        );
      }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? ""}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <ResultsConsentFeedback
          analysisSessionId="session-id"
          preConsented
          initialComarques={["barcelones"]}
          onComarquesSaved={onComarquesSaved}
        />,
      );
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });

    // Auto-promote must not show the saved-voice thank-you before feedback.
    expect(container.textContent).not.toMatch(/Hem desat la teva veu per a la recerca/);

    const thumbsUp = container.querySelector(
      'button[aria-label="Sí"]',
    ) as HTMLButtonElement;
    expect(thumbsUp).not.toBeNull();
    await act(async () => {
      thumbsUp.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/Hem desat la teva veu per a la recerca/);
    expect(
      container.querySelector('.comarca-picker-option[aria-selected="true"]')?.textContent,
    ).toMatch(/Barcelonès/);

    const send = container.querySelector(
      ".feedback-comarca-send",
    ) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    await act(async () => {
      send.click();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    });

    expect(onComarquesSaved).toHaveBeenCalledWith(["barcelones"]);
    expect(container.textContent).toMatch(/Hem desat la teva veu per a la recerca/);
    const feedbackBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/feedback"))
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as { comarques?: string[] });
    expect(feedbackBodies.some((body) => body.comarques?.includes("barcelones"))).toBe(
      true,
    );
  });

  it("notifies when research consent is declined", async () => {
    const onResearchDeclined = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/feedback")) {
          return Promise.resolve(response({ feedbackId: "feedback-id" }));
        }
        if (url.endsWith("/research-consent")) {
          return Promise.resolve(
            response({
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
          onResearchDeclined={onResearchDeclined}
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
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    });

    expect(onResearchDeclined).toHaveBeenCalledTimes(1);
  });

  it("does not auto-submit comarques when the sheet is dismissed", async () => {
    const fetchMock = vi.fn((...args: [RequestInfo | URL, RequestInit?]) => {
      const [input] = args;
      const url = String(input);
      if (url.endsWith("/feedback")) {
        return Promise.resolve(response({ feedbackId: "feedback-id" }));
      }
      if (url.endsWith("/research-consent")) {
        return Promise.resolve(
          response({
            analysisSessionId: "session-id",
            researchConsent: true,
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <ResultsConsentFeedback analysisSessionId="session-id" preConsented />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });

    const thumbsUp = container.querySelector(
      'button[aria-label="Sí"]',
    ) as HTMLButtonElement;
    await act(async () => {
      thumbsUp.click();
      await Promise.resolve();
    });

    const option = container.querySelector(
      ".comarca-picker-option",
    ) as HTMLButtonElement;
    await act(async () => {
      option.click();
    });

    const backdrop = container.querySelector(
      ".feedback-sheet-backdrop",
    ) as HTMLButtonElement;
    await act(async () => {
      backdrop.click();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const feedbackBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/feedback"))
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as {
        comarques?: string[];
      });
    expect(feedbackBodies.some((body) => (body.comarques?.length ?? 0) > 0)).toBe(false);
  });

  it("skips the comarca sheet with Ara no", async () => {
    const fetchMock = vi.fn((...args: [RequestInfo | URL, RequestInit?]) => {
      const [input] = args;
      const url = String(input);
      if (url.endsWith("/feedback")) {
        return Promise.resolve(response({ feedbackId: "feedback-id" }));
      }
      if (url.endsWith("/research-consent")) {
        return Promise.resolve(
          response({
            analysisSessionId: "session-id",
            researchConsent: true,
          }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <ResultsConsentFeedback analysisSessionId="session-id" preConsented />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });

    const thumbsUp = container.querySelector(
      'button[aria-label="Sí"]',
    ) as HTMLButtonElement;
    await act(async () => {
      thumbsUp.click();
      await Promise.resolve();
    });

    const skip = container.querySelector(
      ".feedback-comarca-skip",
    ) as HTMLButtonElement;
    expect(skip.disabled).toBe(false);
    await act(async () => {
      skip.click();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    });

    expect(container.textContent).toMatch(/Hem desat la teva veu per a la recerca/);
    const feedbackBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/feedback"))
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as {
        comarques?: string[];
        selfReportedDialect?: string;
      });
    expect(feedbackBodies.some((body) => body.selfReportedDialect === "unknown")).toBe(true);
    expect(feedbackBodies.some((body) => (body.comarques?.length ?? 0) > 0)).toBe(false);
  });
});
