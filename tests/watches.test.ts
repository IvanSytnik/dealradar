import { describe, expect, it } from "vitest";
import { BatchClassifier } from "../src/ai/batch.js";
import { PLANS } from "../src/core/plans.js";
import { PREVIEW_AI_MAX, WatchService } from "../src/services/watches.js";
import { fakeHttp, fakeLlm, memRepo, seedUser, willhabenHtml } from "./helpers.js";

const URL1 = "https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=xbox+series+s&areaId=6&sfId=abc";
const page = willhabenHtml([
  { id: 1, title: "Xbox Series S 512GB", price: 180 },
  { id: 2, title: "Xbox Series S Controller", price: 30 },
  { id: 3, title: "Suche Xbox Series S", price: 150 },
]);

function setup(opts: { llm?: ReturnType<typeof fakeLlm>["llm"] | null; page?: string | null } = {}) {
  const repo = memRepo();
  const http = fakeHttp(() => {
    if (opts.page === null) throw new Error("HTTP 503 for www.willhaben.at");
    return opts.page ?? page;
  });
  const svc = new WatchService(repo, http.get, opts.llm ?? null);
  return { repo, http, svc };
}

describe("WatchService.create", () => {
  it("creates a seeded watch from a pasted link and returns a preview", async () => {
    const { repo, svc, http } = setup();
    const user = seedUser(repo);
    const r = await svc.create(user, `вот ссылка ${URL1}`);
    if (!r.ok) throw new Error(r.error);

    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]).toContain("sort=1");
    expect(r.watch).toMatchObject({ seeded: true, name: "xbox series s", intervalSec: PLANS.free.minIntervalSec });
    expect(r.profileSource).toBe("fallback");
    expect(r.preview.total).toBe(3);
    // generic lexicon drops the lone controller and the wanted ad even without an AI profile
    expect(r.preview.passed.map((p) => p.listing.id)).toEqual(["1"]);
    expect(repo.checkSeen(r.watch.id, "1", 180).status).toBe("seen");
  });

  it("creates from plain text on the default site", async () => {
    const { repo, svc, http } = setup();
    const r = await svc.create(seedUser(repo), "ps5 digital");
    expect(r.ok).toBe(true);
    expect(new URL(http.calls[0]!).searchParams.get("keyword")).toBe("ps5 digital");
  });

  it("uses the AI profile when a model is available", async () => {
    const { llm } = fakeLlm(() =>
      JSON.stringify({ item: "Xbox Series S", must_any: [["series", "s"]], exclude: [], accessory_words: ["controller"], price_min: 60, price_max: 260 }),
    );
    const { repo, svc } = setup({ llm });
    const r = await svc.create(seedUser(repo), URL1);
    if (!r.ok) throw new Error(r.error);
    expect(r.profileSource).toBe("ai");
    expect(r.preview.passed.map((p) => p.listing.id)).toEqual(["1"]);
  });

  it("screens the preview with ONE batched AI call instead of one per listing (the Free budget drain)", async () => {
    const ai = JSON.stringify({ item: "Xbox Series S", must_any: [["series", "s"]], exclude: [], accessory_words: [], price_min: null, price_max: null });
    const { llm, calls } = fakeLlm((u, sys) =>
      sys.includes("configure")
        ? ai
        : JSON.stringify({
            items: [...u.matchAll(/^\[(\d+)\] (.*?) \|/gm)].map((m) => ({
              i: Number(m[1]),
              relevant: !m[2]!.includes("Karton"),
              condition: "good",
              bundle: [],
              suspicious: false,
              note: m[2]!.includes("Karton") ? "пустая коробка" : "",
            })),
          }),
    );
    const ads = [
      { id: 1, title: "Xbox Series S 512GB", price: 180 },
      { id: 2, title: "Xbox Series S Karton", price: 90 },
      ...Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, title: `Xbox Series S #${i}`, price: 150 })),
    ];
    const repo = memRepo();
    const http = fakeHttp(() => willhabenHtml(ads));
    const svc = new WatchService(repo, http.get, llm, Date.now, new BatchClassifier(repo, llm));
    const r = await svc.create(seedUser(repo), URL1);
    if (!r.ok) throw new Error(r.error);
    expect(r.preview.aiChecked).toBe(14);
    expect(r.preview.aiDropped.map((d) => [d.listing.id, d.reason])).toEqual([["2", "пустая коробка"]]);
    expect(r.preview.passed).toHaveLength(13);
    expect(calls.filter((c) => !c.system.includes("configure"))).toHaveLength(1);
    expect(PREVIEW_AI_MAX).toBeGreaterThanOrEqual(30);
  });

  it("rejects duplicates, foreign sites, single ads and over-limit", async () => {
    const { repo, svc } = setup();
    const user = seedUser(repo);
    expect((await svc.create(user, URL1)).ok).toBe(true);
    expect(await svc.create(user, URL1)).toMatchObject({ ok: false, error: "duplicate" });
    expect(await svc.create(user, "https://www.avito.ru/moskva?q=ps5")).toMatchObject({ ok: false, error: "unsupported_site" });
    expect(await svc.create(user, "https://www.willhaben.at/iad/kaufen-und-verkaufen/d/xbox-1234/")).toMatchObject({
      ok: false,
      error: "bad_url",
    });
    await svc.create(user, "a1 b");
    await svc.create(user, "a2 b");
    expect(await svc.create(user, "a3 b")).toMatchObject({ ok: false, error: "limit" });
  });

  it("does not create anything when the site is down", async () => {
    const { repo, svc } = setup({ page: null });
    const user = seedUser(repo);
    expect(await svc.create(user, URL1)).toMatchObject({ ok: false, error: "fetch_failed" });
    expect(repo.countWatches(user.id)).toBe(0);
  });
});

