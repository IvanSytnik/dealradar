import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb, Repo } from "../src/db/repo.js";
import { MIGRATIONS } from "../src/db/migrations.js";
import { clock, memRepo, seedUser, seedWatch, XBOX_PROFILE } from "./helpers.js";

describe("migrations", () => {
  it("applies once and is idempotent on reopen", () => {
    const path = join(mkdtempSync(join(tmpdir(), "dr-")), "nested", "db.sqlite");
    const db1 = openDb(path);
    expect(db1.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
    new Repo(db1).upsertUser(1, 10, "a");
    db1.close();
    const db2 = openDb(path);
    expect(new Repo(db2).getUser(1)?.username).toBe("a");
    db2.close();
  });
});

describe("migration v5", () => {
  it("moves Kleinanzeigen watches under 5 min to 10 min, leaves the rest", () => {
    const path = join(mkdtempSync(join(tmpdir(), "dr-")), "db.sqlite");
    const db = openDb(path);
    const repo = new Repo(db);
    seedUser(repo, 1, "pro");
    const ka = { site: "kleinanzeigen", url: "https://www.kleinanzeigen.de/s-ps5/k0", keyword: "ps5", categoryHint: null, priceFrom: null, priceTo: null };
    const fast = repo.createWatch({ userId: 1, name: "ka", query: ka, profile: XBOX_PROFILE, intervalSec: 60 });
    const slow = repo.createWatch({ userId: 1, name: "ka2", query: { ...ka, url: ka.url + "?x" }, profile: XBOX_PROFILE, intervalSec: 1800 });
    const wh = seedWatch(repo, 1);
    repo.updateWatch(wh.id, { intervalSec: 60 });
    db.pragma("user_version = 4");
    db.close();

    const again = new Repo(openDb(path));
    expect(again.getWatch(fast.id)!.intervalSec).toBe(600);
    expect(again.getWatch(slow.id)!.intervalSec).toBe(1800);
    expect(again.getWatch(wh.id)!.intervalSec).toBe(60);
  });
});

describe("Repo", () => {
  it("upsert keeps plan and un-blocks a returning user", () => {
    const repo = memRepo();
    seedUser(repo, 1, "pro");
    repo.markBlocked(1);
    const u = repo.upsertUser(1, 99, "renamed");
    expect(u).toMatchObject({ plan: "pro", chatId: 99, username: "renamed", blocked: false });
  });

  it("tracks seen listings: new, seen, price drop, price rise", () => {
    const repo = memRepo();
    seedUser(repo);
    const w = seedWatch(repo, 1);
    expect(repo.checkSeen(w.id, "a", 200, "Xbox").status).toBe("new");
    expect(repo.checkSeen(w.id, "a", 200).status).toBe("seen");
    expect(repo.checkSeen(w.id, "a", 170)).toEqual({ status: "price_drop", oldPrice: 200 });
    expect(repo.checkSeen(w.id, "a", 190).status).toBe("seen");
    expect(repo.getSeen(w.id, "a")).toEqual({ title: "Xbox", price: 170 });
  });

  it("isolates watches between users", () => {
    const repo = memRepo();
    seedUser(repo, 1);
    seedUser(repo, 2);
    const w = seedWatch(repo, 1);
    expect(repo.getUserWatch(2, w.id)).toBeNull();
    expect(repo.deleteWatch(2, w.id)).toBe(false);
    expect(repo.deleteWatch(1, w.id)).toBe(true);
  });

  it("returns only due, active watches of non-blocked users", () => {
    const c = clock();
    const repo = memRepo(c.now);
    seedUser(repo, 1);
    seedUser(repo, 2);
    const due = seedWatch(repo, 1);
    const later = seedWatch(repo, 1);
    repo.markRun(later.id, true, c.now() + 60_000, true);
    const paused = seedWatch(repo, 1);
    repo.updateWatch(paused.id, { active: false });
    seedWatch(repo, 2);
    repo.markBlocked(2);
    expect(repo.dueWatches().map((w) => w.id)).toEqual([due.id]);
  });

  it("resuming a paused watch schedules it now", () => {
    const c = clock();
    const repo = memRepo(c.now);
    seedUser(repo);
    const w = seedWatch(repo, 1);
    repo.markRun(w.id, true, c.now() + 999_999, true);
    repo.updateWatch(w.id, { active: false });
    repo.updateWatch(w.id, { active: true });
    expect(repo.getWatch(w.id)!.nextRunAt).toBe(c.now());
  });

  it("counts failures and resets them on success", () => {
    const repo = memRepo();
    seedUser(repo);
    const w = seedWatch(repo, 1);
    repo.markRun(w.id, false, 0, true);
    repo.markRun(w.id, false, 0, true);
    expect(repo.getWatch(w.id)!.failures).toBe(2);
    repo.markRun(w.id, true, 0, true);
    expect(repo.getWatch(w.id)!.failures).toBe(0);
  });

  it("enforces the daily AI budget and resets it the next day", () => {
    const c = clock();
    const repo = memRepo(c.now);
    seedUser(repo);
    expect([repo.takeAiCall(1, 2), repo.takeAiCall(1, 2), repo.takeAiCall(1, 2)]).toEqual([true, true, false]);
    expect(repo.aiCallsToday(1)).toBe(2);
    c.advance(86_400_000);
    expect(repo.takeAiCall(1, 2)).toBe(true);
  });

  it("stores feedback once per listing, last vote wins", () => {
    const repo = memRepo();
    seedUser(repo);
    const w = seedWatch(repo, 1);
    repo.addFeedback(w.id, "a", "Xbox Controller", 30, false);
    repo.addFeedback(w.id, "a", "Xbox Controller", 30, true);
    expect(repo.recentFeedback(w.id)).toEqual([{ title: "Xbox Controller", price: 30, good: true }]);
  });

  it("cascades deletes and round-trips the profile JSON", () => {
    const repo = memRepo();
    seedUser(repo);
    const w = seedWatch(repo, 1);
    expect(repo.getWatch(w.id)!.profile).toEqual(XBOX_PROFILE);
    repo.checkSeen(w.id, "a", 1);
    repo.deleteWatch(1, w.id);
    expect(repo.getSeen(w.id, "a")).toBeNull();
  });

  it("aggregates stats", () => {
    const repo = memRepo();
    seedUser(repo, 1, "pro");
    seedUser(repo, 2);
    seedWatch(repo, 1);
    repo.track(1, "notify");
    expect(repo.stats(0)).toMatchObject({ users: 2, proUsers: 1, watches: 1, activeWatches: 1, notifications: 1 });
  });

  it("invite bonus: Pro until it expires, stacking on a running bonus", () => {
    const c = clock();
    const repo = memRepo(c.now);
    repo.upsertUser(1, 1, "a");
    expect(repo.getUser(1)!.plan).toBe("free");
    repo.grantProDays(1, 7);
    repo.grantProDays(1, 7); // second invite extends, does not reset
    expect(repo.getUser(1)!.plan).toBe("pro");
    c.advance(13 * 86_400_000);
    expect(repo.getUser(1)!.plan).toBe("pro");
    c.advance(2 * 86_400_000);
    expect(repo.getUser(1)!.plan).toBe("free");
  });

  it("a user can be referred only once", () => {
    const repo = memRepo();
    for (const id of [1, 2, 3]) repo.upsertUser(id, id, null);
    expect(repo.setReferrer(3, 1)).toBe(true);
    expect(repo.setReferrer(3, 2)).toBe(false);
    expect(repo.countReferrals(1)).toBe(1);
  });

  it("deleteUser erases the user and everything keyed by them", () => {
    const repo = memRepo();
    seedUser(repo, 1);
    seedUser(repo, 2);
    const w = seedWatch(repo, 1);
    repo.checkSeen(w.id, "x", 100, "Xbox");
    repo.addFeedback(w.id, "x", "Xbox", 100, false);
    repo.track(1, "signup");
    repo.takeAiCall(1, 10);
    repo.takeScan(1, 10);
    repo.setReferrer(2, 1);

    expect(repo.deleteUser(1)).toBe(true);
    const left = (table: string, where = "user_id = 1") =>
      (repo.db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${where}`).get() as { c: number }).c;
    expect(repo.getUser(1)).toBeNull();
    expect(left("watches")).toBe(0);
    expect(left("seen", `watch_id = ${w.id}`)).toBe(0);
    expect(left("feedback", `watch_id = ${w.id}`)).toBe(0);
    expect(left("events")).toBe(0);
    expect(left("ai_usage")).toBe(0);
    expect(left("scan_usage")).toBe(0);
    expect(left("users", "referred_by = 1")).toBe(0); // no dangling reference to the erased id
    expect(repo.getUser(2)).not.toBeNull();
  });
});
