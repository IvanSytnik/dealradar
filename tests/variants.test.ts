import { describe, expect, it } from "vitest";
import { BatchClassifier } from "../src/ai/batch.js";
import { buildProfile } from "../src/ai/profile.js";
import { listingText, profileSummary, scanSummaryText } from "../src/bot/format.js";
import { matchVariant, sanitizeVariants, variantLabel, VARIANT_MIN_N } from "../src/core/variants.js";
import { t } from "../src/i18n/index.js";
import { renderReport } from "../src/report/html.js";
import { ScanService } from "../src/services/scan.js";
import { fakeHttp, fakeLlm, listing, memRepo, query, seedUser, seedWatch, willhabenHtml, XBOX_PROFILE, type FakeAd } from "./helpers.js";

const RU = t("ru");
const PS5 = ["standard", "digital", "slim", "slim digital", "pro"];
const PROFILE = { ...XBOX_PROFILE, item: "PS5", mustAny: [["ps5"]], exclude: [], accessoryWords: [], priceMin: null, priceMax: null, useAi: true };

describe("variant names", () => {
  it("keeps 2-6 distinct short names, drops junk and a single variant", () => {
    expect(sanitizeVariants(["Standard", "PRO", "pro", "", 5, "other", "Slim Digital"])).toEqual(["standard", "pro", "slim digital"]);
    expect(sanitizeVariants(["pro"])).toEqual([]);
    expect(sanitizeVariants(["a", "b", "c", "d", "e", "f", "g", "h"])).toHaveLength(6);
  });

  it("maps the model's answer onto the list, longest name first", () => {
    expect(matchVariant("pro", PS5)).toBe("pro");
    expect(matchVariant("PS5 Pro", PS5)).toBe("pro");
    expect(matchVariant("Slim Digital Edition", PS5)).toBe("slim digital");
    expect(matchVariant("slim", PS5)).toBe("slim");
    expect(matchVariant("xbox", PS5)).toBeNull();
    expect(matchVariant(null, PS5)).toBeNull();
    expect(matchVariant("pro", undefined)).toBeNull();
  });

  it("labels in title case", () => {
    expect(variantLabel("slim digital")).toBe("Slim Digital");
  });
});

describe("profile", () => {
  it("takes the variants from the AI profile", async () => {
    const f = fakeLlm(() =>
      JSON.stringify({ item: "PS5", must_any: [["ps5"]], exclude: ["ps4"], accessory_words: [], price_min: 150, price_max: 700, variants: ["Standard", "Digital", "Pro"] }),
    );
    const { profile } = await buildProfile({ ...query(), keyword: "ps5" }, f.llm);
    expect(profile.variants).toEqual(["standard", "digital", "pro"]);
  });
});

/** Batch fake that names the model from the title, like the real AI does. */
function variantLlm() {
  return fakeLlm((user, system) => {
    if (system.startsWith("A buyer searches")) return JSON.stringify({ variants: PS5 });
    const items = [...user.matchAll(/^\[(\d+)\] (.*?) \|/gm)].map((m) => {
      const title = m[2]!.toLowerCase();
      const variant = title.includes("pro") ? "PS5 Pro" : title.includes("digital") ? "digital" : title.includes("disc") ? "standard" : null;
      return { i: Number(m[1]), relevant: true, condition: "good", bundle: [], suspicious: false, note: "ok", variant };
    });
    return JSON.stringify({ items });
  });
}

function ads(): FakeAd[] {
  const out: FakeAd[] = [];
  [520, 540, 550, 550, 560, 580, 600].forEach((p, i) => out.push({ id: 100 + i, title: `PS5 Disc #${i}`, price: p }));
  [1150, 1200, 1250, 1250, 1300, 1350].forEach((p, i) => out.push({ id: 200 + i, title: `PS5 Pro #${i}`, price: p }));
  out.push({ id: 300, title: "PS5 Pro Neu", price: 950 }); // cheap for a Pro, expensive for a PS5
  [450, 480].forEach((p, i) => out.push({ id: 400 + i, title: `PS5 Digital #${i}`, price: p })); // too few for their own median
  out.push({ id: 500, title: "Sony PS5 Konsole", price: 420 }); // model not stated
  return out;
}

function setup(variants?: string[]) {
  const repo = memRepo();
  const user = seedUser(repo, 1, "pro");
  const watch = seedWatch(repo, 1, { profile: { ...PROFILE, ...(variants ? { variants } : {}) } });
  const http = fakeHttp(() => willhabenHtml(ads()));
  const f = variantLlm();
  return { repo, user, watch, calls: f.calls, scan: new ScanService(repo, http.get, new BatchClassifier(repo, f.llm)) };
}

