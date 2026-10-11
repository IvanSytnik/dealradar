import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { isLang, type Lang } from "../i18n/index.js";
import type { AiVerdict, FilterProfile, Plan, SearchQuery, User, Watch } from "../types.js";
import { MIGRATIONS } from "./migrations.js";
import type { MarketStats } from "../core/market.js";

export type SeenStatus = "new" | "price_drop" | "seen";

export function openDb(path: string): Database.Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]!);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  return db;
}

const today = (now: number) => new Date(now).toISOString().slice(0, 10);

function rowToWatch(r: any): Watch {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    query: JSON.parse(r.query_json) as SearchQuery,
    profile: JSON.parse(r.profile_json) as FilterProfile,
    intervalSec: r.interval_sec,
    active: !!r.active,
    seeded: !!r.seeded,
    failures: r.failures,
    nextRunAt: r.next_run_at,
    lastRunAt: r.last_run_at,
    createdAt: r.created_at,
    market: r.market_json ? (JSON.parse(r.market_json) as MarketStats) : null,
  };
}

/** `plan` is the effective plan: a stored "pro", or a Pro bonus that has not expired yet. */
function rowToUser(r: any, now: number): User {
  const proUntil: number | null = r.pro_until ?? null;
  return {
    id: r.id,
    chatId: r.chat_id,
    username: r.username,
    plan: r.plan === "pro" || (proUntil !== null && proUntil > now) ? "pro" : (r.plan as Plan),
    proUntil,
    lang: isLang(r.lang) ? r.lang : "en",
    blocked: !!r.blocked,
    createdAt: r.created_at,
  };
}

export class Repo {
  constructor(
    readonly db: Database.Database,
    private now: () => number = Date.now,
  ) {}

  // ---------- users ----------
  /**
   * `lang` is the language detected from Telegram on this update. It follows the user's Telegram
   * locale until they pick one explicitly with /lang (lang_set = 1).
   */
  upsertUser(id: number, chatId: number, username: string | null, defaultPlan: Plan = "free", lang: Lang = "en"): User {
    this.db
      .prepare(
        `INSERT INTO users (id, chat_id, username, plan, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET chat_id = excluded.chat_id, username = excluded.username, blocked = 0,
           lang = CASE WHEN users.lang_set = 1 THEN users.lang ELSE excluded.lang END`,
      )
      .run(id, chatId, username, defaultPlan, lang, this.now());
    return this.getUser(id)!;
  }

  /** Adds Pro days on top of whatever bonus is still running. */
  grantProDays(id: number, days: number) {
    const r = this.db.prepare("SELECT pro_until FROM users WHERE id = ?").get(id) as { pro_until: number | null } | undefined;
    if (!r) return false;
    const from = Math.max(r.pro_until ?? 0, this.now());
    this.db.prepare("UPDATE users SET pro_until = ? WHERE id = ?").run(from + days * 86_400_000, id);
    return true;
  }

  /** First referrer wins; returns false if the user already had one. */
  setReferrer(id: number, referrerId: number) {
    return this.db.prepare("UPDATE users SET referred_by = ? WHERE id = ? AND referred_by IS NULL").run(referrerId, id).changes > 0;
  }

  countReferrals(id: number): number {
    return (this.db.prepare("SELECT COUNT(*) c FROM users WHERE referred_by = ?").get(id) as { c: number }).c;
  }

