import { t as dict } from "../src/i18n/index.js";
import { describe, expect, it } from "vitest";
import { marketStats, pct, quantile, scoreDeal } from "../src/core/market.js";

// PS5 prices from the live preview on 2026-10-10
const PS5 = [450, 500, 540, 460, 550, 380, 1300];

describe("marketStats", () => {
  it("computes robust stats; one 1300 € outlier does not move the median", () => {
    const m = marketStats(PS5, 0)!;
    expect(m).toMatchObject({ n: 7, median: 500, min: 380, max: 1300 });
    expect(m.p25).toBe(455);
    expect(m.p75).toBe(545);
  });

  it("needs at least 3 prices", () => {
    expect(marketStats([100, 200], 0)).toBeNull();
    expect(marketStats([0, -1, NaN, 100, 200], 0)).toBeNull();
  });

  it("quantile interpolates", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(() => quantile([], 0.5)).toThrow();
  });
});

describe("scoreDeal", () => {
  const m = marketStats(PS5, 0)!; // median 500

  it.each([
    [500, 0, 5, []],
    [400, 0, 7, ["cheap"]],
    [330, 0, 8, ["very_cheap"]],
    [650, 0, 2, ["expensive"]],
    [500, 2, 6, ["bundle"]],
  ])("%s € with %s extras -> %s", (price, bundleItems, score, tags) => {
    const r = scoreDeal({ price, bundleItems, defect: false, suspicious: false }, m);
    expect(r.score).toBe(score);
    expect(r.tags).toEqual(tags);
  });

  it("too cheap is suspicious, not a deal", () => {
    const r = scoreDeal({ price: 150, bundleItems: 0, defect: false, suspicious: false }, m);
    expect(r.tags).toContain("suspicious");
    expect(r.score).toBeLessThanOrEqual(3);
    expect(scoreDeal({ price: 450, bundleItems: 0, defect: false, suspicious: true }, m).score).toBeLessThanOrEqual(3);
  });

  it("a defect unit is scored against defect prices and capped (the 140 € = 10/10 bug)", () => {
    const cheap = scoreDeal({ price: 140, bundleItems: 0, defect: true, suspicious: false }, m); // ref = 200
    expect(cheap.tags).toEqual(["defect"]); // not "suspicious", not "cheaper than market"
    expect(cheap.score).toBe(7);
    expect(scoreDeal({ price: 250, bundleItems: 0, defect: true, suspicious: false }, m).score).toBe(3);
  });

  it("no price or no market -> no score", () => {
    expect(scoreDeal({ price: null, bundleItems: 0, defect: false, suspicious: false }, m)).toEqual({ score: null, tags: ["no_price"], delta: null });
    expect(scoreDeal({ price: 400, bundleItems: 0, defect: false, suspicious: false }, null).score).toBeNull();
  });

  it("pct wording", () => {
    expect(pct(-0.18, dict("ru"))).toBe("на 18% дешевле медианы");
    expect(pct(0.1, dict("ru"))).toBe("на 10% дороже медианы");
    expect(pct(0.001, dict("ru"))).toBe("по медиане");
  });
});
