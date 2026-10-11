import { describe, expect, it } from "vitest";
import { kleinanzeigen as ka, parseKaPrice } from "../src/sites/kleinanzeigen.js";
import { adapterForUrl } from "../src/sites/index.js";
import { kleinanzeigenHtml } from "./helpers.js";

const u = (s: string) => new URL(s);

describe("Kleinanzeigen URLs (shapes verified on the live site, 2026-10-11)", () => {
  it("is picked for kleinanzeigen.de links, old ebay-kleinanzeigen.de too", () => {
    expect(adapterForUrl(u("https://www.kleinanzeigen.de/s-ps5/k0"))?.id).toBe("kleinanzeigen");
    expect(adapterForUrl(u("https://www.ebay-kleinanzeigen.de/s-ps5/k0"))?.id).toBe("kleinanzeigen");
    expect(ka.beta).toBe(true);
  });

  it("reads keyword, category and price, and drops the page", () => {
    expect(ka.parseSearchUrl(u("https://www.kleinanzeigen.de/s-konsolen/seite:3/ps5/k0c279"))).toMatchObject({
      url: "https://www.kleinanzeigen.de/s-konsolen/ps5/k0c279",
      keyword: "ps5",
      categoryHint: "konsolen",
    });
    expect(ka.parseSearchUrl(u("https://www.kleinanzeigen.de/s-preis:100:300/xbox-series-s/k0"))).toMatchObject({
      keyword: "xbox series s",
      priceFrom: 100,
      priceTo: 300,
      categoryHint: null,
    });
    expect(ka.parseSearchUrl(u("https://www.kleinanzeigen.de/s-konsolen/c279")).keyword).toBe("konsolen");
  });

  it("builds page URLs the way the site links them", () => {
    expect(ka.pageUrl("https://www.kleinanzeigen.de/s-konsolen/ps5/k0c279", 2)).toBe("https://www.kleinanzeigen.de/s-konsolen/seite:2/ps5/k0c279");
    expect(ka.pageUrl("https://www.kleinanzeigen.de/s-ps5/k0", 2)).toBe("https://www.kleinanzeigen.de/s-seite:2/ps5/k0");
    expect(ka.pageUrl("https://www.kleinanzeigen.de/s-ps5/k0", 1)).toBe("https://www.kleinanzeigen.de/s-ps5/k0");
  });

  it("rejects single ads and non-search pages", () => {
    expect(() => ka.parseSearchUrl(u("https://www.kleinanzeigen.de/s-anzeige/ps5/3521975183-279-704"))).toThrow(/single ad/);
    expect(() => ka.parseSearchUrl(u("https://www.kleinanzeigen.de/m-meine-anzeigen.html"))).toThrow();
  });

  it("builds a search from free text", () => {
    expect(ka.searchUrlFromText("Xbox Series S")).toBe("https://www.kleinanzeigen.de/s-xbox-series-s/k0");
  });
});

describe("Kleinanzeigen listings", () => {
  it("parses id, title, price, place, text and image", () => {
    const [a, b, c] = ka.parseListings(
      kleinanzeigenHtml([
        { id: 3521975183, title: "PlayStation 5 + 2 Controller", price: "600 € VB", location: "24118 Kiel", body: "Top Zustand", image: "https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/1.jpg" },
        { id: 2, title: "PS5 Pro neu OVP", price: "1.500 €" },
        { id: 3, title: "PS5 Spiele", price: "VB" },
      ]),
    );
    expect(a).toMatchObject({
      id: "3521975183",
      title: "PlayStation 5 + 2 Controller",
      price: 600,
      location: "24118 Kiel",
      body: "Top Zustand",
      url: "https://www.kleinanzeigen.de/s-anzeige/playstation-5-2-controller/3521975183-279-704",
      image: "https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/1.jpg",
    });
    expect(b!.price).toBe(1500);
    expect(c!.price).toBeNull(); // "VB" alone: negotiable, no number
  });

  it("deduplicates promoted ads that repeat", () => {
    const html = kleinanzeigenHtml([{ id: 1, title: "PS5", price: "400 €", top: true }, { id: 1, title: "PS5", price: "400 €" }, { id: 2, title: "PS5 Slim", price: "450 €" }]);
    expect(ka.parseListings(html).map((l) => l.id)).toEqual(["1", "2"]);
  });

  it("an empty result page is fine, a blocked or changed page is an error", () => {
    expect(ka.parseListings("<html><body>Es wurden leider keine Ergebnisse gefunden.</body></html>")).toEqual([]);
    expect(() => ka.parseListings("<html><body>Please solve this captcha</body></html>")).toThrow(/blocked/);
    expect(() => ka.parseListings("<html><body><div>new layout</div></body></html>")).toThrow(/layout changed/);
  });

  it("reads German prices", () => {
    expect(parseKaPrice("1.200 € VB")).toBe(1200);
    expect(parseKaPrice("Zu verschenken")).toBe(0);
    expect(parseKaPrice("VB")).toBeNull();
  });
});
