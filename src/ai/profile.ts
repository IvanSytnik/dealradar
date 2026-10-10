import { z } from "zod";
import { DEFECT_WORDS, GAME_WORDS, GENERIC_ACCESSORIES } from "../core/lexicon.js";
import { normalize, tokens } from "../core/normalize.js";
import { parsePrice } from "../core/price.js";
import type { FilterProfile, SearchQuery } from "../types.js";
import { logger } from "../logger.js";
import { extractJson, type Llm } from "./llm.js";

// Words that say nothing about the item; dropped from the fallback match groups
const STOP = new Set(["und", "oder", "mit", "fuer", "the", "and", "neu", "gebraucht", "ovp", "top", "zustand"]);

/**
 * Lenient on size (models over-deliver: 40+ words is a good answer, not a broken one),
 * strict on shape. Junk entries are dropped, long lists are truncated.
 */
const words = (max: number) =>
  z
    .array(z.unknown())
    .transform((a) =>
      a
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x.length > 0 && x.length <= 40)
        .slice(0, max),
    );

const price = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => parsePrice(v ?? null));

const aiProfileSchema = z.object({
  item: z.string().trim().min(2).transform((x) => x.slice(0, 120)),
  must_any: z
    .array(words(5))
    .transform((g) => g.filter((x) => x.length > 0).slice(0, 12))
    .refine((g) => g.length > 0, "must_any is empty"),
  // required: a reply without it means the model ignored the format
  exclude: words(80),
  accessory_words: words(40).default([]),
  price_min: price,
  price_max: price,
});

const SYSTEM = `You configure a listing filter for the Austrian marketplace Willhaben (German-language listings).
Given the user's search, return ONLY a JSON object:
{
 "item": "short English description of what the user most likely wants to buy",
 "must_any": [["word", "word"], ...],   // title must contain ALL words of AT LEAST ONE group. Cover common spellings and model aliases (e.g. [["series","s"],["xbox","s"],["xss"]]). Lowercase. Single words or short phrases.
 "exclude": ["..."],                      // German/English title words that mean it is NOT the item: other models of the same family, games, cases, covers, chargers, spare parts sold alone, empty boxes. Lowercase word stems are fine ("huelle" matches "huellen").
 "accessory_words": ["..."],               // accessories that are fine as part of a bundle but not alone (e.g. "controller" for a console). Lowercase.
 "price_min": number|null,                  // EUR. Below this it is almost certainly an accessory or a scam, roughly 35% of the typical used price.
 "price_max": number|null                   // EUR. Roughly 130% of the typical used price; null if unknowable.
}
Do not put words from must_any into exclude. Write umlauts as ae/oe/ue, ß as ss.
Anything that is often sold TOGETHER with the item (controllers, games, cables, cases, chargers) goes into accessory_words, never into exclude: "PS5 + 2 Controller" must still match.
Do not exclude defect words (defekt, bastler): the user decides about broken units separately.
price_min is the LOWER bound and must be well below price_max (e.g. 100 and 330, never 800 and 300).
Be thorough: a good profile for a popular product has 10-30 exclude words and real price bounds. Empty lists are almost always wrong.`;

/** Models sometimes answer in camelCase; accept both. */
function snakeKeys(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()), x]));
}

/** Rule-only profile when no AI is configured or the AI reply is unusable. */
export function fallbackProfile(q: SearchQuery): FilterProfile {
  const t = tokens(q.keyword).filter((x) => !STOP.has(x));
  return {
    item: q.keyword,
    mustAny: t.length ? [t] : [],
    exclude: [],
    accessoryWords: [],
    priceMin: q.priceFrom,
    priceMax: q.priceTo,
    allowDefect: true,
    useAi: false,
    minScore: 4,
  };
}

