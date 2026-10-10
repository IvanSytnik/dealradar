import { createHash } from "node:crypto";
import { z } from "zod";
import type { Repo } from "../db/repo.js";
import type { Listing, Watch } from "../types.js";
import { extractJson, type Llm } from "./llm.js";

/** Per-listing judgement for market analysis. No price opinion: prices are scored from real data. */
export interface BatchVerdict {
  relevant: boolean;
  condition: "new" | "good" | "defect" | "unknown";
  bundle: string[];
  suspicious: boolean;
  note: string;
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
});
const replySchema = z.object({ items: z.array(z.unknown()) });

const SYSTEM = `You screen many listings from the Austrian marketplace Willhaben for one buyer at once.
Return ONLY JSON: {"items": [{"i": number, "relevant": bool, "condition": "new|good|defect|unknown", "bundle": string[], "suspicious": bool, "note": string}, ...]}
One entry per listing, same "i" as given.
- relevant: true only if the listing sells the item the buyer wants (not an accessory alone, not a game, not a wanted ad, not a swap, not an empty box, not a different model).
- condition: "defect" only if the MAIN item is broken or sold for parts. A worn or faulty accessory (e.g. a controller with stick drift) does not make the item defect.
- bundle: extras BEYOND what comes standard in the box (e.g. "2. Controller", "3 Spiele", "Ladestation"). Never list the standard controller, cables, original box (OVP) or receipt.
- suspicious: scam signals only (prepayment only, shipping from abroad only, copied stock text, absurd promises). NOT for a low price alone.
- note: one short phrase in Russian about what makes this listing notable, or why it is not relevant.
Do not judge the price.`;

/** Bump when the prompt changes meaning, so cached verdicts from the old prompt are not reused. */
export const BATCH_PROMPT_VERSION = 2;

export function batchKey(watch: Watch, l: Listing): string {
  return `b${BATCH_PROMPT_VERSION}:` + createHash("sha1").update(`${watch.profile.item}|${l.id}|${l.price}|${l.title}`).digest("hex");
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

  async classify(
    watch: Watch,
    listings: Listing[],
    dailyLimit: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<BatchResult> {
    const verdicts = new Map<string, BatchVerdict>();
    const result: BatchResult = { verdicts, calls: 0, skippedForBudget: 0, failedBatches: 0 };
    if (!this.llm) return result;

    const todo: Listing[] = [];
    for (const l of listings) {
      const cached = this.repo.getVerdict(batchKey(watch, l)) as unknown as BatchVerdict | null;
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
          const parsed = await this.runBatch(watch, batch);
          for (const [id, v] of parsed) {
            verdicts.set(id, v);
            this.repo.putVerdict(batchKey(watch, batch.find((l) => l.id === id)!), v as never);
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

  private async runBatch(watch: Watch, batch: Listing[]): Promise<Map<string, BatchVerdict>> {
    const lines = batch.map(
      (l, i) =>
        `[${i}] ${l.title} | ${l.price ?? "?"} EUR | ${l.body.replace(/\s+/g, " ").slice(0, 300) || "-"}`,
    );
    const user = [
      `Buyer wants: ${watch.profile.item}`,
      watch.profile.allowDefect ? "Broken units are acceptable to this buyer." : "Broken units are NOT acceptable.",
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
      const { i: _i, ...v } = r.data;
      out.set(l.id, v);
    }
    return out;
  }
}
