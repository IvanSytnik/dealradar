import { PLANS } from "../core/plans.js";
import type { Preview } from "../services/watches.js";
import type { ScanReport } from "../services/scan.js";
import { pct, RELIABLE_N, statsFor, vsMedian, type MarketStats } from "../core/market.js";
import { refLabel, variantLabel } from "../core/variants.js";
import type { Dict } from "../i18n/index.js";
import type { ListingInfo } from "../services/notifier.js";
import type { Listing, User, Watch } from "../types.js";

/** Every text a user reads comes from the Dict of their language; this file only arranges it. */

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const eur = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100) / 100} €`);

export function intervalLabel(t: Dict, sec: number) {
  return sec < 3600 ? `${Math.round(sec / 60)} ${t.unitMin}` : `${Math.round(sec / 3600)} ${t.unitHour}`;
}

export function listingText(t: Dict, watch: Watch, l: Listing, info: ListingInfo): string {
  const name = esc(watch.name);
  const lines: string[] = [];
  lines.push(info.oldPrice !== null ? t.priceDropped(name) : t.newListing(name));
  lines.push(`<b>${esc(l.title)}</b>`);
  lines.push(info.oldPrice !== null ? `💶 <b>${eur(l.price)}</b> <s>${eur(info.oldPrice)}</s>` : `💶 <b>${eur(l.price)}</b>`);
  if (l.location) lines.push(`📍 ${esc(l.location)}`);
  if (info.defect || info.verdict?.condition === "defect") lines.push(t.looksDefect);
  const ref = statsFor(watch.market, info.verdict?.variant);
  if (ref.stats && l.price !== null) {
    const delta = pct(vsMedian(l.price, ref.stats), t);
    lines.push(ref.variant ? t.vsMedianVariant(delta, esc(refLabel(ref.variant, ref.guessed)), eur(ref.stats.median)) : t.vsMedian(delta, eur(ref.stats.median)));
  }
  const v = info.verdict;
  if (v) {
    if (v.bundle.length) lines.push(`📦 ${esc(v.bundle.join(", "))}`);
    lines.push(`⭐ ${v.score}/10${v.reason ? ` · ${esc(v.reason)}` : ""}`);
  }
  const text = lines.join("\n");
  // Telegram caption limit is 1024
  return text.length > 1000 ? text.slice(0, 997) + "…" : text;
}

/** "from 120 €", "120 €–300 €", "up to 300 €", "any" */
export function priceRange(t: Dict, min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${eur(min)}–${eur(max)}`;
  if (min !== null) return t.rangeFrom(eur(min));
  if (max !== null) return t.rangeTo(eur(max));
  return t.rangeAny;
}

/**
 * Market line: real numbers from the last scan win over the AI's guess, which is only a prior
 * (the AI said ~120–260 € for an Xbox Series S while the scan found a 300 € median).
 */
function marketLine(t: Dict, w: Watch): string {
  if (w.market) {
    const days = Math.floor((Date.now() - w.market.at) / 86_400_000);
    const age = days <= 0 ? t.ageToday : days === 1 ? t.ageYesterday : t.ageDays(days);
    return t.marketReal(eur(w.market.median), eur(w.market.p25), eur(w.market.p75), age);
  }
  const tp = w.profile.typicalPrice;
  if (tp?.max) return t.marketGuess(eur(tp.min), eur(tp.max));
  return t.marketNone;
}

/** "Pro 1250 € (21) · Slim 560 € (9)", most listings first */
export function variantList(vs: { name: string; stats: MarketStats }[], counts = true): string {
  return vs.map((v) => `${esc(variantLabel(v.name))} ${eur(v.stats.median)}${counts ? ` (${v.stats.n})` : ""}`).join(" · ");
}

const storedVariants = (w: Watch) =>
  Object.entries(w.market?.variants ?? {})
    .map(([name, stats]) => ({ name, stats }))
    .sort((a, b) => b.stats.n - a.stats.n);

/** Compact watch card: what a user needs at a glance. Filter internals live in the settings view. */
export function profileSummary(t: Dict, w: Watch): string {
  const p = w.profile;
  return [
    `<b>#${w.id} ${esc(w.name)}</b> ${w.active ? "🟢" : t.paused}`,
    `🎯 ${esc(p.item)}`,
    t.priceLine(priceRange(t, p.priceMin, p.priceMax)),
    marketLine(t, w),
    ...(storedVariants(w).length ? [t.variantsLine(variantList(storedVariants(w), false))] : []),
    t.statusLine(intervalLabel(t, w.intervalSec), p.useAi, p.allowDefect),
    `🔗 <a href="${esc(w.query.url)}">${t.openSearch}</a>`,
  ].join("\n");
}

