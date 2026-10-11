import { Bot, GrammyError, InlineKeyboard, InputFile, type Context } from "grammy";
import type { AppConfig } from "../config.js";
import { INTERVAL_CHOICES, PLANS, REFERRAL_DAYS } from "../core/plans.js";
import type { Repo } from "../db/repo.js";
import { detectLang, isLang, LANG_LABELS, LANGS, t, type Dict, type Lang } from "../i18n/index.js";
import { logger } from "../logger.js";
import { extractUrl, siteById } from "../sites/index.js";
import { RecipientGoneError, type Notifier } from "../services/notifier.js";
import type { WatchService } from "../services/watches.js";
import type { ScanProgress, ScanService } from "../services/scan.js";
import { renderReport } from "../report/html.js";
import { REPORT_TTL_DAYS, type ReportPublisher } from "../report/publish.js";
import type { Plan, User, Watch } from "../types.js";
import { cb, parseId, parseIdAndList, parseIdAndRest, parsePriceArgs } from "./commands.js";
import {
  editHelp,
  esc,
  EXAMPLE_LABELS,
  EXAMPLES,
  filterDetails,
  HELP_TOPICS,
  helpText,
  type HelpTopic,
  intervalLabel,
  listingText,
  planPitch,
  planText,
  previewText,
  profileSummary,
  scanSummaryText,
} from "./format.js";

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

/** Main card: the four things people actually do. Everything else is one tap deeper, in settings. */
function watchKeyboard(T: Dict, w: Watch) {
  return new InlineKeyboard()
    .text(w.active ? T.btnPause : T.btnResume, cb("tgl", w.id, "active"))
    .text(T.btnScan, cb("scan", w.id))
    .row()
    .text(T.btnSettings, cb("set", w.id))
    .text(T.btnPreview, cb("prv", w.id))
    .row()
    .text(T.btnAllWatches, cb("lst"));
}

function settingsKeyboard(T: Dict, w: Watch) {
  return new InlineKeyboard()
    .text(T.btnAi(w.profile.useAi), cb("tgl", w.id, "ai"))
    .text(T.btnDefects(w.profile.allowDefect), cb("tgl", w.id, "defect"))
    .row()
    .text(`⏱ ${intervalLabel(T, w.intervalSec)}`, cb("int", w.id))
    .text(T.btnWords, cb("edt", w.id))
    .row()
    .text(T.btnDelete, cb("del", w.id))
    .text(T.btnBack, cb("opn", w.id));
}

