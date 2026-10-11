import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BATCH_SIZE, BatchClassifier } from "../src/ai/batch.js";
import { MIGRATIONS } from "../src/db/migrations.js";
import { openDb, Repo } from "../src/db/repo.js";
import { PLANS } from "../src/core/plans.js";
import { renderReport } from "../src/report/html.js";
import { ScanService } from "../src/services/scan.js";
import { fakeHttp, fakeLlm, memRepo, seedUser, seedWatch, willhabenHtml, XBOX_PROFILE, type FakeAd } from "./helpers.js";

const PS5_PROFILE = { ...XBOX_PROFILE, item: "PS5 console", mustAny: [["playstation", "5"], ["ps5"]], exclude: ["ps4"], accessoryWords: ["controller"], priceMin: 100, priceMax: null, useAi: true, variants: [] as string[] };

/** Batch fake: reads "[i] title | price | body" lines and answers per line. */
function batchLlm(judge: (title: string) => Partial<{ relevant: boolean; condition: string; bundle: string[]; suspicious: boolean; note: string }>) {
  return fakeLlm((user) => {
    const items = [...user.matchAll(/^\[(\d+)\] (.*?) \|/gm)].map((m) => ({
      i: Number(m[1]),
      relevant: true,
      condition: "good",
      bundle: [],
      suspicious: false,
      note: "ok",
      ...judge(m[2]!),
    }));
    return JSON.stringify({ items });
  });
}

function pages(ads: FakeAd[], size = 30) {
  const byPage: Record<number, FakeAd[]> = {};
  ads.forEach((a, i) => (byPage[Math.floor(i / size) + 1] ??= []).push(a));
  return fakeHttp((url) => willhabenHtml(byPage[Number(new URL(url).searchParams.get("page") ?? "1")] ?? []));
}

// 70 listings over 3 pages: consoles at various prices, games, a scam-cheap one, a defect, a lone controller
function market(): FakeAd[] {
  const ads: FakeAd[] = [];
  const prices = [380, 420, 450, 460, 480, 500, 500, 520, 540, 550, 600, 650];
  prices.forEach((p, i) => ads.push({ id: 100 + i, title: `PlayStation 5 Konsole #${i}`, price: p }));
  ads.push({ id: 200, title: "PS5 + 2 Controller + 3 Spiele", price: 470 });
  ads.push({ id: 201, title: "PS5 Disc Top", price: 180 }); // suspicious cheap
  ads.push({ id: 202, title: "PS5 defekt startet nicht", price: 150 }); // defect
  ads.push({ id: 203, title: "PS5 Controller DualSense", price: 45 }); // accessory, rules
  ads.push({ id: 204, title: "PS5 Karton leer", price: 120 }); // AI says not relevant
  for (let i = 0; ads.length < 70; i++) ads.push({ id: 300 + i, title: `FIFA 2${i % 10} PS4 Spiel`, price: 10 });
  return ads;
}

function setup(opts: { plan?: "free" | "pro"; ads?: FakeAd[] } = {}) {
  const repo = memRepo();
  const user = seedUser(repo, 1, opts.plan ?? "pro");
  const watch = seedWatch(repo, 1, { profile: PS5_PROFILE });
  const http = pages(opts.ads ?? market());
  const f = batchLlm((t) =>
    t.includes("leer") ? { relevant: false, note: "пустая коробка" } : t.includes("+ 2 Controller") ? { bundle: ["2 Controller", "3 Spiele"] } : {},
  );
  const scan = new ScanService(repo, http.get, new BatchClassifier(repo, f.llm));
  return { repo, user, watch, http, scan, calls: f.calls };
}

