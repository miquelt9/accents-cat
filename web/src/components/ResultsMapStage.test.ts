import { describe, expect, it } from "vitest";
import {
  displayedFocusComarcaSlug,
  shouldShowAffinityCallout,
} from "../lib/resultsMapFocus";

describe("ResultsMapStage focus comarca", () => {
  it("keeps the illustrative focus pin for unresolved results", () => {
    expect(displayedFocusComarcaSlug("central", "central", null, "barcelones")).toBe(
      "barcelones",
    );
  });

  it("keeps an explicitly inspected comarca when the selected zone changes", () => {
    expect(
      displayedFocusComarcaSlug("valencian", "central", "barcelones", "osona"),
    ).toBe("barcelones");
  });

  it("shows affinity callout only when the pin is the illustrative focus comarca", () => {
    expect(shouldShowAffinityCallout("barcelones", "barcelones")).toBe(true);
    expect(shouldShowAffinityCallout("osona", "barcelones")).toBe(false);
    expect(shouldShowAffinityCallout(null, "barcelones")).toBe(false);
  });
});
