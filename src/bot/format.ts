import { PLANS } from "../core/plans.js";
import type { Preview } from "../services/watches.js";
import type { ScanReport } from "../services/scan.js";
import { pct, RELIABLE_N, TAG_LABEL, vsMedian } from "../core/market.js";
import type { ListingInfo } from "../services/notifier.js";
import type { Listing, User, Watch } from "../types.js";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const eur = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100) / 100} €`);

export function intervalLabel(sec: number) {
  return sec < 3600 ? `${Math.round(sec / 60)} мин` : `${Math.round(sec / 3600)} ч`;
}

export function listingText(watch: Watch, l: Listing, info: ListingInfo): string {
  const lines: string[] = [];
  lines.push(info.oldPrice !== null ? `📉 <b>Цена снижена</b> · ${esc(watch.name)}` : `🆕 ${esc(watch.name)}`);
  lines.push(`<b>${esc(l.title)}</b>`);
  lines.push(info.oldPrice !== null ? `💶 <b>${eur(l.price)}</b> <s>${eur(info.oldPrice)}</s>` : `💶 <b>${eur(l.price)}</b>`);
  if (l.location) lines.push(`📍 ${esc(l.location)}`);
  if (info.defect || info.verdict?.condition === "defect") lines.push("⚠️ Похоже на дефект / на запчасти");
  if (watch.market && l.price !== null) {
    lines.push(`📊 ${pct(vsMedian(l.price, watch.market))} (медиана ${eur(watch.market.median)})`);
  }
  const v = info.verdict;
  if (v) {
    if (v.bundle.length) lines.push(`📦 ${esc(v.bundle.join(", "))}`);
    lines.push(`⭐ ${v.score}/10${v.reason ? ` · ${esc(v.reason)}` : ""}`);
  }
  const text = lines.join("\n");
  // Telegram caption limit is 1024
  return text.length > 1000 ? text.slice(0, 997) + "…" : text;
}

export function profileSummary(w: Watch): string {
  const p = w.profile;
  const groups = p.mustAny.length ? p.mustAny.map((g) => g.join(" ")).join(" | ") : "любой заголовок";
  return [
    `<b>#${w.id} ${esc(w.name)}</b> ${w.active ? "🟢" : "⏸"}`,
    `🎯 Ищу: ${esc(p.item)}`,
    `🔤 В заголовке: <code>${esc(groups)}</code>`,
    `🚫 Исключить: ${p.exclude.length ? `<code>${esc(p.exclude.join(", "))}</code>` : "—"}`,
    `🧩 Аксессуары (только в комплекте): ${p.accessoryWords.length ? `<code>${esc(p.accessoryWords.join(", "))}</code>` : "—"}`,
    `💶 Цена: ${eur(p.priceMin)} … ${p.priceMax === null ? "без потолка" : eur(p.priceMax)}` +
      (p.typicalPrice?.max ? ` · обычно ~${eur(p.typicalPrice.min)}–${eur(p.typicalPrice.max)} (для оценки ИИ)` : ""),
    `🤖 ИИ: ${p.useAi ? `вкл, порог ${p.minScore}/10` : "выкл"} · ⚠️ Дефектные: ${p.allowDefect ? "да" : "нет"}`,
    `⏱ Проверка: каждые ${intervalLabel(w.intervalSec)}`,
    `🔗 <a href="${esc(w.query.url)}">Поиск на сайте</a>`,
  ].join("\n");
}

export function editHelp(id: number): string {
  return [
    "<b>Тонкая настройка</b>",
    `<code>/price ${id} 80 220</code>: диапазон цены (<code>-</code> без границы)`,
    `<code>/exclude ${id} hülle, spiel</code>: добавить стоп-слова`,
    `<code>/unexclude ${id} controller</code>: убрать стоп-слово`,
    `<code>/match ${id} series s | xbox s</code>: что обязано быть в заголовке`,
    `<code>/score ${id} 6</code>: порог оценки ИИ`,
    `<code>/rename ${id} Моя Xbox</code>`,
  ].join("\n");
}

/** Telegram caps a message at 4096 chars; titles are cut so a long preview still fits. */
const short = (t: string, n = 70) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
const more = (shown: number, total: number) => (total > shown ? [`<i>…и ещё ${total - shown}</i>`] : []);

