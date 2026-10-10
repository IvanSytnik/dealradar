import { openDb, Repo } from "../src/db/repo.js";
import type { Llm } from "../src/ai/llm.js";
import type { ListingInfo, Notifier } from "../src/services/notifier.js";
import type { FilterProfile, Listing, SearchQuery, User, Watch } from "../src/types.js";

export interface FakeAd {
  id: string | number;
  title: string;
  price?: number | string | null;
  body?: string;
  seo?: string;
  image?: string;
  postcode?: string;
  location?: string;
}

/** Builds a page shaped like a Willhaben search result (the __NEXT_DATA__ JSON the adapter reads). */
export function willhabenHtml(ads: FakeAd[]): string {
  const advertSummary = ads.map((a) => {
    const attribute: { name: string; values: string[] }[] = [];
    const push = (name: string, v: unknown) => v !== undefined && v !== null && attribute.push({ name, values: [String(v)] });
    push("PRICE", a.price);
    push("SEO_URL", a.seo ?? `kaufen-und-verkaufen/d/item-${a.id}/`);
    push("BODY_DYN", a.body);
    push("MMO", a.image);
    push("POSTCODE", a.postcode);
    push("LOCATION", a.location ?? "Wien");
    push("PUBLISHED", 1760000000000);
    return { id: String(a.id), description: a.title, attributes: { attribute } };
  });
  const data = { props: { pageProps: { searchResult: { advertSummaryList: { advertSummary } } } } };
  return `<!doctype html><html><head></head><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${
    // Next.js escapes "<" in __NEXT_DATA__ so a "</script>" inside a title cannot end the tag
    JSON.stringify(data).replace(/</g, "\\u003c")
  }</script></body></html>`;
}

export function clock(start = Date.parse("2026-10-10T08:00:00Z")) {
  let t = start;
  const now = () => t;
  return { now, advance: (ms: number) => (t += ms), set: (v: number) => (t = v) };
}

export function memRepo(now?: () => number) {
  return new Repo(openDb(":memory:"), now);
}

export const XBOX_PROFILE: FilterProfile = {
  item: "Xbox Series S console",
  mustAny: [["series", "s"], ["xbox", "s"], ["xss"]],
  exclude: ["huelle", "staender", "netzteil", "game pass", "spiel"],
  accessoryWords: ["controller", "headset"],
  priceMin: 60,
  priceMax: 250,
  allowDefect: true,
  useAi: false,
  minScore: 4,
};

export function query(url = "https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=xbox+series+s&sort=1&rows=30"): SearchQuery {
  return { site: "willhaben", url, keyword: "xbox series s", categoryHint: null, priceFrom: null, priceTo: null };
}

export function listing(p: Partial<Listing> & { id: string; title: string }): Listing {
  return { price: 150, url: `https://www.willhaben.at/iad/x/${p.id}`, location: "Wien", body: "", image: null, publishedAt: null, ...p };
}

export function seedUser(repo: Repo, id = 1, plan: User["plan"] = "free"): User {
  const u = repo.upsertUser(id, id * 10, `u${id}`);
  if (plan !== "free") repo.setPlan(id, plan);
  return repo.getUser(id)!;
}

export function seedWatch(repo: Repo, userId: number, over: Partial<{ profile: FilterProfile; q: SearchQuery; seeded: boolean }> = {}): Watch {
  const w = repo.createWatch({ userId, name: "xbox", query: over.q ?? query(), profile: over.profile ?? XBOX_PROFILE, intervalSec: 300 });
  if (over.seeded !== false) repo.markRun(w.id, true, 0, true);
  return repo.getWatch(w.id)!;
}

export class RecordingNotifier implements Notifier {
  listings: { user: User; watch: Watch; listing: Listing; info: ListingInfo }[] = [];
  texts: { user: User; text: string }[] = [];
  failWith: Error | null = null;
  async sendListing(user: User, watch: Watch, listing: Listing, info: ListingInfo) {
    if (this.failWith) throw this.failWith;
    this.listings.push({ user, watch, listing, info });
  }
  async sendText(user: User, text: string) {
    if (this.failWith) throw this.failWith;
    this.texts.push({ user, text });
  }
}

/** Fake LLM: answers by a function of the user prompt and records calls. */
export function fakeLlm(answer: (user: string, system: string) => string) {
  const calls: { system: string; user: string }[] = [];
  const llm: Llm = async (system, user) => {
    calls.push({ system, user });
    return answer(user, system);
  };
  return { llm, calls };
}

export function fakeHttp(pages: Record<string, string> | ((url: string) => string)) {
  const calls: string[] = [];
  const get = async (url: string) => {
    calls.push(url);
    const page = typeof pages === "function" ? pages(url) : pages[url];
    if (page === undefined) throw new Error(`no fake page for ${url}`);
    return page;
  };
  return { get, calls };
}
