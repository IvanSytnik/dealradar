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

/** "от 120 €", "120–300 €", "до 300 €", "любая" */
export function priceRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${eur(min)}–${eur(max)}`;
  if (min !== null) return `от ${eur(min)}`;
  if (max !== null) return `до ${eur(max)}`;
  return "любая";
}

/**
 * Market line: real numbers from the last scan win over the AI's guess, which is only a prior
 * (the AI said ~120–260 € for an Xbox Series S while the scan found a 300 € median).
 */
function marketLine(w: Watch): string {
  if (w.market) {
    const days = Math.floor((Date.now() - w.market.at) / 86_400_000);
    const age = days <= 0 ? "сегодня" : days === 1 ? "вчера" : `${days} дн. назад`;
    return `📊 Рынок: медиана <b>${eur(w.market.median)}</b> (обычно ${eur(w.market.p25)}–${eur(w.market.p75)}), ${age}`;
  }
  const t = w.profile.typicalPrice;
  if (t?.max) return `📊 Рынок: ~${eur(t.min)}–${eur(t.max)} по оценке ИИ. Точнее покажет «Анализ рынка»`;
  return "📊 Рынок: нажми «Анализ рынка», чтобы узнать реальные цены";
}

/** Compact watch card: what a user needs at a glance. Filter internals live in the settings view. */
export function profileSummary(w: Watch): string {
  const p = w.profile;
  return [
    `<b>#${w.id} ${esc(w.name)}</b> ${w.active ? "🟢" : "⏸ на паузе"}`,
    `🎯 ${esc(p.item)}`,
    `💶 Цена: ${priceRange(p.priceMin, p.priceMax)}`,
    marketLine(w),
    `⏱ Раз в ${intervalLabel(w.intervalSec)} · 🤖 ИИ ${p.useAi ? "вкл" : "выкл"}${p.allowDefect ? " · ⚠️ с дефектами" : ""}`,
    `🔗 <a href="${esc(w.query.url)}">Открыть поиск</a>`,
  ].join("\n");
}

