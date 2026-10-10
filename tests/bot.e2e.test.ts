import { describe, expect, it } from "vitest";
import type { Update } from "grammy/types";
import { createBot } from "../src/bot/bot.js";
import { loadConfig } from "../src/config.js";
import { WatchService } from "../src/services/watches.js";
import { ScanService } from "../src/services/scan.js";
import { BatchClassifier } from "../src/ai/batch.js";
import { fakeHttp, memRepo, willhabenHtml } from "./helpers.js";

const USER = { id: 42, is_bot: false, first_name: "Ivan", username: "ivan" };
const CHAT = { id: 42, type: "private" as const, first_name: "Ivan" };
const LINK = "https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=xbox+series+s&areaId=6";

function setup(opts: { admin?: boolean } = {}) {
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
  const bot = createBot({ config, repo, watches: new WatchService(repo, http.get, null), aiEnabled: false, scans });
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
  const text = (t: string) => {
    const entities = t.startsWith("/") ? [{ type: "bot_command" as const, offset: 0, length: t.split(" ")[0]!.length }] : undefined;
    return bot.handleUpdate({
      update_id: ++updateId,
      message: { message_id: updateId, date: 0, chat: CHAT, from: USER, text: t, entities },
    } as Update);
  };
  const press = (data: string) =>
    bot.handleUpdate({
      update_id: ++updateId,
      callback_query: {
        id: String(updateId),
        from: USER,
        chat_instance: "x",
        data,
        message: { message_id: 1, date: 0, chat: CHAT, text: "card" },
      },
    } as Update);

  const texts = () => sent.filter((s) => s.method === "sendMessage").map((s) => s.payload.text as string);
  const idle = () => (bot as unknown as { idleScans: () => Promise<void> }).idleScans();
  return { repo, sent, text, press, texts, idle };
}

describe("bot end-to-end", () => {
  it("start → link → watch card + preview", async () => {
    const s = setup();
    await s.text("/start");
    expect(s.texts()[0]).toMatch(/слежу за объявлениями/);

    await s.text(`вот ${LINK}`);
    const all = s.texts().join("\n");
    expect(all).toMatch(/Готово/);
    expect(all).toMatch(/под фильтр подходит <b>3<\/b>/);
    expect(s.repo.listWatches(42)).toHaveLength(1);
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

    await s.text("/scan 999");
    expect(s.texts().at(-1)).toMatch(/Укажи номер/);
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
