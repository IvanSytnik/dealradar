import { describe, expect, it } from "vitest";
import type { Update } from "grammy/types";
import { createBot } from "../src/bot/bot.js";
import { loadConfig } from "../src/config.js";
import { WatchService } from "../src/services/watches.js";
import { ScanService } from "../src/services/scan.js";
import { BatchClassifier } from "../src/ai/batch.js";
import type { ReportPublisher } from "../src/report/publish.js";
import { fakeHttp, memRepo, willhabenHtml } from "./helpers.js";

const USER = { id: 42, is_bot: false, first_name: "Ivan", username: "ivan", language_code: "ru" };
const CHAT = { id: 42, type: "private" as const, first_name: "Ivan" };
const LINK = "https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=xbox+series+s&areaId=6";

function setup(opts: { admin?: boolean; reports?: ReportPublisher; langCode?: string } = {}) {
  const from = { ...USER, language_code: opts.langCode ?? USER.language_code };
  const repo = memRepo();
  const http = fakeHttp(() =>
    willhabenHtml([
      { id: 1, title: "Xbox Series S", price: 170 },
      { id: 2, title: "Xbox Series S 512GB", price: 230 },
      { id: 3, title: "Xbox Series S weiß", price: 250 },
    ]),
  );
  const config = loadConfig({ TELEGRAM_BOT_TOKEN: "123456:TEST-TOKEN", ADMIN_IDS: opts.admin === false ? "7" : "42" } as NodeJS.ProcessEnv);
  const scans = new ScanService(repo, http.get, new BatchClassifier(repo, null));
  const bot = createBot({ config, repo, watches: new WatchService(repo, http.get, null), aiEnabled: false, scans, reports: opts.reports });
  bot.botInfo = {
    ...USER,
    id: 1,
    is_bot: true,
    first_name: "DealRadar",
    username: "dealradar_bot",
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
  } as typeof bot.botInfo;

  const sent: { method: string; payload: any }[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    sent.push({ method, payload });
    return { ok: true, result: { message_id: sent.length, chat: CHAT, date: 0, text: "" } } as any;
  });

  let updateId = 0;
  const text = (t: string, as: typeof from = from) => {
    const entities = t.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: t.split(" ")[0]!.length }] : undefined;
    return bot.handleUpdate({
      update_id: ++updateId,
      message: { message_id: updateId, date: 0, chat: { ...CHAT, id: as.id }, from: as, text: t, entities },
    } as Update);
  };
  const press = (data: string) =>
    bot.handleUpdate({
      update_id: ++updateId,
      callback_query: {
        id: String(updateId),
        from,
        chat_instance: "x",
        data,
        message: { message_id: 1, date: 0, chat: CHAT, text: "card" },
      },
    } as Update);

  const texts = () => sent.filter((s) => s.method === "sendMessage").map((s) => s.payload.text as string);
  /** Every button label/data of the last message or markup edit. */
  const buttons = () => {
    const last = [...sent].reverse().find((s) => s.payload?.reply_markup?.inline_keyboard);
    return (last?.payload.reply_markup.inline_keyboard as { text: string; callback_data?: string; url?: string }[][]).flat();
  };
  const idle = () => (bot as unknown as { idleScans: () => Promise<void> }).idleScans();
  const lastEdit = () => [...sent].reverse().find((x) => x.method === "editMessageText");
  return { repo, sent, text, press, texts, idle, buttons, lastEdit };
}

