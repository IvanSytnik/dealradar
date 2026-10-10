/** Lowercase, fold umlauts/diacritics, turn punctuation into spaces, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}+&]+/gu, " ")
    .replace(/([+&])/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bx box\b/g, "xbox")
    .replace(/\bplay station\b/g, "playstation")
    .replace(/\bps ([1-5])\b/g, "ps$1")
    .replace(/\bserie (s|x)\b/g, "series $1");
}

// Spellings sellers use for the same thing ("X Box Serie S", "Play Station 5", "PS 5") are folded into one.
// Live miss on 2026-10-10: "X Box Serie S" for 400 € did not match "xbox series s".

/** Whole-word / whole-phrase match on normalised text. "series s" matches "xbox series s 512gb". */
export function hasPhrase(normText: string, phrase: string): boolean {
  const p = normalize(phrase);
  if (!p) return false;
  return ` ${normText} `.includes(` ${p} `);
}

/**
 * Prefix match for German compounds: "controller" also hits "controllerset".
 * Used for exclude/accessory lists, where over-matching is the safer error.
 */
export function hasWordPrefix(normText: string, word: string): boolean {
  const w = normalize(word);
  if (!w) return false;
  if (w.includes(" ")) return hasPhrase(normText, w);
  return normText.split(" ").some((t) => t.startsWith(w));
}

export function tokens(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}
