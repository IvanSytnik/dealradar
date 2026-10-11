import type { BatchClassifier } from "../ai/batch.js";
import { buildProfile } from "../ai/profile.js";
import type { Llm } from "../ai/llm.js";
import { applyRules, type RuleResult } from "../core/filter.js";
import { normalize } from "../core/normalize.js";
import { clampInterval, defaultInterval, PLANS } from "../core/plans.js";
import type { Repo } from "../db/repo.js";
import { adapterForUrl, DEFAULT_SITE, extractUrl, siteById } from "../sites/index.js";
import type { HttpGet } from "../sites/types.js";
import type { FilterProfile, Listing, SearchQuery, User, Watch } from "../types.js";

export type CreateResult =
  | { ok: true; watch: Watch; profileSource: "ai" | "fallback"; preview: Preview }
  | { ok: false; error: "limit" | "unsupported_site" | "bad_url" | "fetch_failed" | "duplicate"; detail?: string };

export interface Preview {
  total: number;
  passed: { listing: Listing; rule: RuleResult }[];
  dropped: { listing: Listing; rule: RuleResult }[];
  /** Passed the rules, rejected by the AI */
  /** reason: the AI's note in the user's language, may be empty; defect: dropped only for being broken */
  aiDropped: { listing: Listing; reason: string; defect: boolean }[];
  aiChecked: number;
}

/** How many rule-passed listings the preview sends to the AI. Batched: 30 listings = 2 calls, not 30. */
export const PREVIEW_AI_MAX = 30;

export class WatchService {
  constructor(
    private repo: Repo,
    private http: HttpGet,
    private llm: Llm | null,
    private now: () => number = Date.now,
    private classifier: BatchClassifier | null = null,
  ) {}

  /** Accepts a pasted search URL or plain text ("ps5 digital"). */
  resolveQuery(input: string): { ok: true; query: SearchQuery } | { ok: false; error: "unsupported_site" | "bad_url"; detail?: string } {
    const url = extractUrl(input);
    if (url) {
      const site = adapterForUrl(url);
      if (!site) return { ok: false, error: "unsupported_site", detail: url.hostname };
      try {
        return { ok: true, query: site.parseSearchUrl(url) };
      } catch (e) {
        return { ok: false, error: "bad_url", detail: (e as Error).message };
      }
    }
    const text = input.trim().slice(0, 80);
    return { ok: true, query: DEFAULT_SITE.parseSearchUrl(new URL(DEFAULT_SITE.searchUrlFromText(text))) };
  }

  async fetchListings(q: SearchQuery): Promise<Listing[]> {
    return siteById(q.site).parseListings(await this.http(q.url));
  }

  async create(user: User, input: string): Promise<CreateResult> {
    const limits = PLANS[user.plan];
    if (this.repo.countWatches(user.id) >= limits.maxWatches) return { ok: false, error: "limit" };

    const r = this.resolveQuery(input);
    if (!r.ok) return r;
    const query = r.query;

    if (this.repo.listWatches(user.id).some((w) => w.query.url === query.url)) return { ok: false, error: "duplicate" };

    let listings: Listing[];
    try {
      listings = await this.fetchListings(query);
    } catch (e) {
      return { ok: false, error: "fetch_failed", detail: (e as Error).message };
    }

    const { profile, source } = await buildProfile(query, this.llm, user.lang);
    const watch = this.repo.createWatch({
      userId: user.id,
      name: query.keyword.slice(0, 40),
      query,
      profile,
      intervalSec: defaultInterval(user.plan, siteById(query.site)),
    });

    // Seed with what is already online: the user only hears about listings posted from now on
    for (const l of listings) this.repo.checkSeen(watch.id, l.id, l.price, l.title);
    this.repo.markRun(watch.id, true, this.now() + watch.intervalSec * 1000, true);
    this.repo.track(user.id, "watch_created", { site: query.site, source, keyword: query.keyword });

    const created = this.repo.getWatch(watch.id)!;
    const preview = await this.screen(user, created, this.previewOf(listings, profile));
    return { ok: true, watch: created, profileSource: source, preview };
  }