describe("ScanService", () => {
  it("reads every page, filters, scores against the real median, highlights the deals", async () => {
    const s = setup();
    const progress: string[] = [];
    const r = await s.scan.run(s.user, s.watch, (p) => progress.push(p.stage));
    if (!r.ok) throw new Error(r.error);
    const rep = r.report;

    expect(rep.pages).toBe(3);
    expect(rep.total).toBe(70);
    expect(progress[0]).toBe("pages");
    expect(progress.at(-1)).toBe("done");

    // median over working, non-suspicious consoles only (defect excluded, 180 € included as AI did not flag it)
    expect(rep.stats?.median).toBeGreaterThanOrEqual(470);
    expect(rep.stats?.median).toBeLessThanOrEqual(500);

    const byId = (id: string) => rep.items.find((i) => i.listing.id === id);
    expect(byId("201")!.deal.tags).toContain("suspicious");
    expect(byId("202")!.deal.tags).toEqual(["defect"]);
    // broken units go to their own list, never to the main highlights
    expect(rep.highlights.map((h) => h.listing.id)).not.toContain("202");
    expect(rep.flips.map((f) => f.listing.id)).toEqual(["202"]);
    expect(byId("200")!.deal.tags).toContain("bundle");
    expect(byId("203")).toBeUndefined(); // lone controller: rules
    expect(rep.aiDropped.map((d) => d.listing.id)).toEqual(["204"]);

    // highlights: real deals only, never the suspicious one
    expect(rep.highlights.map((h) => h.listing.id)).toContain("100"); // 380 €
    expect(rep.highlights.map((h) => h.listing.id)).not.toContain("201");
    expect(rep.items[0]!.deal.score).toBeGreaterThanOrEqual(rep.items.at(-1)!.deal.score ?? 0);
    expect(rep.items[0]!.deal.tags).not.toContain("defect");

    // one AI call per batch of 20, not per listing
    expect(s.calls.length).toBe(Math.ceil((rep.items.length + rep.aiDropped.length) / BATCH_SIZE));
    // market stored for live notifications
    expect(s.repo.getWatch(s.watch.id)!.market?.median).toBe(rep.stats!.median);
  });

  it("caches verdicts: a second scan does not call the AI again", async () => {
    const s = setup();
    await s.scan.run(s.user, s.watch);
    const first = s.calls.length;
    await s.scan.run(s.user, s.watch);
    expect(s.calls.length).toBe(first);
  });

  it("respects the plan: page limit and daily scans", async () => {
    const s = setup({ plan: "free", ads: Array.from({ length: 300 }, (_, i) => ({ id: i + 1, title: `PS5 #${i}`, price: 400 + (i % 50) })) });
    const r = await s.scan.run(s.user, s.watch);
    if (!r.ok) throw new Error(r.error);
    expect(r.report.pages).toBe(PLANS.free.scanPages);
    expect(r.report.pageLimitHit).toBe(true);
    for (let i = 1; i < PLANS.free.scansPerDay; i++) await s.scan.run(s.user, s.watch);
    expect(await s.scan.run(s.user, s.watch)).toEqual({ ok: false, error: "limit" });
  });

  it("stops when the site ignores the page parameter (same page served again)", async () => {
    const repo = memRepo();
    const user = seedUser(repo, 1, "pro");
    const watch = seedWatch(repo, 1, { profile: { ...PS5_PROFILE, useAi: false } });
    const same = willhabenHtml(Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: `PS5 #${i}`, price: 400 })));
    const http = fakeHttp(() => same);
    const r = await new ScanService(repo, http.get, new BatchClassifier(repo, null)).run(user, watch);
    if (!r.ok) throw new Error(r.error);
    expect(http.calls).toHaveLength(2);
    expect(r.report.total).toBe(30);
  });

  it("works without AI: rules + statistics only", async () => {
    const repo = memRepo();
    const user = seedUser(repo, 1, "pro");
    const watch = seedWatch(repo, 1, { profile: PS5_PROFILE });
    const r = await new ScanService(repo, pages(market()).get, new BatchClassifier(repo, null)).run(user, watch);
    if (!r.ok) throw new Error(r.error);
    expect(r.report.aiChecked).toBe(0);
    expect(r.report.stats).not.toBeNull();
    expect(r.report.items.every((i) => i.verdict === null)).toBe(true);
  });

  it("never recommends listings the AI did not check (VR glasses on top of the live PS5 report)", async () => {
    const repo = memRepo();
    const user = seedUser(repo, 1, "pro");
    const watch = seedWatch(repo, 1, { profile: PS5_PROFILE });
    for (let i = 0; i < PLANS.pro.aiPerDay; i++) repo.takeAiCall(1, PLANS.pro.aiPerDay); // budget gone
    const { llm } = fakeLlm(() => "unused");
    const r = await new ScanService(repo, pages(market()).get, new BatchClassifier(repo, llm)).run(user, watch);
    if (!r.ok) throw new Error(r.error);
    expect(r.report.aiUnchecked).toBe(r.report.items.length);
    expect(r.report.highlights).toEqual([]);
    expect(r.report.items.length).toBeGreaterThan(0); // still listed, just not recommended
  });

  it("survives a broken batch reply and reports what was not checked", async () => {
    const repo = memRepo();
    const user = seedUser(repo, 1, "pro");
    const watch = seedWatch(repo, 1, { profile: PS5_PROFILE });
    const { llm } = fakeLlm(() => "sorry, no");
    const r = await new ScanService(repo, pages(market()).get, new BatchClassifier(repo, llm)).run(user, watch);
    if (!r.ok) throw new Error(r.error);
    expect(r.report.aiUnchecked).toBe(r.report.items.length);
  });

  it("reports a site error instead of throwing", async () => {
    const repo = memRepo();
    const user = seedUser(repo, 1, "pro");
    const watch = seedWatch(repo, 1);
    const http = fakeHttp(() => {
      throw new Error("HTTP 503");
    });
    expect(await new ScanService(repo, http.get, new BatchClassifier(repo, null)).run(user, watch)).toEqual({
      ok: false,
      error: "fetch_failed",
      detail: "HTTP 503",
    });
  });
});