describe("bot end-to-end", () => {
  it("start → link → watch card + preview", async () => {
    const s = setup();
    await s.text("/start");
    expect(s.texts()[0]).toMatch(/следит за объявлениями/);
    expect(s.buttons().map((b) => b.text)).toEqual(expect.arrayContaining(["🎮 PS5", "🔗 Как взять ссылку"]));

    await s.text(`вот ${LINK}`);
    const all = s.texts().join("\n");
    expect(all).toMatch(/Готово/);
    expect(all).toMatch(/под фильтр подходит <b>3<\/b>/);
    expect(s.repo.listWatches(42)).toHaveLength(1);
  });

  it("speaks the user's Telegram language", async () => {
    const s = setup({ langCode: "de-AT" });
    await s.text("/start");
    expect(s.texts()[0]).toMatch(/beobachtet willhaben\.at/);
    expect(s.buttons().map((b) => b.text)).toContain("🌐 🇦🇹 Deutsch");
    await s.text(LINK);
    const all = s.texts().join("\n");
    expect(all).toMatch(/Fertig/);
    expect(all).toMatch(/passen zum Filter/);
    expect(all).not.toMatch(/[А-Яа-яЁё]/);
  });

  it("/lang switches the language and it sticks over the Telegram locale", async () => {
    const s = setup({ langCode: "de" });
    await s.text("/lang");
    expect(s.buttons().map((b) => b.callback_data)).toEqual(["lng:de", "lng:en", "lng:uk", "lng:ru"]);
    await s.press("lng:uk");
    expect(s.repo.getUser(42)!.lang).toBe("uk");
    expect(s.texts().at(-1)).toMatch(/стежить за оголошеннями/); // welcome again, now in Ukrainian
    await s.text("/help"); // Telegram still says "de"
    expect(s.texts().at(-1)).toMatch(/Що вміє DealRadar/);
  });

  it("an example button creates a watch in one tap", async () => {
    const s = setup();
    await s.text("/start");
    await s.press("ex:0");
    expect(s.repo.listWatches(42)[0]!.query.keyword).toBe("ps5");
    expect(s.texts().join("\n")).toMatch(/Готово/);
  });

  it("help is split into topics you can switch between", async () => {
    const s = setup();
    await s.text("/help");
    expect(s.texts().at(-1)).toMatch(/Что умеет DealRadar/);
    await s.press("hlp:link"); // pressed on the help message: edits it in place
    expect(s.lastEdit()?.payload.text).toMatch(/Поделиться/);
    await s.press("hlp:scan:n"); // from the welcome screen: a new message
    expect(s.texts().at(-1)).toMatch(/медиану/);
    const edit = s.lastEdit();
    expect(edit?.payload.text).toMatch(/Как взять ссылку/);
    expect(edit?.payload.text).toMatch(/Поделиться/);
  });

  it("the card has few buttons; filter details and toggles live in settings", async () => {
    const s = setup({ admin: false });
    await s.text(LINK);
    const id = s.repo.listWatches(42)[0]!.id;
    await s.press(`opn:${id}`);
    const main = s.buttons().map((b) => b.callback_data);
    expect(main).toHaveLength(5);
    expect(main).not.toContain(`del:${id}`);

    await s.press(`set:${id}`);
    const edit = s.lastEdit();
    expect(edit?.payload.text).toMatch(/Настройки #/);
    expect(s.buttons().map((b) => b.callback_data)).toEqual(expect.arrayContaining([`tgl:${id}:defect`, `del:${id}`, `opn:${id}`]));

    await s.press(`tgl:${id}:defect`); // stays in settings
    expect(s.lastEdit()?.payload.text).toMatch(/Настройки #/);
    expect(s.repo.getWatch(id)!.profile.allowDefect).toBe(false);
  });

  it("plain text asks for confirmation, then creates", async () => {
    const s = setup();
    await s.text("ps5 digital");
    expect(s.texts().at(-1)).toMatch(/Следить за «<b>ps5 digital<\/b>»/);
    await s.press("kw");
    expect(s.repo.listWatches(42)[0]!.query.keyword).toBe("ps5 digital");
  });

  it("buttons pause, change interval, delete; edits via commands", async () => {
    const s = setup({ admin: false });
    await s.text(LINK);
    const id = s.repo.listWatches(42)[0]!.id;

    await s.press(`tgl:${id}:active`);
    expect(s.repo.getWatch(id)!.active).toBe(false);

    await s.press(`ints:${id}:60`); // pro-only interval on free plan
    const alert = s.sent.find((x) => x.method === "answerCallbackQuery" && x.payload.show_alert);
    expect(alert?.payload.text).toMatch(/Pro/);

    await s.text(`/price ${id} 90 210`);
    expect(s.repo.getWatch(id)!.profile).toMatchObject({ priceMin: 90, priceMax: 210 });
    await s.text(`/exclude ${id} Hülle, Spiel`);
    expect(s.repo.getWatch(id)!.profile.exclude).toEqual(["huelle", "spiel"]);
    await s.text(`/price oops`);
    expect(s.texts().at(-1)).toMatch(/Не понял/);

    await s.press(`delok:${id}`);
    expect(s.repo.listWatches(42)).toHaveLength(0);
  });

  it("feedback is stored against the listing", async () => {
    const s = setup();
    await s.text(LINK);
    const id = s.repo.listWatches(42)[0]!.id;
    await s.press(`fb:0:${id}:1`);
    expect(s.repo.recentFeedback(id)).toEqual([{ title: "Xbox Series S", price: 170, good: false }]);
  });

  it("/scan answers immediately and sends a summary plus an HTML report", async () => {
    const s = setup();
    await s.text(LINK);
    const id = s.repo.listWatches(42)[0]!.id;
    await s.text(`/scan ${id}`); // returns before the scan finishes
    await s.idle();
    const all = s.texts().join("\n");
    expect(all).toMatch(/Анализ рынка/);
    expect(all).toMatch(/Медиана <b>230 €<\/b>/);
    const doc = s.sent.find((x) => x.method === "sendDocument");
    expect(doc).toBeDefined();
    expect(s.repo.getWatch(id)!.market?.median).toBe(230);
    expect(all).toMatch(/в файле ниже/); // no publisher configured: file only

    await s.text("/scan 999");
    expect(s.texts().at(-1)).toMatch(/Укажи номер/);

    // two watches and no number: offer them as buttons instead of asking for the number
    await s.text("https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=ps5");
    await s.text("/scan");
    expect(s.texts().at(-1)).toMatch(/Какой поиск/);
    expect(s.buttons().map((b) => b.callback_data)).toEqual(s.repo.listWatches(42).map((w) => `scan:${w.id}`));
  });

  it("a published report comes as a link button, with the file as a copy", async () => {
    const published: string[] = [];
    const s = setup({ reports: { publish: async (html) => (published.push(html), "https://reports.example/r/abc.html") } });
    await s.text(LINK);
    const id = s.repo.listWatches(42)[0]!.id;
    await s.text(`/scan ${id}`);
    await s.idle();
    expect(published[0]).toMatch(/<!doctype html>/);
    const summary = s.sent.find((x) => x.method === "sendMessage" && /Просмотрено/.test(x.payload.text));
    expect(summary?.payload.reply_markup.inline_keyboard[0][0]).toEqual({ text: "🌐 Открыть полный отчёт", url: "https://reports.example/r/abc.html" });
    expect(s.sent.find((x) => x.method === "sendDocument")).toBeDefined();
  });

  it("falls back to the file when publishing fails", async () => {
    const s = setup({ reports: { publish: async () => null } });
    await s.text(LINK);
    await s.text(`/scan ${s.repo.listWatches(42)[0]!.id}`);
    await s.idle();
    expect(s.texts().join("\n")).toMatch(/в файле ниже/);
  });

  it("an invite gives both sides a week of Pro, once, and never for yourself", async () => {
    const s = setup({ admin: false });
    await s.text("/start");
    await s.text("/invite");
    expect(s.texts().at(-1)).toContain("https://t.me/dealradar_bot?start=ref_42");
    expect(s.buttons()[0]!.url).toMatch(/^https:\/\/t\.me\/share\/url\?url=/);

    const friend = { id: 77, is_bot: false, first_name: "Olya", username: "olya", language_code: "uk" };
    await s.text("/start ref_42", friend);
    expect(s.repo.getUser(77)!.plan).toBe("pro");
    expect(s.repo.getUser(42)!.plan).toBe("pro");
    expect(s.texts().some((x) => /\+7 дней Pro/.test(x))).toBe(true); // inviter is told, in their language
    expect(s.texts().some((x) => /7 днів Pro в подарунок/.test(x))).toBe(true);

    // the same friend again, and the inviter with their own link: nothing more
    const before = s.repo.getUser(42)!.proUntil;
    await s.text("/start ref_42", friend);
    await s.text("/start ref_42");
    expect(s.repo.getUser(42)!.proUntil).toBe(before);
    expect(s.repo.countReferrals(42)).toBe(1);
  });

  it("/privacy explains the data, /delete_me erases it after confirmation", async () => {
    const s = setup({ admin: false });
    await s.text(LINK);
    await s.text("/privacy");
    expect(s.texts().at(-1)).toMatch(/Данные и приватность/);
    expect(s.texts().at(-1)).toMatch(/Anthropic/);
    await s.text("/delete_me");
    expect(s.repo.getUser(42)).not.toBeNull(); // nothing happens before the confirmation
    await s.press("delmeok");
    expect(s.repo.getUser(42)).toBeNull();
    expect(s.repo.listWatches(42)).toHaveLength(0);
    expect(s.lastEdit()?.payload.text).toMatch(/данные удалены/);
  });

  it("the admin (owner) gets Pro limits automatically", async () => {
    const s = setup();
    await s.text("/start");
    expect(s.repo.getUser(42)!.plan).toBe("pro");
  });

  it("admin commands", async () => {
    const s = setup();
    await s.text("/start");
    await s.text("/stats");
    expect(s.texts().at(-1)).toMatch(/Пользователи: 1/);
    await s.text("/grant 42 pro");
    expect(s.repo.getUser(42)!.plan).toBe("pro");
  });
});
