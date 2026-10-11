import type { BatchClassifier, BatchVerdict } from "../ai/batch.js";
import { applyRules, type RuleResult } from "../core/filter.js";
import { marketStats, scoreDeal, statsFor, type DealScore, type MarketData, type MarketStats } from "../core/market.js";
import { VARIANT_MIN_N } from "../core/variants.js";
import { PLANS } from "../core/plans.js";
import type { Repo } from "../db/repo.js";
import { siteById } from "../sites/index.js";
import type { HttpGet } from "../sites/types.js";
import type { Listing, User, Watch } from "../types.js";

export interface ScoredItem {
  listing: Listing;
  verdict: BatchVerdict | null; // null: not checked by AI (off, budget, error)
  deal: DealScore;
  /** The variant whose median scored this listing; null: scored against the overall median */
  variant: string | null;
  /** the listing did not name its model: compared with the cheapest one */
  guessed: boolean;
}

export interface ScanReport {
  watch: Watch;
  at: number;
  pages: number;
  total: number;
  ruleDropped: { listing: Listing; rule: RuleResult }[];
  aiDropped: { listing: Listing; note: string }[];
  items: ScoredItem[]; // relevant, sorted best deal first
  highlights: ScoredItem[]; // working units, good price
  flips: ScoredItem[]; // broken units cheap enough to repair or resell
  stats: MarketStats | null;
  /** Per-variant numbers, most listings first; empty when the item has no variants or too few prices */
  variants: { name: string; stats: MarketStats }[];
  aiChecked: number;
  aiUnchecked: number;
  pageLimitHit: boolean;
}

export type ScanProgress =
  | { stage: "pages"; page: number; listings: number }
  | { stage: "ai"; done: number; total: number }
  | { stage: "done" };

export type ScanResult = { ok: true; report: ScanReport } | { ok: false; error: "limit" | "fetch_failed"; detail?: string };

export const HIGHLIGHT_MIN_SCORE = 7;
export const MAX_HIGHLIGHTS = 10;
export const FLIP_MIN_SCORE = 6;
export const MAX_FLIPS = 5;

export class ScanService {
  constructor(
    private repo: Repo,
    private http: HttpGet,
    private batch: BatchClassifier,
    private now: () => number = Date.now,
  ) {}

  /** Every page of the search (up to the plan limit), deduplicated, newest first. */
  async fetchAll(watch: Watch, maxPages: number, onProgress?: (p: ScanProgress) => void) {
    const site = siteById(watch.query.site);
    const all: Listing[] = [];
    const ids = new Set<string>();
    let pages = 0;
    let pageLimitHit = false;
    for (let page = 1; page <= maxPages; page++) {
      const batch = site.parseListings(await this.http(site.pageUrl(watch.query.url, page)));
      pages++;
      const fresh = batch.filter((l) => !ids.has(l.id));
      for (const l of fresh) {
        ids.add(l.id);
        all.push(l);
      }
      onProgress?.({ stage: "pages", page, listings: all.length });
      // last page, or the site ignored the page parameter and served page 1 again
      if (batch.length < site.pageSize || fresh.length === 0) break;
      if (page === maxPages) pageLimitHit = true;
    }
    return { listings: all, pages, pageLimitHit };
  }