describe("WatchService edits", () => {
  async function withWatch() {
    const s = setup();
    const user = seedUser(s.repo);
    const r = await s.svc.create(user, URL1);
    if (!r.ok) throw new Error(r.error);
    return { ...s, user, id: r.watch.id };
  }

  it("price, swapped if reversed", async () => {
    const { svc, user, id } = await withWatch();
    expect(svc.setPrice(user, id, 300, 100)!.profile).toMatchObject({ priceMin: 100, priceMax: 300 });
  });

  it("exclude / unexclude normalise words and dedupe", async () => {
    const { svc, user, id } = await withWatch();
    svc.addExclude(user, id, ["Hülle", "huelle", "Spiel"]);
    expect(svc.removeExclude(user, id, ["SPIEL"])!.profile.exclude).toEqual(["huelle"]);
  });

  it("match groups", async () => {
    const { svc, user, id } = await withWatch();
    expect(svc.setMatch(user, id, "Series S | xbox-s | | XSS")!.profile.mustAny).toEqual([["series", "s"], ["xbox", "s"], ["xss"]]);
  });

  it("score is clamped, toggles flip, interval respects the plan", async () => {
    const { svc, user, id } = await withWatch();
    expect(svc.setMinScore(user, id, 42)!.profile.minScore).toBe(10);
    expect(svc.toggle(user, id, "allowDefect")!.profile.allowDefect).toBe(false);
    expect(svc.setInterval(user, id, 30)!.intervalSec).toBe(PLANS.free.minIntervalSec);
    expect(svc.setActive(user, id, false)!.active).toBe(false);
    expect(svc.rename(user, id, "   ")!.name).toBe("watch");
  });

  it("nobody can edit someone else's watch", async () => {
    const { repo, svc, id } = await withWatch();
    const intruder = seedUser(repo, 2);
    expect(svc.setPrice(intruder, id, 1, 2)).toBeNull();
    expect(svc.setActive(intruder, id, false)).toBeNull();
    expect(svc.delete(intruder, id)).toBe(false);
  });
});
