import { Bot, GrammyError, InlineKeyboard, InputFile, type Context } from "grammy";
import type { AppConfig } from "../config.js";
import { INTERVAL_CHOICES, PLANS } from "../core/plans.js";
import type { Repo } from "../db/repo.js";
import { logger } from "../logger.js";
import { extractUrl } from "../sites/index.js";
import { RecipientGoneError, type Notifier } from "../services/notifier.js";
import type { WatchService } from "../services/watches.js";
import type { ScanProgress, ScanService } from "../services/scan.js";
import { renderReport } from "../report/html.js";
import type { Plan, User, Watch } from "../types.js";
import { cb, parseId, parseIdAndList, parseIdAndRest, parsePriceArgs } from "./commands.js";
import {
  editHelp,
  esc,
  HELP,
  intervalLabel,
  listingText,
  planText,
  previewText,
  profileSummary,
  scanSummaryText,
  WELCOME,
} from "./format.js";

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

function watchKeyboard(w: Watch) {
  return new InlineKeyboard()
    .text(w.active ? "⏸ Пауза" : "▶️ Включить", cb("tgl", w.id, "active"))
    .text("🧪 Превью", cb("prv", w.id))
    .row()
    .text(w.profile.useAi ? "🤖 ИИ: вкл" : "🤖 ИИ: выкл", cb("tgl", w.id, "ai"))
    .text(w.profile.allowDefect ? "⚠️ Дефект: да" : "⚠️ Дефект: нет", cb("tgl", w.id, "defect"))
    .row()
    .text(`⏱ ${intervalLabel(w.intervalSec)}`, cb("int", w.id))
    .text("✏️ Настроить", cb("edt", w.id))
    .row()
    .text("📊 Анализ рынка: все страницы", cb("scan", w.id))
    .row()
    .text("🗑 Удалить", cb("del", w.id))
    .text("« Список", cb("lst"));
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
      const text = listingText(watch, listing, info);
      const kb = new InlineKeyboard()
        .url("Открыть", listing.url)
        .row()
        .text("👎 Не то", cb("fb", 0, watch.id, listing.id))
        .text("👍 Годно", cb("fb", 1, watch.id, listing.id));
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

export function createBot(deps: { config: AppConfig; repo: Repo; watches: WatchService; aiEnabled: boolean; scans?: ScanService }) {
  const { config, repo, watches, aiEnabled, scans } = deps;
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
  const isAdmin = (id: number) => config.ADMIN_IDS.includes(id);

  // Keyword waiting for confirmation, per user. Callback data is too small to carry free text.
  const pendingText = new Map<number, string>();

  const userOf = (ctx: Context): User => {
    const from = ctx.from!;
    const u = repo.upsertUser(from.id, ctx.chat?.id ?? from.id, from.username ?? null, config.EVERYONE_PRO ? "pro" : "free");
    // the owner should never hit the Free limits while testing
    if (isAdmin(u.id) && u.plan !== "pro") {
      repo.setPlan(u.id, "pro");
      return { ...u, plan: "pro" };
    }
    return u;
  };

  const reply = (ctx: Context, text: string, kb?: InlineKeyboard) => ctx.reply(text, { ...HTML, reply_markup: kb });

  async function showWatch(ctx: Context, w: Watch, edit = false) {
    const text = profileSummary(w);
    if (edit) {
      await ctx.editMessageText(text, { ...HTML, reply_markup: watchKeyboard(w) }).catch(() => undefined);
    } else {
      await reply(ctx, text, watchKeyboard(w));
    }
  }

  async function showList(ctx: Context, user: User, edit = false) {
    const list = repo.listWatches(user.id);
    if (!list.length) {
      const t = "Отслеживаний пока нет. Пришли ссылку на поиск Willhaben или напиши, что ищешь.";
      return edit ? ctx.editMessageText(t, HTML).catch(() => undefined) : reply(ctx, t);
    }
    const kb = new InlineKeyboard();
    for (const w of list) kb.text(`${w.active ? "🟢" : "⏸"} #${w.id} ${w.name}`, cb("opn", w.id)).row();
    const t = `<b>Твои отслеживания</b> (${list.length}/${PLANS[user.plan].maxWatches})`;
    return edit ? ctx.editMessageText(t, { ...HTML, reply_markup: kb }).catch(() => undefined) : reply(ctx, t, kb);
  }

  async function createWatch(ctx: Context, user: User, input: string) {
    await ctx.replyWithChatAction("typing");
    const status = await reply(ctx, "🔎 Смотрю поиск и настраиваю фильтр…");
    const r = await watches.create(user, input);
    await ctx.api.deleteMessage(status.chat.id, status.message_id).catch(() => undefined);

    if (!r.ok) {
      const msg = {
        limit: `Лимит тарифа: ${PLANS[user.plan].maxWatches} отслеживаний. Удали лишнее в /list или перейди на Pro (/plan).`,
        unsupported_site: `Пока поддерживаю только Willhaben. ${r.detail ? `(${esc(r.detail)})` : ""}`,
        bad_url: `Это не похоже на страницу поиска. Открой поиск, а не одно объявление, и пришли ссылку. ${r.detail ? `(${esc(r.detail)})` : ""}`,
        fetch_failed: `Не удалось загрузить поиск, попробуй позже. (${esc(r.detail ?? "")})`,
        duplicate: "Такой поиск уже отслеживается, смотри /list.",
      }[r.error];
      return reply(ctx, msg);
    }

    const head =
      r.profileSource === "ai"
        ? "✅ Готово. ИИ разобрал, что ты ищешь, и собрал фильтр:"
        : `✅ Готово. Фильтр по словам запроса${aiEnabled ? " (ИИ не ответил, проверь правила)" : ""}:`;
    await reply(ctx, `${head}\n\n${profileSummary(r.watch)}`, watchKeyboard(r.watch));
    await reply(ctx, `${previewText(r.preview)}\n\nТекущие объявления запомнил. Пришлю только новые и подешевевшие.`);
  }

  // A scan takes up to a minute; one at a time per user
  const scanning = new Set<number>();

  async function runScan(ctx: Context, user: User, w: Watch) {
    if (!scans) return reply(ctx, "Анализ рынка не настроен на сервере.");
    if (scanning.has(user.id)) return reply(ctx, "Анализ уже идёт, подожди немного.");
    scanning.add(user.id);
    const status = await reply(ctx, `📊 Анализирую «${esc(w.name)}»…`);
    let last = 0;
    const progress = (p: ScanProgress) => {
      const now = Date.now();
      if (p.stage !== "done" && now - last < 1500) return;
      last = now;
      const text =
        p.stage === "pages"
          ? `📊 Загружаю страницы: ${p.page}, объявлений ${p.listings}…`
          : p.stage === "ai"
            ? `🤖 ИИ проверяет: ${p.done}/${p.total}…`
            : "📊 Готовлю отчёт…";
      void ctx.api.editMessageText(status.chat.id, status.message_id, text).catch(() => undefined);
    };
    try {
      const r = await scans.run(user, w, progress);
      if (!r.ok) {
        const msg =
          r.error === "limit"
            ? `Лимит анализов на сегодня: ${PLANS[user.plan].scansPerDay}. На Pro больше, см. /plan.`
            : `Не удалось загрузить поиск: ${esc(r.detail ?? "")}`;
        await ctx.api.editMessageText(status.chat.id, status.message_id, msg, HTML).catch(() => reply(ctx, msg));
        return;
      }
      await ctx.api.deleteMessage(status.chat.id, status.message_id).catch(() => undefined);
      await reply(ctx, scanSummaryText(r.report));
      const day = new Date(r.report.at).toISOString().slice(0, 10);
      const file = `dealradar-${w.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-${day}.html`;
      await ctx.replyWithDocument(new InputFile(Buffer.from(renderReport(r.report), "utf8"), file), {
        caption: "Полный отчёт: открой файл в браузере, можно сортировать и фильтровать.",
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
      return reply(ctx, "Анализ упал с ошибкой, попробуй позже.").catch(() => undefined);
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
    const user = userOf(ctx);
    if (isNew) repo.track(user.id, "signup", { ref: ctx.match || null });
    // Deep link: t.me/bot?start=<base64url keyword> lets a landing page pre-fill a search
    if (ctx.match) {
      try {
        const kw = Buffer.from(ctx.match, "base64url").toString("utf8").trim();
        if (kw.length >= 2) return createWatch(ctx, user, kw);
      } catch {
        /* ignore */
      }
    }
    await reply(ctx, WELCOME);
  });

  bot.command("help", (ctx) => reply(ctx, HELP));

  bot.command("scan", async (ctx) => {
    const user = userOf(ctx);
    const list = repo.listWatches(user.id);
    const id = parseId(ctx.match.trim()) ?? (list.length === 1 ? list[0]!.id : null);
    const w = id ? repo.getUserWatch(user.id, id) : null;
    if (!w) return reply(ctx, "Укажи номер отслеживания: <code>/scan 3</code>. Номера в /list.");
    startScan(ctx, user, w);
  });
  bot.command("list", (ctx) => showList(ctx, userOf(ctx)));

  bot.command("plan", (ctx) => {
    const user = userOf(ctx);
    const extra =
      user.plan === "free"
        ? `\n\n<b>Pro</b>: до ${PLANS.pro.maxWatches} отслеживаний, проверка раз в ${intervalLabel(PLANS.pro.minIntervalSec)}, ${PLANS.pro.aiPerDay} ИИ-проверок в день.`
        : "";
    return reply(ctx, planText(user, repo.countWatches(user.id), repo.aiCallsToday(user.id)) + extra);
  });

  const editCmd = (name: string, run: (user: User, args: string) => Watch | null, usage: string) =>
    bot.command(name, async (ctx) => {
      const user = userOf(ctx);
      const w = run(user, ctx.match);
      if (!w) return reply(ctx, `Не понял. Пример: <code>${usage}</code>`);
      repo.track(user.id, `edit_${name}`);
      return showWatch(ctx, w);
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
    "/rename 3 Моя Xbox",
  );

  // ---------------- admin ----------------

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
    if (text.startsWith("/")) return reply(ctx, "Неизвестная команда. /help");
    const user = userOf(ctx);

    if (extractUrl(text)) return createWatch(ctx, user, text);

    const kw = text.trim();
    if (kw.length < 2 || kw.length > 80) return reply(ctx, "Пришли ссылку на поиск или коротко напиши, что ищешь.");
    pendingText.set(user.id, kw);
    return reply(
      ctx,
      `Следить за «<b>${esc(kw)}</b>» на Willhaben по всей Австрии?\n<i>Для региона, категории и цены лучше прислать ссылку на поиск с нужными фильтрами.</i>`,
      new InlineKeyboard().text("✅ Да", cb("kw")).text("Отмена", cb("kwx")),
    );
  });

  // ---------------- buttons ----------------

  bot.callbackQuery("kw", async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = userOf(ctx);
    const kw = pendingText.get(user.id);
    pendingText.delete(user.id);
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    if (!kw) return reply(ctx, "Запрос устарел, напиши ещё раз.");
    return createWatch(ctx, user, kw);
  });

  bot.callbackQuery("kwx", async (ctx) => {
    pendingText.delete(ctx.from.id);
    await ctx.answerCallbackQuery("Отменено");
    await ctx.deleteMessage().catch(() => undefined);
  });

  bot.callbackQuery("lst", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showList(ctx, userOf(ctx), true);
  });

  bot.callbackQuery(/^opn:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const w = repo.getUserWatch(ctx.from.id, Number(ctx.match[1]));
    if (w) await showWatch(ctx, w, true);
  });

  bot.callbackQuery(/^tgl:(\d+):(active|ai|defect)$/, async (ctx) => {
    const user = userOf(ctx);
    const id = Number(ctx.match[1]);
    const what = ctx.match[2];
    const cur = repo.getUserWatch(user.id, id);
    if (!cur) return ctx.answerCallbackQuery("Не найдено");
    if (what === "ai" && !aiEnabled) return ctx.answerCallbackQuery({ text: "ИИ не настроен на сервере", show_alert: true });
    const w =
      what === "active"
        ? watches.setActive(user, id, !cur.active)
        : watches.toggle(user, id, what === "ai" ? "useAi" : "allowDefect");
    await ctx.answerCallbackQuery("Сохранено");
    if (w) await showWatch(ctx, w, true);
  });

  bot.callbackQuery(/^int:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = userOf(ctx);
    const id = Number(ctx.match[1]);
    const kb = new InlineKeyboard();
    for (const s of INTERVAL_CHOICES) {
      const locked = s < PLANS[user.plan].minIntervalSec;
      kb.text(`${locked ? "🔒 " : ""}${intervalLabel(s)}`, cb("ints", id, s));
    }
    kb.row().text("« Назад", cb("opn", id));
    await ctx.editMessageReplyMarkup({ reply_markup: kb }).catch(() => undefined);
  });

  bot.callbackQuery(/^ints:(\d+):(\d+)$/, async (ctx) => {
    const user = userOf(ctx);
    const sec = Number(ctx.match[2]);
    if (sec < PLANS[user.plan].minIntervalSec) {
      return ctx.answerCallbackQuery({ text: "Доступно на Pro, см. /plan", show_alert: true });
    }
    const w = watches.setInterval(user, Number(ctx.match[1]), sec);
    await ctx.answerCallbackQuery("Сохранено");
    if (w) await showWatch(ctx, w, true);
  });

  bot.callbackQuery(/^edt:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await reply(ctx, editHelp(Number(ctx.match[1])));
  });

  bot.callbackQuery(/^scan:(\d+)$/, async (ctx) => {
    const user = userOf(ctx);
    const w = repo.getUserWatch(user.id, Number(ctx.match[1]));
    if (!w) return ctx.answerCallbackQuery("Не найдено");
    await ctx.answerCallbackQuery("Запускаю анализ…");
    startScan(ctx, user, w);
  });

  bot.callbackQuery(/^prv:(\d+)$/, async (ctx) => {
    const w = repo.getUserWatch(ctx.from.id, Number(ctx.match[1]));
    if (!w) return ctx.answerCallbackQuery("Не найдено");
    await ctx.answerCallbackQuery("Загружаю…");
    try {
      await reply(ctx, `🧪 <b>${esc(w.name)}</b>\n${previewText(await watches.preview(userOf(ctx), w))}`);
    } catch (e) {
      await reply(ctx, `Не удалось загрузить: ${esc((e as Error).message)}`);
    }
  });

  bot.callbackQuery(/^del:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = Number(ctx.match[1]);
    await ctx
      .editMessageReplyMarkup({
        reply_markup: new InlineKeyboard().text("Да, удалить", cb("delok", id)).text("Отмена", cb("opn", id)),
      })
      .catch(() => undefined);
  });

  bot.callbackQuery(/^delok:(\d+)$/, async (ctx) => {
    const user = userOf(ctx);
    const ok = watches.delete(user, Number(ctx.match[1]));
    await ctx.answerCallbackQuery(ok ? "Удалено" : "Не найдено");
    if (ok) repo.track(user.id, "watch_deleted");
    await showList(ctx, user, true);
  });

  bot.callbackQuery(/^fb:([01]):(\d+):(.+)$/, async (ctx) => {
    const good = ctx.match[1] === "1";
    const watchId = Number(ctx.match[2]);
    const listingId = ctx.match[3]!;
    const w = repo.getUserWatch(ctx.from.id, watchId);
    const seen = w ? repo.getSeen(watchId, listingId) : null;
    if (!w || !seen) return ctx.answerCallbackQuery("Отслеживание удалено");
    repo.addFeedback(watchId, listingId, seen.title, seen.price, good);
    repo.track(ctx.from.id, good ? "feedback_good" : "feedback_bad", { watch: watchId });
    await ctx.answerCallbackQuery(
      good
        ? "Спасибо, учту"
        : w.profile.useAi
          ? "Учту. Похожие будут отсеиваться"
          : "Учту. Включи ИИ или добавь стоп-слово через /exclude",
    );
    // keep only the link button so the message does not get re-voted
    const url = (ctx.callbackQuery.message?.reply_markup?.inline_keyboard?.[0]?.[0] as { url?: string } | undefined)?.url;
    await ctx
      .editMessageReplyMarkup({ reply_markup: url ? new InlineKeyboard().url(good ? "👍 Открыть" : "👎 Открыть", url) : undefined })
      .catch(() => undefined);
  });

  bot.catch((err) => logger.error("bot handler error", { err: err.error instanceof Error ? err.error.message : String(err.error) }));

  return bot;
}

export async function registerCommands(bot: Bot) {
  await bot.api.setMyCommands([
    { command: "list", description: "Мои отслеживания" },
    { command: "scan", description: "Анализ рынка по всем страницам" },
    { command: "plan", description: "Тариф и лимиты" },
    { command: "help", description: "Помощь" },
  ]);
}
