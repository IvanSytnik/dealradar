import type { Dict } from "../i18n/index.js";
// Market statistics and deal scoring. Pure functions: the numbers come from real listings, not from a model's guess.

export interface MarketStats {
  n: number; // listings with a price that were judged relevant
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  at: number; // when computed (ms)
}

/** What a scan stores on the watch: the overall numbers plus one set per variant that had enough prices. */
export interface MarketData extends MarketStats {
  variants?: Record<string, MarketStats>;
}

export interface MarketRef {
  stats: MarketStats | null;
  /** the variant whose numbers are used; null: the overall ones */
  variant: string | null;
  /** the listing does not say which model it is, so it is compared with the cheapest one */
  guessed: boolean;
}

/**
 * The numbers a listing is compared with:
 * - its own variant, when known and it has enough listings;
 * - the cheapest variant, when the listing does not name one. Sellers name the expensive models ("Pro"),
 *   so an unnamed "PS5 Konsole" is a base model; the overall median (pulled up by Pros) made a 360 €
 *   one look 40 % cheap and put it at the top of the live Stuttgart scan (2026-10-11). Cheapest is the
 *   conservative choice: a missed deal is better than a false one;
 * - the overall numbers otherwise (a named variant with too few listings, or no variants at all).
 */
export function statsFor(m: MarketData | null, variant: string | null | undefined): MarketRef {
  const own = variant ? m?.variants?.[variant] : undefined;
  if (own) return { stats: own, variant: variant!, guessed: false };
  if (!variant && m?.variants) {
    const cheapest = Object.entries(m.variants).sort((a, b) => a[1].median - b[1].median)[0];
    if (cheapest) return { stats: cheapest[1], variant: cheapest[0], guessed: true };
  }
  return { stats: m, variant: null, guessed: false };
}

/** Linear-interpolated quantile of a sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new Error("quantile of empty array");
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Needs at least 3 prices to say anything; outliers (0 €, 9999 €) are trimmed by the quartiles, not removed. */
export function marketStats(prices: number[], at: number): MarketStats | null {
  const p = prices.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (p.length < 3) return null;
  const r = (x: number) => Math.round(x);
  return { n: p.length, median: r(quantile(p, 0.5)), p25: r(quantile(p, 0.25)), p75: r(quantile(p, 0.75)), min: p[0]!, max: p[p.length - 1]!, at };
}

/** -0.18 means 18 % below the median. */
export function vsMedian(price: number, m: MarketStats): number {
  return price / m.median - 1;
}

export type DealTag = "cheap" | "very_cheap" | "bundle" | "defect" | "suspicious" | "no_price" | "expensive";

export interface ScoreInput {
  price: number | null;
  bundleItems: number; // extras listed by the AI (controllers, games, …)
  defect: boolean;
  suspicious: boolean; // AI flagged scam signals
}

export interface DealScore {
  score: number | null; // 1-10, null when the price is unknown
  tags: DealTag[];
  delta: number | null; // vs median
}

/** Below this many priced listings the median is noisy; reports say so. */
export const RELIABLE_N = 8;

/** Below this fraction of the median a listing is more likely a scam or a mislabeled accessory than a deal. */
export const SUSPICIOUS_BELOW = 0.45;
/** Broken units are compared with what broken units go for, not with working ones. */
export const DEFECT_REFERENCE = 0.4;
export const DEFECT_MAX_SCORE = 7;

/**
 * Deterministic deal score: price against the real market median, plus a little for extras.
 * 5 = median price; each 10 % cheaper adds a point. Defects and scam signals are tagged, not hidden.
 */
export function scoreDeal(x: ScoreInput, m: MarketStats | null): DealScore {
  const tags: DealTag[] = [];
  if (x.defect) tags.push("defect");
  if (x.bundleItems >= 2) tags.push("bundle");
  if (x.price === null) return { score: null, tags: [...tags, "no_price"], delta: null };
  if (!m) return { score: null, tags, delta: null };

  const delta = vsMedian(x.price, m);
  const bundleBonus = x.bundleItems >= 2 ? 1 : x.bundleItems === 1 ? 0.5 : 0;
  if (x.defect) {
    // a 140 € broken PS5 is not a "10/10 deal" for someone who wants a working one
    const vsDefectRef = x.price / (m.median * DEFECT_REFERENCE) - 1;
    const s = Math.min(DEFECT_MAX_SCORE, 5 - vsDefectRef * 10 + bundleBonus);
    return { score: Math.max(1, Math.min(10, Math.round(s))), tags, delta };
  }
  let s = 5 - delta * 10 + bundleBonus;

  const suspicious = x.suspicious || (!x.defect && x.price < m.median * SUSPICIOUS_BELOW);
  if (suspicious) {
    tags.push("suspicious");
    s = Math.min(s, 3);
  } else if (delta <= -0.3) tags.push("very_cheap");
  else if (delta <= -0.12) tags.push("cheap");
  else if (delta >= 0.25) tags.push("expensive");

  return { score: Math.max(1, Math.min(10, Math.round(s))), tags, delta };
}

/** "18% below median" in the user's language. Labels for tags live in the locale (Dict.tag). */
export function pct(delta: number, t: Dict): string {
  const v = Math.round(delta * 100);
  return v === 0 ? t.pctAt : v < 0 ? t.pctBelow(-v) : t.pctAbove(v);
}
