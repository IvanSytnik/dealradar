// Regression: profiles the real model (claude-haiku-5-5) produced on 2026-10-10, and real Willhaben titles.
import { describe, expect, it } from "vitest";
import { buildProfile, matchGroups, sanePrices } from "../src/ai/profile.js";
import { applyRules } from "../src/core/filter.js";
import { parsePrice } from "../src/core/price.js";
import { fakeLlm, listing, query } from "./helpers.js";

const XBOX_REPLY = {
  item: "Microsoft Xbox Series S game console (used or new, console itself)",
  must_any: [["xbox series s"], ["xbox series s"], ["xbox seriess"], ["xbox xss"], ["xss"], ["series s konsole"], ["xbox s konsole"]],
  exclude: "series x, serie x, seriesx, xbox x, xsx, one, 360, ps5, playstation, switch, nintendo, gehäuse, gehaeuse, leer, karton, verpackung, ohne konsole, nur controller, nur netzteil, festplatte, hdd, ssd, speicherkarte, gutschein, guthaben, abo, game pass, gamepass, mietkonsole, stand, kühler, kuehler, dock, lenkrad, vr".split(", "),
  accessory_words: "controller, gamepad, spiel, game, ladestation, headset, hdd, ssd, speicher, kabel, spiele, games, hülle, huelle, huellen, case, tasche, schutzfolie, folie, skin, ladegerät, ladegeraet, netzteil, halterung".split(", "),
};

const PS5_REPLY = {
  item: "Sony PlayStation 5 console",
  must_any: [["playstation 5"], ["playstation5"], ["ps5"], ["ps 5"], ["playstation 5"]],
  exclude: "ps4, ps3, ps2, ps1, playstation 4, playstation 3, playstation 2, playstation 1, psp, ps vita, vita, playstation portal, portal, ps5 spiel, ps5 spiele, ps5 game, ps5 games, dualsense, aufkleber, sticker, gehaeuse, gehäuse, leer, verpackung nur, karton leer, stand, mikrofon, kamera, camera, hdmi, speicherkarte, ssd karte, festplatte nur, lenkrad, vr brille, psvr, digital edition gutschein, guthaben, abo, psn, plus karte, nintendo, xbox".split(", "),
  accessory_words: "controller, dualsense, spiel, spiele, game, headset, ladestation, kabel, extra, games, gamepad, huelle, hülle, cover, skin, ladegeraet, ladegerät, netzteil, staender, ständer, kopfhoerer, kopfhörer".split(", "),
  price_min: 150,
  price_max: 600,
};

async function profileFor(reply: object, keyword: string) {
  const { llm } = fakeLlm(() => JSON.stringify(reply));
  const r = await buildProfile({ ...query(), keyword }, llm);
  expect(r.source).toBe("ai");
  return r.profile;
}

describe("prices", () => {
  it.each([
    ["99,0", 99],
    ["99,00", 99],
    ["1.234,50", 1234.5],
    ["€ 150,-", 150],
    [150, 150],
    [-5, null],
    ["", null],
  ])("parsePrice(%j) = %s", (raw, expected) => {
    expect(parsePrice(raw as string | number)).toBe(expected);
  });

  it("repairs an inverted range: keeps the lower number as the ceiling, derives a floor (899/330, 800/330, 990/330 live)", () => {
    expect(sanePrices(990, 330)).toEqual({ min: 99, max: 330 });
    expect(sanePrices(899, 330)).toEqual({ min: 99, max: 330 });
    expect(sanePrices(300, 330)).toEqual({ min: 90, max: 300 });
    expect(sanePrices(100, 330)).toEqual({ min: 100, max: 330 });
    expect(sanePrices(null, 330)).toEqual({ min: null, max: 330 });
  });

  it.each([
    ["99,0", 100], // German decimal string -> 99, rounded to 5
    [990, 100], // inverted range -> floor derived from 330 (99 -> 100)
  ])("xbox profile with price_min %j", async (min, expectedMin) => {
    const p = await profileFor({ ...XBOX_REPLY, price_min: min, price_max: 330 }, "xbox series s");
    expect(p.priceMin).toBe(expectedMin);
    expect(p.priceMax).toBeNull(); // AI ceiling is never a hard filter
    expect(p.typicalPrice?.max).toBe(330);
  });
});

