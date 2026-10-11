import { describe, expect, it } from "vitest";
import { HEALTH_REALERT_MS, HealthMonitor } from "../src/services/health.js";
import { clock } from "./helpers.js";

function setup() {
  const c = clock();
  const alerts: string[] = [];
  const h = new HealthMonitor(async (t) => void alerts.push(t), c.now);
  const feed = async (n: number, url: (i: number) => string, count: number | null, error?: string) => {
    for (let i = 0; i < n; i++) await h.record({ site: "willhaben", url: url(i), count, error });
  };
  return { c, alerts, feed };
}

describe("HealthMonitor", () => {
  it("alerts once when many different searches come back broken", async () => {
    const s = setup();
    await s.feed(10, (i) => `u${i % 3}`, null, "__NEXT_DATA__ not found (layout changed or bot protection)");
    expect(s.alerts).toHaveLength(1);
    expect(s.alerts[0]).toMatch(/парсер, похоже, сломан/);
    expect(s.alerts[0]).toContain("__NEXT_DATA__ not found");
  });

  it("stays quiet for one search that simply has no results", async () => {
    const s = setup();
    await s.feed(20, () => "rare-item", 0);
    await s.feed(5, (i) => `ok${i}`, 30);
    expect(s.alerts).toHaveLength(0);
  });

  it("stays quiet when only some searches fail", async () => {
    const s = setup();
    for (let i = 0; i < 20; i++) await s.feed(1, () => `u${i % 4}`, i % 3 === 0 ? null : 30);
    expect(s.alerts).toHaveLength(0);
  });

  it("reports recovery, and repeats a lasting outage only after the cooldown", async () => {
    const s = setup();
    await s.feed(10, (i) => `u${i % 2}`, 0);
    await s.feed(10, (i) => `u${i % 2}`, 0);
    expect(s.alerts).toHaveLength(1); // no spam while it stays broken
    s.c.advance(HEALTH_REALERT_MS);
    await s.feed(1, () => "u0", 0);
    expect(s.alerts).toHaveLength(2);
    await s.feed(20, (i) => `u${i % 2}`, 30);
    expect(s.alerts.at(-1)).toMatch(/снова работает/);
    expect(s.alerts).toHaveLength(3);
  });
});
