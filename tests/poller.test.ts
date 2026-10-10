import { describe, expect, it } from "vitest";
import { Classifier } from "../src/ai/classifier.js";
import { FAILURE_ALERT_AT, MAX_NOTIFY_PER_RUN, MAX_PAGES, Poller } from "../src/services/poller.js";
import { RecipientGoneError } from "../src/services/notifier.js";
import { clock, fakeHttp, fakeLlm, memRepo, query, RecordingNotifier, seedUser, seedWatch, willhabenHtml, XBOX_PROFILE, type FakeAd } from "./helpers.js";

function setup(opts: { ads?: FakeAd[]; llm?: ReturnType<typeof fakeLlm>["llm"] } = {}) {
  const c = clock();
  const repo = memRepo(c.now);
  let ads: FakeAd[] = opts.ads ?? [];
  let down = false;
  const http = fakeHttp(() => {
    if (down) throw new Error("HTTP 503");
    return willhabenHtml(ads);
  });
  const notifier = new RecordingNotifier();
  const poller = new Poller(repo, http.get, new Classifier(repo, opts.llm ?? null), notifier, c.now);
  return {
    c,
    repo,
    http,
    notifier,
    poller,
    setAds: (a: FakeAd[]) => (ads = a),
    setDown: (d: boolean) => (down = d),
    /** move time past every watch's next run */
    later: () => c.advance(10 * 3600_000),
  };
}

const xbox = (id: number, title = "Xbox Series S 512GB", price = 180): FakeAd => ({ id, title, price });

describe("Poller", () => {
  it("first run of an unseeded watch only memorises listings", async () => {
    const s = setup({ ads: [xbox(1), xbox(2)] });
    seedUser(s.repo);
    const w = seedWatch(s.repo, 1, { seeded: false });
    await s.poller.tick();
    expect(s.notifier.listings).toHaveLength(0);
    expect(s.repo.getWatch(w.id)!.seeded).toBe(true);
  });

  it("notifies about new relevant listings only, oldest first", async () => {
    const s = setup({ ads: [xbox(1)] });
    seedUser(s.repo);
    seedWatch(s.repo, 1, { seeded: false });
    await s.poller.tick();

    // newest first, like the site
    s.setAds([xbox(4, "Xbox Series S Hülle", 15), xbox(3, "Xbox Series S weiß"), xbox(2), xbox(1)]);
    s.later();
    const stats = await s.poller.tick();
    expect(stats.notified).toBe(2);
    expect(s.notifier.listings.map((n) => n.listing.id)).toEqual(["2", "3"]);

    s.later();
    await s.poller.tick();
    expect(s.notifier.listings).toHaveLength(2); // nothing new
  });

  it("re-notifies on a price drop with the old price", async () => {
    const s = setup({ ads: [xbox(1, undefined, 200)] });
    seedUser(s.repo);
    seedWatch(s.repo, 1, { seeded: false });
    await s.poller.tick();
    s.setAds([xbox(1, undefined, 160)]);
    s.later();
    await s.poller.tick();
    expect(s.notifier.listings[0]!.info.oldPrice).toBe(200);
  });

  it("does not poll before the watch is due", async () => {
    const s = setup({ ads: [xbox(1)] });
    seedUser(s.repo);
    seedWatch(s.repo, 1);
    await s.poller.tick();
    await s.poller.tick();
    expect(s.http.calls).toHaveLength(1);
  });

  it("shares one request between watches with the same URL, per-user dedupe stays separate", async () => {
    const s = setup({ ads: [] });
    seedUser(s.repo, 1);
    seedUser(s.repo, 2);
    seedWatch(s.repo, 1);
    seedWatch(s.repo, 2);
    seedWatch(s.repo, 2, {
      q: query("https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=ps5&sort=1"),
      profile: { ...XBOX_PROFILE, mustAny: [["ps5"]] },
    });
    s.setAds([xbox(9)]);
    const stats = await s.poller.tick();
    expect(stats.fetches).toBe(2);
    expect(s.notifier.listings.map((n) => n.user.id).sort()).toEqual([1, 2]);
  });

  it("caps notifications per run and sends a summary", async () => {
    const s = setup();
    seedUser(s.repo);
    seedWatch(s.repo, 1);
    s.setAds(Array.from({ length: MAX_NOTIFY_PER_RUN + 3 }, (_, i) => xbox(100 + i)));
    await s.poller.tick();
    expect(s.notifier.listings).toHaveLength(MAX_NOTIFY_PER_RUN);
    expect(s.notifier.texts[0]!.text).toMatch(/ещё 3/);
  });

  it("backs off on errors and alerts the user once", async () => {
    const s = setup();
    seedUser(s.repo);
    const w = seedWatch(s.repo, 1);
    s.setDown(true);
    const gaps: number[] = [];
    for (let i = 0; i < FAILURE_ALERT_AT + 1; i++) {
      await s.poller.tick();
      const cur = s.repo.getWatch(w.id)!;
      gaps.push(cur.nextRunAt - s.c.now());
      s.c.set(cur.nextRunAt);
    }
    expect(s.repo.getWatch(w.id)!.failures).toBe(FAILURE_ALERT_AT + 1);
    expect(gaps[1]!).toBeGreaterThan(gaps[0]!);
    expect(s.notifier.texts).toHaveLength(1);

    s.setDown(false);
    await s.poller.tick();
    expect(s.repo.getWatch(w.id)!.failures).toBe(0);
  });

  it("deactivates users who blocked the bot", async () => {
    const s = setup();
    seedUser(s.repo);
    const w = seedWatch(s.repo, 1);
    s.setAds([xbox(1)]);
    s.notifier.failWith = new RecipientGoneError("Forbidden: bot was blocked by the user");
    await s.poller.tick();
    expect(s.repo.getUser(1)!.blocked).toBe(true);
    expect(s.repo.getWatch(w.id)!.active).toBe(false);
  });

  it("keeps going when Telegram has a transient error", async () => {
    const s = setup();
    seedUser(s.repo);
    const w = seedWatch(s.repo, 1);
    s.setAds([xbox(1)]);
    s.notifier.failWith = new Error("429 Too Many Requests");
    await s.poller.tick();
    expect(s.repo.getWatch(w.id)!.nextRunAt).toBeGreaterThan(s.c.now());
  });
});