/** Everything the filter does, shown in the settings view. */
export function filterDetails(w: Watch): string {
  const p = w.profile;
  const groups = p.mustAny.length ? p.mustAny.map((g) => g.join(" ")).join(" | ") : "любой заголовок";
  const list = (xs: string[]) => (xs.length ? `<code>${esc(xs.join(", "))}</code>` : "—");
  return [
    `⚙️ <b>Настройки #${w.id} ${esc(w.name)}</b>`,
    "",
    `🔤 В заголовке должно быть одно из: <code>${esc(groups)}</code>`,
    `🚫 Стоп-слова: ${list(p.exclude)}`,
    `🧩 Аксессуары (ок только в комплекте): ${list(p.accessoryWords)}`,
    `💶 Цена: ${priceRange(p.priceMin, p.priceMax)}`,
    `🤖 ИИ: ${p.useAi ? `вкл, присылаю от ${p.minScore}/10` : "выкл, только правила"}`,
    `⚠️ Дефектные / на запчасти: ${p.allowDefect ? "присылать" : "отсеивать"}`,
    "",
    "<i>Слова, цену и порог меняй кнопкой «✏️ Слова и цена».</i>",
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

export function scanSummaryText(r: ScanReport, opts: { link?: boolean } = {}): string {
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
  lines.push(
    "",
    opts.link
      ? "Полный список с сортировкой и фильтрами по кнопке ниже. Медиана сохранена: новые уведомления будут сравниваться с ней."
      : "Полный список в файле ниже. Медиана сохранена: новые уведомления будут сравниваться с ней.",
  );
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

export const WELCOME = `👋 <b>DealRadar</b> следит за объявлениями на willhaben.at и присылает только то, что ты ищешь: без аксессуаров, обменов и мусора. И сразу говорит, дешевле ли это рынка.

<b>Как начать:</b> пришли ссылку на поиск Willhaben или просто напиши, что ищешь, например <code>ps5 digital</code>.

Попробуй на примере 👇`;

/** One-tap examples on the welcome screen: the fastest way to see what the bot does. */
export const EXAMPLES = ["ps5", "iphone 13", "e-bike"] as const;
export const EXAMPLE_LABELS = ["🎮 PS5", "📱 iPhone 13", "🚲 E-Bike"] as const;

export type HelpTopic = "about" | "link" | "filter" | "scan" | "plan";

export const HELP_TOPICS: { id: HelpTopic; label: string }[] = [
  { id: "about", label: "🤖 Что умеет" },
  { id: "link", label: "🔗 Как взять ссылку" },
  { id: "filter", label: "🧹 Фильтр и ИИ" },
  { id: "scan", label: "📊 Анализ рынка" },
  { id: "plan", label: "💎 Тарифы" },
];

export function helpText(topic: HelpTopic): string {
  switch (topic) {
    case "about":
      return `🤖 <b>Что умеет DealRadar</b>

• <b>Следит за поиском</b> и присылает новые объявления через минуты после публикации, а также снижения цены
• <b>Отсеивает мусор:</b> аксессуары без самого товара, «suche», обмены, пустые коробки, другие модели
• <b>Оценивает сделку:</b> на сколько дешевле рынка, что в комплекте, есть ли дефект
• <b>Анализ рынка:</b> читает все страницы поиска и показывает медиану цен и лучшие предложения
• <b>Учится:</b> кнопки 👎/👍 под объявлением помогают ИИ понять, что тебе нужно

Можно вести несколько отслеживаний сразу: /list`;
    case "link":
      return `🔗 <b>Как взять ссылку на поиск</b>

Текстового запроса (<code>ps5 digital</code>) хватает для старта. Ссылка нужна, если важны регион, категория или цена.

<b>В приложении Willhaben</b>
1. Найди товар и настрой фильтры: регион, цена, состояние
2. Нажми «Поделиться» (значок ↗ вверху) → «Копировать»
3. Вставь ссылку сюда

<b>В браузере</b>
1. Открой willhaben.at, найди товар, выставь фильтры
2. Скопируй адрес из адресной строки
3. Вставь сюда

⚠️ Нужна ссылка на <b>страницу поиска</b> (список объявлений), а не на одно объявление.`;
    case "filter":
      return `🧹 <b>Как работает фильтр</b>

Каждое объявление проходит три ступени:
1. <b>Общие правила:</b> «suche», «tausche», пустые коробки, дефекты
2. <b>Твой фильтр:</b> в заголовке должна быть модель, стоп-слова отсекают лишнее, аксессуары ок только в комплекте
3. <b>ИИ</b> читает объявление целиком и ставит оценку 1–10: подходит ли товар, состояние, что в комплекте

Фильтр собирается сам из запроса. Поправить его можно в карточке: /list → отслеживание → ⚙️ Настройки.

При создании и по кнопке «🧪 Превью» видно, что прошло и что отсеялось. Так ошибку в фильтре видно сразу.`;
    case "scan":
      return `📊 <b>Анализ рынка</b>

Бот читает все страницы поиска, отбирает подходящие объявления и считает:
• <b>медиану</b> и типичный диапазон цен
• <b>лучшие предложения</b> (дешевле медианы, проверены ИИ)
• <b>дефектные дёшево</b> для ремонта и перепродажи
• <b>подозрительно дешёвые</b>: возможный обман

Медиана запоминается, и новые уведомления показывают «на 18% дешевле рынка».

Запуск: /list → отслеживание → 📊 Анализ рынка, или <code>/scan 3</code>.`;
    case "plan":
      return `💎 <b>Тарифы</b>

<b>Free</b>: ${PLANS.free.maxWatches} отслеживания, проверка раз в ${intervalLabel(PLANS.free.minIntervalSec)}, ${PLANS.free.aiPerDay} ИИ-проверок и ${PLANS.free.scansPerDay} анализа рынка в день (до ${PLANS.free.scanPages} стр.)

<b>Pro</b>: ${PLANS.pro.maxWatches} отслеживаний, проверка раз в ${intervalLabel(PLANS.pro.minIntervalSec)}, ${PLANS.pro.aiPerDay} ИИ-проверок и ${PLANS.pro.scansPerDay} анализов в день (до ${PLANS.pro.scanPages} стр.)

Твой тариф и расход: /plan`;
  }
}

export const HELP = helpText("about");
