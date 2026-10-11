import { describe, expect, it } from "vitest";
import { cacheKey, Classifier } from "../src/ai/classifier.js";
import { fakeLlm, listing, memRepo, seedUser, seedWatch, XBOX_PROFILE } from "./helpers.js";

const ok = JSON.stringify({ relevant: true, condition: "good", bundle: ["controller"], score: 7.6, reason: "норм" });

function setup(answer: () => string = () => ok) {
  const repo = memRepo();
  seedUser(repo);
  const watch = seedWatch(repo, 1, { profile: { ...XBOX_PROFILE, useAi: true } });
  const f = fakeLlm(answer);
  return { repo, watch, ...f, clf: new Classifier(repo, f.llm) };
}

describe("Classifier", () => {
  it("parses and normalises the verdict", async () => {
    const { clf, watch } = setup();
    const r = await clf.classify(watch, listing({ id: "1", title: "Xbox Series S" }), 10);
    expect(r).toMatchObject({ kind: "verdict", cached: false, verdict: { score: 8, bundle: ["controller"] } });
  });

  it("caches per listing+price, so a price drop is re-judged", async () => {
    const { clf, watch, calls } = setup();
    const l = listing({ id: "1", title: "Xbox Series S", price: 200 });
    await clf.classify(watch, l, 10);
    expect((await clf.classify(watch, l, 10)) as any).toMatchObject({ cached: true });
    await clf.classify(watch, { ...l, price: 150 }, 10);
    expect(calls).toHaveLength(2);
    expect(cacheKey(watch, l)).not.toBe(cacheKey(watch, { ...l, price: 150 }));
  });

  it("asks for the reason in the user's language and caches per language", async () => {
    const { clf, watch, calls } = setup();
    const l = listing({ id: "1", title: "Xbox Series S" });
    await clf.classify(watch, l, 10, "de");
    expect(calls[0]!.user).toContain('Write "reason" in German.');
    await clf.classify(watch, l, 10, "uk"); // same listing, other language: new call
    expect(calls[1]!.user).toContain("Ukrainian");
    expect(calls).toHaveLength(2);
  });

  it("puts the buyer's feedback into the prompt", async () => {
    const { clf, watch, calls, repo } = setup();
    repo.addFeedback(watch.id, "9", "Xbox Series S nur Controller", 40, false);
    await clf.classify(watch, listing({ id: "1", title: "Xbox Series S" }), 10);
    expect(calls[0]!.user).toContain('NOT WANTED: "Xbox Series S nur Controller" 40 EUR');
    expect(calls[0]!.user).toContain("Buyer wants: Xbox Series S console");
  });

  it("passes the AI's typical price to the deal score", async () => {
    const { clf, watch, calls, repo } = setup();
    repo.updateWatch(watch.id, { profile: { ...watch.profile, typicalPrice: { min: 120, max: 480 } } });
    await clf.classify(repo.getWatch(watch.id)!, listing({ id: "1", title: "PS5" }), 10);
    expect(calls[0]!.user).toContain("Typical used price: about 120-480 EUR.");
  });

  it("reports budget and bad replies instead of throwing", async () => {
    const { clf, watch } = setup(() => "I cannot help");
    expect(await clf.classify(watch, listing({ id: "1", title: "x" }), 10)).toEqual({ kind: "skipped", why: "error" });
    expect(await clf.classify(watch, listing({ id: "2", title: "x" }), 1)).toEqual({ kind: "skipped", why: "budget" });
  });

  it("is a no-op without a model", async () => {
    const { repo, watch } = setup();
    expect(await new Classifier(repo, null).classify(watch, listing({ id: "1", title: "x" }), 10)).toEqual({
      kind: "skipped",
      why: "no_ai",
    });
  });
});
