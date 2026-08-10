import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DialectMap } from "./DialectMap";

describe("DialectMap focus callout", () => {
  it("renders the comarca and illustrative affinity wording on the focus pin", () => {
    const markup = renderToStaticMarkup(
      <DialectMap
        pinComarca="barcelones"
        showAffinityCallout
        playEntrance={false}
        selectedZone="central"
      />,
    );

    expect(markup).toContain("Barcelonès");
    expect(markup).toContain("Punt d’afinitat dialectal");
    expect(markup).not.toContain("Focus visual aproximat; no indica el teu origen.");
  });

  it("shows only the white name label when inspecting a non-focus comarca", () => {
    const markup = renderToStaticMarkup(
      <DialectMap
        pinComarca="osona"
        showAffinityCallout={false}
        playEntrance={false}
        selectedZone="central"
      />,
    );

    expect(markup).toContain("Osona");
    expect(markup).toContain("comarca-hover-label");
    expect(markup).not.toContain("Punt d’afinitat dialectal");
    expect(markup).not.toContain("comarca-callout");
  });
});
