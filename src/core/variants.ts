// Variants of one item that sell at clearly different prices (PS5: standard / digital / slim / pro).
// A single median over all of them is misleading: in the Stuttgart PS5 scan (2026-10-11) the overall
// median was 600 € while a standard PS5 went for 550 € and a Pro for 1250 €, so a normal PS5 looked
// like a deal and every Pro looked overpriced. Names are short lowercase words, chosen by the AI once
// per watch and stored in the profile, so every listing is assigned to the same fixed list.

export const MAX_VARIANTS = 6;
/** A variant gets its own median only with at least this many priced listings; otherwise the overall one is used. */
export const VARIANT_MIN_N = 5;

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+ ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Deduplicated, at most MAX_VARIANTS; fewer than two is no split at all. */
export function sanitizeVariants(raw: unknown[]): string[] {
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const v = clean(x);
    if (v && v.length <= 24 && !out.includes(v) && v !== "other" && v !== "unknown") out.push(v);
  }
  return out.length >= 2 ? out.slice(0, MAX_VARIANTS) : [];
}

/** Maps the model's answer onto the watch's list ("PS5 Pro" -> "pro"), or null when it is none of them. */
export function matchVariant(raw: unknown, variants: string[] | undefined): string | null {
  if (typeof raw !== "string" || !variants?.length) return null;
  const v = clean(raw);
  if (!v) return null;
  if (variants.includes(v)) return v;
  // longest name first, so "slim digital" wins over "slim" and "digital"
  const byLength = [...variants].sort((a, b) => b.length - a.length);
  const words = new Set(v.split(" "));
  return byLength.find((name) => name.split(" ").every((w) => words.has(w))) ?? null;
}

/** "slim digital" -> "Slim Digital" */
export const variantLabel = (v: string) => v.replace(/(^|\s)(\p{L})/gu, (_, s: string, c: string) => s + c.toUpperCase());

/** "Pro", or "Digital?" when the listing did not name its model and was compared with the cheapest one */
export const refLabel = (variant: string, guessed: boolean) => variantLabel(variant) + (guessed ? "?" : "");
