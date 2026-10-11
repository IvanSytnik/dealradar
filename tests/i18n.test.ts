import { describe, expect, it } from "vitest";
import { detectLang, LANGS, t, type Dict } from "../src/i18n/index.js";
import { profileSummary, helpText, HELP_TOPICS } from "../src/bot/format.js";
import { memRepo, seedWatch, seedUser } from "./helpers.js";

/** Calls every function with plausible arguments so the rendered text can be checked. */
function render(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (typeof v === "function") {
    const fn = v as (...a: unknown[]) => unknown;
    const plan = { watches: 3, interval: "5 min", ai: 50, scans: 2, pages: 5 };
    // helpPlan takes two plan objects; everything else is fine with numbers (also truthy for booleans)
    const out = String(v).includes("free.watches") ? fn(plan, plan) : fn(...Array.from({ length: v.length }, () => 3));
    return [String(out)];
  }
  if (v && typeof v === "object") return Object.values(v).flatMap(render);
  return [];
}

function shape(v: unknown): unknown {
  if (typeof v === "function") return `fn/${v.length}`;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return typeof v;
}

const TELEGRAM_TAGS = new Set(["b", "i", "s", "code", "a"]);

describe("i18n", () => {
  it("picks the language from Telegram's locale", () => {
    expect(detectLang("de")).toBe("de");
    expect(detectLang("de-AT")).toBe("de");
    expect(detectLang("uk")).toBe("uk");
    expect(detectLang("ru")).toBe("ru");
    expect(detectLang("be")).toBe("ru");
    expect(detectLang("fr")).toBe("en");
    expect(detectLang(undefined)).toBe("en");
  });

  it("every locale has exactly the keys and arities of the reference", () => {
    const ref = shape(t("ru"));
    for (const l of LANGS) expect(shape(t(l)), l).toEqual(ref);
  });

  it.each(LANGS)("%s: Telegram HTML is balanced and uses only supported tags", (l) => {
    for (const text of render(t(l))) {
      const tags = [...text.matchAll(/<(\/?)([a-z]+)[^>]*>/g)];
      const stack: string[] = [];
      for (const [, close, name] of tags) {
        expect(TELEGRAM_TAGS.has(name!), `${l}: <${name}> in ${text.slice(0, 60)}`).toBe(true);
        if (close) expect(stack.pop(), `${l}: unbalanced in ${text.slice(0, 80)}`).toBe(name);
        else stack.push(name!);
      }
      expect(stack, `${l}: unclosed in ${text.slice(0, 80)}`).toEqual([]);
      expect(text).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it.each(["de", "en"] as const)("%s has no Cyrillic left over", (l) => {
    for (const text of render(t(l))) expect(text, text.slice(0, 80)).not.toMatch(/[А-Яа-яЁёІіЇїЄє]/);
  });

  it("bot profile texts fit Telegram's limits", () => {
    for (const l of LANGS) {
      const T = t(l);
      expect([...T.botShortDescription].length, l).toBeLessThanOrEqual(120);
      expect([...T.botDescription].length, l).toBeLessThanOrEqual(512);
    }
  });

  it("button labels are short enough not to be cut on a phone (two per row)", () => {
    for (const l of LANGS) {
      const T = t(l);
      for (const label of [T.btnHowLink, T.btnWhatCan, ...Object.values(T.helpLabels), T.btnSettings, T.btnScan, T.btnPreview, T.btnWords]) {
        expect([...label].length, `${l}: ${label}`).toBeLessThanOrEqual(20);
      }
    }
  });

  it("help and the card render in every language", () => {
    const repo = memRepo();
    seedUser(repo);
    const w = seedWatch(repo, 1);
    for (const l of LANGS) {
      const T: Dict = t(l);
      expect(profileSummary(T, w)).toContain(T.openSearch);
      for (const topic of HELP_TOPICS) expect(helpText(T, topic).length).toBeGreaterThan(50);
    }
    expect(profileSummary(t("de"), w)).toMatch(/Alle 5 Min\./);
  });
});

describe("user language", () => {
  it("follows the Telegram locale until the user picks one", () => {
    const repo = memRepo();
    expect(repo.upsertUser(1, 1, "a", "free", "de").lang).toBe("de");
    expect(repo.upsertUser(1, 1, "a", "free", "en").lang).toBe("en"); // changed the app language
    repo.setLang(1, "uk");
    expect(repo.upsertUser(1, 1, "a", "free", "de").lang).toBe("uk"); // explicit choice sticks
  });
});