  previewOf(listings: Listing[], profile: FilterProfile): Preview {
    const passed: Preview["passed"] = [];
    const dropped: Preview["dropped"] = [];
    for (const l of listings) {
      const rule = applyRules(l, profile);
      (rule.pass ? passed : dropped).push({ listing: l, rule });
    }
    return { total: listings.length, passed, dropped, aiDropped: [], aiChecked: 0 };
  }

  /**
   * Runs the AI over the rule-passed listings in one or two batched calls, so the preview shows
   * what the user will actually get. Per-listing calls here used to eat the whole Free daily budget.
   */
  async screen(user: User, watch: Watch, preview: Preview): Promise<Preview> {
    if (!this.classifier?.enabled || !watch.profile.useAi || preview.passed.length === 0) return preview;
    const p = watch.profile;
    const head = preview.passed.slice(0, PREVIEW_AI_MAX);
    const r = await this.classifier.classify(watch, head.map((x) => x.listing), PLANS[user.plan].aiPerDay, undefined, user.lang);
    const kept: Preview["passed"] = [];
    const aiDropped: Preview["aiDropped"] = [];
    for (const item of preview.passed) {
      const v = r.verdicts.get(item.listing.id);
      if (v && !v.relevant) aiDropped.push({ listing: item.listing, reason: v.note, defect: false });
      else if (v && v.condition === "defect" && !p.allowDefect) aiDropped.push({ listing: item.listing, reason: "", defect: true });
      else kept.push(item);
    }
    return { ...preview, passed: kept, aiDropped, aiChecked: r.verdicts.size };
  }

  async preview(user: User, watch: Watch): Promise<Preview> {
    return this.screen(user, watch, this.previewOf(await this.fetchListings(watch.query), watch.profile));
  }

  // ---------- edits (all ownership-checked) ----------

  private patchProfile(user: User, id: number, fn: (p: FilterProfile) => FilterProfile): Watch | null {
    const w = this.repo.getUserWatch(user.id, id);
    if (!w) return null;
    return this.repo.updateWatch(id, { profile: fn(w.profile) });
  }

  setPrice(user: User, id: number, min: number | null, max: number | null) {
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    return this.patchProfile(user, id, (p) => ({ ...p, priceMin: min, priceMax: max }));
  }

  addExclude(user: User, id: number, words: string[]) {
    const clean = words.map((w) => normalize(w)).filter(Boolean);
    return this.patchProfile(user, id, (p) => ({ ...p, exclude: [...new Set([...p.exclude, ...clean])] }));
  }

  removeExclude(user: User, id: number, words: string[]) {
    const clean = new Set(words.map((w) => normalize(w)));
    return this.patchProfile(user, id, (p) => ({
      ...p,
      exclude: p.exclude.filter((w) => !clean.has(normalize(w))),
      accessoryWords: p.accessoryWords.filter((w) => !clean.has(normalize(w))),
    }));
  }

  /** Replaces the match groups. "series s | xbox s | xss" -> [["series","s"],["xbox","s"],["xss"]] */
  setMatch(user: User, id: number, spec: string) {
    const groups = spec
      .split("|")
      .map((g) => normalize(g).split(" ").filter(Boolean))
      .filter((g) => g.length > 0);
    return this.patchProfile(user, id, (p) => ({ ...p, mustAny: groups }));
  }

  setMinScore(user: User, id: number, score: number) {
    const s = Math.max(1, Math.min(10, Math.round(score)));
    return this.patchProfile(user, id, (p) => ({ ...p, minScore: s }));
  }

  toggle(user: User, id: number, field: "useAi" | "allowDefect") {
    return this.patchProfile(user, id, (p) => ({ ...p, [field]: !p[field] }));
  }

  setActive(user: User, id: number, active: boolean) {
    if (!this.repo.getUserWatch(user.id, id)) return null;
    return this.repo.updateWatch(id, { active });
  }

  setInterval(user: User, id: number, sec: number) {
    const w = this.repo.getUserWatch(user.id, id);
    if (!w) return null;
    return this.repo.updateWatch(id, { intervalSec: clampInterval(user.plan, sec, siteById(w.query.site)) });
  }

  rename(user: User, id: number, name: string) {
    if (!this.repo.getUserWatch(user.id, id)) return null;
    return this.repo.updateWatch(id, { name: name.trim().slice(0, 40) || "watch" });
  }

  delete(user: User, id: number) {
    return this.repo.deleteWatch(user.id, id);
  }
}
