import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DialectMap } from "./DialectMap";

describe("DialectMap focus callout", () => {
  it("renders the comarca and illustrative affinity wording on the pin", () => {
    const markup = renderToStaticMarkup(
      <DialectMap
        pinComarca="barcelones"
        playEntrance={false}
        selectedZone="central"
      />,
    );

    expect(markup).toContain("Barcelonès");
    expect(markup).toContain("Punt d’afinitat dialectal");
    expect(markup).not.toContain("Focus visual aproximat; no indica el teu origen.");
  });
});
