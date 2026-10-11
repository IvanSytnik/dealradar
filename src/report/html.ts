import { pct, RELIABLE_N } from "../core/market.js";
import { refLabel, variantLabel } from "../core/variants.js";
import { t as dict, type Dict, type Lang } from "../i18n/index.js";
import type { ScanReport, ScoredItem } from "../services/scan.js";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Only http(s) links and images end up in the report: listing data is untrusted. */
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? esc(u) : "");

const eur = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("de-AT")} €`);

function row(t: Dict, i: ScoredItem, rank: number): string {
  const l = i.listing;
  const tags = i.deal.tags.map((x) => `<span class="tag t-${x}">${esc(t.tag[x])}</span>`).join("");
  const bundle = i.verdict?.bundle.length ? `<div class="sub">📦 ${esc(i.verdict.bundle.join(", "))}</div>` : "";
  const note = i.verdict?.note ? `<div class="sub">${esc(i.verdict.note)}</div>` : i.verdict ? "" : `<div class="sub muted">${esc(t.report.notChecked)}</div>`;
  const img = safeUrl(l.image);
  // the AI's model guess, even when it had too few listings for its own median (then the delta is vs. all models)
  // "?" = the listing did not name its model (filterable as its own chip)
  const model = i.verdict?.variant ?? (i.guessed ? "?" : "");
  const modelTag = i.verdict?.variant
    ? `<span class="tag t-model">${esc(variantLabel(i.verdict.variant))}</span>`
    : i.guessed && i.variant
      ? `<span class="tag t-guess" title="${esc(t.report.guessHint)}">${esc(refLabel(i.variant, true))}</span>`
      : "";
  return `<tr data-score="${i.deal.score ?? -1}" data-price="${l.price ?? ""}" data-delta="${i.deal.delta ?? ""}" data-tags="${i.deal.tags.join(" ")}" data-variant="${esc(model)}">
  <td class="num">${rank}</td>
  <td class="pic">${img ? `<img loading="lazy" src="${img}" alt="">` : ""}</td>
  <td><a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title)}</a><div class="m-price">${eur(l.price)}${i.deal.delta === null ? "" : ` · ${i.deal.delta > 0 ? "+" : ""}${Math.round(i.deal.delta * 100)}%`}</div>${bundle}${note}<div class="tags">${modelTag}${tags}</div></td>
  <td class="num pr">${eur(l.price)}</td>
  <td class="num dl">${i.deal.delta === null ? "—" : `${i.deal.delta > 0 ? "+" : ""}${Math.round(i.deal.delta * 100)}%`}</td>
  <td class="num"><b>${i.deal.score ?? "—"}</b></td>
  <td class="loc">${esc(l.location)}</td>
</tr>`;
}

export function renderReport(r: ScanReport, lang: Lang): string {
  const t = dict(lang);
  const R = t.report;
  const s = r.stats;
  const when = new Date(r.at).toLocaleString("de-AT", { timeZone: "Europe/Vienna" });
  const title = R.title(r.watch.name);
  const statCards = s
    ? [
        [R.median, eur(s.median)],
        [R.typical, `${eur(s.p25)} – ${eur(s.p75)}`],
        [R.minMax, `${eur(s.min)} / ${eur(s.max)}`],
        [R.withPrice, String(s.n)],
      ]
    : [[R.median, R.fewData]];
  const highlights = r.highlights.length
    ? r.highlights
        .map(
          (h) => `<li><a href="${safeUrl(h.listing.url)}" target="_blank" rel="noopener noreferrer">${esc(h.listing.title)}</a>
          <b>${eur(h.listing.price)}</b> · ${h.variant ? `${esc(refLabel(h.variant, h.guessed))}: ` : ""}${h.deal.delta !== null ? esc(pct(h.deal.delta, t)) : ""} · ${esc(R.score(h.deal.score ?? 0))}</li>`,
        )
        .join("")
    : `<li class="muted">${esc(R.noHighlights)}</li>`;

  const flips = r.flips.length
    ? `<h2>${esc(R.flipsTitle)}</h2><p class="muted">${esc(R.flipsNote)}</p><ol class="hl">${r.flips
        .map(
          (f) => `<li><a href="${safeUrl(f.listing.url)}" target="_blank" rel="noopener noreferrer">${esc(f.listing.title)}</a>
          <b>${eur(f.listing.price)}</b>${f.verdict?.note ? ` · ${esc(f.verdict.note)}` : ""}</li>`,
        )
        .join("")}</ol>`
    : "";

  const tagsPresent = [...new Set(r.items.flatMap((i) => i.deal.tags))];

  const variantRow = (name: string, v: { median: number; p25: number; p75: number; n: number }, cls = "") =>
    `<tr${cls ? ` class="${cls}"` : ""}><td>${esc(name)}</td><td class="num"><b>${eur(v.median)}</b></td><td class="num">${eur(v.p25)} – ${eur(v.p75)}</td><td class="num">${v.n}</td></tr>`;
  const variantsBlock =
    s && r.variants.length
      ? `<h2>${esc(R.variantsTitle)}</h2><p class="muted">${esc(R.variantsNote)}</p>
