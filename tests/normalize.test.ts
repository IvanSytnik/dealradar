import { describe, expect, it } from "vitest";
import { hasPhrase, hasWordPrefix, normalize, tokens } from "../src/core/normalize.js";

describe("normalize", () => {
  it("folds umlauts, case and punctuation", () => {
    expect(normalize("Xbox Series-S Hülle, NEU!!")).toBe("xbox series s huelle neu");
    expect(normalize("Fußball Ständer")).toBe("fussball staender");
    expect(normalize("Café crème")).toBe("cafe creme");
  });

  it("keeps + and & as separate tokens", () => {
    expect(normalize("Series S+2 Controller")).toBe("series s + 2 controller");
    expect(normalize("PS5&Spiele")).toBe("ps5 & spiele");
  });

  it("tokens drops empties", () => {
    expect(tokens("  ps5   digital ")).toEqual(["ps5", "digital"]);
  });
});

describe("hasPhrase", () => {
  const t = normalize("Xbox Series S 512GB weiß");
  it("matches whole words and phrases", () => {
    expect(hasPhrase(t, "series s")).toBe(true);
    expect(hasPhrase(t, "Series-S")).toBe(true);
    expect(hasPhrase(t, "weiß")).toBe(true);
  });
  it("does not match inside words", () => {
    expect(hasPhrase(normalize("Xbox Series X"), "series s")).toBe(false);
    expect(hasPhrase(normalize("Messer"), "mess er")).toBe(false);
    expect(hasPhrase(t, "")).toBe(false);
  });
});

describe("hasWordPrefix", () => {
  it("hits German compounds and plurals", () => {
    expect(hasWordPrefix(normalize("Controllerset schwarz"), "controller")).toBe(true);
    expect(hasWordPrefix(normalize("2 Hüllen"), "huelle")).toBe(true);
    expect(hasWordPrefix(normalize("Schutzhülle"), "huelle")).toBe(false); // only prefixes, not suffixes
  });
  it("falls back to phrase match for multi-word entries", () => {
    expect(hasWordPrefix(normalize("inkl Game Pass"), "game pass")).toBe(true);
  });
});
