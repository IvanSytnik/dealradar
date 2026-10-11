import { t } from "../i18n/index.js";
import { esc } from "../bot/format.js";
import type { Classifier } from "../ai/classifier.js";
import { applyRules } from "../core/filter.js";
import { PLANS } from "../core/plans.js";
import type { Repo } from "../db/repo.js";
import { logger } from "../logger.js";
import { siteById } from "../sites/index.js";
import type { HttpGet } from "../sites/types.js";
import type { Listing, Watch } from "../types.js";
import type { HealthMonitor } from "./health.js";
import { RecipientGoneError, type Notifier } from "./notifier.js";

export const MAX_NOTIFY_PER_RUN = 10;
export const FAILURE_ALERT_AT = 5;
/** Catch-up limit: pages fetched per search per run when a burst of listings overflows page 1. */
export const MAX_PAGES = 4;

export interface RunStats {
  watches: number;
  fetches: number;
  pages: number;
  notified: number;
  errors: number;
}

export class Poller {
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private repo: Repo,
    private http: HttpGet,
    private classifier: Classifier,
    private notifier: Notifier,
    private now: () => number = Date.now,
    private health?: HealthMonitor,
  ) {}

  start(tickSec: number) {
    const loop = async () => {
      try {
        await this.tick();
      } catch (e) {
        logger.error("tick failed", { err: (e as Error).message });
      }
      this.timer = setTimeout(loop, tickSec * 1000);
    };
    void loop();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
  }

  /** One scheduler pass. Watches with the same URL share one HTTP request. */
  async tick(): Promise<RunStats> {
    const stats: RunStats = { watches: 0, fetches: 0, pages: 0, notified: 0, errors: 0 };
    if (this.running) return stats;
    this.running = true;
    try {
      const due = this.repo.dueWatches();
      stats.watches = due.length;
      const byUrl = new Map<string, Watch[]>();
      for (const w of due) byUrl.set(w.query.url, [...(byUrl.get(w.query.url) ?? []), w]);

      await Promise.all(
        [...byUrl.entries()].map(async ([url, watches]) => {
          let listings: Listing[];
          const site = watches[0]!.query.site;
          try {
            stats.fetches++;
            listings = await this.fetchWithCatchUp(url, watches, stats);
          } catch (e) {
            stats.errors++;
            await this.health?.record({ site, url, count: null, error: (e as Error).message }).catch(() => undefined);
            for (const w of watches) await this.fail(w, (e as Error).message);
            return;
          }
          await this.health?.record({ site, url, count: listings.length }).catch(() => undefined);
          for (const w of watches) stats.notified += await this.processWatch(w, listings);
        }),
      );
    } finally {
      this.running = false;
    }
    return stats;
  }

  /**
   * Results are sorted newest first, so new listings are always on page 1.
   * Only when a whole page is unseen (a burst between two checks) can more be hiding on the next one.
   */
  private async fetchWithCatchUp(url: string, watches: Watch[], stats: RunStats): Promise<Listing[]> {
    const site = siteById(watches[0]!.query.site);
    const seeded = watches.filter((w) => w.seeded);
    const all: Listing[] = [];
    const ids = new Set<string>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = site.parseListings(await this.http(site.pageUrl(url, page)));
      stats.pages++;
      const fresh = batch.filter((l) => !ids.has(l.id));
      for (const l of fresh) {
        ids.add(l.id);
        all.push(l);
      }
      const pageFull = batch.length >= site.pageSize;
      // an unseeded watch only needs page 1 to memorise what is online
      const overflow = seeded.some((w) => fresh.length > 0 && fresh.every((l) => !this.repo.isSeen(w.id, l.id)));
      if (!pageFull || fresh.length === 0 || !overflow) break;
      if (page === MAX_PAGES) logger.warn("catch-up limit reached", { url, pages: MAX_PAGES });
    }
    return all;
  }

  private nextRun(w: Watch, failures: number) {
    const backoff = Math.min(2 ** failures, 32);
    const jitter = 1 + Math.random() * 0.15;
    // the site floor also holds for watches stored before it existed
    const base = Math.max(w.intervalSec, siteById(w.query.site).minIntervalSec ?? 0);
    return this.now() + base * 1000 * backoff * jitter;
  }

  private async fail(w: Watch, message: string) {
    const failures = w.failures + 1;
    this.repo.markRun(w.id, false, this.nextRun(w, failures), w.seeded);
    logger.warn("watch fetch failed", { watch: w.id, failures, message });
    if (failures === FAILURE_ALERT_AT) {
      const user = this.repo.getUser(w.userId);
      if (user) await this.safeText(user, t(user.lang).fetchFailing(esc(w.name), esc(message)));
    }
  }

  /** Returns the number of notifications sent. */
  async processWatch(w: Watch, listings: Listing[]): Promise<number> {
    const user = this.repo.getUser(w.userId);
    if (!user) return 0;
    const limits = PLANS[user.plan];

    const fresh: { listing: Listing; oldPrice: number | null }[] = [];
    // oldest first so the chat reads chronologically
    for (const l of [...listings].reverse()) {
      const { status, oldPrice } = this.repo.checkSeen(w.id, l.id, l.price, l.title);
      if (!w.seeded || status === "seen") continue;
      fresh.push({ listing: l, oldPrice: status === "price_drop" ? oldPrice : null });
    }

    let sent = 0;
    let suppressed = 0;
    try {
      for (const { listing, oldPrice } of fresh) {
        const rule = applyRules(listing, w.profile);
        if (!rule.pass) continue;

        let verdict = null;
        if (w.profile.useAi) {
          const r = await this.classifier.classify(w, listing, limits.aiPerDay, user.lang);
          if (r.kind === "verdict") {
            verdict = r.verdict;
            if (!verdict.relevant || verdict.score < w.profile.minScore) continue;
            if (verdict.condition === "defect" && !w.profile.allowDefect) continue;
          }
          // budget exhausted / AI error: fall back to rules only rather than going silent
        }

        if (sent >= MAX_NOTIFY_PER_RUN) {
          suppressed++;
          continue;
        }
        await this.notifier.sendListing(user, w, listing, { defect: rule.defect, verdict, oldPrice });
        this.repo.track(user.id, "notify", { watch: w.id });
        sent++;
      }
      if (suppressed > 0) {
        await this.notifier.sendText(user, t(user.lang).moreListings(suppressed, esc(w.name)));
      }
    } catch (e) {
      if (e instanceof RecipientGoneError) {
        this.repo.markBlocked(user.id);
        logger.info("user blocked the bot, deactivated", { user: user.id });
        return sent;
      }
      // Transport hiccup (rate limit, network): listings are already marked seen, keep the schedule going
      logger.error("notify failed", { watch: w.id, err: (e as Error).message });
    }

    this.repo.markRun(w.id, true, this.nextRun(w, 0), true);
    return sent;
  }

  private async safeText(user: Parameters<Notifier["sendText"]>[0], text: string) {
    try {
      await this.notifier.sendText(user, text);
    } catch (e) {
      if (e instanceof RecipientGoneError) this.repo.markBlocked(user.id);
    }
  }
}