  async run(user: User, watch: Watch, onProgress?: (p: ScanProgress) => void): Promise<ScanResult> {
    const limits = PLANS[user.plan];
    if (!this.repo.takeScan(user.id, limits.scansPerDay)) return { ok: false, error: "limit" };
    this.repo.track(user.id, "scan", { watch: watch.id });

    let fetched;
    try {
      fetched = await this.fetchAll(watch, limits.scanPages, onProgress);
    } catch (e) {
      return { ok: false, error: "fetch_failed", detail: (e as Error).message };
    }

    // older watches have no variants yet: decide once and keep them in the profile
    // (re-read: the caller may hold a copy from before the last scan saved them)
    watch = this.repo.getWatch(watch.id) ?? watch;
    if (watch.profile.useAi && this.batch.enabled && watch.profile.variants === undefined) {
      const variants = await this.batch.variantsFor(watch);
      watch = this.repo.updateWatch(watch.id, { profile: { ...watch.profile, variants } }) ?? { ...watch, profile: { ...watch.profile, variants } };
    }

    const p = watch.profile;
    const passed: { listing: Listing; rule: RuleResult }[] = [];
    const ruleDropped: ScanReport["ruleDropped"] = [];
    for (const l of fetched.listings) {
      const rule = applyRules(l, p);
      (rule.pass ? passed : ruleDropped).push({ listing: l, rule });
    }

    const useAi = p.useAi && this.batch.enabled;
    const ai = useAi
      ? await this.batch.classify(
          watch,
          passed.map((x) => x.listing),
          limits.aiPerDay,
          (done, total) => onProgress?.({ stage: "ai", done, total }),
          user.lang,
        )
      : null;

    const aiDropped: ScanReport["aiDropped"] = [];
    const kept: { listing: Listing; rule: RuleResult; verdict: BatchVerdict | null }[] = [];
    for (const x of passed) {
      const v = ai?.verdicts.get(x.listing.id) ?? null;
      if (v && !v.relevant) aiDropped.push({ listing: x.listing, note: v.note });
      else if (v && v.condition === "defect" && !p.allowDefect) aiDropped.push({ listing: x.listing, note: "defect" });
      else kept.push({ ...x, verdict: v });
    }

    const isDefect = (k: (typeof kept)[number]) => k.rule.defect || k.verdict?.condition === "defect";
    // The market price is what working units sell for: defects and scam-flagged listings stay out of the median
    const priced = kept.filter((k) => !isDefect(k) && !k.verdict?.suspicious && k.listing.price !== null);
    const stats = marketStats(
      priced.map((k) => k.listing.price!),
      this.now(),
    );
    // A Pro is compared with Pros and a Digital with Digitals; variants with too few prices use the overall median
    const variants: ScanReport["variants"] = [];
    for (const name of p.variants ?? []) {
      const prices = priced.filter((k) => k.verdict?.variant === name).map((k) => k.listing.price!);
      const vs = prices.length >= VARIANT_MIN_N ? marketStats(prices, this.now()) : null;
      if (vs) variants.push({ name, stats: vs });
    }
    variants.sort((a, b) => b.stats.n - a.stats.n);
    const market: MarketData | null = stats
      ? { ...stats, ...(variants.length ? { variants: Object.fromEntries(variants.map((v) => [v.name, v.stats])) } : {}) }
      : null;

    const items: ScoredItem[] = kept.map((k) => {
      const ref = statsFor(market, k.verdict?.variant);
      return {
        listing: k.listing,
        verdict: k.verdict,
        variant: ref.variant,
        guessed: ref.guessed,
        deal: scoreDeal(
          { price: k.listing.price, bundleItems: k.verdict?.bundle.length ?? 0, defect: isDefect(k), suspicious: !!k.verdict?.suspicious },
          ref.stats,
        ),
      };
    });
    const broken = (i: ScoredItem) => (i.deal.tags.includes("defect") ? 1 : 0);
    // best score first; on a tie working units before broken ones, then cheaper first
    items.sort(
      (a, b) =>
        (b.deal.score ?? -1) - (a.deal.score ?? -1) || broken(a) - broken(b) || (a.listing.price ?? Infinity) - (b.listing.price ?? Infinity),
    );

    const isBroken = (i: ScoredItem) => i.deal.tags.includes("defect");
    // With AI on, only AI-confirmed listings are recommended: unchecked ones put VR glasses
    // and a steering wheel at the top of the live PS5 report (2026-10-10).
    const trusted = (i: ScoredItem) => !useAi || i.verdict !== null;
    const highlights = items
      .filter((i) => trusted(i) && !isBroken(i) && (i.deal.score ?? 0) >= HIGHLIGHT_MIN_SCORE && !i.deal.tags.includes("suspicious"))
      .slice(0, MAX_HIGHLIGHTS);
    const flips = items.filter((i) => trusted(i) && isBroken(i) && (i.deal.score ?? 0) >= FLIP_MIN_SCORE).slice(0, MAX_FLIPS);

    if (market) this.repo.setMarket(watch.id, market);

    const aiChecked = items.filter((i) => i.verdict).length + aiDropped.length;
    onProgress?.({ stage: "done" });
    return {
      ok: true,
      report: {
        watch: { ...watch, market: market ?? watch.market },
        at: this.now(),
        pages: fetched.pages,
        total: fetched.listings.length,
        ruleDropped,
        aiDropped,
        items,
        highlights,
        flips,
        stats,
        variants,
        aiChecked,
        aiUnchecked: useAi ? passed.length - aiChecked : 0,
        pageLimitHit: fetched.pageLimitHit,
      },
    };
  }
}
