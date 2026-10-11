/**
 * Reference locale. Every other locale must have exactly these keys (enforced by the `Dict` type).
 * Function arguments that come from users or listings are already HTML-escaped by the caller.
 */
export const ru = {
  unitMin: "мин",
  unitHour: "ч",

  // ---------- notification ----------
  priceDropped: (name: string) => `📉 <b>Цена снижена</b> · ${name}`,
  newListing: (name: string) => `🆕 ${name}`,
  looksDefect: "⚠️ Похоже на дефект / на запчасти",
  vsMedian: (pct: string, median: string) => `📊 ${pct} (медиана ${median})`,
  btnOpen: "Открыть",
  btnNotIt: "👎 Не то",
  btnGood: "👍 Годно",
  btnOpenGood: "👍 Открыть",
  btnOpenBad: "👎 Открыть",
  moreListings: (n: number, name: string) => `…и ещё ${n} по «${name}». Открой поиск, чтобы посмотреть всё.`,
  fetchFailing: (name: string, msg: string) => `⚠️ «${name}»: не удаётся загрузить поиск (${msg}). Продолжаю пробовать реже.`,

  // ---------- watch card ----------
  paused: "⏸ на паузе",
  priceLine: (range: string) => `💶 Цена: ${range}`,
  rangeFrom: (x: string) => `от ${x}`,
  rangeTo: (x: string) => `до ${x}`,
  rangeAny: "любая",
  marketReal: (median: string, p25: string, p75: string, age: string) =>
    `📊 Рынок: медиана <b>${median}</b> (обычно ${p25}–${p75}), ${age}`,
  marketGuess: (lo: string, hi: string) => `📊 Рынок: ~${lo}–${hi} по оценке ИИ. Точнее покажет «Анализ рынка»`,
  marketNone: "📊 Рынок: нажми «Анализ рынка», чтобы узнать реальные цены",
  ageToday: "сегодня",
  ageYesterday: "вчера",
  ageDays: (n: number) => `${n} дн. назад`,
  statusLine: (interval: string, ai: boolean, defects: boolean) =>
    `⏱ Раз в ${interval} · 🤖 ИИ ${ai ? "вкл" : "выкл"}${defects ? " · ⚠️ с дефектами" : ""}`,
  openSearch: "Открыть поиск",

  // ---------- settings ----------
  settingsTitle: (id: number, name: string) => `⚙️ <b>Настройки #${id} ${name}</b>`,
  mustLine: (groups: string) => `🔤 В заголовке должно быть одно из: ${groups}`,
  anyTitle: "любой заголовок",
  stopWords: (list: string) => `🚫 Стоп-слова: ${list}`,
  accessories: (list: string) => `🧩 Аксессуары (ок только в комплекте): ${list}`,
  aiLine: (on: boolean, min: number) => `🤖 ИИ: ${on ? `вкл, присылаю от ${min}/10` : "выкл, только правила"}`,
  defectLine: (allow: boolean) => `⚠️ Дефектные / на запчасти: ${allow ? "присылать" : "отсеивать"}`,
  settingsHint: "<i>Слова, цену и порог меняй кнопкой «✏️ Слова и цена».</i>",
  editTitle: "<b>Тонкая настройка</b>",
  editPrice: "диапазон цены (<code>-</code> без границы)",
  editExclude: "добавить стоп-слова",
  editUnexclude: "убрать стоп-слово",
  editMatch: "что обязано быть в заголовке",
  editScore: "порог оценки ИИ",
  editRenameExample: "Моя Xbox",

  // ---------- buttons ----------
  btnPause: "⏸ Пауза",
  btnResume: "▶️ Включить",
  btnScan: "📊 Анализ рынка",
  btnSettings: "⚙️ Настройки",
  btnPreview: "🧪 Превью",
  btnAllWatches: "« Все отслеживания",
  btnAi: (on: boolean): string => (on ? "🤖 ИИ: вкл" : "🤖 ИИ: выкл"),
  btnDefects: (on: boolean): string => (on ? "⚠️ Дефекты: да" : "⚠️ Дефекты: нет"),
  btnWords: "✏️ Слова и цена",
  btnDelete: "🗑 Удалить",
  btnBack: "« Назад",
  btnConfirmDelete: "Да, удалить",
  btnCancel: "Отмена",
  btnYes: "✅ Да",
  btnOpenReport: "🌐 Открыть полный отчёт",

  // ---------- preview ----------
  previewHead: (total: number, n: number) => `Сейчас на сайте ${total} объявлений, под фильтр подходит <b>${n}</b>.`,
  previewAiChecked: (n: number) => `<i>ИИ проверил ${n} из прошедших правила.</i>`,
  previewPassed: "✅ Прошли:",
  previewAiDropped: "🤖 Отсеял ИИ:",
  andMore: (n: number) => `<i>…и ещё ${n}</i>`,
  previewRuleDropped: (n: number, summary: string) => `🗑 Отсеяно правилами: ${n} (${summary}), например:`,
  groupPrice: "цена",
  groupNotItem: "не тот товар",
  groupNotOffer: "не продажа",
  groupStop: "стоп-слово",
  groupAccessory: "аксессуар",
  groupDefect: "дефект",
  groupOther: "другое",
  reasonNotOffer: "не продажа: ",
  reasonStop: "стоп-слово ",
  reasonAccessory: "аксессуар ",
  reasonPriceLow: (p: string, min: string) => `цена ${p} ниже ${min}`,
  reasonPriceHigh: (p: string, max: string) => `цена ${p} выше ${max}`,

  // ---------- market analysis ----------
  scanTitle: (name: string) => `📊 <b>Анализ рынка: ${name}</b>`,
  scanViewed: (total: number, pages: number, limitHit: boolean, n: number) =>
    `Просмотрено ${total} объявлений на ${pages} стр.${limitHit ? " (лимит тарифа)" : ""}, подходит <b>${n}</b>.`,
  scanMedian: (median: string, p25: string, p75: string, min: string, max: string, n: number) =>
    `💶 Медиана <b>${median}</b>, обычно ${p25}–${p75}, от ${min} до ${max} (${n} шт.)`,
  scanFewPrices: (n: number) => `<i>Всего ${n} объявлений с ценой: медиана приблизительная, оценки сделок тоже.</i>`,
  scanNoStats: "💶 Слишком мало объявлений с ценой для статистики.",
  scanHighlights: "🔥 <b>Интересное:</b>",
  scanNoHighlights: "🔥 Явно выгодных предложений сейчас нет.",
  scanFlips: "🔧 <b>Дефектные дёшево</b> (ремонт / перепродажа):",
  scanSuspicious: (n: number) => `⚠️ Подозрительно дешёвых: ${n}. Они в отчёте, но не в топе.`,
  scanAiUnchecked: (n: number, total: number) =>
    `⚠️ <b>ИИ не проверил ${n} из ${total}</b> (дневной лимит). Непроверенные не попадают в «Интересное», а в списке может быть мусор (аксессуары, другие модели).`,
  scanFooterLink: "Полный список с сортировкой и фильтрами по кнопке ниже. Медиана сохранена: новые уведомления будут сравниваться с ней.",
  scanFooterFile: "Полный список в файле ниже. Медиана сохранена: новые уведомления будут сравниваться с ней.",
  pctAt: "по медиане",
  pctBelow: (n: number) => `на ${n}% дешевле медианы`,
  pctAbove: (n: number) => `на ${n}% дороже медианы`,
  tag: {
    very_cheap: "🔥 сильно дешевле рынка",
    cheap: "💸 дешевле рынка",
    bundle: "📦 богатый комплект",
    defect: "🔧 дефект / на запчасти",
    suspicious: "⚠️ подозрительно дёшево",
    no_price: "❔ без цены",
    expensive: "📈 дороже рынка",
  },
  scanNotConfigured: "Анализ рынка не настроен на сервере.",
  scanBusy: "Анализ уже идёт, подожди немного.",
  scanStarting: (name: string) => `📊 Анализирую «${name}»…`,
  scanProgressPages: (page: number, listings: number) => `📊 Загружаю страницы: ${page}, объявлений ${listings}…`,
  scanProgressAi: (done: number, total: number) => `🤖 ИИ проверяет: ${done}/${total}…`,
  scanProgressReport: "📊 Готовлю отчёт…",
  scanLimit: (n: number) => `Лимит анализов на сегодня: ${n}. На Pro больше, см. /plan.`,
  scanFetchFailed: (detail: string) => `Не удалось загрузить поиск: ${detail}`,
  scanCrashed: "Анализ упал с ошибкой, попробуй позже.",
  scanUsage: "Укажи номер отслеживания: <code>/scan 3</code>. Номера в /list.",
  scanPick: "📊 Какой поиск проанализировать?",
  scanStartingToast: "Запускаю анализ…",
  fileCaptionLink: (days: number) => `Копия отчёта файлом. Ссылка выше работает ${days} дней, сортировка и фильтры там.`,
  fileCaptionNoLink: "Полный отчёт. Сортировка и фильтры работают, если открыть файл в браузере (в просмотре Telegram на телефоне нет).",

  // ---------- creating watches ----------
  noWatches: "Отслеживаний пока нет. Пришли ссылку на поиск Willhaben или напиши, что ищешь. Или попробуй пример:",
  listTitle: (n: number, max: number) => `<b>Твои отслеживания</b> (${n}/${max})`,
  creating: "🔎 Смотрю поиск и настраиваю фильтр…",
  errLimit: (max: number) => `Лимит тарифа: ${max} отслеживаний. Удали лишнее в /list или перейди на Pro (/plan).`,
  errUnsupported: (detail: string) => `Пока поддерживаю только Willhaben. ${detail}`,
  errBadUrl: (detail: string) => `Это не похоже на страницу поиска. Открой поиск, а не одно объявление, и пришли ссылку. ${detail}`,
  errFetch: (detail: string) => `Не удалось загрузить поиск, попробуй позже. (${detail})`,
  errDuplicate: "Такой поиск уже отслеживается, смотри /list.",
  createdAi: "✅ Готово. ИИ разобрал, что ты ищешь, и собрал фильтр:",
  createdFallback: (aiConfigured: boolean) =>
    `✅ Готово. Фильтр по словам запроса${aiConfigured ? " (ИИ не ответил, проверь правила)" : ""}:`,
  seededNote: "Текущие объявления запомнил. Пришлю только новые и подешевевшие.",
  confirmKeyword: (kw: string) =>
    `Следить за «<b>${kw}</b>» на Willhaben по всей Австрии?\n<i>Для региона, категории и цены лучше прислать ссылку на поиск с нужными фильтрами.</i>`,
  sendLinkOrText: "Пришли ссылку на поиск или коротко напиши, что ищешь.",
  requestExpired: "Запрос устарел, напиши ещё раз.",
  cancelled: "Отменено",
  creatingExample: (kw: string) => `Создаю «${kw}»…`,
  unknownCommand: "Неизвестная команда. Помощь: /help",
  badCommand: (usage: string) => `Не понял. Пример: <code>${usage}</code>`,

  // ---------- toasts ----------
  notFound: "Не найдено",
  aiNotConfigured: "ИИ не настроен на сервере",
  saved: "Сохранено",
  proOnly: "Доступно на Pro, см. /plan",
  loading: "Загружаю…",
  loadFailed: (msg: string) => `Не удалось загрузить: ${msg}`,
  deleted: "Удалено",
  watchGone: "Отслеживание удалено",
  fbGood: "Спасибо, учту",
  fbBadAi: "Учту. Похожие будут отсеиваться",
  fbBadNoAi: "Учту. Включи ИИ или добавь стоп-слово через /exclude",

  // ---------- plan ----------
  planName: (pro: boolean) => `Тариф: <b>${pro ? "Pro" : "Free"}</b>`,
  planWatches: (n: number, max: number) => `Отслеживаний: ${n}/${max}`,
  planInterval: (i: string) => `Минимальный интервал: ${i}`,
  planAi: (n: number, max: number) => `ИИ-проверок сегодня: ${n}/${max}`,
  planProPitch: (watches: number, interval: string, ai: number) =>
    `<b>Pro</b>: до ${watches} отслеживаний, проверка раз в ${interval}, ${ai} ИИ-проверок в день.`,

  // ---------- language ----------
  langPrompt: "🌐 Выбери язык:",
  langSet: "Готово, теперь по-русски.",

  // ---------- onboarding and help ----------
  welcome: `👋 <b>DealRadar</b> следит за объявлениями на willhaben.at и присылает только то, что ты ищешь: без аксессуаров, обменов и мусора. И сразу говорит, дешевле ли это рынка.

<b>Как начать:</b> пришли ссылку на поиск Willhaben или просто напиши, что ищешь, например <code>ps5 digital</code>.

Попробуй на примере 👇`,
  btnHowLink: "🔗 Как взять ссылку",
  btnWhatCan: "🤖 Что умеет",
  btnLanguage: "🌐 Язык",
  helpLabels: {
    about: "🤖 Что умеет",
    link: "🔗 Как взять ссылку",
    filter: "🧹 Фильтр и ИИ",
    scan: "📊 Анализ рынка",
    plan: "💎 Тарифы",
  },
  helpAbout: `🤖 <b>Что умеет DealRadar</b>

• <b>Следит за поиском</b> и присылает новые объявления через минуты после публикации, а также снижения цены
• <b>Отсеивает мусор:</b> аксессуары без самого товара, «suche», обмены, пустые коробки, другие модели
• <b>Оценивает сделку:</b> на сколько дешевле рынка, что в комплекте, есть ли дефект
• <b>Анализ рынка:</b> читает все страницы поиска и показывает медиану цен и лучшие предложения
• <b>Учится:</b> кнопки 👎/👍 под объявлением помогают ИИ понять, что тебе нужно

Можно вести несколько отслеживаний сразу: /list · Язык: /lang`,
  helpLink: `🔗 <b>Как взять ссылку на поиск</b>

Текстового запроса (<code>ps5 digital</code>) хватает для старта. Ссылка нужна, если важны регион, категория или цена.

<b>В приложении Willhaben</b>
1. Найди товар и настрой фильтры: регион, цена, состояние
2. Нажми «Поделиться» (значок ↗ вверху) → «Копировать»
3. Вставь ссылку сюда

<b>В браузере</b>
1. Открой willhaben.at, найди товар, выставь фильтры
2. Скопируй адрес из адресной строки
3. Вставь сюда

⚠️ Нужна ссылка на <b>страницу поиска</b> (список объявлений), а не на одно объявление.`,
  helpFilter: `🧹 <b>Как работает фильтр</b>

Каждое объявление проходит три ступени:
1. <b>Общие правила:</b> «suche», «tausche», пустые коробки, дефекты
2. <b>Твой фильтр:</b> в заголовке должна быть модель, стоп-слова отсекают лишнее, аксессуары ок только в комплекте
3. <b>ИИ</b> читает объявление целиком и ставит оценку 1–10: подходит ли товар, состояние, что в комплекте

Фильтр собирается сам из запроса. Поправить его можно в карточке: /list → отслеживание → ⚙️ Настройки.

При создании и по кнопке «🧪 Превью» видно, что прошло и что отсеялось. Так ошибку в фильтре видно сразу.`,
  helpScan: `📊 <b>Анализ рынка</b>

Бот читает все страницы поиска, отбирает подходящие объявления и считает:
• <b>медиану</b> и типичный диапазон цен
• <b>лучшие предложения</b> (дешевле медианы, проверены ИИ)
• <b>дефектные дёшево</b> для ремонта и перепродажи
• <b>подозрительно дешёвые</b>: возможный обман

Медиана запоминается, и новые уведомления показывают «на 18% дешевле медианы».

Запуск: /list → отслеживание → 📊 Анализ рынка, или <code>/scan 3</code>.`,
  helpPlan: (
    free: { watches: number; interval: string; ai: number; scans: number; pages: number },
    pro: { watches: number; interval: string; ai: number; scans: number; pages: number },
  ) => `💎 <b>Тарифы</b>

<b>Free</b>: ${free.watches} отслеживания, проверка раз в ${free.interval}, ${free.ai} ИИ-проверок и ${free.scans} анализа рынка в день (до ${free.pages} стр.)

<b>Pro</b>: ${pro.watches} отслеживаний, проверка раз в ${pro.interval}, ${pro.ai} ИИ-проверок и ${pro.scans} анализов в день (до ${pro.pages} стр.)

Твой тариф и расход: /plan`,

  // ---------- Telegram command menu ----------
  cmdList: "Мои отслеживания",
  cmdScan: "Анализ рынка по всем страницам",
  cmdPlan: "Тариф и лимиты",
  cmdLang: "Язык",
  cmdHelp: "Помощь",

  // ---------- HTML report ----------
  report: {
    title: (name: string) => `Анализ рынка: ${name}`,
    meta: (pages: number, total: number, n: number, limitHit: boolean) =>
      `${pages} стр. · ${total} объявлений · подходит ${n}${limitHit ? " · достигнут лимит страниц" : ""}`,
    fewPrices: (n: number) => `Всего ${n} объявлений с ценой: медиана приблизительная.`,
    median: "Медиана",
    typical: "Типичный диапазон",
    minMax: "Мин / макс",
    withPrice: "Подходящих с ценой",
    fewData: "мало данных",
    highlights: "🔥 Интересное",
    noHighlights: "Сейчас явно выгодных предложений нет.",
    score: (s: number) => `оценка ${s}/10`,
    flipsTitle: "🔧 Дефектные дёшево",
    flipsNote: "Для ремонта или перепродажи. Оценка считается от цены дефектных (~40% медианы), а не рабочих.",
    all: (n: number) => `Все подходящие (${n})`,
    sorted: "Отсортировано по оценке сделки, лучшие сверху.",
    noJs: "Сортировка и фильтры не работают во встроенном просмотре Telegram. Открой отчёт по кнопке «🌐 Открыть полный отчёт» в чате с ботом или в браузере.",
    chipAll: "Все",
    colListing: "Объявление",
    colPrice: "Цена",
    colDelta: "К медиане",
    colScore: "Оценка",
    colPlace: "Место",
    notChecked: "ИИ не проверял",
    footer: (rules: number, ai: number, unchecked: number) =>
      `Отсеяно правилами: ${rules}, ИИ: ${ai}${unchecked ? `, не проверено ИИ (лимит): ${unchecked}` : ""}.
Оценка: 5 = медианная цена, каждые 10% дешевле дают +1; комплект +1; дефектные сравниваются с ~40% медианы и получают не больше 7. «Подозрительно дёшево» = ниже 45% медианы или признаки мошенничества.`,
  },
};

export type Dict = typeof ru;
