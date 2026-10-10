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
});
