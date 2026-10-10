import type { Listing, SearchQuery } from "../types.js";
import type { SiteAdapter } from "./types.js";
import { parsePrice } from "../core/price.js";

const BASE = "https://www.willhaben.at";
const IMG_BASE = "https://cache.willhaben.at/mmo/";

type Attr = { name: string; values?: string[] };

const attr = (attrs: Attr[], ...names: string[]): string | undefined => {
  for (const n of names) {
    const v = attrs.find((a) => a.name === n)?.values?.[0];
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
};

export { parsePrice };

/** "/iad/kaufen-und-verkaufen/marktplatz/konsolen-2785" -> "konsolen" */
function categoryFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const i = parts.indexOf("marktplatz");
  if (i === -1 || i === parts.length - 1) return null;
  const last = parts[parts.length - 1]!;
  return last.replace(/-\d+$/, "").replace(/-/g, " ") || null;
}

function num(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const willhaben: SiteAdapter = {
  id: "willhaben",
  name: "Willhaben",

  matches: (url) => /(^|\.)willhaben\.at$/.test(url.hostname),

  parseSearchUrl(url) {
    if (!url.pathname.startsWith("/iad/")) throw new Error("not a willhaben search URL");
    if (/\/d\//.test(url.pathname) || url.searchParams.has("adId")) {
      throw new Error("this is a single ad, send a search URL");
    }

    const u = new URL(url.toString());
    u.protocol = "https:";
    u.hostname = "www.willhaben.at";
    // tracking / navigation noise
    for (const k of ["sfId", "isNavigation", "page", "fromSearch"]) u.searchParams.delete(k);
    u.searchParams.set("sort", "1"); // newest first
    u.searchParams.set("rows", "30");

    const keyword = (u.searchParams.get("keyword") ?? "").trim();
    const categoryHint = categoryFromPath(u.pathname);
    if (!keyword && !categoryHint) throw new Error("search URL has neither keyword nor category");

    const q: SearchQuery = {
      site: "willhaben",
      url: u.toString(),
      keyword: keyword || categoryHint!,
      categoryHint,
      priceFrom: num(u.searchParams.get("PRICE_FROM")),
      priceTo: num(u.searchParams.get("PRICE_TO")),
    };
    return q;
  },

  pageSize: 30,

  pageUrl(url, page) {
    const u = new URL(url);
    if (page <= 1) u.searchParams.delete("page");
    else u.searchParams.set("page", String(page));
    return u.toString();
  },

  searchUrlFromText(text) {
    const u = new URL(`${BASE}/iad/kaufen-und-verkaufen/marktplatz`);
    u.searchParams.set("keyword", text.trim());
    u.searchParams.set("sort", "1");
    u.searchParams.set("rows", "30");
    return u.toString();
  },

  parseListings(html) {
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) throw new Error("__NEXT_DATA__ not found (layout changed or bot protection)");
    const data = JSON.parse(m[1]!);
    const list: any[] = data?.props?.pageProps?.searchResult?.advertSummaryList?.advertSummary ?? [];

    return list
      .filter((raw) => raw && raw.id != null)
      .map((raw): Listing => {
        const attrs: Attr[] = raw?.attributes?.attribute ?? [];
        const seo = attr(attrs, "SEO_URL");
        const img = attr(attrs, "MMO") ?? attr(attrs, "ALL_IMAGE_URLS")?.split(";")[0];
        const published = Number(attr(attrs, "PUBLISHED"));
        const location = [attr(attrs, "POSTCODE"), attr(attrs, "LOCATION")].filter(Boolean).join(" ");

        return {
          id: String(raw.id),
          title: String(raw.description ?? attr(attrs, "HEADING") ?? ""),
          price: parsePrice(attr(attrs, "PRICE", "PRICE/AMOUNT", "PRICE_FOR_DISPLAY")),
          url: seo ? `${BASE}/iad/${seo.replace(/^\/+/, "")}` : `${BASE}/iad/object?adId=${raw.id}`,
          location,
          body: attr(attrs, "BODY_DYN", "DESCRIPTION") ?? "",
          image: img ? (img.startsWith("http") ? img : IMG_BASE + img) : null,
          publishedAt: Number.isFinite(published) && published > 0 ? published : null,
        };
      });
  },
};