describe("HTML report", () => {
  it("is self-contained, escapes listing data and drops non-http links", async () => {
    const s = setup({
      ads: [
        { id: 1, title: 'PS5 <script>alert(1)</script>', price: 400 },
        { id: 2, title: "PS5 normal", price: 450, image: "javascript:alert(1)" },
        { id: 3, title: "PS5 drei", price: 500 },
      ],
    });
    const r = await s.scan.run(s.user, s.watch);
    if (!r.ok) throw new Error(r.error);
    // the report itself must refuse non-http links, whatever the adapter produced
    r.report.items[0]!.listing.url = "javascript:alert(1)";
    r.report.items[0]!.listing.image = "javascript:alert(2)";
    const html = renderReport(r.report, "ru");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toMatch(/(href|src)="javascript:/i);
    expect(html).not.toMatch(/<script src=|<link rel="stylesheet"/); // no external resources
    expect(html).toContain("Медиана");
    expect(html).toContain("медиана приблизительная"); // 3 listings < RELIABLE_N
    // iOS Telegram preview runs no JS: filters are hidden until the script marks the page, with a hint instead
    expect(html).toMatch(/\.chips\{display:none/);
    expect(html).toContain('class="nojs"');
    expect(html).toContain("documentElement.className+=' js'");
    // as a Telegram Mini App it takes the theme from the URL hash and asks to expand
    expect(html).toContain("tgWebAppThemeParams");
    expect(html).toContain("web_app_expand");
    // the same report for a German user carries no Russian
    const de = renderReport(r.report, "de");
    expect(de).toContain('<html lang="de">');
    expect(de).toContain("Median");
    expect(de.replace(/<td>.*?<\/td>/gs, "")).not.toMatch(/[А-Яа-яЁё]/);
  });
});

describe("migration v1 -> v2", () => {
  it("upgrades an existing v1 database without losing watches", () => {
    const path = join(mkdtempSync(join(tmpdir(), "dr-")), "db.sqlite");
    const v1 = new Database(path);
    v1.exec(MIGRATIONS[0]!);
    v1.pragma("user_version = 1");
    v1.prepare("INSERT INTO users (id, chat_id, plan, created_at) VALUES (1, 1, 'free', 0)").run();
    v1.prepare(
      "INSERT INTO watches (user_id, name, query_json, profile_json, interval_sec, next_run_at, created_at) VALUES (1, 'old', '{}', '{}', 300, 0, 0)",
    ).run();
    v1.close();

    const db = openDb(path);
    expect(db.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
    const repo = new Repo(db);
    expect(repo.listWatches(1)[0]).toMatchObject({ name: "old", market: null });
    repo.setMarket(1, { n: 3, median: 400, p25: 350, p75: 450, min: 300, max: 500, at: 0 });
    expect(repo.getWatch(1)!.market?.median).toBe(400);
    db.close();
  });
});
