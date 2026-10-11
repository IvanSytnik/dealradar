import { parse, type HTMLElement } from "node-html-parser";
import { parsePrice } from "../core/price.js";
import type { Listing, SearchQuery } from "../types.js";
import type { SiteAdapter } from "./types.js";

/**
 * Kleinanzeigen.de (Germany).
 *
 * Verified against the live site on 2026-10-11: search URLs look like /s-konsolen/ps5/k0c279, page 2
 * is /s-konsolen/seite:2/ps5/k0c279 (the "seite:N" segment goes right before the keyword), 25 results
 * per page plus two promoted ads, sorted by date by default. tests/fixtures/kleinanzeigen-ps5.html is
 * a real results page from that day (cards only, icon paths stripped).
 */

const BASE = "https://www.kleinanzeigen.de";

/** "k0", "k0c279", "k0c279l3331r20": the trailing code segment of a search path */
const CODE = /^(k0)?(c\d+)?(l\d+)?(r\d+)?$/;
const MODIFIER = /^(seite|preis|anzeige|sortierung|anbieter|versand|zustand):/;

interface PathParts {
  /** segments with the leading "s-" removed from the first one */
  segs: string[];
  codeIdx: number;
  keywordIdx: number | null;
}

function splitPath(pathname: string): PathParts {
  if (!pathname.startsWith("/s-")) throw new Error("not a Kleinanzeigen search URL");
  if (pathname.startsWith("/s-anzeige/")) throw new Error("this is a single ad, send a search URL");
  const segs = pathname.slice(3).split("/").filter(Boolean);
  const codeIdx = segs.findIndex((s) => s !== "" && CODE.test(s) && /\d|k0/.test(s));
  if (codeIdx === -1) throw new Error("search URL has no search code (k0…)");
  const hasKeyword = segs[codeIdx]!.startsWith("k0") && codeIdx > 0 && !MODIFIER.test(segs[codeIdx - 1]!);
  return { segs, codeIdx, keywordIdx: hasKeyword ? codeIdx - 1 : null };
}

const joinPath = (segs: string[]) => "/s-" + segs.join("/");

function priceRangeOf(segs: string[]): { from: number | null; to: number | null } {
  const p = segs.find((s) => s.startsWith("preis:"));
  if (!p) return { from: null, to: null };
  const [, from, to] = p.split(":");
  const n = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);
  return { from: n(from), to: n(to) };
}