describe("match groups", () => {
  it("are order-free word sets, deduplicated, and always include the query", () => {
    expect(matchGroups([["xbox series s"], ["xbox series s"], ["xss"]], [["xbox", "series", "s"]])).toEqual([
      ["xbox", "series", "s"],
      ["xss"],
    ]);
  });
});

describe("live Xbox Series S profile", () => {
  it.each([
    ["Xbox s series", 300, true],
    ["Microsoft Xbox Series S mit 512 GB mit controller und OVP", 275, true],
    ["Xbox Series S 512GB SSD", 220, true], // ssd was in both exclude and accessories
    ["Xbox Series s zum verkaufen kommt mit kontroller ethernet cable und alles", 260, true],
    ["Xbox Series S|X Controller Starfield Controller NEU und OVP", 199, false],
    ["(reserviert) Xbox series s", 250, false],
    ["Xbox Series X 1TB", 350, false],
    ["Tiny Tina's Wonderlands - Next-Level Edition", 20, false],
    ["Xbox Spiele Bundle", 30, false],
  ])("%s (%s €) -> %s", async (title, price, pass) => {
    const p = await profileFor({ ...XBOX_REPLY, price_min: "99,0", price_max: 330 }, "xbox series s");
    expect(applyRules(listing({ id: "1", title, price }), p).pass).toBe(pass);
  });
});

describe("live PlayStation 5 profile", () => {
  it.each([
    ["Playstation 5", 500, true],
    ["Ps5 disk edition", 540, true],
    ["PlayStation 5 Slim Digital", 460, true],
    ["Playstation 5 + 2 Controller", 550, true],
    ["Sony PlayStation 5 Digital 825GB SSD Speicher PS5 Konsole DualSense Wireless Controller weiss 4K Gaming OVP", 450, true],
    ["*UNGEÖFFNET & VERSIEGELT* PlayStation 5 Spiele - FC24 - F1 24 PS5 - Madden NFL 24", 39, false],
    ["PS4 Konsole + 3 Controller + 7 Spiele (FIFA 19, Landwirtschafts-Simulator, F1) - Top Zustand", 140, false],
    ["Leere PlayStation 5 Slim Disc Originalverpackung (Black Ops 6 Edition) - keine Konsole", 45, false],
    ["Sony PlayStation 5 HD Camera / PS5 Kamera - NEU & OVP", 60, false],
  ])("%s (%s €) -> %s", async (title, price, pass) => {
    const p = await profileFor(PS5_REPLY, "playstation 5");
    expect(applyRules(listing({ id: "1", title, price }), p).pass).toBe(pass);
  });
});

// Second live run (#7): the PS5 for 380 € was reported missing from the preview
const PS5_REPLY_2 = {
  item: "Sony PlayStation 5 console (PS5)",
  must_any: [["playstation 5"], ["playstation5"], ["ps5"], ["ps 5"], ["play station 5"], ["sony ps5"]],
  exclude: "ps4, ps3, ps2, ps vita, psp, playstation 4, playstation 3, playstation 2, playstation 4 pro, ps5 pro, pro konsole, ps5 slim pro, ps5 spiel, ps5 game, ps5 games, schutzhuelle, aufkleber, sticker, dock, docking, charger, stand, standfuss, vertikal, kuehler, kuehlung, lüfter, luefter, gehaeuse, frontblende, blende, faceplate, laufwerk, leer, ohne inhalt, karton, verpackung, ovp only, nur ovp, nur karton, gutschein, guthaben, psn, abo, plus karte, geschenkkarte, code, mikrofon, eyetoy, kamera, move, vr, psvr, psvr2, ps vr, ps vr2, playstation vr, xbox".split(", "),
  accessory_words: "controller, dualsense, joystick, gamepad, ladestation, headset, spiel dabei, mit spiel, 2 controller, zwei controller, extra controller, bundle, spiel, spiele, game, games, huelle, huellen, case, tasche, schutzfolie, folie, skin, ladegeraet, ladekabel, kabel, netzteil, staender, cover, kopfhoerer".split(", "),
  price_min: 170,
  price_max: 560,
};