/** Everything the filter does, shown in the settings view. */
export function filterDetails(t: Dict, w: Watch): string {
  const p = w.profile;
  const groups = p.mustAny.length ? p.mustAny.map((g) => g.join(" ")).join(" | ") : t.anyTitle;
  const list = (xs: string[]) => (xs.length ? `<code>${esc(xs.join(", "))}</code>` : "—");
  return [
    t.settingsTitle(w.id, esc(w.name)),
    "",
    t.mustLine(`<code>${esc(groups)}</code>`),
    t.stopWords(list(p.exclude)),
    t.accessories(list(p.accessoryWords)),
    t.priceLine(priceRange(t, p.priceMin, p.priceMax)),
    t.aiLine(p.useAi, p.minScore),
    t.defectLine(p.allowDefect),
    "",
    t.settingsHint,
  ].join("\n");
}

export function editHelp(t: Dict, id: number): string {
  return [
    t.editTitle,
    `<code>/price ${id} 80 220</code>: ${t.editPrice}`,
    `<code>/exclude ${id} hülle, spiel</code>: ${t.editExclude}`,
    `<code>/unexclude ${id} controller</code>: ${t.editUnexclude}`,
    `<code>/match ${id} series s | xbox s</code>: ${t.editMatch}`,
    `<code>/score ${id} 6</code>: ${t.editScore}`,
    `<code>/rename ${id} ${esc(t.editRenameExample)}</code>`,
  ].join("\n");
}

