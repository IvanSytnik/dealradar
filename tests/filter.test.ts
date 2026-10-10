import { describe, expect, it } from "vitest";
import { applyRules } from "../src/core/filter.js";
import { listing, XBOX_PROFILE } from "./helpers.js";

const run = (title: string, price: number | null = 150, over = {}, body = "") =>
  applyRules(listing({ id: "1", title, price, body }), { ...XBOX_PROFILE, ...over });

describe("applyRules (Xbox Series S profile)", () => {
  it.each([
    ["Xbox Series S 512GB", true],
    ["Xbox Series S 512GB mit Controller", true],
    ["Xbox Series-S + 2 Controller + 5 Spiele", false], // "spiel" is excluded in this profile
    ["XSS weiß wie neu", true],
    ["Microsoft Xbox S Konsole", true],
    ["Xbox Series S Controller schwarz", false], // accessory alone
    ["Xbox Series S Controllerset", false], // compound accessory
    ["Xbox Series S Headset Konsole", true], // accessory + console signal
    ["Xbox Series S Hülle", false],
    ["Suche Xbox Series S", false],
    ["Tausche Xbox Series S gegen PS5", false],
    ["Xbox Series X 1TB", false],
    ["PlayStation 5", false],
  ])("%s -> %s", (title, pass) => {
    expect(run(title).pass).toBe(pass);
  });

  // Real titles from the first live run (2026-10-10), no AI profile: generic lexicon only
  describe("generic lexicon, empty profile", () => {
    const bare = { exclude: [], accessoryWords: [], priceMin: null, priceMax: null, mustAny: [["xbox", "series", "s"]] };
    it.each([
      ["Xbox s series", true],
      ["Xbox Series S 512Gb packet + bildschirm, controller und headset", true],
      ["Microsoft Xbox Series S mit 512 GB mit controller und OVP", true],
      ["Xbox Series S|X Controller Starfield Controller NEU und OVP", false],
      ["(reserviert) Xbox series s", false],
      ["Xbox Series S bereits verkauft", false],
      ["Verkaufe Xbox Series S", true],
      ["Xbox Series S Ladestation", false],
    ])("%s -> %s", (title, pass) => {
      expect(run(title, 200, bare).pass).toBe(pass);
    });

    // PS5 live run (2026-10-10): games are bundle-able, matched as whole words only
    it.each([
      ["PlayStation 5 Spiele FC24 F1 24", false],
      ["Playstation 5 + 2 Spiele", true],
      ["PS5 Spielekonsole digital", true],
      ["Sony PlayStation 5 Digital 4K Gaming OVP", true],
    ])("games: %s -> %s", (title, pass) => {
      expect(run(title, 300, { ...bare, mustAny: [["playstation", "5"], ["ps5"]] }).pass).toBe(pass);
    });

    it("does not treat the searched word as an accessory", () => {
      const r = applyRules(listing({ id: "1", title: "Xbox Series Controller Carbon Black", price: 40 }), {
        ...XBOX_PROFILE,
        ...bare,
        mustAny: [["xbox", "controller"]],
      });
      expect(r.pass).toBe(true);
    });
  });

  it("applies the price range but lets unknown prices through", () => {
    expect(run("Xbox Series S", 40).reason).toMatch(/price 40 < 60/);
    expect(run("Xbox Series S", 400).reason).toMatch(/price 400 > 250/);
    expect(run("Xbox Series S", null).pass).toBe(true);
    expect(run("Xbox Series S", 400, { priceMax: null }).pass).toBe(true);
  });

  it("flags defects, drops them only when not allowed", () => {
    const allowed = run("Xbox Series S defekt", 80);
    expect(allowed).toMatchObject({ pass: true, defect: true });
    expect(run("Xbox Series S", 80, {}, "Startet nicht, für Bastler").defect).toBe(true);
    expect(run("Xbox Series S defekt", 80, { allowDefect: false })).toMatchObject({ pass: false, defect: true });
  });

  it("with no match groups accepts any title (category watches)", () => {
    expect(run("Irgendwas Konsole", 100, { mustAny: [] }).pass).toBe(true);
  });
});
