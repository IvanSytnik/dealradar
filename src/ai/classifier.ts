import { AI_LANGUAGE, type Lang } from "../i18n/index.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Repo } from "../db/repo.js";
import type { AiVerdict, Listing, Watch } from "../types.js";
import { extractJson, type Llm } from "./llm.js";
import { matchVariant } from "../core/variants.js";

const verdictSchema = z.object({
  relevant: z.boolean(),
  condition: z.enum(["new", "good", "defect", "unknown"]).catch("unknown"),
  bundle: z.array(z.string()).max(10).catch([]),
  score: z.coerce.number().transform((n) => Math.max(1, Math.min(10, Math.round(n)))),
  reason: z.string().max(200).catch(""),
  variant: z.unknown().optional(),
});

const SYSTEM = `You screen listings from the Austrian marketplace Willhaben for a buyer.
Return ONLY JSON: {"relevant": bool, "condition": "new|good|defect|unknown", "bundle": string[], "score": 1-10, "reason": string, "variant": string|null}
- relevant: true only if the listing sells the item the buyer wants (not an accessory alone, not a wanted ad, not a swap, not an empty box, not a different model).
- condition: "defect" if broken or for parts.
- bundle: notable extras included, short.
- score: how good the deal is for this buyer, using typical Austrian used prices. Clear scam signals (prepayment only, shipping only from abroad, copied text) -> 1-2.
- reason: one short phrase in the language named at the end of the request.
- variant: only when the request lists variants: which one this listing sells, exactly as listed, or null if unclear. Judge the deal against that variant's prices.`;

export type ClassifyResult =
  | { kind: "verdict"; verdict: AiVerdict; cached: boolean }
  | { kind: "skipped"; why: "no_ai" | "budget" | "error" };

export function cacheKey(watch: Watch, l: Listing, lang: Lang = "en"): string {
  // Price and the watch's target are part of the key: a price drop or a re-tuned profile is re-judged.
  // The language too: the reason text is shown to the user.
  return createHash("sha1").update(`${watch.id}|${watch.profile.item}|${(watch.profile.variants ?? []).join(",")}|${watch.market?.median ?? ""}|${l.id}|${l.price}|${lang}`).digest("hex");
}

export class Classifier {
  constructor(
    private repo: Repo,
    private llm: Llm | null,
  ) {}

  get enabled() {
    return this.llm !== null;
  }

  async classify(watch: Watch, listing: Listing, dailyLimit: number, lang: Lang = "en"): Promise<ClassifyResult> {
    if (!this.llm) return { kind: "skipped", why: "no_ai" };

    const key = cacheKey(watch, listing, lang);
    const cached = this.repo.getVerdict(key);
    if (cached) return { kind: "verdict", verdict: cached, cached: true };

    if (!this.repo.takeAiCall(watch.userId, dailyLimit)) return { kind: "skipped", why: "budget" };
    this.repo.track(watch.userId, "ai_call");

    const examples = this.repo
      .recentFeedback(watch.id, 6)
      .map((f) => `- ${f.good ? "WANTED" : "NOT WANTED"}: "${f.title}" ${f.price ?? "?"} EUR`)
      .join("\n");

    const user = [
      `Buyer wants: ${watch.profile.item}`,
      watch.market
        ? `Real market right now: median ${watch.market.median} EUR, typical ${watch.market.p25}-${watch.market.p75} EUR (${watch.market.n} listings).`
        : watch.profile.typicalPrice?.max
          ? `Typical used price: about ${watch.profile.typicalPrice.min ?? "?"}-${watch.profile.typicalPrice.max} EUR.`
          : "",
      variantLines(watch),
      watch.profile.allowDefect ? "Broken units are acceptable (lower score)." : "Broken units are NOT acceptable.",
      examples ? `Buyer feedback on earlier listings:\n${examples}` : "",
      "",
      `Title: ${listing.title}`,
      `Price: ${listing.price ?? "not given"} EUR`,
      `Location: ${listing.location || "-"}`,
      `Description: ${listing.body.slice(0, 1500) || "-"}`,
      "",
      `Write "reason" in ${AI_LANGUAGE[lang]}.`,
    ]
      .filter((x) => x !== "")
      .join("\n");

    try {
      const { variant, ...v } = verdictSchema.parse(extractJson(await this.llm(SYSTEM, user, 300)));
      const verdict: AiVerdict = { ...v, variant: matchVariant(variant, watch.profile.variants) };
      this.repo.putVerdict(key, verdict);
      return { kind: "verdict", verdict, cached: false };
    } catch {
      return { kind: "skipped", why: "error" };
    }
  }
}

/** "Variants: Standard (median 550 EUR), Pro (median 1250 EUR), Slim" */
function variantLines(watch: Watch): string {
  const vs = watch.profile.variants;
  if (!vs?.length) return "";
  const m = watch.market?.variants ?? {};
  return `Variants: ${vs.map((v) => `"${v}"${m[v] ? ` (median ${m[v]!.median} EUR)` : ""}`).join(", ")}`;
}