describe("Poller + AI", () => {
  const verdict = (relevant: boolean, score: number, condition = "good") =>
    JSON.stringify({ relevant, condition, bundle: [], score, reason: "тест" });

  it("drops irrelevant / low-score listings and attaches the verdict otherwise", async () => {
    const { llm, calls } = fakeLlm((u) => (u.includes("Karton") ? verdict(false, 1) : u.includes("teuer") ? verdict(true, 2) : verdict(true, 8)));
    const s = setup({ llm });
    seedUser(s.repo);
    seedWatch(s.repo, 1, { profile: { ...XBOX_PROFILE, useAi: true } });
    s.setAds([xbox(1, "Xbox Series S Karton"), xbox(2, "Xbox Series S teuer"), xbox(3)]);
    await s.poller.tick();
    expect(calls).toHaveLength(3);
    expect(s.notifier.listings.map((n) => n.listing.id)).toEqual(["3"]);
    expect(s.notifier.listings[0]!.info.verdict?.score).toBe(8);
  });

  it("rule-rejected listings never reach the AI", async () => {
    const { llm, calls } = fakeLlm(() => verdict(true, 9));
    const s = setup({ llm });
    seedUser(s.repo);
    seedWatch(s.repo, 1, { profile: { ...XBOX_PROFILE, useAi: true } });
    s.setAds([xbox(1, "Suche Xbox Series S"), xbox(2, "PS5")]);
    await s.poller.tick();
    expect(calls).toHaveLength(0);
  });

  it("drops AI-detected defects when the watch disallows them", async () => {
    const { llm } = fakeLlm(() => verdict(true, 7, "defect"));
    const s = setup({ llm });
    seedUser(s.repo);
    seedWatch(s.repo, 1, { profile: { ...XBOX_PROFILE, useAi: true, allowDefect: false } });
    s.setAds([xbox(1)]);
    await s.poller.tick();
    expect(s.notifier.listings).toHaveLength(0);
  });

  it("falls back to rules when the daily AI budget is used up", async () => {
    const { llm, calls } = fakeLlm(() => verdict(true, 9));
    const s = setup({ llm });
    seedUser(s.repo);
    seedWatch(s.repo, 1, { profile: { ...XBOX_PROFILE, useAi: true } });
    for (let i = 0; i < 50; i++) s.repo.takeAiCall(1, 50);
    s.setAds([xbox(1)]);
    await s.poller.tick();
    expect(calls).toHaveLength(0);
    expect(s.notifier.listings).toHaveLength(1);
    expect(s.notifier.listings[0]!.info.verdict).toBeNull();
  });
});