  /**
   * GDPR erasure: the user row and everything keyed by the user. Watches cascade to seen and feedback.
   * Verdict cache rows are keyed by a hash of the listing and carry no user id.
   */
  deleteUser(id: number) {
    const run = this.db.transaction(() => {
      for (const table of ["events", "ai_usage", "scan_usage"]) this.db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id);
      this.db.prepare("UPDATE users SET referred_by = NULL WHERE referred_by = ?").run(id);
      return this.db.prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
    });
    return run();
  }

  /** Explicit choice from /lang: sticks even if the Telegram locale differs. */
  setLang(id: number, lang: Lang) {
    return this.db.prepare("UPDATE users SET lang = ?, lang_set = 1 WHERE id = ?").run(lang, id).changes > 0;
  }

  getUser(id: number): User | null {
    const r = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return r ? rowToUser(r, this.now()) : null;
  }

  setPlan(id: number, plan: Plan) {
    return this.db.prepare("UPDATE users SET plan = ? WHERE id = ?").run(plan, id).changes > 0;
  }

  /** User blocked the bot: stop polling their watches. */
  markBlocked(id: number) {
    this.db.prepare("UPDATE users SET blocked = 1 WHERE id = ?").run(id);
    this.db.prepare("UPDATE watches SET active = 0 WHERE user_id = ?").run(id);
  }

  // ---------- watches ----------
  createWatch(input: { userId: number; name: string; query: SearchQuery; profile: FilterProfile; intervalSec: number }): Watch {
    const now = this.now();
    const info = this.db
      .prepare(
        `INSERT INTO watches (user_id, name, query_json, profile_json, interval_sec, next_run_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.userId, input.name, JSON.stringify(input.query), JSON.stringify(input.profile), input.intervalSec, now, now);
    return this.getWatch(Number(info.lastInsertRowid))!;
  }

  getWatch(id: number): Watch | null {
    const r = this.db.prepare("SELECT * FROM watches WHERE id = ?").get(id);
    return r ? rowToWatch(r) : null;
  }

  /** Ownership-checked lookup for anything coming from Telegram. */
  getUserWatch(userId: number, id: number): Watch | null {
    const r = this.db.prepare("SELECT * FROM watches WHERE id = ? AND user_id = ?").get(id, userId);
    return r ? rowToWatch(r) : null;
  }

  listWatches(userId: number): Watch[] {
    return this.db.prepare("SELECT * FROM watches WHERE user_id = ? ORDER BY id").all(userId).map(rowToWatch);
  }

  countWatches(userId: number): number {
    return (this.db.prepare("SELECT COUNT(*) c FROM watches WHERE user_id = ?").get(userId) as { c: number }).c;
  }

  dueWatches(limit = 200): Watch[] {
    return this.db
      .prepare(
        `SELECT w.* FROM watches w JOIN users u ON u.id = w.user_id
         WHERE w.active = 1 AND u.blocked = 0 AND w.next_run_at <= ?
         ORDER BY w.next_run_at LIMIT ?`,
      )
      .all(this.now(), limit)
      .map(rowToWatch);
  }

  updateWatch(id: number, patch: Partial<Pick<Watch, "name" | "profile" | "intervalSec" | "active" | "query">>) {
    const w = this.getWatch(id);
    if (!w) return null;
    const next = { ...w, ...patch };
    this.db
      .prepare(
        `UPDATE watches SET name = ?, profile_json = ?, interval_sec = ?, active = ?, query_json = ?,
         next_run_at = CASE WHEN ? = 1 AND active = 0 THEN ? ELSE next_run_at END WHERE id = ?`,
      )
      .run(
        next.name,
        JSON.stringify(next.profile),
        next.intervalSec,
        next.active ? 1 : 0,
        JSON.stringify(next.query),
        next.active ? 1 : 0,
        this.now(),
        id,
      );
    return this.getWatch(id);
  }

  setMarket(id: number, m: MarketStats | null) {
    this.db.prepare("UPDATE watches SET market_json = ? WHERE id = ?").run(m ? JSON.stringify(m) : null, id);
  }

  /** Atomically consumes one market scan from the user's daily allowance. */
  takeScan(userId: number, dailyLimit: number): boolean {
    const day = today(this.now());
    return this.db.transaction(() => {
      const r = this.db.prepare("SELECT scans FROM scan_usage WHERE user_id = ? AND day = ?").get(userId, day) as { scans: number } | undefined;
      if ((r?.scans ?? 0) >= dailyLimit) return false;
      this.db
        .prepare(
          `INSERT INTO scan_usage (user_id, day, scans) VALUES (?, ?, 1)
           ON CONFLICT(user_id, day) DO UPDATE SET scans = scans + 1`,
        )
        .run(userId, day);
      return true;
    })();
  }

  deleteWatch(userId: number, id: number): boolean {
    return this.db.prepare("DELETE FROM watches WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
  }

  markRun(id: number, ok: boolean, nextRunAt: number, seeded: boolean) {
    this.db
      .prepare(
        `UPDATE watches SET last_run_at = ?, next_run_at = ?, seeded = MAX(seeded, ?),
         failures = CASE WHEN ? THEN 0 ELSE failures + 1 END WHERE id = ?`,
      )
      .run(this.now(), nextRunAt, seeded ? 1 : 0, ok ? 1 : 0, id);
  }

  // ---------- seen ----------
  checkSeen(
    watchId: number,
    listingId: string,
    price: number | null,
    title = "",
  ): { status: SeenStatus; oldPrice: number | null } {
    const row = this.db.prepare("SELECT price FROM seen WHERE watch_id = ? AND listing_id = ?").get(watchId, listingId) as
      | { price: number | null }
      | undefined;
    if (!row) {
      this.db
        .prepare("INSERT INTO seen (watch_id, listing_id, title, price, first_seen) VALUES (?, ?, ?, ?, ?)")
        .run(watchId, listingId, title, price, this.now());
      return { status: "new", oldPrice: null };
    }
    if (price !== null && row.price !== null && price < row.price) {
      this.db.prepare("UPDATE seen SET price = ? WHERE watch_id = ? AND listing_id = ?").run(price, watchId, listingId);
      return { status: "price_drop", oldPrice: row.price };
    }
    return { status: "seen", oldPrice: row.price };
  }

  isSeen(watchId: number, listingId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM seen WHERE watch_id = ? AND listing_id = ?").get(watchId, listingId);
  }

  getSeen(watchId: number, listingId: string): { title: string; price: number | null } | null {
    return (
      (this.db.prepare("SELECT title, price FROM seen WHERE watch_id = ? AND listing_id = ?").get(watchId, listingId) as
        | { title: string; price: number | null }
        | undefined) ?? null
    );
  }

  // ---------- AI ----------
  getVerdict(key: string): AiVerdict | null {
    const r = this.db.prepare("SELECT verdict_json FROM ai_cache WHERE key = ?").get(key) as { verdict_json: string } | undefined;
    return r ? (JSON.parse(r.verdict_json) as AiVerdict) : null;
  }

  putVerdict(key: string, v: AiVerdict) {
    this.db
      .prepare("INSERT OR REPLACE INTO ai_cache (key, verdict_json, created_at) VALUES (?, ?, ?)")
      .run(key, JSON.stringify(v), this.now());
  }

  /** Atomically consumes one AI call from the user's daily budget. */
  takeAiCall(userId: number, dailyLimit: number): boolean {
    const day = today(this.now());
    return this.db.transaction(() => {
      const r = this.db.prepare("SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?").get(userId, day) as
        | { calls: number }
        | undefined;
      if ((r?.calls ?? 0) >= dailyLimit) return false;
      this.db
        .prepare(
          `INSERT INTO ai_usage (user_id, day, calls) VALUES (?, ?, 1)
           ON CONFLICT(user_id, day) DO UPDATE SET calls = calls + 1`,
        )
        .run(userId, day);
      return true;
    })();
  }

  aiCallsToday(userId: number): number {
    const r = this.db.prepare("SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?").get(userId, today(this.now())) as
      | { calls: number }
      | undefined;
    return r?.calls ?? 0;
  }

  // ---------- feedback ----------
  addFeedback(watchId: number, listingId: string, title: string, price: number | null, good: boolean) {
    this.db
      .prepare(
        `INSERT INTO feedback (watch_id, listing_id, title, price, good, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(watch_id, listing_id) DO UPDATE SET good = excluded.good`,
      )
      .run(watchId, listingId, title, price, good ? 1 : 0, this.now());
  }

  recentFeedback(watchId: number, limit = 8): { title: string; price: number | null; good: boolean }[] {
    return (
      this.db
        .prepare("SELECT title, price, good FROM feedback WHERE watch_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
        .all(watchId, limit) as any[]
    ).map((r) => ({ title: r.title, price: r.price, good: !!r.good }));
  }

  // ---------- analytics ----------
  track(userId: number | null, type: string, data?: unknown) {
    this.db
      .prepare("INSERT INTO events (user_id, type, data, created_at) VALUES (?, ?, ?, ?)")
      .run(userId, type, data === undefined ? null : JSON.stringify(data), this.now());
  }

  stats(sinceMs: number) {
    const one = (sql: string, ...a: unknown[]) => (this.db.prepare(sql).get(...a) as { c: number }).c;
    return {
      users: one("SELECT COUNT(*) c FROM users"),
      activeUsers: one("SELECT COUNT(DISTINCT user_id) c FROM watches WHERE active = 1"),
      proUsers: one("SELECT COUNT(*) c FROM users WHERE plan = 'pro' OR pro_until > ?", this.now()),
      referrals: one("SELECT COUNT(*) c FROM users WHERE referred_by IS NOT NULL AND created_at >= ?", sinceMs),
      watches: one("SELECT COUNT(*) c FROM watches"),
      activeWatches: one("SELECT COUNT(*) c FROM watches WHERE active = 1"),
      notifications: one("SELECT COUNT(*) c FROM events WHERE type = 'notify' AND created_at >= ?", sinceMs),
      signups: one("SELECT COUNT(*) c FROM users WHERE created_at >= ?", sinceMs),
      aiCalls: one("SELECT COUNT(*) c FROM events WHERE type = 'ai_call' AND created_at >= ?", sinceMs),
      negativeFeedback: one("SELECT COUNT(*) c FROM feedback WHERE good = 0 AND created_at >= ?", sinceMs),
    };
  }
}