export async function buildProfile(q: SearchQuery, llm: Llm | null): Promise<{ profile: FilterProfile; source: "ai" | "fallback" }> {
  const base = fallbackProfile(q);
  if (!llm) return { profile: base, source: "fallback" };

  const prompt = `Search keyword: "${q.keyword}"\nCategory: ${q.categoryHint ?? "unknown"}\nPrice range in URL: ${q.priceFrom ?? "-"} to ${q.priceTo ?? "-"} EUR`;
  let reply = "";
  try {
    let p: z.infer<typeof aiProfileSchema> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !p; attempt++) {
      try {
        reply = await llm(SYSTEM, prompt, 800);
        p = aiProfileSchema.parse(snakeKeys(extractJson(reply)));
      } catch (e) {
        lastErr = e;
      }
    }
    if (!p) throw lastErr;
    const mustAny = matchGroups(p.must_any, base.mustAny);
    const mustWords = new Set(mustAny.flat().map(normalize));
    const { exclude, accessoryWords } = sortWords(p.exclude, p.accessory_words, mustWords);
    const prices = sanePrices(p.price_min, p.price_max);
    logger.info("ai profile", {
      keyword: q.keyword,
      item: p.item,
      groups: mustAny.length,
      exclude: exclude.length,
      accessories: accessoryWords.length,
      price: [prices.min, prices.max],
      rawPrice: [p.price_min, p.price_max],
    });
    // The user's own price range in the URL wins over the AI guess
    return {
      source: "ai",
      profile: {
        ...base,
        item: p.item,
        mustAny,
        exclude,
        accessoryWords,
        // AI lower bound stays as a hard floor: below it is an accessory or a scam, a safe cut.
        // The AI upper bound does not: a pricier listing is a worse deal, not a wrong item.
        priceMin: q.priceFrom ?? roundPrice(prices.min),
        priceMax: q.priceTo,
        typicalPrice: prices.min === null && prices.max === null ? null : { min: roundPrice(prices.min), max: roundPrice(prices.max) },
        useAi: true,
      },
    };
  } catch (e) {
    logger.warn("ai profile failed, using fallback", { keyword: q.keyword, err: String((e as Error)?.message ?? e).slice(0, 300), reply: reply.slice(0, 500) });
    // The profile failed, but per-listing AI screening can still work
    return { profile: { ...base, useAi: true }, source: "fallback" };
  }
}

const unique = (a: string[]) => [...new Set(a)];

const ACCESSORY_SET = new Set(GENERIC_ACCESSORIES.map(normalize));
const DEFECT_SET = new Set(DEFECT_WORDS.map(normalize));
const GAME_SET = new Set(GAME_WORDS);

/**
 * Fixes the model's most common mistake: putting bundle-able accessories into exclude,
 * which would kill "PS5 + 2 Controller". Those move to accessoryWords; defect words are
 * dropped (allowDefect decides); the user's own search words are never excluded.
 */
export function sortWords(exclude: string[], accessories: string[], mustWords: Set<string>) {
  // the model's own accessory list also wins over its exclude list ("dualsense", "ssd" listed in both)
  const ownAccessories = new Set(accessories.map(normalize));
  const isAccessory = (w: string) => {
    const n = normalize(w);
    return ownAccessories.has(n) || GAME_SET.has(n) || [...ACCESSORY_SET].some((a) => n.startsWith(a));
  };
  const keep = (w: string) => !mustWords.has(normalize(w));
  const ex = unique(exclude.filter(keep).filter((w) => !DEFECT_SET.has(normalize(w))));
  return {
    exclude: ex.filter((w) => !isAccessory(w)),
    accessoryWords: unique([...accessories, ...ex.filter(isAccessory)].filter(keep)),
  };
}
const roundPrice = (n: number | null) => (n === null ? null : Math.round(n / 5) * 5);

/**
 * Match groups become word sets (order-free: "Xbox s series" must still match "xbox series s"),
 * deduplicated, and the user's own query words are always one of the groups.
 */
export function matchGroups(aiGroups: string[][], queryGroups: string[][]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const g of [...queryGroups, ...aiGroups]) {
    const t = [...new Set(g.flatMap((w) => tokens(w)))];
    const key = [...t].sort().join(" ");
    if (t.length && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/** Floor derived from the typical price when the model's own floor is unusable. */
export const FLOOR_SHARE = 0.3;

/**
 * The model repeatedly returns an inverted range for some items (Xbox Series S: 800/330, 899/330, 990/330
 * on 2026-10-10) while the lower number is plausible. Keep the lower one as the typical ceiling and
 * derive a conservative floor from it instead of losing both bounds.
 */
export function sanePrices(min: number | null, max: number | null): { min: number | null; max: number | null } {
  if (min !== null && max !== null && min > max * 0.8) {
    const ceiling = Math.min(min, max);
    const fixed = { min: Math.round(ceiling * FLOOR_SHARE), max: ceiling };
    logger.warn("ai profile price range inverted, repaired", { min, max, fixed });
    return fixed;
  }
  return { min, max };
}