function helpKeyboard(T: Dict, current: HelpTopic) {
  const kb = new InlineKeyboard();
  HELP_TOPICS.forEach((id, i) => {
    kb.text(id === current ? `• ${T.helpLabels[id]}` : T.helpLabels[id], cb("hlp", id));
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

/** The language button names the current language, so a wrong guess is obvious and one tap away. */
function welcomeKeyboard(T: Dict, lang: Lang) {
  const kb = new InlineKeyboard();
  EXAMPLE_LABELS.forEach((label, i) => kb.text(label, cb("ex", i)));
  // ":n" = answer with a new message, so the example buttons stay on screen
  return kb
    .row()
    .text(T.btnHowLink, cb("hlp", "link", "n"))
    .text(T.btnWhatCan, cb("hlp", "about", "n"))
    .row()
    .text(`🌐 ${LANG_LABELS[lang]}`, cb("lngm"));
}

function langKeyboard() {
  const kb = new InlineKeyboard();
  LANGS.forEach((l, i) => {
    kb.text(LANG_LABELS[l], cb("lng", l));
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

export function createTelegramNotifier(bot: Bot): Notifier {
  const wrap = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      if (e instanceof GrammyError && (e.error_code === 403 || /chat not found/i.test(e.description))) {
        throw new RecipientGoneError(e.description);
      }
      throw e;
    }
  };

  return {
    async sendListing(user, watch, listing, info) {
      const T = t(user.lang);
      const text = listingText(T, watch, listing, info);
      const kb = new InlineKeyboard()
        .url(T.btnOpen, listing.url)
        .row()
        .text(T.btnNotIt, cb("fb", 0, watch.id, listing.id))
        .text(T.btnGood, cb("fb", 1, watch.id, listing.id));
      await wrap(async () => {
        if (listing.image) {
          try {
            await bot.api.sendPhoto(user.chatId, listing.image, { caption: text, parse_mode: "HTML", reply_markup: kb });
            return;
          } catch (e) {
            if (e instanceof GrammyError && e.error_code === 403) throw e;
            // bad image URL: fall through to text
          }
        }
        await bot.api.sendMessage(user.chatId, text, { ...HTML, reply_markup: kb });
      });
    },
    async sendText(user, text) {
      await wrap(() => bot.api.sendMessage(user.chatId, text, HTML));
    },
  };
}

export function createBot(deps: {
  config: AppConfig;
  repo: Repo;
  watches: WatchService;
  aiEnabled: boolean;
  scans?: ScanService;
  reports?: ReportPublisher;
}) {
  const { config, repo, watches, aiEnabled, scans, reports } = deps;
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
  const isAdmin = (id: number) => config.ADMIN_IDS.includes(id);

  // Keyword waiting for confirmation, per user. Callback data is too small to carry free text.
  const pendingText = new Map<number, string>();

  const userOf = (ctx: Context): User => {
    const from = ctx.from!;
    const u = repo.upsertUser(
      from.id,
      ctx.chat?.id ?? from.id,
      from.username ?? null,
      config.EVERYONE_PRO ? "pro" : "free",
      detectLang(from.language_code),
    );
    // the owner should never hit the Free limits while testing
    if (isAdmin(u.id) && u.plan !== "pro") {
      repo.setPlan(u.id, "pro");
      return { ...u, plan: "pro" };
    }
    return u;
  };
  /** The user and their dictionary: almost every handler needs both. */
  const who = (ctx: Context) => {
    const user = userOf(ctx);
    return { user, T: t(user.lang) };
  };

  const reply = (ctx: Context, text: string, kb?: InlineKeyboard) => ctx.reply(text, { ...HTML, reply_markup: kb });

  async function showWatch(ctx: Context, T: Dict, w: Watch, edit = false) {
    const text = profileSummary(T, w);
    if (edit) {
      await ctx.editMessageText(text, { ...HTML, reply_markup: watchKeyboard(T, w) }).catch(() => undefined);
    } else {
      await reply(ctx, text, watchKeyboard(T, w));
    }
  }

  async function showSettings(ctx: Context, T: Dict, w: Watch) {
    await ctx.editMessageText(filterDetails(T, w), { ...HTML, reply_markup: settingsKeyboard(T, w) }).catch(() => undefined);
  }

  async function showList(ctx: Context, user: User, edit = false) {
    const T = t(user.lang);
    const list = repo.listWatches(user.id);
    if (!list.length) {
      const opts = { ...HTML, reply_markup: welcomeKeyboard(T, user.lang) };
      return edit ? ctx.editMessageText(T.noWatches, opts).catch(() => undefined) : ctx.reply(T.noWatches, opts);
    }
    const kb = new InlineKeyboard();
    for (const w of list) kb.text(`${w.active ? "🟢" : "⏸"} #${w.id} ${w.name}`, cb("opn", w.id)).row();
    const text = T.listTitle(list.length, PLANS[user.plan].maxWatches);
    return edit ? ctx.editMessageText(text, { ...HTML, reply_markup: kb }).catch(() => undefined) : reply(ctx, text, kb);
  }

  async function createWatch(ctx: Context, user: User, input: string) {
    const T = t(user.lang);
    await ctx.replyWithChatAction("typing");
    const status = await reply(ctx, T.creating);
    const r = await watches.create(user, input);
    await ctx.api.deleteMessage(status.chat.id, status.message_id).catch(() => undefined);

    if (!r.ok) {
      const detail = r.detail ? `(${esc(r.detail)})` : "";
      const msg = {
        limit: T.errLimit(PLANS[user.plan].maxWatches),
        unsupported_site: T.errUnsupported(detail),
        bad_url: T.errBadUrl(detail),
        fetch_failed: T.errFetch(esc(r.detail ?? "")),
        duplicate: T.errDuplicate,
      }[r.error];
      return reply(ctx, msg);
    }

    const head = r.profileSource === "ai" ? T.createdAi : T.createdFallback(aiEnabled);
    await reply(ctx, `${head}\n\n${profileSummary(T, r.watch)}`, watchKeyboard(T, r.watch));
    await reply(ctx, `${previewText(T, r.preview)}\n\n${T.seededNote}`);
    const site = siteById(r.watch.query.site);
    if (site.beta) await reply(ctx, T.betaSite(site.name));
  }

  // A scan takes up to a minute; one at a time per user
  const scanning = new Set<number>();

  async function runScan(ctx: Context, user: User, w: Watch) {
    const T = t(user.lang);
    if (!scans) return reply(ctx, T.scanNotConfigured);
    if (scanning.has(user.id)) return reply(ctx, T.scanBusy);
    scanning.add(user.id);
    const status = await reply(ctx, T.scanStarting(esc(w.name)));
    let last = 0;
    const progress = (p: ScanProgress) => {
      const now = Date.now();
      if (p.stage !== "done" && now - last < 1500) return;
      last = now;
      const text =
        p.stage === "pages"
          ? T.scanProgressPages(p.page, p.listings)
          : p.stage === "ai"
            ? T.scanProgressAi(p.done, p.total)
            : T.scanProgressReport;
      void ctx.api.editMessageText(status.chat.id, status.message_id, text).catch(() => undefined);
    };
    try {
      const r = await scans.run(user, w, progress);
      if (!r.ok) {
        const msg = r.error === "limit" ? T.scanLimit(PLANS[user.plan].scansPerDay) : T.scanFetchFailed(esc(r.detail ?? ""));
        await ctx.api.editMessageText(status.chat.id, status.message_id, msg, HTML).catch(() => reply(ctx, msg));
        return;
      }
      await ctx.api.deleteMessage(status.chat.id, status.message_id).catch(() => undefined);
      const html = renderReport(r.report, user.lang);
      const url = reports ? await reports.publish(html) : null;
      // Mini App first: the report opens inside Telegram with JS, the theme and a back button;
      // the browser link is the fallback for desktop and old clients
      const kb = url ? new InlineKeyboard().webApp(T.btnOpenReportApp, url).row().url(T.btnOpenReport, url) : undefined;
      await reply(ctx, scanSummaryText(T, r.report, { link: Boolean(url) }), kb);
      const day = new Date(r.report.at).toISOString().slice(0, 10);
      const file = `dealradar-${w.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-${day}.html`;
      await ctx.replyWithDocument(new InputFile(Buffer.from(html, "utf8"), file), {
        caption: url ? T.fileCaptionLink(REPORT_TTL_DAYS) : T.fileCaptionNoLink,
      });
    } finally {
      scanning.delete(user.id);
    }
  }

  /**
   * grammY handles updates one by one: awaiting a minute-long scan here would freeze the bot for everyone.
   * The scan runs detached; `pendingScans` lets tests (and graceful shutdown) wait for it.
   */
  const pendingScans = new Set<Promise<unknown>>();
  function startScan(ctx: Context, user: User, w: Watch) {
    const p = runScan(ctx, user, w).catch((e) => {
      logger.error("scan failed", { watch: w.id, err: (e as Error).message });
      return reply(ctx, t(user.lang).scanCrashed).catch(() => undefined);
    });
    pendingScans.add(p);
    void p.finally(() => pendingScans.delete(p));
  }
  (bot as Bot & { idleScans?: () => Promise<void> }).idleScans = async () => {
    await Promise.all([...pendingScans]);
  };

  // ---------------- commands ----------------

  bot.command("start", async (ctx) => {
    const isNew = !repo.getUser(ctx.from!.id);
    const { user, T } = who(ctx);
    if (isNew) repo.track(user.id, "signup", { ref: ctx.match || null, lang: user.lang });

    // Invite link: t.me/bot?start=ref_<inviter id>. Only a brand-new user counts, and not yourself.
    const ref = /^ref_(\d+)$/.exec(ctx.match ?? "");
    if (ref) {
      const inviter = repo.getUser(Number(ref[1]));
      if (isNew && inviter && inviter.id !== user.id && repo.setReferrer(user.id, inviter.id)) {
        repo.grantProDays(user.id, REFERRAL_DAYS);
        repo.grantProDays(inviter.id, REFERRAL_DAYS);
        repo.track(inviter.id, "referral", { invited: user.id });
        await ctx.api
          .sendMessage(inviter.chatId, t(inviter.lang).refRewarded(REFERRAL_DAYS), HTML)
          .catch(() => undefined);
        await reply(ctx, T.refWelcome(REFERRAL_DAYS));
      }
      return reply(ctx, T.welcome, welcomeKeyboard(T, user.lang));
    }

    // Deep link: t.me/bot?start=<base64url keyword> lets a landing page pre-fill a search
    if (ctx.match) {
      try {
        const kw = Buffer.from(ctx.match, "base64url").toString("utf8").trim();
        if (kw.length >= 2) return createWatch(ctx, user, kw);
      } catch {
        /* ignore */
      }
    }
    await reply(ctx, T.welcome, welcomeKeyboard(T, user.lang));
  });

  bot.command("invite", async (ctx) => {
    const { user, T } = who(ctx);
    const link = `https://t.me/${ctx.me.username}?start=ref_${user.id}`;
    const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(T.shareText)}`;
    repo.track(user.id, "invite_opened");
    return reply(ctx, T.inviteText(link, REFERRAL_DAYS, repo.countReferrals(user.id)), new InlineKeyboard().url(T.btnShare, share));
  });

  bot.command("privacy", (ctx) => {
    const { T } = who(ctx);
    return reply(ctx, T.privacy(esc(config.CONTACT)), new InlineKeyboard().text(T.btnDeleteMe, cb("delme")));
  });

  const askDelete = (ctx: Context) => {
    const { T } = who(ctx);
    return reply(ctx, T.deleteConfirm, new InlineKeyboard().text(T.btnConfirmDelete, cb("delmeok")).text(T.btnCancel, cb("kwx")));
  };
  bot.command("delete_me", askDelete);

  bot.command("help", (ctx) => {
    const { T } = who(ctx);
    return reply(ctx, helpText(T, "about"), helpKeyboard(T, "about"));
  });

  bot.command("lang", (ctx) => {
    const { T } = who(ctx);
    return reply(ctx, T.langPrompt, langKeyboard());
  });

  bot.command("scan", async (ctx) => {
    const { user, T } = who(ctx);
    const list = repo.listWatches(user.id);
    const id = parseId(ctx.match.trim()) ?? (list.length === 1 ? list[0]!.id : null);
    if (!id && list.length > 1) {
      const kb = new InlineKeyboard();
      for (const x of list) kb.text(`📊 #${x.id} ${x.name}`, cb("scan", x.id)).row();
      return reply(ctx, T.scanPick, kb);
    }
    const w = id ? repo.getUserWatch(user.id, id) : null;
    if (!w) return reply(ctx, T.scanUsage);
    startScan(ctx, user, w);
  });

  bot.command("list", (ctx) => showList(ctx, userOf(ctx)));

  bot.command("plan", (ctx) => {
    const { user, T } = who(ctx);
    const lines = [planText(T, user, repo.countWatches(user.id), repo.aiCallsToday(user.id))];
    // a running invite bonus (not a permanent Pro) shows its end date
    if (user.proUntil && user.proUntil > Date.now() && !isAdmin(user.id)) {
      lines.push(T.planProUntil(new Date(user.proUntil).toLocaleDateString("de-AT", { timeZone: "Europe/Vienna" })));
    }
    if (user.plan === "free") lines.push("", planPitch(T));
    lines.push("", T.planInviteHint);
    return reply(ctx, lines.join("\n"));
  });

  const editCmd = (name: string, run: (user: User, args: string) => Watch | null, usage: string) =>
    bot.command(name, async (ctx) => {
      const { user, T } = who(ctx);
      const w = run(user, ctx.match);
      if (!w) return reply(ctx, T.badCommand(usage));
      repo.track(user.id, `edit_${name}`);
      return showWatch(ctx, T, w);
    });

  editCmd(
    "price",
    (u, a) => {
      const p = parsePriceArgs(a);
      return p ? watches.setPrice(u, p.id, p.min, p.max) : null;
    },
    "/price 3 80 220",
  );
  editCmd(
    "exclude",
    (u, a) => {
      const p = parseIdAndList(a);
      return p ? watches.addExclude(u, p.id, p.words) : null;
    },
    "/exclude 3 hülle, spiel",
  );
  editCmd(
    "unexclude",
    (u, a) => {
      const p = parseIdAndList(a);
      return p ? watches.removeExclude(u, p.id, p.words) : null;
    },
    "/unexclude 3 controller",
  );
  editCmd(
    "match",
    (u, a) => {
      const p = parseIdAndRest(a);
      return p ? watches.setMatch(u, p.id, p.rest) : null;
    },
    "/match 3 series s | xbox s",
  );
  editCmd(
    "score",
    (u, a) => {
      const p = parseIdAndRest(a);
      const n = p ? Number(p.rest) : NaN;
      return p && Number.isFinite(n) ? watches.setMinScore(u, p.id, n) : null;
    },
    "/score 3 6",
  );
  editCmd(
    "rename",
    (u, a) => {
      const p = parseIdAndRest(a);
      return p ? watches.rename(u, p.id, p.rest) : null;
    },
    "/rename 3 My Xbox",
  );

  // ---------------- admin (owner-only, Russian on purpose) ----------------

  bot.command("stats", (ctx) => {
    if (!isAdmin(ctx.from!.id)) return;
    const day = repo.stats(Date.now() - 86_400_000);
    const week = repo.stats(Date.now() - 7 * 86_400_000);
    return reply(
      ctx,
      [
        `👥 Пользователи: ${day.users} (Pro ${day.proUsers}, активных ${day.activeUsers})`,
        `👀 Отслеживания: ${day.watches} (активных ${day.activeWatches})`,
        `🆕 Регистрации: ${day.signups} за 24ч / ${week.signups} за 7д`,
        `🔔 Уведомления: ${day.notifications} за 24ч / ${week.notifications} за 7д`,
        `🤖 ИИ-вызовы: ${day.aiCalls} за 24ч`,
        `👎 «Не то»: ${day.negativeFeedback} за 24ч`,
        `🎁 По приглашениям: ${day.referrals} за 24ч / ${week.referrals} за 7д`,
      ].join("\n"),
    );
  });

  bot.command("grant", (ctx) => {
    if (!isAdmin(ctx.from!.id)) return;
    const [id, plan] = ctx.match.trim().split(/\s+/);
    const uid = parseId(id);
    if (!uid || (plan !== "pro" && plan !== "free")) return reply(ctx, "Пример: <code>/grant 123456 pro</code>");
    return reply(ctx, repo.setPlan(uid, plan as Plan) ? `Готово: ${uid} → ${plan}` : "Пользователь не найден");
  });

  // ---------------- free text / links ----------------

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const { user, T } = who(ctx);
    if (text.startsWith("/")) return reply(ctx, T.unknownCommand);

    if (extractUrl(text)) return createWatch(ctx, user, text);

    const kw = text.trim();
    if (kw.length < 2 || kw.length > 80) {
      return reply(ctx, T.sendLinkOrText, new InlineKeyboard().text(T.btnHowLink, cb("hlp", "link", "n")));
    }
    pendingText.set(user.id, kw);
    return reply(ctx, T.confirmKeyword(esc(kw)), new InlineKeyboard().text(T.btnYes, cb("kw")).text(T.btnCancel, cb("kwx")));
  });

  // ---------------- buttons ----------------

  bot.callbackQuery("kw", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { user, T } = who(ctx);
    const kw = pendingText.get(user.id);
    pendingText.delete(user.id);
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    if (!kw) return reply(ctx, T.requestExpired);
    return createWatch(ctx, user, kw);
  });

  bot.callbackQuery("kwx", async (ctx) => {
    const { user, T } = who(ctx);
    pendingText.delete(user.id);
    await ctx.answerCallbackQuery(T.cancelled);
    await ctx.deleteMessage().catch(() => undefined);
  });

  bot.callbackQuery(/^ex:(\d)$/, async (ctx) => {
    const kw = EXAMPLES[Number(ctx.match[1])];
    if (!kw) return ctx.answerCallbackQuery();
    const { user, T } = who(ctx);
    await ctx.answerCallbackQuery(T.creatingExample(kw));
    repo.track(user.id, "example", { kw });
    return createWatch(ctx, user, kw);
  });

  bot.callbackQuery(/^hlp:(about|link|filter|scan|plan)(:n)?$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { T } = who(ctx);
    const topic = ctx.match[1] as HelpTopic;
    const opts = { ...HTML, reply_markup: helpKeyboard(T, topic) };
    if (ctx.match[2]) await ctx.reply(helpText(T, topic), opts);
    else await ctx.editMessageText(helpText(T, topic), opts).catch(() => undefined);
  });

  bot.callbackQuery("delme", async (ctx) => {
    await ctx.answerCallbackQuery();
    await askDelete(ctx);
  });

  bot.callbackQuery("delmeok", async (ctx) => {
    const T = t(repo.getUser(ctx.from.id)?.lang ?? detectLang(ctx.from.language_code));
    // no userOf() here: it would re-create the user we are deleting
    pendingText.delete(ctx.from.id);
    repo.deleteUser(ctx.from.id);
    logger.info("user deleted their data", { user: ctx.from.id });
    await ctx.answerCallbackQuery(T.deleted);
    await ctx.editMessageText(T.deleteDone, HTML).catch(() => reply(ctx, T.deleteDone));
  });

  bot.callbackQuery("lngm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { T } = who(ctx);
    await reply(ctx, T.langPrompt, langKeyboard());
  });

  bot.callbackQuery(/^lng:([a-z]{2})$/, async (ctx) => {
    const lang = ctx.match[1];
    if (!isLang(lang)) return ctx.answerCallbackQuery();
    const user = userOf(ctx);
    repo.setLang(user.id, lang);
    repo.track(user.id, "lang", { lang });
    const T = t(lang);
    await ctx.answerCallbackQuery(T.saved);
    await ctx.editMessageText(T.langSet, HTML).catch(() => undefined);
    // show the start screen again, now readable
    await reply(ctx, T.welcome, welcomeKeyboard(T, lang));
  });

  bot.callbackQuery(/^set:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { user, T } = who(ctx);
    const w = repo.getUserWatch(user.id, Number(ctx.match[1]));
    if (w) await showSettings(ctx, T, w);
  });

  bot.callbackQuery("lst", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showList(ctx, userOf(ctx), true);
  });

  bot.callbackQuery(/^opn:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { user, T } = who(ctx);
    const w = repo.getUserWatch(user.id, Number(ctx.match[1]));
    if (w) await showWatch(ctx, T, w, true);
  });

  bot.callbackQuery(/^tgl:(\d+):(active|ai|defect)$/, async (ctx) => {
    const { user, T } = who(ctx);
    const id = Number(ctx.match[1]);
    const what = ctx.match[2];
    const cur = repo.getUserWatch(user.id, id);
    if (!cur) return ctx.answerCallbackQuery(T.notFound);
    if (what === "ai" && !aiEnabled) return ctx.answerCallbackQuery({ text: T.aiNotConfigured, show_alert: true });
    const w =
      what === "active" ? watches.setActive(user, id, !cur.active) : watches.toggle(user, id, what === "ai" ? "useAi" : "allowDefect");
    await ctx.answerCallbackQuery(T.saved);
    if (!w) return;
    if (what === "active") await showWatch(ctx, T, w, true);
    else await showSettings(ctx, T, w);
  });

  bot.callbackQuery(/^int:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { user, T } = who(ctx);
    const id = Number(ctx.match[1]);
    const w = repo.getUserWatch(user.id, id);
    // intervals below the site's politeness floor are not offered at all, whatever the plan
    const floor = w ? (siteById(w.query.site).minIntervalSec ?? 0) : 0;
    const kb = new InlineKeyboard();
    for (const s of INTERVAL_CHOICES.filter((x) => x >= floor)) {
      const locked = s < PLANS[user.plan].minIntervalSec;
      kb.text(`${locked ? "🔒 " : ""}${intervalLabel(T, s)}`, cb("ints", id, s));
    }
    kb.row().text(T.btnBack, cb("set", id));
    await ctx.editMessageReplyMarkup({ reply_markup: kb }).catch(() => undefined);
  });

  bot.callbackQuery(/^ints:(\d+):(\d+)$/, async (ctx) => {
    const { user, T } = who(ctx);
    const sec = Number(ctx.match[2]);
    if (sec < PLANS[user.plan].minIntervalSec) return ctx.answerCallbackQuery({ text: T.proOnly, show_alert: true });
    const w = watches.setInterval(user, Number(ctx.match[1]), sec);
    await ctx.answerCallbackQuery(T.saved);
    if (w) await showSettings(ctx, T, w);
  });

  bot.callbackQuery(/^edt:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { T } = who(ctx);
    await reply(ctx, editHelp(T, Number(ctx.match[1])));
  });

  bot.callbackQuery(/^scan:(\d+)$/, async (ctx) => {
    const { user, T } = who(ctx);
    const w = repo.getUserWatch(user.id, Number(ctx.match[1]));
    if (!w) return ctx.answerCallbackQuery(T.notFound);
    await ctx.answerCallbackQuery(T.scanStartingToast);
    startScan(ctx, user, w);
  });

  bot.callbackQuery(/^prv:(\d+)$/, async (ctx) => {
    const { user, T } = who(ctx);
    const w = repo.getUserWatch(user.id, Number(ctx.match[1]));
    if (!w) return ctx.answerCallbackQuery(T.notFound);
    await ctx.answerCallbackQuery(T.loading);
    try {
      await reply(ctx, `🧪 <b>${esc(w.name)}</b>\n${previewText(T, await watches.preview(user, w))}`);
    } catch (e) {
      await reply(ctx, T.loadFailed(esc((e as Error).message)));
    }
  });

  bot.callbackQuery(/^del:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const { T } = who(ctx);
    const id = Number(ctx.match[1]);
    await ctx
      .editMessageReplyMarkup({
        reply_markup: new InlineKeyboard().text(T.btnConfirmDelete, cb("delok", id)).text(T.btnCancel, cb("set", id)),
      })
      .catch(() => undefined);
  });

  bot.callbackQuery(/^delok:(\d+)$/, async (ctx) => {
    const { user, T } = who(ctx);
    const ok = watches.delete(user, Number(ctx.match[1]));
    await ctx.answerCallbackQuery(ok ? T.deleted : T.notFound);
    if (ok) repo.track(user.id, "watch_deleted");
    await showList(ctx, user, true);
  });

  bot.callbackQuery(/^fb:([01]):(\d+):(.+)$/, async (ctx) => {
    const { user, T } = who(ctx);
    const good = ctx.match[1] === "1";
    const watchId = Number(ctx.match[2]);
    const listingId = ctx.match[3]!;
    const w = repo.getUserWatch(user.id, watchId);
    const seen = w ? repo.getSeen(watchId, listingId) : null;
    if (!w || !seen) return ctx.answerCallbackQuery(T.watchGone);
    repo.addFeedback(watchId, listingId, seen.title, seen.price, good);
    repo.track(user.id, good ? "feedback_good" : "feedback_bad", { watch: watchId });
    await ctx.answerCallbackQuery(good ? T.fbGood : w.profile.useAi ? T.fbBadAi : T.fbBadNoAi);
    // keep only the link button so the message does not get re-voted
    const url = (ctx.callbackQuery.message?.reply_markup?.inline_keyboard?.[0]?.[0] as { url?: string } | undefined)?.url;
    await ctx
      .editMessageReplyMarkup({ reply_markup: url ? new InlineKeyboard().url(good ? T.btnOpenGood : T.btnOpenBad, url) : undefined })
      .catch(() => undefined);
  });

  bot.catch((err) => logger.error("bot handler error", { err: err.error instanceof Error ? err.error.message : String(err.error) }));

  return bot;
}

/** Command menu per Telegram app language; "en" is also the default for every other locale. */
export async function registerCommands(bot: Bot) {
  for (const lang of LANGS) {
    const T = t(lang);
    const commands = [
      { command: "list", description: T.cmdList },
      { command: "scan", description: T.cmdScan },
      { command: "plan", description: T.cmdPlan },
      { command: "invite", description: T.cmdInvite },
      { command: "lang", description: T.cmdLang },
      { command: "privacy", description: T.cmdPrivacy },
      { command: "help", description: T.cmdHelp },
    ];
    await bot.api.setMyCommands(commands, { language_code: lang });
    if (lang === "en") await bot.api.setMyCommands(commands);
  }
}
