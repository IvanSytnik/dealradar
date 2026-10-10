import type { FilterProfile, Listing } from "../types.js";
import { BUNDLE_SIGNALS, DEFECT_WORDS, GAME_WORDS, GENERIC_ACCESSORIES, NOT_AN_OFFER } from "./lexicon.js";
import { hasPhrase, hasWordPrefix, normalize } from "./normalize.js";

export interface RuleResult {
  pass: boolean;
  reason: string;
  defect: boolean;
}

const drop = (reason: string, defect = false): RuleResult => ({ pass: false, reason, defect });

export function applyRules(listing: Listing, p: FilterProfile): RuleResult {
  const title = normalize(listing.title);
  const full = `${title} ${normalize(listing.body)}`;

  if (p.mustAny.length > 0) {
    const ok = p.mustAny.some((group) => group.length > 0 && group.every((w) => hasPhrase(title, w)));
    if (!ok) return drop("title does not match the item");
  }

  const notOffer = NOT_AN_OFFER.find((w) => hasPhrase(title, w));
  if (notOffer) return drop(`not an offer: "${notOffer}"`);

  const excluded = p.exclude.find((w) => hasWordPrefix(title, w));
  if (excluded) return drop(`excluded word: "${excluded}"`);

  // The user's own search words are never treated as accessories
  const wanted = new Set(p.mustAny.flat().map((w) => normalize(w)));
  const accessoryList = [...p.accessoryWords, ...GENERIC_ACCESSORIES].filter((w) => !wanted.has(normalize(w)));
  const accessory =
    accessoryList.find((w) => hasWordPrefix(title, w)) ?? GAME_WORDS.filter((w) => !wanted.has(w)).find((w) => hasPhrase(title, w));
  // "512GB" / "1 TB" in the title describes the device itself, not a loose accessory
  const hasCapacity = /(^| )\d+ ?(gb|tb)( |$)/.test(title);
  if (accessory && !hasCapacity && !BUNDLE_SIGNALS.some((s) => hasPhrase(title, s))) {
    return drop(`looks like an accessory: "${accessory}"`);
  }

  if (listing.price !== null) {
    if (p.priceMin !== null && listing.price < p.priceMin) return drop(`price ${listing.price} < ${p.priceMin}`);
    if (p.priceMax !== null && listing.price > p.priceMax) return drop(`price ${listing.price} > ${p.priceMax}`);
  }

  const defect = DEFECT_WORDS.some((w) => hasPhrase(full, w));
  if (defect && !p.allowDefect) return drop("defect / for parts", true);

  return { pass: true, reason: "ok", defect };
}
