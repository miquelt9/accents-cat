import { describe, expect, it } from "vitest";
import { LEGAL_DOCS, LEGAL_POLICY_VERSION } from "./legalDocs";

describe("legal copy", () => {
  it("does not mention PostHog or session replay", () => {
    const text = JSON.stringify(LEGAL_DOCS);
    expect(text).not.toMatch(/PostHog/);
    expect(text).not.toMatch(/reproduccions només quan hi ha un error/);
    expect(text).not.toMatch(/reproducció de sessió/);
    expect(text).toMatch(/rep errors i traces mostrejades/);
    expect(text).toMatch(/no fa servir galetes ni emmagatzematge del navegador/);
    expect(LEGAL_POLICY_VERSION).toBe("21 d'octubre de 2026");
  });
});
