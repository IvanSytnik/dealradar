import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePrice, willhaben } from "../src/sites/willhaben.js";
import { adapterForUrl, extractUrl } from "../src/sites/index.js";
import { willhabenHtml } from "./helpers.js";

describe("willhaben.parseSearchUrl", () => {
  it("canonicalises the URL the user pasted", () => {
    const q = willhaben.parseSearchUrl(
      new URL(
        "https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=xbox+series+s&sfId=31cc353f-826b-4a6e-8009-d48c5f8f753b&rows=30&isNavigation=true&areaId=6",
      ),
    );
    const u = new URL(q.url);
    expect(q.keyword).toBe("xbox series s");
    expect(u.searchParams.get("sort")).toBe("1");
    expect(u.searchParams.get("areaId")).toBe("6");
    expect(u.searchParams.has("sfId")).toBe(false);
    expect(u.searchParams.has("isNavigation")).toBe(false);
  });

  it("reads price filters and the category slug", () => {
    const q = willhaben.parseSearchUrl(
      new URL("https://willhaben.at/iad/kaufen-und-verkaufen/marktplatz/konsolen-2785?PRICE_FROM=50&PRICE_TO=300"),
    );
    expect(q.keyword).toBe("konsolen");
    expect(q.categoryHint).toBe("konsolen");
    expect(q.priceFrom).toBe(50);
    expect(q.priceTo).toBe(300);
    expect(new URL(q.url).hostname).toBe("www.willhaben.at");
  });

  it("rejects single ads and pages without a query", () => {
    expect(() => willhaben.parseSearchUrl(new URL("https://www.willhaben.at/iad/kaufen-und-verkaufen/d/xbox-123456/"))).toThrow(/single ad/);
    expect(() => willhaben.parseSearchUrl(new URL("https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz"))).toThrow();
    expect(() => willhaben.parseSearchUrl(new URL("https://www.willhaben.at/jobs"))).toThrow();
  });

  it("builds page URLs", () => {
    const base = "https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=ps5&sort=1&rows=30";
    expect(new URL(willhaben.pageUrl(base, 3)).searchParams.get("page")).toBe("3");
    expect(willhaben.pageUrl(base, 1)).toBe(base);
  });

  it("builds a search URL from free text", () => {
    const q = willhaben.parseSearchUrl(new URL(willhaben.searchUrlFromText(" ps5 digital ")));
    expect(q.keyword).toBe("ps5 digital");
  });
});

describe("parsePrice", () => {
  it.each([
    ["150", 150],
    ["150.0", 150],
    ["1.234,50", 1234.5],
    ["1.200", 1200],
    ["€ 99,-", 99],
    ["", null],
    [undefined, null],
    ["VB", null],
  ])("%s -> %s", (raw, expected) => {
    expect(parsePrice(raw as string | undefined)).toBe(expected);
  });
});

describe("willhaben.parseListings", () => {
  it("parses ads from __NEXT_DATA__", () => {
    const html = willhabenHtml([
      { id: 111, title: "Xbox Series S", price: "180", body: "Top Zustand", image: "1/2/3.jpg", postcode: "1020", location: "Wien" },
      { id: 222, title: "Ohne Preis" },
    ]);
    const [a, b] = willhaben.parseListings(html);
    expect(a).toMatchObject({
      id: "111",
      title: "Xbox Series S",
      price: 180,
      body: "Top Zustand",
      location: "1020 Wien",
      image: "https://cache.willhaben.at/mmo/1/2/3.jpg",
      url: "https://www.willhaben.at/iad/kaufen-und-verkaufen/d/item-111/",
    });
    expect(b!.price).toBeNull();
  });

  it("parses the stored sample page", () => {
    const html = readFileSync(new URL("./fixtures/willhaben-search.html", import.meta.url), "utf8");
    const ads = willhaben.parseListings(html);
    expect(ads.length).toBe(3);
    expect(ads[0]!.title).toContain("Series S");
  });

  it("returns [] for an empty result and throws when the layout changed", () => {
    expect(willhaben.parseListings(willhabenHtml([]))).toEqual([]);
    expect(() => willhaben.parseListings("<html>captcha</html>")).toThrow(/__NEXT_DATA__/);
  });
});

describe("site registry", () => {
  it("finds a URL inside a message and the right adapter", () => {
    const url = extractUrl("глянь https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=ps5 пж");
    expect(url?.searchParams.get("keyword")).toBe("ps5");
    expect(adapterForUrl(url!)?.id).toBe("willhaben");
    expect(adapterForUrl(new URL("https://www.avito.ru/x"))).toBeNull();
    expect(extractUrl("без ссылки")).toBeNull();
  });
});