<div class="wrap"><table class="vt"><thead><tr><th>${esc(R.colModel)}</th><th class="num">${esc(R.median)}</th><th class="num">${esc(R.typical)}</th><th class="num">${esc(R.colCount)}</th></tr></thead><tbody>
${r.variants.map((v) => variantRow(variantLabel(v.name), v.stats)).join("\n")}
${variantRow(R.allModels, s, "all")}
</tbody></table></div>`
      : "";
  // chips for every model the AI named in this report, most common first
  const modelCounts = new Map<string, number>();
  for (const i of r.items) {
    const m = i.verdict?.variant ?? (i.guessed ? "?" : null);
    if (m) modelCounts.set(m, (modelCounts.get(m) ?? 0) + 1);
  }
  const models = [...modelCounts.entries()].sort((a, b) => (a[0] === "?" ? 1 : b[0] === "?" ? -1 : b[1] - a[1])).map(([m]) => m);
  const chipName = (m: string) => (m === "?" ? R.unknownModel : variantLabel(m));
  const modelChips =
    models.length >= 2
      ? `<div class="chips" id="models"><button class="chip" aria-pressed="true" data-variant="">${esc(R.allModels)}</button>${models
          .map((m) => `<button class="chip" aria-pressed="false" data-variant="${esc(m)}">${esc(chipName(m))} (${modelCounts.get(m)})</button>`)
          .join("")}</div>`
      : "";

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--card:#fff;--line:#e7e5e4;--acc:#0f766e;--hot:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#f5f5f4;--muted:#a8a29e;--card:#1f1e1c;--line:#2e2c29;--acc:#2dd4bf;--hot:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.muted{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.card .k{color:var(--muted);font-size:13px}.card .v{font-size:18px;font-weight:600}
ol.hl{padding-left:22px}ol.hl li{margin:6px 0}a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
.chips{display:none;flex-wrap:wrap;gap:6px;margin:8px 0 12px}.js .chips{display:flex}
th[data-k]{cursor:default}.js th[data-k]{cursor:pointer}.js th[data-k]::after{content:" ↕";opacity:.5}
.tg main{padding-top:12px}
.nojs{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:10px 12px;margin:8px 0 12px;font-size:14px}.js .nojs{display:none}.chip{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:4px 10px;cursor:pointer;font:inherit;font-size:13px}
.chip[aria-pressed=true]{border-color:var(--acc);color:var(--acc)}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card)}
table{border-collapse:collapse;width:100%;min-width:720px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
th{font-size:13px;color:var(--muted);user-select:none;white-space:nowrap;position:sticky;top:0;background:var(--card)}
td.num{text-align:right;white-space:nowrap}td.loc{font-size:13px;color:var(--muted)}td.pic img{width:64px;height:48px;object-fit:cover;border-radius:6px}
.sub{font-size:13px;color:var(--muted);margin-top:2px}.tags{margin-top:4px}.tag{display:inline-block;font-size:12px;border-radius:6px;padding:1px 6px;margin:2px 4px 0 0;background:var(--bg);border:1px solid var(--line)}
.t-very_cheap,.t-cheap{color:var(--acc)}.t-model{font-weight:600}.t-guess{color:var(--muted);border-style:dashed}
table.vt{min-width:0}table.vt tr.all td{color:var(--muted)}.t-suspicious{color:var(--hot)}
footer{margin-top:24px;font-size:13px;color:var(--muted)}
.m-price{display:none}
@media (max-width:640px){table{min-width:0}th.pic,td.pic,th.loc,td.loc,th.dl,td.dl,th.pr,td.pr{display:none}.m-price{display:block;font-weight:600;margin-top:2px}th,td{padding:8px 6px}}
</style></head><body><main>
<h1>${esc(title)}</h1>
<div class="muted">${esc(when)} · ${esc(R.meta(r.pages, r.total, r.items.length, r.pageLimitHit))}</div>
${s && s.n < RELIABLE_N ? `<p class="muted">${esc(R.fewPrices(s.n))}</p>` : ""}
<div class="cards">${statCards.map(([k, v]) => `<div class="card"><div class="k">${esc(k!)}</div><div class="v">${esc(v!)}</div></div>`).join("")}</div>

${variantsBlock}

<h2>${esc(R.highlights)}</h2>
<ol class="hl">${highlights}</ol>
${flips}

<h2>${esc(R.all(r.items.length))}</h2>
<p class="muted">${esc(R.sorted)}</p>
<div class="nojs">${esc(R.noJs)}</div>
${modelChips}
<div class="chips" id="chips"><button class="chip" aria-pressed="true" data-tag="">${esc(R.chipAll)}</button>${tagsPresent
    .map((x) => `<button class="chip" aria-pressed="false" data-tag="${x}">${esc(t.tag[x])}</button>`)
    .join("")}</div>
<div class="wrap"><table id="t"><thead><tr>
<th data-k="rank">#</th><th class="pic"></th><th>${esc(R.colListing)}</th><th class="pr" data-k="price">${esc(R.colPrice)}</th><th class="dl" data-k="delta">${esc(R.colDelta)}</th><th data-k="score">${esc(R.colScore)}</th><th class="loc">${esc(R.colPlace)}</th>
</tr></thead><tbody>
${r.items.map((i, n) => row(t, i, n + 1)).join("\n")}
</tbody></table></div>

<footer>${esc(R.footer(r.ruleDropped.length, r.aiDropped.length, r.aiUnchecked))}</footer>
</main>
<script>
/* Telegram Mini App: Telegram opens this page with #tgWebAppThemeParams=... in the hash.
   Take its colours, tell the client we are ready, expand to full height, open listings outside. */
(function(){
  try{
    var h=new URLSearchParams(location.hash.slice(1)),tp=h.get('tgWebAppThemeParams');
    if(!tp)return;
    var post=function(e,d){var data=JSON.stringify(d||{});
      if(window.TelegramWebviewProxy)window.TelegramWebviewProxy.postEvent(e,data);
      else if(window.external&&'notify' in window.external)window.external.notify(JSON.stringify({eventType:e,eventData:d||{}}));
      else if(window.parent!==window)window.parent.postMessage(JSON.stringify({eventType:e,eventData:d||{}}),'*');};
    var p=JSON.parse(tp),r=document.documentElement.style;
    var map={bg_color:'--bg',text_color:'--fg',hint_color:'--muted',link_color:'--acc',secondary_bg_color:'--card',section_separator_color:'--line'};
    for(var k in map)if(p[k])r.setProperty(map[k],p[k]);
    document.documentElement.className+=' tg';
    document.addEventListener('click',function(ev){var a=ev.target.closest&&ev.target.closest('a[href^="http"]');
      if(a){ev.preventDefault();post('web_app_open_link',{url:a.href});}});
    post('web_app_ready');post('web_app_expand');
  }catch(e){}
})();
(function(){
  document.documentElement.className+=' js';
  var tb=document.querySelector('#t tbody');var dir={};
  document.querySelectorAll('th[data-k]').forEach(function(th){th.addEventListener('click',function(){
    var k=th.dataset.k;dir[k]=!dir[k];var rows=[].slice.call(tb.rows);
    rows.sort(function(a,b){
      var x=k==='rank'?+a.cells[0].textContent:parseFloat(a.dataset[k]);var y=k==='rank'?+b.cells[0].textContent:parseFloat(b.dataset[k]);
      if(isNaN(x))return 1;if(isNaN(y))return -1;return dir[k]?x-y:y-x;});
    rows.forEach(function(r){tb.appendChild(r);});});});
  /* two independent filters: deal tag AND model */
  var f={tag:'',variant:''};
  var apply=function(){[].forEach.call(tb.rows,function(r){
    var okT=!f.tag||(' '+r.dataset.tags+' ').indexOf(' '+f.tag+' ')>=0,okV=!f.variant||r.dataset.variant===f.variant;
    r.style.display=okT&&okV?'':'none';});};
  ['chips','models'].forEach(function(id){var box=document.getElementById(id);if(!box)return;
    var key=id==='chips'?'tag':'variant';
    box.querySelectorAll('.chip').forEach(function(c){c.addEventListener('click',function(){
      box.querySelectorAll('.chip').forEach(function(x){x.setAttribute('aria-pressed','false');});c.setAttribute('aria-pressed','true');
      f[key]=c.dataset[key];apply();});});});
})();
</script></body></html>`;
}
