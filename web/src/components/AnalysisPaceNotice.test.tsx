import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnalysisPaceNotice } from "./AnalysisPaceNotice";
import { ANALYSIS_SLOW_MESSAGE, calmFailureMessage } from "../lib/analysisPace";

describe("AnalysisPaceNotice", () => {
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
  });

  it("renders the calm slow and fail messages with the existing hint style", async () => {
    await act(async () => {
      root.render(<AnalysisPaceNotice mode="slow" />);
    });
    const slow = container.querySelector("[data-analysis-pace='slow']");
    expect(slow?.className).toContain("quiet-recording-hint");
    expect(slow?.textContent).toBe(ANALYSIS_SLOW_MESSAGE);
    expect(slow?.getAttribute("role")).toBe("status");

    await act(async () => {
      root.render(<AnalysisPaceNotice mode="fail" reason="network" />);
    });
    const fail = container.querySelector("[data-analysis-pace='fail']");
    expect(fail?.className).toContain("quiet-recording-hint");
    expect(fail?.textContent).toBe(calmFailureMessage("network"));
    expect(fail?.getAttribute("role")).toBe("alert");

    await act(async () => {
      root.render(
        <AnalysisPaceNotice mode="fail" reason="4xx" message="La gravació és massa curta." />,
      );
    });
    const clientError = container.querySelector("[data-analysis-pace='fail']");
    expect(clientError?.className).toContain("quiet-recording-hint");
    expect(clientError?.textContent).toBe("La gravació és massa curta.");
  });
});
