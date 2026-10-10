import { pct, RELIABLE_N, TAG_LABEL } from "../core/market.js";
import type { ScanReport, ScoredItem } from "../services/scan.js";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Only http(s) links and images end up in the report: listing data is untrusted. */
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? esc(u) : "");

const eur = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("de-AT")} €`);

function row(i: ScoredItem, rank: number): string {
  const l = i.listing;
  const tags = i.deal.tags.map((t) => `<span class="tag t-${t}">${esc(TAG_LABEL[t])}</span>`).join("");
  const bundle = i.verdict?.bundle.length ? `<div class="sub">📦 ${esc(i.verdict.bundle.join(", "))}</div>` : "";
  const note = i.verdict?.note ? `<div class="sub">${esc(i.verdict.note)}</div>` : i.verdict ? "" : `<div class="sub muted">ИИ не проверял</div>`;
  const img = safeUrl(l.image);
  return `<tr data-score="${i.deal.score ?? -1}" data-price="${l.price ?? ""}" data-delta="${i.deal.delta ?? ""}" data-tags="${i.deal.tags.join(" ")}">
  <td class="num">${rank}</td>
  <td class="pic">${img ? `<img loading="lazy" src="${img}" alt="">` : ""}</td>
  <td><a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title)}</a><div class="m-price">${eur(l.price)}${i.deal.delta === null ? "" : ` · ${i.deal.delta > 0 ? "+" : ""}${Math.round(i.deal.delta * 100)}%`}</div>${bundle}${note}<div class="tags">${tags}</div></td>
  <td class="num pr">${eur(l.price)}</td>
  <td class="num dl">${i.deal.delta === null ? "—" : `${i.deal.delta > 0 ? "+" : ""}${Math.round(i.deal.delta * 100)}%`}</td>
  <td class="num"><b>${i.deal.score ?? "—"}</b></td>
  <td class="loc">${esc(l.location)}</td>
