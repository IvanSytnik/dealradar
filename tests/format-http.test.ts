import { describe, expect, it } from "vitest";
import { filterDetails, listingText, previewText, priceRange, profileSummary, ruleReasonRu } from "../src/bot/format.js";
import { createHttpGet, HttpError } from "../src/sites/http.js";
import { listing, memRepo, seedUser, seedWatch } from "./helpers.js";

describe("format", () => {
  const repo = memRepo();
  seedUser(repo);
  const w = seedWatch(repo, 1);

  it("escapes HTML from listings", () => {
    const t = listingText(w, listing({ id: "1", title: "<b>Xbox</b> & co" }), { defect: false, verdict: null, oldPrice: null });
    expect(t).toContain("&lt;b&gt;Xbox&lt;/b&gt; &amp; co");
  });

  it("shows price drops, defects and the AI verdict", () => {
    const t = listingText(w, listing({ id: "1", title: "X", price: 150 }), {
      defect: true,
      oldPrice: 200,
      verdict: { relevant: true, condition: "good", bundle: ["2 Controller"], score: 8, reason: "дёшево" },
    });
    expect(t).toMatch(/Цена снижена/);
    expect(t).toMatch(/<s>200 €<\/s>/);
    expect(t).toMatch(/дефект/);
    expect(t).toMatch(/8\/10 · дёшево/);
  });

  it("preview lists up to 15 passed listings and says how many more (the missing 380 € PS5)", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ listing: listing({ id: String(i), title: `PS5 #${i} ` + "x".repeat(200) }), rule: { pass: true, reason: "ok", defect: false } }));
    const t = previewText({ total: 30, passed: mk(18), dropped: [], aiDropped: [], aiChecked: 0 });
    expect(t).toContain("PS5 #14");
    expect(t).not.toContain("PS5 #15");
    expect(t).toContain("…и ещё 3");
    expect(t.length).toBeLessThan(4096);
  });

  it("stays within Telegram's caption limit", () => {
    const t = listingText(w, listing({ id: "1", title: "x".repeat(2000) }), { defect: false, verdict: null, oldPrice: null });
    expect(t.length).toBeLessThanOrEqual(1000);
  });

  it("keeps the card short and moves filter internals to settings", () => {
    const card = profileSummary(w);
    expect(card).not.toContain("huelle"); // no stop-word dump on the main card
    expect(card.split("\n").length).toBeLessThanOrEqual(6);
    expect(card).toContain("Цена: 60 €–250 €");
    const details = filterDetails(w);
    expect(details).toContain("series s | xbox s | xss");
    expect(details).toContain("huelle");
  });

  it("prefers the real market median over the AI price guess (scan said 300 €, AI ~120–260 €)", () => {
    const guess = { ...w, profile: { ...w.profile, typicalPrice: { min: 120, max: 260 } } };
    expect(profileSummary(guess)).toMatch(/~120 €–260 € по оценке ИИ/);
    const real = { ...guess, market: { n: 14, median: 300, p25: 263, p75: 368, min: 200, max: 430, at: Date.now() } };
    const card = profileSummary(real);
    expect(card).toMatch(/медиана <b>300 €<\/b> \(обычно 263 €–368 €\), сегодня/);
    expect(card).not.toContain("оценке ИИ");
  });

  it("formats price ranges", () => {
    expect(priceRange(120, null)).toBe("от 120 €");
    expect(priceRange(null, 300)).toBe("до 300 €");
    expect(priceRange(null, null)).toBe("любая");
  });

  it("summarises a preview", () => {
    const p = previewText({
      total: 2,
      passed: [{ listing: listing({ id: "1", title: "A" }), rule: { pass: true, reason: "ok", defect: false } }],
      dropped: [{ listing: listing({ id: "2", title: "B" }), rule: { pass: false, reason: "price 10 < 60", defect: false } }],
      aiDropped: [{ listing: listing({ id: "3", title: "C", price: 199 }), reason: "только геймпад" }],
      aiChecked: 2,
    });
    expect(p).toContain("ИИ проверил 2");
    expect(p).toContain("C · 199 € · <i>только геймпад</i>");
    expect(p).toContain("подходит <b>1</b>");
    expect(p).toContain("цена 10 ниже 60");
    expect(p).toContain("Отсеяно правилами: 1 (цена 1)");
    expect(ruleReasonRu('excluded word: "huelle"')).toBe('стоп-слово "huelle"');
  });
});

describe("createHttpGet", () => {
  it("serialises requests per host with a minimum gap", async () => {
    const starts: Record<string, number[]> = {};
    const fake = (async (url: string) => {
      const h = new URL(url).hostname;
      (starts[h] ??= []).push(Date.now());
      return new Response("ok");
    }) as unknown as typeof fetch;
    const get = createHttpGet(150, fake);
    await Promise.all([get("https://a.test/1"), get("https://a.test/2"), get("https://b.test/1")]);
    const a = starts["a.test"]!;
    expect(a).toHaveLength(2);
    expect(a[1]! - a[0]!).toBeGreaterThanOrEqual(140);
    expect(starts["b.test"]![0]!).toBeLessThan(a[1]!); // other hosts do not wait for a.test's gap
  });

  it("throws HttpError on non-2xx and does not jam the queue", async () => {
    let n = 0;
    const fake = (async () => new Response("x", { status: n++ === 0 ? 429 : 200 })) as unknown as typeof fetch;
    const get = createHttpGet(0, fake);
    await expect(get("https://a.test/")).rejects.toBeInstanceOf(HttpError);
    await expect(get("https://a.test/")).resolves.toBe("x");
  });
});