/** Telegram caps a message at 4096 chars; titles are cut so a long preview still fits. */
const short = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function previewText(t: Dict, p: Preview, limits = { passed: 15, dropped: 5 }): string {
  const more = (shown: number, total: number) => (total > shown ? [t.andMore(total - shown)] : []);
  const lines = [t.previewHead(p.total, p.passed.length)];
  if (p.aiChecked > 0) lines.push(t.previewAiChecked(p.aiChecked));
  if (p.passed.length) {
    lines.push("", t.previewPassed);
    for (const { listing } of p.passed.slice(0, limits.passed)) lines.push(`• ${esc(short(listing.title))} · ${eur(listing.price)}`);
    lines.push(...more(limits.passed, p.passed.length));
  }
  if (p.aiDropped.length) {
    lines.push("", t.previewAiDropped);
    for (const { listing, reason, defect } of p.aiDropped.slice(0, limits.dropped)) {
      const why = defect ? t.groupDefect : reason || t.groupNotItem;
      lines.push(`• ${esc(short(listing.title))} · ${eur(listing.price)} · <i>${esc(short(why, 90))}</i>`);
    }
    lines.push(...more(limits.dropped, p.aiDropped.length));
  }
  if (p.dropped.length) {
    const byReason = new Map<string, number>();
    for (const { rule } of p.dropped) {
      const k = reasonGroup(t, rule.reason);
      byReason.set(k, (byReason.get(k) ?? 0) + 1);
    }
    const summary = [...byReason.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
    lines.push("", t.previewRuleDropped(p.dropped.length, summary));
    for (const { listing, rule } of p.dropped.slice(0, limits.dropped)) {
      lines.push(`• ${esc(short(listing.title))} · <i>${esc(ruleReason(t, rule.reason))}</i>`);
    }
  }
  return lines.join("\n");
}

export function scanSummaryText(t: Dict, r: ScanReport, opts: { link?: boolean } = {}): string {
  const s = r.stats;
  const lines = [t.scanTitle(esc(r.watch.name)), t.scanViewed(r.total, r.pages, r.pageLimitHit, r.items.length)];
  if (s) {
    lines.push(t.scanMedian(eur(s.median), eur(s.p25), eur(s.p75), eur(s.min), eur(s.max), s.n));
    if (s.n < RELIABLE_N) lines.push(t.scanFewPrices(s.n));
    if (r.variants.length) lines.push(t.variantsLine(variantList(r.variants)), `<i>${t.scanVariantsNote}</i>`);
  } else {
    lines.push(t.scanNoStats);
  }
  lines.push("", r.highlights.length ? t.scanHighlights : t.scanNoHighlights);
  r.highlights.forEach((h, i) => {
    const tags = h.deal.tags.filter((x) => x !== "cheap" && x !== "very_cheap").map((x) => t.tag[x]);
    lines.push(
      `${i + 1}. <a href="${esc(h.listing.url)}">${esc(h.listing.title.slice(0, 60))}</a> · <b>${eur(h.listing.price)}</b> · ${
        h.variant ? `${esc(refLabel(h.variant, h.guessed))}: ` : ""
      }${h.deal.delta !== null ? pct(h.deal.delta, t) : ""}${tags.length ? ` · ${tags.join(", ")}` : ""}`,
    );
  });
  if (r.flips.length) {
    lines.push("", t.scanFlips);
    for (const f of r.flips) {
      lines.push(
        `• <a href="${esc(f.listing.url)}">${esc(f.listing.title.slice(0, 60))}</a> · <b>${eur(f.listing.price)}</b>${
          f.verdict?.note ? ` · ${esc(f.verdict.note.slice(0, 60))}` : ""
        }`,
      );
    }
  }
  const susp = r.items.filter((i) => i.deal.tags.includes("suspicious")).length;
  if (susp) lines.push("", t.scanSuspicious(susp));
  if (r.aiUnchecked) lines.push(t.scanAiUnchecked(r.aiUnchecked, r.items.length));
  lines.push("", opts.link ? t.scanFooterLink : t.scanFooterFile);
  return lines.join("\n");
}

/** Coarse bucket for the drop summary, so a price cut is visible at a glance. Rule reasons are English in code. */
export function reasonGroup(t: Dict, reason: string): string {
  if (reason.startsWith("price")) return t.groupPrice;
  if (reason.startsWith("title does not match")) return t.groupNotItem;
  if (reason.startsWith("not an offer")) return t.groupNotOffer;
  if (reason.startsWith("excluded word")) return t.groupStop;
  if (reason.startsWith("looks like an accessory")) return t.groupAccessory;
  if (reason.startsWith("defect")) return t.groupDefect;
  return t.groupOther;
}

/** Rule reasons are English in code; users see their language. */
export function ruleReason(t: Dict, reason: string): string {
  const low = /^price (.+) < (.+)$/.exec(reason);
  if (low) return t.reasonPriceLow(low[1]!, low[2]!);
  const high = /^price (.+) > (.+)$/.exec(reason);
  if (high) return t.reasonPriceHigh(high[1]!, high[2]!);
  return reason
    .replace("title does not match the item", t.groupNotItem)
    .replace(/^not an offer: /, t.reasonNotOffer)
    .replace(/^excluded word: /, t.reasonStop)
    .replace(/^looks like an accessory: /, t.reasonAccessory)
    .replace("defect / for parts", t.groupDefect);
}

export function planText(t: Dict, user: User, watches: number, aiToday: number): string {
  const l = PLANS[user.plan];
  return [
    t.planName(user.plan === "pro"),
    t.planWatches(watches, l.maxWatches),
    t.planInterval(intervalLabel(t, l.minIntervalSec)),
    t.planAi(aiToday, l.aiPerDay),
  ].join("\n");
}

export function planPitch(t: Dict): string {
  return t.planProPitch(PLANS.pro.maxWatches, intervalLabel(t, PLANS.pro.minIntervalSec), PLANS.pro.aiPerDay);
}

/** One-tap examples on the welcome screen: the fastest way to see what the bot does. Same in every language. */
export const EXAMPLES = ["ps5", "iphone 13", "e-bike"] as const;
export const EXAMPLE_LABELS = ["🎮 PS5", "📱 iPhone 13", "🚲 E-Bike"] as const;

export const HELP_TOPICS = ["about", "link", "filter", "scan", "plan"] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

export function helpText(t: Dict, topic: HelpTopic): string {
  switch (topic) {
    case "about":
      return t.helpAbout;
    case "link":
      return t.helpLink;
    case "filter":
      return t.helpFilter;
    case "scan":
      return t.helpScan;
    case "plan": {
      const plan = (p: (typeof PLANS)["free"]) => ({
        watches: p.maxWatches,
        interval: intervalLabel(t, p.minIntervalSec),
        ai: p.aiPerDay,
        scans: p.scansPerDay,
        pages: p.scanPages,
      });
      return t.helpPlan(plan(PLANS.free), plan(PLANS.pro));
    }
  }
}
