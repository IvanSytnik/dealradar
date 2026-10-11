import type { Dict } from "./ru.js";

/** Informal "du", like Willhaben itself; "Anzeige" for a listing, as on the site. */
export const de: Dict = {
  unitMin: "Min.",
  unitHour: "Std.",

  priceDropped: (name) => `📉 <b>Preis gesenkt</b> · ${name}`,
  newListing: (name) => `🆕 ${name}`,
  looksDefect: "⚠️ Wirkt defekt / für Bastler",
  vsMedian: (pct, median) => `📊 ${pct} (Median ${median})`,
  btnOpen: "Öffnen",
  btnNotIt: "👎 Passt nicht",
  btnGood: "👍 Passt",
  btnOpenGood: "👍 Öffnen",
  btnOpenBad: "👎 Öffnen",
  moreListings: (n, name) => `…und ${n} weitere für „${name}“. Öffne die Suche, um alle zu sehen.`,
  fetchFailing: (name, msg) => `⚠️ „${name}“: Die Suche lässt sich nicht laden (${msg}). Ich versuche es weiter, aber seltener.`,

  paused: "⏸ pausiert",
  priceLine: (range) => `💶 Preis: ${range}`,
  rangeFrom: (x) => `ab ${x}`,
  rangeTo: (x) => `bis ${x}`,
  rangeAny: "beliebig",
  marketReal: (median, p25, p75, age) => `📊 Markt: Median <b>${median}</b> (meist ${p25}–${p75}), ${age}`,
  marketGuess: (lo, hi) => `📊 Markt: ~${lo}–${hi} laut KI-Schätzung. Genaue Zahlen liefert die „Marktanalyse“`,
  marketNone: "📊 Markt: Tippe auf „Marktanalyse“, um echte Preise zu sehen",
  ageToday: "heute",
  ageYesterday: "gestern",
  ageDays: (n) => `vor ${n} Tagen`,
  statusLine: (interval, ai, defects) =>
    `⏱ Alle ${interval} · 🤖 KI ${ai ? "an" : "aus"}${defects ? " · ⚠️ inkl. defekte" : ""}`,
  openSearch: "Suche öffnen",

  settingsTitle: (id, name) => `⚙️ <b>Einstellungen #${id} ${name}</b>`,
  mustLine: (groups) => `🔤 Titel muss eines davon enthalten: ${groups}`,
  anyTitle: "beliebiger Titel",
  stopWords: (list) => `🚫 Stoppwörter: ${list}`,
  accessories: (list) => `🧩 Zubehör (nur im Bundle ok): ${list}`,
  aiLine: (on, min) => `🤖 KI: ${on ? `an, sende ab ${min}/10` : "aus, nur Regeln"}`,
  defectLine: (allow) => `⚠️ Defekt / für Bastler: ${allow ? "senden" : "aussortieren"}`,
  settingsHint: "<i>Wörter, Preis und Schwelle änderst du über „✏️ Wörter & Preis“.</i>",
  editTitle: "<b>Feineinstellung</b>",
  editPrice: "Preisbereich (<code>-</code> = ohne Grenze)",
  editExclude: "Stoppwörter hinzufügen",
  editUnexclude: "Stoppwort entfernen",
  editMatch: "was im Titel stehen muss",
  editScore: "KI-Schwelle",
  editRenameExample: "Meine Xbox",

  btnPause: "⏸ Pause",
  btnResume: "▶️ Fortsetzen",
  btnScan: "📊 Marktanalyse",
  btnSettings: "⚙️ Einstellungen",
  btnPreview: "🧪 Vorschau",
  btnAllWatches: "« Alle Suchaufträge",
  btnAi: (on) => (on ? "🤖 KI: an" : "🤖 KI: aus"),
  btnDefects: (on) => (on ? "⚠️ Defekte: ja" : "⚠️ Defekte: nein"),
  btnWords: "✏️ Wörter & Preis",
  btnDelete: "🗑 Löschen",
  btnBack: "« Zurück",
  btnConfirmDelete: "Ja, löschen",
  btnCancel: "Abbrechen",
  btnYes: "✅ Ja",
  btnOpenReport: "🌐 Ganzen Bericht öffnen",

  previewHead: (total, n) => `Gerade ${total} Anzeigen online, <b>${n}</b> passen zum Filter.`,
  previewAiChecked: (n) => `<i>Die KI hat ${n} der durch die Regeln gekommenen geprüft.</i>`,
  previewPassed: "✅ Passen:",
  previewAiDropped: "🤖 Von der KI aussortiert:",
  andMore: (n) => `<i>…und ${n} weitere</i>`,
  previewRuleDropped: (n, summary) => `🗑 Von Regeln aussortiert: ${n} (${summary}), z. B.:`,
  groupPrice: "Preis",
  groupNotItem: "falscher Artikel",
  groupNotOffer: "kein Verkauf",
  groupStop: "Stoppwort",
  groupAccessory: "Zubehör",
  groupDefect: "defekt",
  groupOther: "Sonstiges",
  reasonNotOffer: "kein Verkauf: ",
  reasonStop: "Stoppwort ",
  reasonAccessory: "Zubehör ",
  reasonPriceLow: (p, min) => `Preis ${p} unter ${min}`,
  reasonPriceHigh: (p, max) => `Preis ${p} über ${max}`,

  scanTitle: (name) => `📊 <b>Marktanalyse: ${name}</b>`,
  scanViewed: (total, pages, limitHit, n) =>
    `${total} Anzeigen auf ${pages} Seiten geprüft${limitHit ? " (Tariflimit)" : ""}, <b>${n}</b> passen.`,
  scanMedian: (median, p25, p75, min, max, n) =>
    `💶 Median <b>${median}</b>, meist ${p25}–${p75}, von ${min} bis ${max} (${n} Stk.)`,
  scanFewPrices: (n) => `<i>Nur ${n} Anzeigen mit Preis: Median und Bewertungen sind grob.</i>`,
  scanNoStats: "💶 Zu wenige Anzeigen mit Preis für eine Statistik.",
  scanHighlights: "🔥 <b>Interessant:</b>",
  scanNoHighlights: "🔥 Gerade keine klaren Schnäppchen.",
  scanFlips: "🔧 <b>Defekte günstig</b> (Reparatur / Weiterverkauf):",
  scanSuspicious: (n) => `⚠️ Verdächtig billig: ${n}. Sie stehen im Bericht, aber nicht in der Top-Liste.`,
  scanAiUnchecked: (n, total) =>
    `⚠️ <b>Die KI hat ${n} von ${total} nicht geprüft</b> (Tageslimit). Ungeprüfte kommen nie unter „Interessant“, und die Liste kann Müll enthalten (Zubehör, andere Modelle).`,
  scanFooterLink: "Die ganze Liste mit Sortierung und Filtern über den Button unten. Der Median ist gespeichert: neue Benachrichtigungen werden damit verglichen.",
  scanFooterFile: "Die ganze Liste in der Datei unten. Der Median ist gespeichert: neue Benachrichtigungen werden damit verglichen.",
  pctAt: "beim Median",
  pctBelow: (n) => `${n} % unter dem Median`,
  pctAbove: (n) => `${n} % über dem Median`,
  tag: {
    very_cheap: "🔥 weit unter Marktpreis",
    cheap: "💸 unter Marktpreis",
    bundle: "📦 großes Bundle",
    defect: "🔧 defekt / für Bastler",
    suspicious: "⚠️ verdächtig billig",
    no_price: "❔ ohne Preis",
    expensive: "📈 über Marktpreis",
  },
  scanNotConfigured: "Die Marktanalyse ist auf dem Server nicht eingerichtet.",
  scanBusy: "Eine Analyse läuft schon, einen Moment bitte.",
  scanStarting: (name) => `📊 Analysiere „${name}“…`,
  scanProgressPages: (page, listings) => `📊 Lade Seiten: ${page}, Anzeigen ${listings}…`,
  scanProgressAi: (done, total) => `🤖 KI prüft: ${done}/${total}…`,
  scanProgressReport: "📊 Erstelle den Bericht…",
  scanLimit: (n) => `Tageslimit für Analysen: ${n}. Mit Pro mehr, siehe /plan.`,
  scanFetchFailed: (detail) => `Die Suche ließ sich nicht laden: ${detail}`,
  scanCrashed: "Die Analyse ist fehlgeschlagen, bitte später nochmal.",
  scanUsage: "Gib die Nummer des Suchauftrags an: <code>/scan 3</code>. Nummern stehen in /list.",
  scanPick: "📊 Welche Suche soll ich analysieren?",
  scanStartingToast: "Starte die Analyse…",
  fileCaptionLink: (days) => `Der Bericht als Datei. Der Link oben gilt ${days} Tage und hat Sortierung und Filter.`,
  fileCaptionNoLink: "Ganzer Bericht. Sortierung und Filter funktionieren, wenn du die Datei im Browser öffnest (nicht in der Telegram-Vorschau am Handy).",

  noWatches: "Noch keine Suchaufträge. Schick einen Willhaben-Suchlink oder schreib, was du suchst. Oder probier ein Beispiel:",
  listTitle: (n, max) => `<b>Deine Suchaufträge</b> (${n}/${max})`,
  creating: "🔎 Ich schaue mir die Suche an und richte den Filter ein…",
  errLimit: (max) => `Tariflimit: ${max} Suchaufträge. Lösch einen in /list oder wechsle zu Pro (/plan).`,
  errUnsupported: (detail) => `Derzeit wird nur Willhaben unterstützt. ${detail}`,
  errBadUrl: (detail) => `Das sieht nicht nach einer Suchseite aus. Öffne eine Suche (keine einzelne Anzeige) und schick den Link. ${detail}`,
  errFetch: (detail) => `Die Suche ließ sich nicht laden, bitte später nochmal. (${detail})`,
  errDuplicate: "Diese Suche beobachtest du schon, siehe /list.",
  createdAi: "✅ Fertig. Die KI hat erkannt, was du suchst, und den Filter gebaut:",
  createdFallback: (aiConfigured) => `✅ Fertig. Filter aus den Suchwörtern${aiConfigured ? " (die KI hat nicht geantwortet, prüf die Regeln)" : ""}:`,
  seededNote: "Die aktuellen Anzeigen habe ich mir gemerkt. Du bekommst nur neue und Preissenkungen.",
  confirmKeyword: (kw) =>
    `„<b>${kw}</b>“ auf Willhaben in ganz Österreich beobachten?\n<i>Für Region, Kategorie oder Preis schick lieber einen Suchlink mit diesen Filtern.</i>`,
  sendLinkOrText: "Schick einen Suchlink oder schreib kurz, was du suchst.",
  requestExpired: "Die Anfrage ist abgelaufen, schreib sie bitte nochmal.",
  cancelled: "Abgebrochen",
  creatingExample: (kw) => `Lege „${kw}“ an…`,
  unknownCommand: "Unbekannter Befehl. Hilfe: /help",
  badCommand: (usage) => `Nicht verstanden. Beispiel: <code>${usage}</code>`,

  notFound: "Nicht gefunden",
  aiNotConfigured: "KI ist auf dem Server nicht eingerichtet",
  saved: "Gespeichert",
  proOnly: "Mit Pro verfügbar, siehe /plan",
  loading: "Lade…",
  loadFailed: (msg) => `Konnte nicht laden: ${msg}`,
  deleted: "Gelöscht",
  watchGone: "Dieser Suchauftrag wurde gelöscht",
  fbGood: "Danke, gemerkt",
  fbBadAi: "Gemerkt. Ähnliche werden aussortiert",
  fbBadNoAi: "Gemerkt. Schalte die KI ein oder füge mit /exclude ein Stoppwort hinzu",

  planName: (pro) => `Tarif: <b>${pro ? "Pro" : "Free"}</b>`,
  planWatches: (n, max) => `Suchaufträge: ${n}/${max}`,
  planInterval: (i) => `Kürzestes Intervall: ${i}`,
  planAi: (n, max) => `KI-Prüfungen heute: ${n}/${max}`,
  planProPitch: (watches, interval, ai) => `<b>Pro</b>: bis zu ${watches} Suchaufträge, Prüfung alle ${interval}, ${ai} KI-Prüfungen pro Tag.`,

  langPrompt: "🌐 Wähle deine Sprache:",
  langSet: "Erledigt, ab jetzt auf Deutsch.",

  welcome: `👋 <b>DealRadar</b> beobachtet willhaben.at und schickt dir nur, was du wirklich suchst: kein Zubehör, kein Tausch, kein Müll. Und sagt dir sofort, ob eine Anzeige unter dem Marktpreis liegt.

<b>So geht's:</b> Schick einen Willhaben-Suchlink oder schreib einfach, was du suchst, z. B. <code>ps5 digital</code>.

Probier ein Beispiel 👇`,
  btnHowLink: "🔗 Link holen",
  btnWhatCan: "🤖 Funktionen",
  btnLanguage: "🌐 Sprache",
  helpLabels: {
    about: "🤖 Funktionen",
    link: "🔗 Link holen",
    filter: "🧹 Filter & KI",
    scan: "📊 Marktanalyse",
    plan: "💎 Tarife",
  },
  helpAbout: `🤖 <b>Was DealRadar kann</b>

• <b>Beobachtet deine Suche</b> und schickt neue Anzeigen wenige Minuten nach dem Erscheinen, dazu Preissenkungen
• <b>Sortiert Müll aus:</b> Zubehör ohne den Artikel, „Suche“-Anzeigen, Tausch, leere Kartons, andere Modelle
• <b>Bewertet das Angebot:</b> wie weit unter dem Marktpreis, was dabei ist, ob es defekt ist
• <b>Marktanalyse:</b> liest alle Seiten einer Suche und zeigt den Medianpreis und die besten Angebote
• <b>Lernt dazu:</b> mit 👎/👍 unter jeder Anzeige zeigst du der KI, was du willst

Du kannst mehrere Suchaufträge gleichzeitig laufen lassen: /list · Sprache: /lang`,
  helpLink: `🔗 <b>So holst du den Suchlink</b>

Für den Start reicht ein Suchbegriff (<code>ps5 digital</code>). Einen Link brauchst du, wenn Region, Kategorie oder Preis wichtig sind.

<b>In der Willhaben-App</b>
1. Such den Artikel und setz die Filter: Region, Preis, Zustand
2. Tippe auf „Teilen“ (das ↗-Symbol oben) → „Kopieren“
3. Füg den Link hier ein

<b>Im Browser</b>
1. Öffne willhaben.at, such den Artikel, setz die Filter
2. Kopier die Adresse aus der Adresszeile
3. Füg sie hier ein

⚠️ Es muss ein Link zu einer <b>Suchseite</b> sein (Liste von Anzeigen), nicht zu einer einzelnen Anzeige.`,
  helpFilter: `🧹 <b>So funktioniert der Filter</b>

Jede Anzeige durchläuft drei Stufen:
1. <b>Allgemeine Regeln:</b> „Suche“, „Tausche“, leere Kartons, Defekte
2. <b>Dein Filter:</b> Der Titel muss das Modell nennen, Stoppwörter schneiden den Rest weg, Zubehör ist nur im Bundle ok
3. <b>Die KI</b> liest die ganze Anzeige und bewertet sie mit 1–10: richtiger Artikel, Zustand, was dabei ist

Der Filter entsteht automatisch aus deiner Suche. Anpassen kannst du ihn in der Karte: /list → Suchauftrag → ⚙️ Einstellungen.

Beim Anlegen und mit „🧪 Vorschau“ siehst du, was durchkam und was aussortiert wurde. So fällt ein falscher Filter sofort auf.`,
  helpScan: `📊 <b>Marktanalyse</b>

Der Bot liest alle Seiten der Suche, behält die passenden Anzeigen und berechnet:
• den <b>Median</b> und die typische Preisspanne
• die <b>besten Angebote</b> (unter dem Median, von der KI geprüft)
• <b>günstige Defekte</b> für Reparatur und Weiterverkauf
• <b>verdächtig billige</b>: möglicher Betrug

Der Median wird gespeichert, dann steht in neuen Benachrichtigungen „18 % unter dem Median“.

Start: /list → Suchauftrag → 📊 Marktanalyse, oder <code>/scan 3</code>.`,
  helpPlan: (free, pro) => `💎 <b>Tarife</b>

<b>Free</b>: ${free.watches} Suchaufträge, Prüfung alle ${free.interval}, ${free.ai} KI-Prüfungen und ${free.scans} Marktanalysen pro Tag (bis ${free.pages} Seiten)

<b>Pro</b>: ${pro.watches} Suchaufträge, Prüfung alle ${pro.interval}, ${pro.ai} KI-Prüfungen und ${pro.scans} Analysen pro Tag (bis ${pro.pages} Seiten)

Dein Tarif und Verbrauch: /plan`,

  cmdList: "Meine Suchaufträge",
  cmdScan: "Marktanalyse über alle Seiten",
  cmdPlan: "Tarif und Limits",
  cmdLang: "Sprache",
  cmdHelp: "Hilfe",

  privacy: (contact) => `🔒 <b>Daten und Datenschutz</b>

<b>Was ich speichere</b>
• deine Telegram-ID, deinen Benutzernamen und deine Sprache
• deine Suchen und Filtereinstellungen
• IDs und Preise bereits gezeigter Anzeigen, damit sie nicht doppelt kommen
• deine 👍/👎 und Nutzungszähler (KI-Prüfungen, Analysen)

<b>Wo</b>: auf einem AWS-Server in Stockholm (EU). Marktberichte werden 30 Tage aufbewahrt, Server-Logs 14 Tage.

<b>Weitergabe</b>: Anzeigentexte und dein Suchbegriff gehen zur Prüfung an Anthropic (Claude-KI). Deine Telegram-Daten nicht. Nichts wird verkauft, es gibt keine Werbung.

<b>Alles löschen</b>: /delete_me löscht dein Konto, deine Suchaufträge und den Verlauf sofort.${contact ? `\n\nFragen: ${contact}` : ""}`,
  btnDeleteMe: "🗑 Meine Daten löschen",
  deleteConfirm: "Alle deine Daten löschen: Suchaufträge, Verlauf und Einstellungen? Das lässt sich nicht rückgängig machen.",
  deleteDone: "Erledigt, alle deine Daten sind gelöscht. Wenn du zurückkommen willst, schick einfach /start.",
  inviteText: (link, days, count) =>
    `🎁 <b>Freund einladen</b>\n\nWenn ein Freund den Bot über deinen Link startet, bekommt ihr beide <b>${days} Tage Pro</b>.\n\n${link}${count ? `\n\nBisher über deinen Link: ${count}` : ""}`,
  btnShare: "📤 Teilen",
  shareText: "Dieser Bot schickt nur die Willhaben-Anzeigen, die du suchst, und sagt dir, ob sie unter dem Marktpreis liegen",
  refWelcome: (days) => `🎁 Ein Freund hat dich eingeladen: Du bekommst ${days} Tage Pro geschenkt.`,
  refRewarded: (days) => `🎉 Über deinen Link ist ein Freund dazugekommen: +${days} Tage Pro.`,
  planProUntil: (date) => `Pro bis ${date}`,
  planInviteHint: "🎁 Lade einen Freund ein und ihr bekommt beide eine Woche Pro: /invite",
  cmdInvite: "Freund einladen (+7 Tage Pro)",
  cmdPrivacy: "Daten und Datenschutz",

  report: {
    title: (name) => `Marktanalyse: ${name}`,
    meta: (pages, total, n, limitHit) => `${pages} Seiten · ${total} Anzeigen · ${n} passen${limitHit ? " · Seitenlimit erreicht" : ""}`,
    fewPrices: (n) => `Nur ${n} Anzeigen mit Preis: Der Median ist grob.`,
    median: "Median",
    typical: "Typische Spanne",
    minMax: "Min / Max",
    withPrice: "Passende mit Preis",
    fewData: "zu wenig Daten",
    highlights: "🔥 Interessant",
    noHighlights: "Gerade keine klaren Schnäppchen.",
    score: (s) => `Bewertung ${s}/10`,
    flipsTitle: "🔧 Defekte günstig",
    flipsNote: "Für Reparatur oder Weiterverkauf. Bewertet gegen den Preis defekter Geräte (~40 % des Medians), nicht funktionierender.",
    all: (n) => `Alle passenden (${n})`,
    sorted: "Nach Bewertung sortiert, beste zuerst.",
    noJs: "Sortierung und Filter funktionieren in der Telegram-Vorschau nicht. Öffne den Bericht über „🌐 Ganzen Bericht öffnen“ im Chat mit dem Bot oder im Browser.",
    chipAll: "Alle",
    colListing: "Anzeige",
    colPrice: "Preis",
    colDelta: "zum Median",
    colScore: "Bewertung",
    colPlace: "Ort",
    notChecked: "nicht von der KI geprüft",
    footer: (rules, ai, unchecked) =>
      `Von Regeln aussortiert: ${rules}, von der KI: ${ai}${unchecked ? `, nicht geprüft (Limit): ${unchecked}` : ""}.
Bewertung: 5 = Medianpreis, je 10 % billiger +1; ein Bundle +1; Defekte werden mit ~40 % des Medians verglichen und bekommen höchstens 7. „Verdächtig billig“ = unter 45 % des Medians oder Betrugsanzeichen.`,
  },
};