describe("scan by variant", () => {
  it("gives each variant its own median and scores listings against it", async () => {
    const s = setup(PS5);
    const r = await s.scan.run(s.user, s.watch);
    if (!r.ok) throw new Error(r.error);
    const rep = r.report;

    expect(rep.variants.map((v) => v.name)).toEqual(["standard", "pro"]);
    expect(rep.variants.find((v) => v.name === "standard")!.stats.median).toBe(550);
    expect(rep.variants.find((v) => v.name === "pro")!.stats.median).toBe(1250);
    expect(rep.variants.every((v) => v.stats.n >= VARIANT_MIN_N)).toBe(true);

    const cheapPro = rep.items.find((i) => i.listing.id === "300")!;
    expect(cheapPro.variant).toBe("pro");
    expect(cheapPro.deal.delta).toBeLessThan(-0.2);
    expect(cheapPro.deal.tags).toContain("cheap");
    expect(rep.highlights.map((h) => h.listing.id)).toContain("300");

    // two Digital listings: not enough for their own median, compared with the overall one
    const digital = rep.items.find((i) => i.listing.id === "400")!;
    expect(digital.variant).toBeNull();
    expect(digital.verdict?.variant).toBe("digital");

    // no model in the listing: compared with the cheapest model, not the Pro-inflated overall median
    const unnamed = rep.items.find((i) => i.listing.id === "500")!;
    expect(unnamed.verdict?.variant).toBeNull();
    expect(unnamed).toMatchObject({ variant: "standard", guessed: true });
    expect(unnamed.deal.delta).toBeCloseTo(420 / 550 - 1, 3);
    expect(rep.stats!.median).toBeGreaterThan(550);

    const stored = s.repo.getWatch(s.watch.id)!.market!;
    expect(stored.variants?.pro?.median).toBe(1250);

    const text = scanSummaryText(RU, rep);
    expect(text).toContain("По моделям: Standard 550 € (7) · Pro 1250 € (7)");
    expect(text).toMatch(/PS5 Pro Neu.*Pro: на \d+% дешевле/);

    const html = renderReport(rep, "en");
    expect(html).toContain("By model");
    expect(html).toContain('data-variant="pro"');
    expect(html).toContain('id="models"');
    expect(html).toContain("Digital (2)");
    expect(html).toContain('data-variant="?"');
    expect(html).toContain("Model not stated (1)");
    expect(html).toContain("Standard?");
  });

  it("asks once for the variants of an older watch and keeps them", async () => {
    const s = setup();
    expect(s.watch.profile.variants).toBeUndefined();
    await s.scan.run(s.user, s.watch);
    expect(s.repo.getWatch(s.watch.id)!.profile.variants).toEqual(PS5);
    const asked = () => s.calls.filter((c) => c.system.startsWith("A buyer searches")).length;
    expect(asked()).toBe(1);
    await s.scan.run(s.user, s.watch); // stale copy: still not asked again
    expect(asked()).toBe(1);
  });

  it("without variants there is one median and no model line", async () => {
    const s = setup([]);
    const r = await s.scan.run(s.user, s.watch);
    if (!r.ok) throw new Error(r.error);
    expect(r.report.variants).toEqual([]);
    expect(r.report.items.every((i) => i.variant === null)).toBe(true);
    expect(scanSummaryText(RU, r.report)).not.toContain("По моделям");
    expect(renderReport(r.report, "ru")).not.toContain('id="models"');
  });

  it("live notifications and the card use the variant median", async () => {
    const s = setup(PS5);
    await s.scan.run(s.user, s.watch);
    const w = s.repo.getWatch(s.watch.id)!;
    const verdict = { relevant: true, condition: "good" as const, bundle: [], score: 8, reason: "", variant: "pro" };
    const text = listingText(RU, w, listing({ id: "9", title: "PS5 Pro", price: 1000 }), { defect: false, verdict, oldPrice: null });
    expect(text).toContain("на 20% дешевле медианы (медиана Pro: 1250 €)");
    const plain = listingText(RU, w, listing({ id: "9", title: "PS5", price: 1000 }), { defect: false, verdict: { ...verdict, variant: null }, oldPrice: null });
    expect(plain).not.toContain("Pro:");
    expect(plain).toContain("(медиана Standard?: 550 €)");
    expect(profileSummary(RU, w)).toContain("🧩 По моделям: Standard 550 € · Pro 1250 €");
  });
});