describe("Poller page catch-up", () => {
  const PAGE = 30;
  function pagedSetup() {
    const c = clock();
    const repo = memRepo(c.now);
    let pages: Record<number, FakeAd[]> = {};
    const http = fakeHttp((url) => willhabenHtml(pages[Number(new URL(url).searchParams.get("page") ?? "1")] ?? []));
    const notifier = new RecordingNotifier();
    const poller = new Poller(repo, http.get, new Classifier(repo, null), notifier, c.now);
    return { c, repo, http, notifier, poller, setPages: (p: Record<number, FakeAd[]>) => (pages = p) };
  }
  const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => xbox(from + i));

  it("fetches page 2 when page 1 is entirely new, stops at the first known listing", async () => {
    const s = pagedSetup();
    seedUser(s.repo);
    const w = seedWatch(s.repo, 1, { seeded: false });
    s.setPages({ 1: range(1, PAGE) });
    await s.poller.tick(); // seed with listings 1..30
    expect(s.http.calls).toHaveLength(1);

    // burst: 45 new listings (1000..1044) push the known ones down
    const burst = range(1000, 45);
    s.setPages({ 1: burst.slice(0, 30), 2: [...burst.slice(30), ...range(1, 15)], 3: range(16, 15) });
    s.c.set(s.repo.getWatch(w.id)!.nextRunAt);
    const stats = await s.poller.tick();
    expect(stats.pages).toBe(2); // page 2 already contains known listings -> no page 3
    expect(s.notifier.listings.map((n) => n.listing.id)).toHaveLength(10); // capped per run
    expect(s.notifier.texts.at(-1)!.text).toMatch(/ещё 35/);
  });

  it("does not paginate in normal operation", async () => {
    const s = pagedSetup();
    seedUser(s.repo);
    const w = seedWatch(s.repo, 1, { seeded: false });
    s.setPages({ 1: range(1, PAGE) });
    await s.poller.tick();
    s.setPages({ 1: [...range(500, 2), ...range(1, PAGE - 2)], 2: range(29, 2) });
    s.c.set(s.repo.getWatch(w.id)!.nextRunAt);
    const stats = await s.poller.tick();
    expect(stats.pages).toBe(1);
    expect(s.notifier.listings.map((n) => n.listing.id)).toEqual(["501", "500"]);
  });

  it("an unseeded watch only reads page 1, and the catch-up has a hard limit", async () => {
    const s = pagedSetup();
    seedUser(s.repo);
    seedWatch(s.repo, 1, { seeded: false });
    s.setPages({ 1: range(1, PAGE), 2: range(100, PAGE) });
    expect((await s.poller.tick()).pages).toBe(1);

    const s2 = pagedSetup();
    seedUser(s2.repo);
    seedWatch(s2.repo, 1);
    s2.setPages({ 1: range(1, PAGE), 2: range(100, PAGE), 3: range(200, PAGE), 4: range(300, PAGE), 5: range(400, PAGE) });
    expect((await s2.poller.tick()).pages).toBe(MAX_PAGES);
  });
});
