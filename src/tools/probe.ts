/**
 * Live check of a site adapter against the real site, without the bot:
 *   npm run probe -- "https://www.kleinanzeigen.de/s-konsolen/ps5/k0c279" [pages]
 * On the server: docker exec dealradar npx tsx src/tools/probe.ts "<url>"
 * Exit code 1 when nothing could be parsed, so it also works as a smoke test.
 */
import { adapterForUrl } from "../sites/index.js";
import { createHttpGet } from "../sites/http.js";

const [raw, pagesArg] = process.argv.slice(2);
if (!raw) {
  console.error('usage: npm run probe -- "<search url>" [pages=2]');
  process.exit(2);
}
const site = adapterForUrl(new URL(raw));
if (!site) {
  console.error(`no adapter for ${new URL(raw).hostname}`);
  process.exit(2);
}

const q = site.parseSearchUrl(new URL(raw));
console.log(`${site.name}${site.beta ? " (beta)" : ""}`);
console.log(`canonical: ${q.url}`);
console.log(`keyword: "${q.keyword}"  category: ${q.categoryHint ?? "-"}  price: ${q.priceFrom ?? "-"}..${q.priceTo ?? "-"}`);

const http = createHttpGet(1500);
const pages = Number(pagesArg ?? 2);
let total = 0;
for (let p = 1; p <= pages; p++) {
  const url = site.pageUrl(q.url, p);
  const t0 = Date.now();
  try {
    const html = await http(url);
    const list = site.parseListings(html);
    total += list.length;
    console.log(`\npage ${p}: ${list.length} listings, ${Math.round(html.length / 1024)} KB, ${Date.now() - t0} ms  ${url}`);
    for (const l of list.slice(0, p === 1 ? 5 : 2)) {
      console.log(`  • ${l.title.slice(0, 60)} | ${l.price ?? "?"} € | ${l.location || "-"} | img:${l.image ? "yes" : "no"} | ${l.url}`);
    }
    const missing = (k: "price" | "location" | "image" | "body") => list.filter((l) => !l[k]).length;
    console.log(`  missing: price ${missing("price")}, location ${missing("location")}, image ${missing("image")}, text ${missing("body")}`);
    if (list.length < site.pageSize) break;
  } catch (e) {
    console.log(`\npage ${p}: FAILED ${(e as Error).message}  ${url}`);
    break;
  }
}
console.log(`\ntotal: ${total}`);
process.exit(total > 0 ? 0 : 1);