</tr>`;
}

export function renderReport(r: ScanReport): string {
  const s = r.stats;
  const when = new Date(r.at).toLocaleString("de-AT", { timeZone: "Europe/Vienna" });
  const title = `Анализ рынка: ${r.watch.name}`;
  const statCards = s
    ? [
        ["Медиана", eur(s.median)],
        ["Типичный диапазон", `${eur(s.p25)} – ${eur(s.p75)}`],
        ["Мин / макс", `${eur(s.min)} / ${eur(s.max)}`],
        ["Подходящих с ценой", String(s.n)],
      ]
    : [["Медиана", "мало данных"]];
  const highlights = r.highlights.length
    ? r.highlights
        .map(
          (h) => `<li><a href="${safeUrl(h.listing.url)}" target="_blank" rel="noopener noreferrer">${esc(h.listing.title)}</a>
          <b>${eur(h.listing.price)}</b> · ${h.deal.delta !== null ? esc(pct(h.deal.delta)) : ""} · оценка ${h.deal.score}/10</li>`,
        )
        .join("")
    : "<li class=\"muted\">Сейчас явно выгодных предложений нет.</li>";

  const flips = r.flips.length
    ? `<h2>🔧 Дефектные дёшево</h2><p class="muted">Для ремонта или перепродажи. Оценка считается от цены дефектных (~40% медианы), а не рабочих.</p><ol class="hl">${r.flips
        .map(
          (f) => `<li><a href="${safeUrl(f.listing.url)}" target="_blank" rel="noopener noreferrer">${esc(f.listing.title)}</a>
          <b>${eur(f.listing.price)}</b>${f.verdict?.note ? ` · ${esc(f.verdict.note)}` : ""}</li>`,
        )
        .join("")}</ol>`
    : "";

  const tagsPresent = [...new Set(r.items.flatMap((i) => i.deal.tags))];

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--card:#fff;--line:#e7e5e4;--acc:#0f766e;--hot:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#f5f5f4;--muted:#a8a29e;--card:#1f1e1c;--line:#2e2c29;--acc:#2dd4bf;--hot:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.muted{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.card .k{color:var(--muted);font-size:13px}.card .v{font-size:18px;font-weight:600}
ol.hl{padding-left:22px}ol.hl li{margin:6px 0}a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px}.chip{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:4px 10px;cursor:pointer;font:inherit;font-size:13px}
.chip[aria-pressed=true]{border-color:var(--acc);color:var(--acc)}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card)}
table{border-collapse:collapse;width:100%;min-width:720px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
th{font-size:13px;color:var(--muted);cursor:pointer;user-select:none;white-space:nowrap;position:sticky;top:0;background:var(--card)}
td.num{text-align:right;white-space:nowrap}td.loc{font-size:13px;color:var(--muted)}td.pic img{width:64px;height:48px;object-fit:cover;border-radius:6px}
.sub{font-size:13px;color:var(--muted);margin-top:2px}.tags{margin-top:4px}.tag{display:inline-block;font-size:12px;border-radius:6px;padding:1px 6px;margin:2px 4px 0 0;background:var(--bg);border:1px solid var(--line)}
.t-very_cheap,.t-cheap{color:var(--acc)}.t-suspicious{color:var(--hot)}
footer{margin-top:24px;font-size:13px;color:var(--muted)}
.m-price{display:none}
@media (max-width:640px){table{min-width:0}th.pic,td.pic,th.loc,td.loc,th.dl,td.dl,th.pr,td.pr{display:none}.m-price{display:block;font-weight:600;margin-top:2px}th,td{padding:8px 6px}}
</style></head><body><main>
<h1>${esc(title)}</h1>
<div class="muted">${esc(when)} · ${r.pages} стр. · ${r.total} объявлений · подходит ${r.items.length}${r.pageLimitHit ? " · достигнут лимит страниц" : ""}</div>
${s && s.n < RELIABLE_N ? `<p class="muted">Всего ${s.n} объявлений с ценой: медиана приблизительная.</p>` : ""}
<div class="cards">${statCards.map(([k, v]) => `<div class="card"><div class="k">${esc(k!)}</div><div class="v">${esc(v!)}</div></div>`).join("")}</div>

<h2>🔥 Интересное</h2>
<ol class="hl">${highlights}</ol>
${flips}

<h2>Все подходящие (${r.items.length})</h2>
<div class="chips" id="chips"><button class="chip" aria-pressed="true" data-tag="">Все</button>${tagsPresent
    .map((t) => `<button class="chip" aria-pressed="false" data-tag="${t}">${esc(TAG_LABEL[t])}</button>`)
    .join("")}</div>
<div class="wrap"><table id="t"><thead><tr>
<th data-k="rank">#</th><th class="pic"></th><th>Объявление</th><th class="pr" data-k="price">Цена</th><th class="dl" data-k="delta">К медиане</th><th data-k="score">Оценка</th><th class="loc">Место</th>
</tr></thead><tbody>
${r.items.map((i, n) => row(i, n + 1)).join("\n")}
</tbody></table></div>

<footer>Отсеяно правилами: ${r.ruleDropped.length}, ИИ: ${r.aiDropped.length}${r.aiUnchecked ? `, не проверено ИИ (лимит): ${r.aiUnchecked}` : ""}.
Оценка: 5 = медианная цена, каждые 10% дешевле дают +1; комплект +1; дефектные сравниваются с ~40% медианы и получают не больше 7. «Подозрительно дёшево» = ниже 45% медианы или признаки мошенничества.</footer>
</main>
<script>
(function(){
  var tb=document.querySelector('#t tbody');var dir={};
  document.querySelectorAll('th[data-k]').forEach(function(th){th.addEventListener('click',function(){
    var k=th.dataset.k;dir[k]=!dir[k];var rows=[].slice.call(tb.rows);
    rows.sort(function(a,b){
      var x=k==='rank'?+a.cells[0].textContent:parseFloat(a.dataset[k]);var y=k==='rank'?+b.cells[0].textContent:parseFloat(b.dataset[k]);
      if(isNaN(x))return 1;if(isNaN(y))return -1;return dir[k]?x-y:y-x;});
    rows.forEach(function(r){tb.appendChild(r);});});});
  document.querySelectorAll('.chip').forEach(function(c){c.addEventListener('click',function(){
    document.querySelectorAll('.chip').forEach(function(x){x.setAttribute('aria-pressed','false');});c.setAttribute('aria-pressed','true');
    var t=c.dataset.tag;[].forEach.call(tb.rows,function(r){r.style.display=!t||(' '+r.dataset.tags+' ').indexOf(' '+t+' ')>=0?'':'none';});});});
})();
</script></body></html>`;
}
