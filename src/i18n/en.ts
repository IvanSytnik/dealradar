import type { Dict } from "./ru.js";

export const en: Dict = {
  unitMin: "min",
  unitHour: "h",

  priceDropped: (name) => `📉 <b>Price dropped</b> · ${name}`,
  newListing: (name) => `🆕 ${name}`,
  looksDefect: "⚠️ Looks broken / for parts",
  vsMedian: (pct, median) => `📊 ${pct} (median ${median})`,
  vsMedianVariant: (pct, variant, median) => `📊 ${pct} (${variant} median ${median})`,
  btnOpen: "Open",
  btnNotIt: "👎 Not it",
  btnGood: "👍 Good one",
  btnOpenGood: "👍 Open",
  btnOpenBad: "👎 Open",
  moreListings: (n, name) => `…and ${n} more for “${name}”. Open the search to see them all.`,
  fetchFailing: (name, msg) => `⚠️ “${name}”: can't load the search (${msg}). I'll keep trying, less often.`,

  paused: "⏸ paused",
  priceLine: (range) => `💶 Price: ${range}`,
  rangeFrom: (x) => `from ${x}`,
  rangeTo: (x) => `up to ${x}`,
  rangeAny: "any",
  marketReal: (median, p25, p75, age) => `📊 Market: median <b>${median}</b> (usually ${p25}–${p75}), ${age}`,
  marketGuess: (lo, hi) => `📊 Market: ~${lo}–${hi} by AI estimate. “Market analysis” gives real numbers`,
  marketNone: "📊 Market: tap “Market analysis” to see real prices",
  variantsLine: (list) => `🧩 By model: ${list}`,
  ageToday: "today",
  ageYesterday: "yesterday",
  ageDays: (n) => `${n} days ago`,
  statusLine: (interval, ai, defects) =>
    `⏱ Every ${interval} · 🤖 AI ${ai ? "on" : "off"}${defects ? " · ⚠️ incl. broken" : ""}`,
  openSearch: "Open search",

  settingsTitle: (id, name) => `⚙️ <b>Settings #${id} ${name}</b>`,
  mustLine: (groups) => `🔤 Title must contain one of: ${groups}`,
  anyTitle: "any title",
  stopWords: (list) => `🚫 Stop words: ${list}`,
  accessories: (list) => `🧩 Accessories (fine only in a bundle): ${list}`,
  aiLine: (on, min) => `🤖 AI: ${on ? `on, sending from ${min}/10` : "off, rules only"}`,
  defectLine: (allow) => `⚠️ Broken / for parts: ${allow ? "send" : "filter out"}`,
  settingsHint: "<i>Change words, price and threshold with “✏️ Words & price”.</i>",
  editTitle: "<b>Fine-tuning</b>",
  editPrice: "price range (<code>-</code> for no bound)",
  editExclude: "add stop words",
  editUnexclude: "remove a stop word",
  editMatch: "what the title must contain",
  editScore: "AI score threshold",
  editRenameExample: "My Xbox",

  btnPause: "⏸ Pause",
  btnResume: "▶️ Resume",
  btnScan: "📊 Market analysis",
  btnSettings: "⚙️ Settings",
  btnPreview: "🧪 Preview",
  btnAllWatches: "« All watches",
  btnAi: (on) => (on ? "🤖 AI: on" : "🤖 AI: off"),
  btnDefects: (on) => (on ? "⚠️ Broken: yes" : "⚠️ Broken: no"),
  btnWords: "✏️ Words & price",
  btnDelete: "🗑 Delete",
  btnBack: "« Back",
  btnConfirmDelete: "Yes, delete",
  btnCancel: "Cancel",
  btnYes: "✅ Yes",
  btnOpenReport: "🌐 Open in browser",
  btnOpenReportApp: "📱 Open report",

  previewHead: (total, n) => `${total} listings on the site right now, <b>${n}</b> match the filter.`,
  previewAiChecked: (n) => `<i>AI checked ${n} of those that passed the rules.</i>`,
  previewPassed: "✅ Passed:",
  previewAiDropped: "🤖 Dropped by AI:",
  andMore: (n) => `<i>…and ${n} more</i>`,
  previewRuleDropped: (n, summary) => `🗑 Dropped by rules: ${n} (${summary}), e.g.:`,
  groupPrice: "price",
  groupNotItem: "wrong item",
  groupNotOffer: "not for sale",
  groupStop: "stop word",
  groupAccessory: "accessory",
  groupDefect: "broken",
  groupOther: "other",
  reasonNotOffer: "not for sale: ",
  reasonStop: "stop word ",
  reasonAccessory: "accessory ",
  reasonPriceLow: (p, min) => `price ${p} below ${min}`,
  reasonPriceHigh: (p, max) => `price ${p} above ${max}`,

  scanTitle: (name) => `📊 <b>Market analysis: ${name}</b>`,
  scanViewed: (total, pages, limitHit, n) =>
    `Checked ${total} listings on ${pages} pages${limitHit ? " (plan limit)" : ""}, <b>${n}</b> match.`,
  scanMedian: (median, p25, p75, min, max, n) =>
    `💶 Median <b>${median}</b>, usually ${p25}–${p75}, from ${min} to ${max} (${n} listings)`,
  scanFewPrices: (n) => `<i>Only ${n} listings with a price: the median and deal scores are rough.</i>`,
  scanNoStats: "💶 Too few listings with a price for statistics.",
  scanVariantsNote: "Each listing is compared with the median of its own model.",
  scanHighlights: "🔥 <b>Worth a look:</b>",
  scanNoHighlights: "🔥 No clear bargains right now.",
  scanFlips: "🔧 <b>Cheap broken units</b> (repair / resale):",
  scanSuspicious: (n) => `⚠️ Suspiciously cheap: ${n}. They are in the report but not in the top list.`,
  scanAiUnchecked: (n, total) =>
    `⚠️ <b>AI did not check ${n} of ${total}</b> (daily limit). Unchecked ones never make “Worth a look”, and the list may contain junk (accessories, other models).`,
  scanFooterLink: "Full list with sorting and filters behind the button below. The median is saved: new alerts will be compared with it.",
  scanFooterFile: "Full list in the file below. The median is saved: new alerts will be compared with it.",
  pctAt: "at the median",
  pctBelow: (n) => `${n}% below median`,
  pctAbove: (n) => `${n}% above median`,
  tag: {
    very_cheap: "🔥 far below market",
    cheap: "💸 below market",
    bundle: "📦 rich bundle",
    defect: "🔧 broken / for parts",
    suspicious: "⚠️ suspiciously cheap",
    no_price: "❔ no price",
    expensive: "📈 above market",
  },
  scanNotConfigured: "Market analysis is not configured on the server.",
  scanBusy: "An analysis is already running, give it a moment.",
  scanStarting: (name) => `📊 Analysing “${name}”…`,
  scanProgressPages: (page, listings) => `📊 Loading pages: ${page}, listings ${listings}…`,
  scanProgressAi: (done, total) => `🤖 AI is checking: ${done}/${total}…`,
  scanProgressReport: "📊 Building the report…",
  scanLimit: (n) => `Today's analysis limit: ${n}. Pro has more, see /plan.`,
  scanFetchFailed: (detail) => `Couldn't load the search: ${detail}`,
  scanCrashed: "The analysis failed, please try again later.",
  scanUsage: "Give the watch number: <code>/scan 3</code>. Numbers are in /list.",
  scanPick: "📊 Which search should I analyse?",
  scanStartingToast: "Starting the analysis…",
  fileCaptionLink: (days) => `The report as a file. The link above works for ${days} days and has sorting and filters.`,
  fileCaptionNoLink: "Full report. Sorting and filters work when you open the file in a browser (not in Telegram's preview on a phone).",

  noWatches: "No watches yet. Send a Willhaben search link or type what you're looking for. Or try an example:",
  listTitle: (n, max) => `<b>Your watches</b> (${n}/${max})`,
  creating: "🔎 Looking at the search and setting up the filter…",
  errLimit: (max) => `Plan limit: ${max} watches. Delete one in /list or switch to Pro (/plan).`,
  errUnsupported: (detail) => `Willhaben.at and Kleinanzeigen.de (beta) are supported. ${detail}`,
  errBadUrl: (detail) => `That doesn't look like a search page. Open a search (not a single listing) and send the link. ${detail}`,
  errFetch: (detail) => `Couldn't load the search, try again later. (${detail})`,
  errDuplicate: "You're already watching this search, see /list.",
  createdAi: "✅ Done. The AI worked out what you're after and built the filter:",
  createdFallback: (aiConfigured) => `✅ Done. Filter built from the search words${aiConfigured ? " (the AI didn't answer, check the rules)" : ""}:`,
  betaSite: (name) =>
    `🧪 <b>${name}</b> runs in beta: the parser is still being checked against the live site. If alerts don't arrive or contain junk, tap 👎 or write to the contact in /privacy.`,
  seededNote: "I've remembered the current listings. You'll only get new ones and price drops.",
  confirmKeyword: (kw) =>
    `Watch “<b>${kw}</b>” on Willhaben across Austria?\n<i>For a region, category or price, send a search link with those filters instead.</i>`,
  sendLinkOrText: "Send a search link or type briefly what you're looking for.",
  requestExpired: "That request expired, please type it again.",
  cancelled: "Cancelled",
  creatingExample: (kw) => `Creating “${kw}”…`,
  unknownCommand: "Unknown command. Help: /help",
  badCommand: (usage) => `Didn't get that. Example: <code>${usage}</code>`,

  notFound: "Not found",
  aiNotConfigured: "AI is not configured on the server",
  saved: "Saved",
  proOnly: "Available on Pro, see /plan",
  loading: "Loading…",
  loadFailed: (msg) => `Couldn't load: ${msg}`,
  deleted: "Deleted",
  watchGone: "This watch was deleted",
  fbGood: "Thanks, noted",
  fbBadAi: "Noted. Similar ones will be filtered out",
  fbBadNoAi: "Noted. Turn on the AI or add a stop word with /exclude",

  planName: (pro) => `Plan: <b>${pro ? "Pro" : "Free"}</b>`,
  planWatches: (n, max) => `Watches: ${n}/${max}`,
  planInterval: (i) => `Shortest interval: ${i}`,
  planAi: (n, max) => `AI checks today: ${n}/${max}`,
  planProPitch: (watches, interval, ai) => `<b>Pro</b>: up to ${watches} watches, checks every ${interval}, ${ai} AI checks a day.`,

  langPrompt: "🌐 Choose your language:",
  langSet: "Done, English it is.",

  welcome: `👋 <b>DealRadar</b> watches willhaben.at and sends you only what you're looking for: no accessories, swaps or junk. And it tells you right away whether a listing is below market price.

<b>To start:</b> send a Willhaben search link or just type what you want, e.g. <code>ps5 digital</code>.

Try an example 👇`,
  btnHowLink: "🔗 How to get a link",
  btnWhatCan: "🤖 What it does",
  btnLanguage: "🌐 Language",
  helpLabels: {
    about: "🤖 What it does",
    link: "🔗 Getting a link",
    filter: "🧹 Filter & AI",
    scan: "📊 Market analysis",
    plan: "💎 Plans",
  },
  helpAbout: `🤖 <b>What DealRadar does</b>

• <b>Watches a search</b> and sends new listings minutes after they go up, plus price drops
• <b>Filters out junk:</b> accessories without the item, “suche” (wanted) ads, swaps, empty boxes, other models
• <b>Rates the deal:</b> how far below market, what's included, whether it's broken
• <b>Market analysis:</b> reads every page of a search and shows the median price and the best offers
• <b>Learns:</b> the 👎/👍 buttons under each listing teach the AI what you want

You can run several watches at once: /list · Language: /lang`,
  helpLink: `🔗 <b>How to get a search link</b>

A plain query (<code>ps5 digital</code>) is enough to start. Use a link when the region, category or price matters.

<b>In the Willhaben app</b>
1. Search for the item and set filters: region, price, condition
2. Tap “Share” (the ↗ icon at the top) → “Copy”
3. Paste the link here

<b>In a browser</b>
1. Open willhaben.at, search, set the filters
2. Copy the address from the address bar
3. Paste it here

🧪 <b>Kleinanzeigen.de</b> (beta): same thing, a search page link from kleinanzeigen.de.

⚠️ It has to be a link to a <b>search page</b> (a list of listings), not to a single listing.`,
  helpFilter: `🧹 <b>How the filter works</b>

Every listing goes through three stages:
1. <b>General rules:</b> “suche”, “tausche”, empty boxes, defects
2. <b>Your filter:</b> the title must name the model, stop words cut the rest, accessories are fine only in a bundle
3. <b>The AI</b> reads the whole listing and scores it 1–10: right item, condition, what's included

The filter is built automatically from your search. Adjust it in the card: /list → watch → ⚙️ Settings.

On creation and with “🧪 Preview” you see what passed and what was dropped, so a wrong filter shows up immediately.`,
  helpScan: `📊 <b>Market analysis</b>

The bot reads every page of the search, keeps the matching listings and works out:
• the <b>median</b> and the typical price range
• the <b>best offers</b> (below median, checked by the AI)
• <b>cheap broken units</b> for repair and resale
• <b>suspiciously cheap</b> ones: possible scams

The median is saved, so new alerts say “18% below median”.

Run it: /list → watch → 📊 Market analysis, or <code>/scan 3</code>.`,
  helpPlan: (free, pro) => `💎 <b>Plans</b>

<b>Free</b>: ${free.watches} watches, checks every ${free.interval}, ${free.ai} AI checks and ${free.scans} market analyses a day (up to ${free.pages} pages)

<b>Pro</b>: ${pro.watches} watches, checks every ${pro.interval}, ${pro.ai} AI checks and ${pro.scans} analyses a day (up to ${pro.pages} pages)

Your plan and usage: /plan`,

  cmdList: "My watches",
  cmdScan: "Market analysis across all pages",
  cmdPlan: "Plan and limits",
  cmdLang: "Language",
  cmdHelp: "Help",

  privacy: (contact) => `🔒 <b>Data and privacy</b>

<b>What I store</b>
• your Telegram ID, username and language
• your searches and filter settings
• IDs and prices of listings already shown, so they aren't sent twice
• your 👍/👎 taps and usage counters (AI checks, analyses)

<b>Where</b>: an AWS server in Stockholm (EU). Market reports are kept for 30 days, server logs for 14 days.

<b>Shared with</b>: listing texts and your search query go to Anthropic (Claude AI) for screening. Your Telegram data does not. Nothing is sold, there are no ads.

<b>Delete everything</b>: /delete_me removes your account, watches and history right away.${contact ? `\n\nQuestions: ${contact}` : ""}`,
  btnDeleteMe: "🗑 Delete my data",
  deleteConfirm: "Delete all your data: watches, history and settings? This can't be undone.",
  deleteDone: "Done, all your data is deleted. If you want to come back, just send /start.",
  inviteText: (link, days, count) =>
    `🎁 <b>Invite a friend</b>\n\nWhen a friend starts the bot through your link, you both get <b>${days} days of Pro</b>.\n\n${link}${count ? `\n\nJoined through your link so far: ${count}` : ""}`,
  btnShare: "📤 Share",
  shareText: "This bot sends only the Willhaben listings you want and tells you if they're below market price",
  refWelcome: (days) => `🎁 A friend invited you: you get ${days} days of Pro as a gift.`,
  refRewarded: (days) => `🎉 A friend joined through your link: +${days} days of Pro.`,
  planProUntil: (date) => `Pro until ${date}`,
  planInviteHint: "🎁 Invite a friend and you both get a week of Pro: /invite",
  cmdInvite: "Invite a friend (+7 days Pro)",
  cmdPrivacy: "Data and privacy",

  report: {
    title: (name) => `Market analysis: ${name}`,
    meta: (pages, total, n, limitHit) => `${pages} pages · ${total} listings · ${n} match${limitHit ? " · page limit reached" : ""}`,
    fewPrices: (n) => `Only ${n} listings with a price: the median is rough.`,
    median: "Median",
    typical: "Typical range",
    minMax: "Min / max",
    withPrice: "Matching with a price",
    fewData: "not enough data",
    highlights: "🔥 Worth a look",
    noHighlights: "No clear bargains right now.",
    score: (s) => `score ${s}/10`,
    flipsTitle: "🔧 Cheap broken units",
    flipsNote: "For repair or resale. Scored against the price of broken units (~40% of the median), not working ones.",
    all: (n) => `All matching (${n})`,
    sorted: "Sorted by deal score, best first.",
    noJs: "Sorting and filters don't work in the built-in file preview. Open the report with “📱 Open report” in the bot chat.",
    chipAll: "All",
    colListing: "Listing",
    colPrice: "Price",
    colDelta: "vs median",
    colScore: "Score",
    colPlace: "Location",
    variantsTitle: "🧩 By model",
    variantsNote: "Each listing is compared with the median of its own model. Models with fewer than 5 listings use the overall median.",
    colModel: "Model",
    colCount: "Count",
    allModels: "All models",
    notChecked: "not checked by AI",
    footer: (rules, ai, unchecked) =>
      `Dropped by rules: ${rules}, by AI: ${ai}${unchecked ? `, not checked by AI (limit): ${unchecked}` : ""}.
Score: 5 = median price, every 10% cheaper adds +1; a bundle adds +1; broken units are compared with ~40% of the median and get at most 7. “Suspiciously cheap” = below 45% of the median or scam signals.`,
  },
};
