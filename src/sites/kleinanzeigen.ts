import { parse, type HTMLElement } from "node-html-parser";
import { parsePrice } from "../core/price.js";
import type { Listing, SearchQuery } from "../types.js";
import type { SiteAdapter } from "./types.js";

/**
 * Kleinanzeigen.de (Germany), BETA.
 *
 * Verified from outside on 2026-10-11: search URLs look like /s-konsolen/ps5/k0c279, page 2 is
 * /s-konsolen/seite:2/ps5/k0c279 (the "seite:N" segment goes right before the keyword), 25 results
 * per page plus a few promoted "TOP" ads, sorted by date by default. The HTML markup itself could not
 * be fetched from the dev environment, so the parser follows the long-standing `article.aditem`
 * structure with fallbacks, and the parser-health alert covers the rest.
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

function listingFrom(el: HTMLElement): Listing | null {
  const href =
    el.getAttribute("data-href") ??
    el.querySelectorAll("a").map((a) => a.getAttribute("href") ?? "").find((h) => h.includes("/s-anzeige/")) ??
    "";
  const id = el.getAttribute("data-adid") ?? href.match(AD_HREF)?.[1] ?? null;
  if (!id || !href) return null;

  const titleEl =
    el.querySelector("a.ellipsis") ?? el.querySelector("h2 a") ?? el.querySelector(".text-module-begin a") ?? el.querySelector("h2");
  const title = text(titleEl);
  if (!title) return null;

  const priceText = text(el.querySelector('[class*="price-shipping--price"]') ?? el.querySelector('[class*="--price"]'));
  const img = el.querySelector("img");
  const image = img?.getAttribute("src") ?? img?.getAttribute("data-imgsrc") ?? img?.getAttribute("srcset")?.split(/\s/)[0] ?? null;

  return {
    id,
    title,
    price: parseKaPrice(priceText),
    url: href.startsWith("http") ? href : BASE + href,
    location: text(el.querySelector('[class*="aditem-main--top--left"]')),
    body: text(el.querySelector('[class*="aditem-main--middle--description"]')),
    image: image && /^https?:\/\//.test(image) ? image : null,
    publishedAt: null,
  };
}

export const kleinanzeigen: SiteAdapter = {
  id: "kleinanzeigen",
  name: "Kleinanzeigen",
  beta: true,

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

  pageSize: 25,

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
    for (const el of items) {
      const l = listingFrom(el);
      if (l && !seen.has(l.id)) {
        seen.add(l.id);
        out.push(l);
      }
    }
    return out;
  },
};