const text = (el: HTMLElement | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Kleinanzeigen writes "600 € VB", "1.500 €", "VB" (negotiable, no number) or "Zu verschenken". */
export function parseKaPrice(raw: string): number | null {
  const s = raw.replace(/\s+/g, " ").trim();
  if (/zu verschenken/i.test(s)) return 0;
  const m = s.match(/(\d[\d.,]*)\s*€/);
  return m ? parsePrice(m[1]!) : null;
}

const AD_HREF = /\/s-anzeige\/[^"'\s]*?\/(\d+)-\d+-\d+/;

/** Each card carries a schema.org ImageObject with the title, a description excerpt and the photo. */
function ldJson(el: HTMLElement): { title?: string; description?: string; contentUrl?: string } {
  const raw = el.querySelector('script[type="application/ld+json"]')?.textContent;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Two markups are handled:
 * - current (Tailwind, seen live on 2026-10-11): article[data-adid][data-href], title in h3 > a,
 *   place next to the locationOutline icon, price in a <p> next to a struck-through old price,
 *   JSON-LD with title/description/photo;
 * - the long-standing one: article.aditem with a.ellipsis, .aditem-main--* classes.
 */
/** Kleinanzeigen marks wanted ads with a "Gesuch" badge: never an offer, whatever the title says. */
const isWanted = (el: HTMLElement) => el.querySelectorAll("span, p").some((x) => x.childNodes.length <= 1 && text(x) === "Gesuch");

function listingFrom(el: HTMLElement): Listing | null {
  const href =
    el.getAttribute("data-href") ??
    el.querySelectorAll("a").map((a) => a.getAttribute("href") ?? "").find((h) => h.includes("/s-anzeige/")) ??
    "";
  const id = el.getAttribute("data-adid") ?? href.match(AD_HREF)?.[1] ?? null;
  if (!id || !href) return null;
  const ld = ldJson(el);

  const titleEl = el.querySelector("h3 a") ?? el.querySelector("h2 a") ?? el.querySelector("a.ellipsis") ?? el.querySelector("h3") ?? el.querySelector("h2");
  const title = text(titleEl) || (ld.title ?? "").trim();
  if (!title) return null;

  // the current price is the first price-looking <p> that is not struck through
  const priceEl =
    el.querySelector('[class*="price-shipping--price"]') ??
    el.querySelectorAll("p").find((p) => !/line-through/.test(p.getAttribute("class") ?? "") && /€|\bVB\b|verschenken/i.test(text(p)));
  const placeEl =
    el.querySelector('[class*="aditem-main--top--left"]') ?? el.querySelector('svg[data-title="locationOutline"]')?.parentNode?.querySelector("span");
  const bodyEl = el.querySelector('[class*="aditem-main--middle--description"]') ?? el.querySelector("h3")?.nextElementSibling;

  const img = el.querySelector("img");
  const image = img?.getAttribute("src") ?? img?.getAttribute("data-imgsrc") ?? ld.contentUrl ?? null;

  return {
    id,
    title,
    price: parseKaPrice(text(priceEl)),
    url: href.startsWith("http") ? href : BASE + href,
    location: text(placeEl),
    body: (ld.description ?? text(bodyEl)).replace(/\s+/g, " ").trim(),
    image: image && /^https?:\/\//.test(image) ? image : null,
    publishedAt: null,
  };
}

export const kleinanzeigen: SiteAdapter = {
  id: "kleinanzeigen",
  name: "Kleinanzeigen",
  // out of beta 2026-10-11: live from AWS, 20-page scans and per-model medians checked on a real search.
  // A slower pace than Willhaben: one IP polling every minute is what bot protection looks for.
  minIntervalSec: 300,
  defaultIntervalSec: 600,

  matches: (url) => /(^|\.)(ebay-)?kleinanzeigen\.de$/.test(url.hostname),

  parseSearchUrl(url) {
    // drop page navigation; the default sort is already newest first
    const path = joinPath(splitPath(url.pathname).segs.filter((s) => !s.startsWith("seite:")));
    const { segs, codeIdx, keywordIdx } = splitPath(path);
    const keyword = keywordIdx !== null ? decodeURIComponent(segs[keywordIdx]!).replace(/-/g, " ").trim() : "";
    // the first segment names the category when the code has one (c279) and it is not the keyword itself
    const first = segs[0]!;
    const categoryHint =
      /c\d+/.test(segs[codeIdx]!) && keywordIdx !== 0 && codeIdx !== 0 && !MODIFIER.test(first) ? first.replace(/-/g, " ") : null;
    if (!keyword && !categoryHint) throw new Error("search URL has neither keyword nor category");
    const price = priceRangeOf(segs);

    const q: SearchQuery = {
      site: "kleinanzeigen",
      url: BASE + path,
      keyword: keyword || categoryHint!,
      categoryHint,
      priceFrom: price.from,
      priceTo: price.to,
    };
    return q;
  },

  /**
   * The site shows 25 per page, but wanted ads and repeated promoted ads are dropped while parsing,
   * so a full page parses to 23-26 (live, 2026-10-11). The scheduler treats "fewer than pageSize"
   * as the last page, so this is the threshold for "full", not the nominal size.
   */
  pageSize: 20,

  /** "seite:N" goes right before the keyword (or before the code when there is no keyword) */
  pageUrl(url, page) {
    const u = new URL(url);
    const clean = joinPath(splitPath(u.pathname).segs.filter((s) => !s.startsWith("seite:")));
    const { segs, codeIdx, keywordIdx } = splitPath(clean);
    if (page > 1) segs.splice(keywordIdx ?? codeIdx, 0, `seite:${page}`);
    u.pathname = joinPath(segs);
    return u.toString();
  },

  searchUrlFromText(t) {
    const slug = t.trim().toLowerCase().replace(/\s+/g, "-");
    return `${BASE}/s-${encodeURIComponent(slug)}/k0`;
  },

  parseListings(html) {
    const root = parse(html);
    let items = root.querySelectorAll("article.aditem");
    if (!items.length) items = root.querySelectorAll("article[data-adid]");
    if (!items.length) items = root.querySelectorAll("li.ad-listitem");

    if (!items.length) {
      if (/keine Ergebnisse|leider keine Anzeigen/i.test(html)) return [];
      if (/captcha|access denied|zugriff verweigert|_abck|akamai/i.test(html)) {
        throw new Error("Kleinanzeigen blocked the request (bot protection)");
      }
      throw new Error("no ad items found (layout changed or bot protection)");
    }

    const seen = new Set<string>();
    const out: Listing[] = [];
    let wanted = 0;
    for (const el of items) {
      if (isWanted(el)) {
        wanted++;
        continue;
      }
      const l = listingFrom(el);
      if (l && !seen.has(l.id)) {
        seen.add(l.id);
        out.push(l);
      }
    }
    // cards found but none readable: the markup changed. Fail loudly so the health alert fires,
    // instead of reporting "0 new listings" forever (what the first live probe did).
    if (!out.length && wanted < items.length) throw new Error(`found ${items.length} ad cards but could not read any (layout changed)`);
    return out;
  },
};
