import { describe, expect, it } from "vitest";
import {
  COMARCA_DEFINITE_ARTICLE,
  comarcaNameMatchesQuery,
  comarcaSearchAliases,
  selfReportedDialectFromComarques,
} from "./comarcaDisplay";

describe("comarcaSearchAliases", () => {
  it("adds the listed article forms", () => {
    expect(comarcaSearchAliases("Selva", "selva")).toEqual(["selva", "la selva"]);
    expect(comarcaSearchAliases("Bages", "bages")).toEqual(["bages", "el bages"]);
    expect(comarcaSearchAliases("Anoia", "anoia")).toEqual(["anoia", "l'anoia"]);
    expect(comarcaSearchAliases("Garrigues", "garrigues")).toEqual(["garrigues", "les garrigues"]);
  });

  it("keeps bare names for comarques without a listed article", () => {
    expect(comarcaSearchAliases("Safor", "safor")).toEqual(["safor"]);
    expect(comarcaSearchAliases("Osona", "osona")).toEqual(["osona"]);
  });
});

describe("comarcaNameMatchesQuery", () => {
  it("matches listed articles with the correct form only", () => {
    expect(comarcaNameMatchesQuery("Selva", "La Selva", "selva")).toBe(true);
    expect(comarcaNameMatchesQuery("Selva", "Selva", "selva")).toBe(true);
    expect(comarcaNameMatchesQuery("Selva", "El Selva", "selva")).toBe(false);

    expect(comarcaNameMatchesQuery("Bages", "El Bages", "bages")).toBe(true);
    expect(comarcaNameMatchesQuery("Bages", "La Bages", "bages")).toBe(false);

    expect(comarcaNameMatchesQuery("Anoia", "L'Anoia", "anoia")).toBe(true);
    expect(comarcaNameMatchesQuery("Anoia", "La Anoia", "anoia")).toBe(false);

    expect(comarcaNameMatchesQuery("Garrigues", "Les Garrigues", "garrigues")).toBe(true);
  });

  it("does not invent La/El for unlisted comarques", () => {
    expect(comarcaNameMatchesQuery("Safor", "La Safor", "safor")).toBe(false);
    expect(comarcaNameMatchesQuery("Safor", "Safor", "safor")).toBe(true);
    expect(comarcaNameMatchesQuery("Osona", "L'Osona", "osona")).toBe(false);
  });

  it("still matches mid-name articles and substrings", () => {
    expect(comarcaNameMatchesQuery("Alt Empordà", "emporda", "alt-emporda")).toBe(true);
    expect(comarcaNameMatchesQuery("Alt Empordà", "l'alt emporda", "alt-emporda")).toBe(true);
    expect(comarcaNameMatchesQuery("Pla de l'Estany", "estany", "pla-estany")).toBe(true);
    expect(comarcaNameMatchesQuery("Pla de l'Estany", "l'estany", "pla-estany")).toBe(true);
  });

  it("matches Vallès / Horta group prefixes", () => {
    expect(comarcaNameMatchesQuery("Vallès Occidental", "el valles", "valles-occidental")).toBe(
      true,
    );
    expect(comarcaNameMatchesQuery("Horta Nord", "l'horta", "horta-nord")).toBe(true);
  });

  it("treats empty queries as match-all", () => {
    expect(comarcaNameMatchesQuery("Selva", "", "selva")).toBe(true);
    expect(comarcaNameMatchesQuery("Selva", "  ", "selva")).toBe(true);
  });

  it("rejects unrelated names", () => {
    expect(comarcaNameMatchesQuery("Selva", "Priorat", "selva")).toBe(false);
    expect(comarcaNameMatchesQuery("Baix Camp", "Alt Camp", "baix-camp")).toBe(false);
  });

  it("covers every slug in the article allowlist shape", () => {
    for (const article of Object.values(COMARCA_DEFINITE_ARTICLE)) {
      expect(["el", "la", "l'", "les"]).toContain(article);
    }
  });
});

describe("selfReportedDialectFromComarques", () => {
  it("returns the shared macro or mixed", () => {
    expect(selfReportedDialectFromComarques(["selva"])).toBe("central");
    expect(selfReportedDialectFromComarques(["selva", "bages"])).toBe("central");
    expect(selfReportedDialectFromComarques(["selva", "safor"])).toBe("mixed");
    expect(selfReportedDialectFromComarques([])).toBeNull();
  });
});