export function previewText(p: Preview, limits = { passed: 15, dropped: 5 }): string {
  const lines = [`Сейчас на сайте ${p.total} объявлений, под фильтр подходит <b>${p.passed.length}</b>.`];
  if (p.aiChecked > 0) lines.push(`<i>ИИ проверил ${p.aiChecked} из прошедших правила.</i>`);
  if (p.passed.length) {
    lines.push("", "✅ Прошли:");
    for (const { listing } of p.passed.slice(0, limits.passed)) lines.push(`• ${esc(short(listing.title))} · ${eur(listing.price)}`);
    lines.push(...more(limits.passed, p.passed.length));
  }
  if (p.aiDropped.length) {
    lines.push("", "🤖 Отсеял ИИ:");
    for (const { listing, reason } of p.aiDropped.slice(0, limits.dropped)) {
      lines.push(`• ${esc(short(listing.title))} · ${eur(listing.price)} · <i>${esc(short(reason, 90))}</i>`);
    }
    lines.push(...more(limits.dropped, p.aiDropped.length));
  }
  if (p.dropped.length) {
    const byReason = new Map<string, number>();
    for (const { rule } of p.dropped) {
      const k = reasonGroup(rule.reason);
      byReason.set(k, (byReason.get(k) ?? 0) + 1);
    }
    const summary = [...byReason.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
    lines.push("", `🗑 Отсеяно правилами: ${p.dropped.length} (${summary}), например:`);
    for (const { listing, rule } of p.dropped.slice(0, limits.dropped)) {
      lines.push(`• ${esc(short(listing.title))} · <i>${esc(ruleReasonRu(rule.reason))}</i>`);
    }
  }
  return lines.join("\n");
}

export function scanSummaryText(r: ScanReport): string {
  const s = r.stats;
  const lines = [
    `📊 <b>Анализ рынка: ${esc(r.watch.name)}</b>`,
    `Просмотрено ${r.total} объявлений на ${r.pages} стр.${r.pageLimitHit ? " (лимит тарифа)" : ""}, подходит <b>${r.items.length}</b>.`,
  ];
  if (s) {
    lines.push(`💶 Медиана <b>${eur(s.median)}</b>, обычно ${eur(s.p25)}–${eur(s.p75)}, от ${eur(s.min)} до ${eur(s.max)} (${s.n} шт.)`);
    if (s.n < RELIABLE_N) lines.push(`<i>Всего ${s.n} объявлений с ценой: медиана приблизительная, оценки сделок тоже.</i>`);
  } else {
    lines.push("💶 Слишком мало объявлений с ценой для статистики.");
  }
  lines.push("", r.highlights.length ? "🔥 <b>Интересное:</b>" : "🔥 Явно выгодных предложений сейчас нет.");
  r.highlights.forEach((h, i) => {
    const tags = h.deal.tags.filter((t) => t !== "cheap" && t !== "very_cheap").map((t) => TAG_LABEL[t]);
    lines.push(
      `${i + 1}. <a href="${esc(h.listing.url)}">${esc(h.listing.title.slice(0, 60))}</a> · <b>${eur(h.listing.price)}</b> · ${
        h.deal.delta !== null ? pct(h.deal.delta) : ""
      }${tags.length ? ` · ${tags.join(", ")}` : ""}`,
    );
  });
  if (r.flips.length) {
    lines.push("", "🔧 <b>Дефектные дёшево</b> (ремонт / перепродажа):");
    for (const f of r.flips) {
      lines.push(`• <a href="${esc(f.listing.url)}">${esc(f.listing.title.slice(0, 60))}</a> · <b>${eur(f.listing.price)}</b>${f.verdict?.note ? ` · ${esc(f.verdict.note.slice(0, 60))}` : ""}`);
    }
  }
  const susp = r.items.filter((i) => i.deal.tags.includes("suspicious")).length;
  if (susp) lines.push("", `⚠️ Подозрительно дешёвых: ${susp}. Они в отчёте, но не в топе.`);
  if (r.aiUnchecked) {
    lines.push(
      `⚠️ <b>ИИ не проверил ${r.aiUnchecked} из ${r.items.length}</b> (дневной лимит). Непроверенные не попадают в «Интересное», а в списке может быть мусор (аксессуары, другие модели).`,
    );
  }
  lines.push("", "Полный список с сортировкой в файле ниже. Медиана сохранена: новые уведомления будут сравниваться с ней.");
  return lines.join("\n");
}

/** Coarse bucket for the drop summary, so a price cut is visible at a glance. */
export function reasonGroup(reason: string): string {
  if (reason.startsWith("price")) return "цена";
  if (reason.startsWith("title does not match")) return "не тот товар";
  if (reason.startsWith("not an offer")) return "не продажа";
  if (reason.startsWith("excluded word")) return "стоп-слово";
  if (reason.startsWith("looks like an accessory")) return "аксессуар";
  if (reason.startsWith("defect")) return "дефект";
  return "другое";
}

/** Rule reasons are English in code; users see Russian. */
export function ruleReasonRu(reason: string): string {
  return reason
    .replace("title does not match the item", "не тот товар")
    .replace(/^not an offer: /, "не продажа: ")
    .replace(/^excluded word: /, "стоп-слово ")
    .replace(/^looks like an accessory: /, "аксессуар ")
    .replace(/^price (.+) < (.+)$/, "цена $1 ниже $2")
    .replace(/^price (.+) > (.+)$/, "цена $1 выше $2")
    .replace("defect / for parts", "дефект");
}

export function planText(user: User, watches: number, aiToday: number): string {
  const l = PLANS[user.plan];
  return [
    `Тариф: <b>${user.plan === "pro" ? "Pro" : "Free"}</b>`,
    `Отслеживаний: ${watches}/${l.maxWatches}`,
    `Минимальный интервал: ${intervalLabel(l.minIntervalSec)}`,
    `ИИ-проверок сегодня: ${aiToday}/${l.aiPerDay}`,
  ].join("\n");
}

export const WELCOME = `👋 Я слежу за объявлениями и присылаю только то, что тебе нужно.

<b>Как начать</b>
1. Открой поиск на willhaben.at, настрой фильтры, скопируй ссылку
2. Пришли её сюда. Или просто напиши, что ищешь: <code>ps5 digital</code>
3. Я сам пойму, что ты ищешь, отсею аксессуары и мусор, и буду присылать новые объявления

/list мои отслеживания
/plan тариф и лимиты
/help все команды`;

export const HELP = `<b>Команды</b>
Ссылка или текст: новое отслеживание
/list список и управление
/price, /exclude, /unexclude, /match, /score, /rename: тонкая настройка (подсказка в карточке отслеживания)
/plan тариф

Под каждым объявлением есть «👎 Не то». Бот учится на этих отметках.`;
