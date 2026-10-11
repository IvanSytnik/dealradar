import { AI_LANGUAGE, type Lang } from "../i18n/index.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Repo } from "../db/repo.js";
import type { Listing, Watch } from "../types.js";
import { extractJson, type Llm } from "./llm.js";
import { matchVariant } from "../core/variants.js";
import { suggestVariants } from "./profile.js";

/** Per-listing judgement for market analysis. No price opinion: prices are scored from real data. */
export interface BatchVerdict {
  relevant: boolean;
  condition: "new" | "good" | "defect" | "unknown";
  bundle: string[];
  suspicious: boolean;
  note: string;
  /** One of watch.profile.variants, null when unclear or the watch has none */
  variant?: string | null;
}

export const BATCH_SIZE = 20;
export const BATCH_PARALLEL = 3;

const itemSchema = z.object({
  i: z.coerce.number().int(),
  relevant: z.boolean(),
  condition: z.enum(["new", "good", "defect", "unknown"]).catch("unknown"),
  bundle: z.array(z.string()).catch([]).transform((a) => a.slice(0, 8)),
  suspicious: z.boolean().catch(false),
  note: z.string().catch("").transform((s) => s.slice(0, 160)),
  variant: z.unknown().optional(),
});
const replySchema = z.object({ items: z.array(z.unknown()) });

const SYSTEM = `You screen many listings from the Austrian marketplace Willhaben for one buyer at once.
Return ONLY JSON: {"items": [{"i": number, "relevant": bool, "condition": "new|good|defect|unknown", "bundle": string[], "suspicious": bool, "note": string, "variant": string|null}, ...]}
One entry per listing, same "i" as given.
- relevant: true only if the listing sells the item the buyer wants (not an accessory alone, not a game, not a wanted ad, not a swap, not an empty box, not a different model).
- condition: "defect" only if the MAIN item is broken or sold for parts. A worn or faulty accessory (e.g. a controller with stick drift) does not make the item defect.
- bundle: extras BEYOND what comes standard in the box (e.g. "2. Controller", "3 Spiele", "Ladestation"). Never list the standard controller, cables, original box (OVP) or receipt.
- suspicious: scam signals only (prepayment only, shipping from abroad only, copied stock text, absurd promises). NOT for a low price alone.
- note: one short phrase, in the language named in the request, about what makes this listing notable, or why it is not relevant.
- variant: only when the request lists variants: which one this listing sells, written exactly as listed, or null if the listing does not say. A plain "PS5" with a disc drive is "standard".
Do not judge the price.`;

/** Bump when the prompt changes meaning, so cached verdicts from the old prompt are not reused. */
export const BATCH_PROMPT_VERSION = 3;

export function batchKey(watch: Watch, l: Listing, lang: Lang = "en"): string {
  // the note is shown to the user, so its language is part of the key
  return `b${BATCH_PROMPT_VERSION}:` + createHash("sha1").update(`${watch.profile.item}|${(watch.profile.variants ?? []).join(",")}|${l.id}|${l.price}|${l.title}|${lang}`).digest("hex");
}

export interface BatchResult {
  verdicts: Map<string, BatchVerdict>;
  calls: number;
  skippedForBudget: number;
  failedBatches: number;
}

export class BatchClassifier {
  constructor(
    private repo: Repo,
    private llm: Llm | null,
  ) {}

  get enabled() {
    return this.llm !== null;
  }

  /** Variants for a watch that has none decided yet; [] without AI. */
  async variantsFor(watch: Watch): Promise<string[]> {
    if (!this.llm) return [];
    if (!this.repo.takeAiCall(watch.userId, Infinity)) return [];
    this.repo.track(watch.userId, "ai_call", { variants: true });
    return suggestVariants(watch.profile.item, watch.query.keyword, this.llm);
  }

  async classify(
    watch: Watch,
    listings: Listing[],
    dailyLimit: number,
    onProgress?: (done: number, total: number) => void,
    lang: Lang = "en",
  ): Promise<BatchResult> {
    const verdicts = new Map<string, BatchVerdict>();
    const result: BatchResult = { verdicts, calls: 0, skippedForBudget: 0, failedBatches: 0 };
    if (!this.llm) return result;

    const todo: Listing[] = [];
    for (const l of listings) {
      const cached = this.repo.getVerdict(batchKey(watch, l, lang)) as unknown as BatchVerdict | null;
      if (cached) verdicts.set(l.id, cached);
      else todo.push(l);
    }

    const batches: Listing[][] = [];
    for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));

    let done = listings.length - todo.length;
    onProgress?.(done, listings.length);
    const queue = [...batches];
    const worker = async () => {
      for (let batch = queue.shift(); batch; batch = queue.shift()) {
        if (!this.repo.takeAiCall(watch.userId, dailyLimit)) {
          result.skippedForBudget += batch.length;
          continue;
        }
        result.calls++;
        this.repo.track(watch.userId, "ai_call", { batch: batch.length });
        try {
          const parsed = await this.runBatch(watch, batch, lang);
          for (const [id, v] of parsed) {
            verdicts.set(id, v);
            this.repo.putVerdict(batchKey(watch, batch.find((l) => l.id === id)!, lang), v as never);
          }
        } catch {
          result.failedBatches++;
        }
        done += batch.length;
        onProgress?.(done, listings.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(BATCH_PARALLEL, batches.length) }, worker));
    return result;
  }

  private async runBatch(watch: Watch, batch: Listing[], lang: Lang): Promise<Map<string, BatchVerdict>> {
    const lines = batch.map(
      (l, i) =>
        `[${i}] ${l.title} | ${l.price ?? "?"} EUR | ${l.body.replace(/\s+/g, " ").slice(0, 300) || "-"}`,
    );
    const user = [
      `Buyer wants: ${watch.profile.item}`,
      watch.profile.allowDefect ? "Broken units are acceptable to this buyer." : "Broken units are NOT acceptable.",
      `Write every "note" in ${AI_LANGUAGE[lang]}.`,
      watch.profile.variants?.length ? `Variants: ${watch.profile.variants.map((v) => `"${v}"`).join(", ")}` : `Variants: none, always null.`,
      "",
      ...lines,
    ].join("\n");

    const reply = await this.llm!(SYSTEM, user, 120 * batch.length + 200);
    const items = replySchema.parse(extractJson(reply)).items;
    const out = new Map<string, BatchVerdict>();
    for (const raw of items) {
      const r = itemSchema.safeParse(raw);
      if (!r.success) continue;
      const l = batch[r.data.i];
      if (!l) continue;
      const { i: _i, variant, ...v } = r.data;
      out.set(l.id, { ...v, variant: matchVariant(variant, watch.profile.variants) });
    }
    return out;
  }
}
