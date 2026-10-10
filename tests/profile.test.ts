import { describe, expect, it } from "vitest";
import { buildProfile, fallbackProfile, sortWords } from "../src/ai/profile.js";
import { extractJson } from "../src/ai/llm.js";
import { fakeLlm, query } from "./helpers.js";

const goodReply = "```json\n" +
  JSON.stringify({
    item: "Xbox Series S console",
    must_any: [["Series", "S"], ["xss"]],
    exclude: ["huelle", "series x", "xss"],
    accessory_words: ["controller"],
    price_min: 62,
    price_max: 263,
  }) +
  "\n```";

describe("fallbackProfile", () => {
  it("requires all meaningful words of the query", () => {
    const p = fallbackProfile({ ...query(), keyword: "PS5 Digital mit OVP" });
    expect(p.mustAny).toEqual([["ps5", "digital"]]);
    expect(p.useAi).toBe(false);
  });

  it("takes the price range from the URL", () => {
    const p = fallbackProfile({ ...query(), priceFrom: 50, priceTo: 200 });
    expect([p.priceMin, p.priceMax]).toEqual([50, 200]);
  });
});

describe("buildProfile", () => {
  it("uses the AI profile, lowercases, removes contradictions, rounds prices", async () => {
    const { llm, calls } = fakeLlm(() => goodReply);
    const { profile, source } = await buildProfile(query(), llm);
    expect(source).toBe("ai");
    expect(calls[0]!.user).toContain("xbox series s");
    // the query itself is always a group; AI groups are added as order-free word sets
    expect(profile.mustAny).toEqual([["xbox", "series", "s"], ["series", "s"], ["xss"]]);
    expect(profile.exclude).toEqual(["series x"]); // "xss" removed: it is a match word
    expect(profile.accessoryWords).toEqual(["controller", "huelle"]); // a case can come with the console

    // AI floor is a hard bound, AI ceiling is only a hint
    expect([profile.priceMin, profile.priceMax]).toEqual([60, null]);
    expect(profile.typicalPrice).toEqual({ min: 60, max: 265 });
    expect(profile.useAi).toBe(true);
  });

  it("prefers the user's URL price range over the AI guess", async () => {
    const { llm } = fakeLlm(() => goodReply);
    const { profile } = await buildProfile({ ...query(), priceFrom: 100, priceTo: null }, llm);
    expect([profile.priceMin, profile.priceMax]).toEqual([100, null]);
  });

  it("accepts an over-delivering reply (the PS5 live failure: 40+ exclude words)", async () => {
    const exclude = ["spiel", "spiele", "game", "controller", "dualsense", "headset", "ladekabel", "huelle", "hülle", "defekt", "bastler", "ps4", "ps3", "ps2", "psp", "vr", "kamera"];
    while (exclude.length < 55) exclude.push(`x${exclude.length}`);
    const { llm } = fakeLlm(() =>
      JSON.stringify({
        item: "Sony PlayStation 5 console",
        must_any: [["playstation 5"], ["ps5"], ["playstation", "5"]],
        exclude: [...exclude, 42, ""],
        price_min: "200",
        price_max: 600,
      }),
    );
    const { profile, source } = await buildProfile({ ...query(), keyword: "playstation 5" }, llm);
    expect(source).toBe("ai");
    expect(profile.mustAny).toEqual([["playstation", "5"], ["ps5"]]); // "playstation 5" twice -> deduplicated
    // accessories moved out of exclude, defects dropped, the rest kept
    expect(profile.accessoryWords).toEqual(expect.arrayContaining(["spiel", "spiele", "game", "controller", "headset", "ladekabel", "huelle", "hülle"]));
    expect(profile.exclude).toEqual(expect.arrayContaining(["ps4", "ps3", "dualsense", "vr"]));
    expect(profile.exclude).not.toContain("controller");
    expect(profile.exclude).not.toContain("defekt");
    expect([profile.priceMin, profile.priceMax]).toEqual([200, null]);
    expect(profile.typicalPrice).toEqual({ min: 200, max: 600 });
  });

  it("sortWords never excludes the user's own search words", () => {
    const r = sortWords(["controller", "ps4", "xbox"], [], new Set(["xbox", "controller"]));
    expect(r).toEqual({ exclude: ["ps4"], accessoryWords: [] });
  });

  it("accepts camelCase keys", async () => {
    const { llm } = fakeLlm(() =>
      JSON.stringify({ item: "Xbox", mustAny: [["xbox"]], exclude: ["spiel"], accessoryWords: ["controller"], priceMin: 50, priceMax: 250 }),
    );
    const { profile, source } = await buildProfile(query(), llm);
    expect(source).toBe("ai");
    expect(profile.accessoryWords).toEqual(["controller", "spiel"]);
    expect(profile.typicalPrice?.max).toBe(250);
  });

  it("retries once, then succeeds", async () => {
    let n = 0;
    const { llm, calls } = fakeLlm(() => (n++ === 0 ? "sorry" : goodReply));
    expect((await buildProfile(query(), llm)).source).toBe("ai");
    expect(calls).toHaveLength(2);
  });

  it("a reply that ignores the format falls back but keeps AI screening on", async () => {
    const { llm, calls } = fakeLlm(() => JSON.stringify({ item: "xbox series s", must_any: [["xbox", "series", "s"]] }));
    const r = await buildProfile(query(), llm);
    expect(r.source).toBe("fallback");
    expect(r.profile.useAi).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["not json at all"],
    [JSON.stringify({ item: "x", must_any: [] })], // empty groups are invalid
    [JSON.stringify({ item: "Xbox", must_any: [["a"]], price_min: -5 })],
  ])("falls back on a bad reply: %s", async (reply) => {
    const { llm } = fakeLlm(() => reply);
    const r = await buildProfile(query(), llm);
    expect(r.source).toBe("fallback");
    expect(r.profile.mustAny).toEqual([["xbox", "series", "s"]]);
  });

  it("falls back when the model throws, and without a model", async () => {
    const r1 = await buildProfile(query(), async () => {
      throw new Error("529 overloaded");
    });
    expect(r1.source).toBe("fallback");
    expect((await buildProfile(query(), null)).source).toBe("fallback");
  });
});

describe("extractJson", () => {
  it("tolerates chatter around the object", () => {
    expect(extractJson('Sure! {"a":1} hope it helps')).toEqual({ a: 1 });
    expect(() => extractJson("nope")).toThrow();
  });
});