describe("live PlayStation 5 profile, run 2", () => {
  it("passes the 380 € PS5 (it was only cut from the 5-line preview)", async () => {
    const p = await profileFor(PS5_REPLY_2, "playstation 5");
    const l = listing({
      id: "1",
      title: "Playstation 5",
      price: 380,
      body: "Verkaufe oder Tausche meine Ps5 mit Aim Controller der aber kleine Macken hat, schnellladestation ist auch dabei von Razer",
    });
    expect(applyRules(l, p)).toMatchObject({ pass: true });
  });
});

// Third live run (#9): the AI guessed a 480 € ceiling and three good PS5s (500/540/550 €) disappeared
const PS5_REPLY_3 = {
  item: "Sony PlayStation 5 console",
  must_any: [["playstation 5"], ["playstation5"], ["ps5"], ["ps 5"]],
  exclude: "ps4, playstation 4, playstation4, ps3, ps2, ps vita, pro, vr, kamera, camera, sticker, standfuss, dock, leer, karton, attrappe, dummy, gutschein, code, abo, psn, lautsprecher, geldkarte, replica, modell, spielfigur, schutz, abdeckung, bluray laufwerk, laufwerk".split(", "),
  accessory_words: "controller, dualsense, spiel, spiele, game, games, headset, kabel, bundle, 2 controller, zwei controller, ladestation, ovp, huelle, skin, staender, netzteil, kopfhoerer, cover".split(", "),
  price_min: 120,
  price_max: 480,
};

describe("live PlayStation 5 profile, run 3: the AI price ceiling is only a hint", () => {
  it.each([
    ["Sony PlayStation 5 Digital 825GB SSD Speicher PS5 Konsole DualSense Wireless Controller weiss 4K Gaming OVP", 450],
    ["Playstation 5", 500],
    ["Ps5 disk edition", 540],
    ["PlayStation 5 Slim Digital", 460],
    ["Playstation 5 + 2 Controller", 550],
    ["Playstation 5", 380],
  ])("%s (%s €) passes", async (title, price) => {
    const p = await profileFor(PS5_REPLY_3, "playstation 5");
    expect(p.priceMax).toBeNull();
    expect(p.typicalPrice).toEqual({ min: 120, max: 480 });
    expect(applyRules(listing({ id: "1", title, price }), p)).toMatchObject({ pass: true });
  });

  it("the AI floor still cuts accessories and games", async () => {
    const p = await profileFor(PS5_REPLY_3, "playstation 5");
    expect(applyRules(listing({ id: "1", title: "PlayStation 5 Spiele FC24 F1 24", price: 39 }), p).pass).toBe(false);
  });

  it("a ceiling the user set in the URL is still hard", async () => {
    const { llm } = fakeLlm(() => JSON.stringify(PS5_REPLY_3));
    const { profile } = await buildProfile({ ...query(), keyword: "playstation 5", priceTo: 450 }, llm);
    expect(profile.priceMax).toBe(450);
    expect(applyRules(listing({ id: "1", title: "Playstation 5", price: 500 }), profile).pass).toBe(false);
  });
});

// Market scan run on 2026-10-10: listings the filter missed
describe("spelling variants from the live Xbox scan", () => {
  it.each([
    ["X Box Serie S", 400],
    ["XBOX Series S", 250],
    ["Play Station 5 Slim", 450],
  ])("%s matches", async (title, price) => {
    const xbox = await profileFor({ ...XBOX_REPLY, price_min: 99, price_max: 330 }, "xbox series s");
    const ps5 = await profileFor(PS5_REPLY_3, "playstation 5");
    const p = title.toLowerCase().includes("station") ? ps5 : xbox;
    expect(applyRules(listing({ id: "1", title, price }), p)).toMatchObject({ pass: true });
  });
});
