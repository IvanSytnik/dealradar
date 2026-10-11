import { BatchClassifier } from "./ai/batch.js";
import { Classifier } from "./ai/classifier.js";
import { ScanService } from "./services/scan.js";
import { createAnthropicLlm } from "./ai/llm.js";
import { createBot, createTelegramNotifier, registerCommands } from "./bot/bot.js";
import { loadConfig } from "./config.js";
import { openDb, Repo } from "./db/repo.js";
import { logger } from "./logger.js";
import { Poller } from "./services/poller.js";
import { WatchService } from "./services/watches.js";
import { createHttpGet } from "./sites/http.js";
import { createS3Publisher } from "./report/publish.js";

const config = loadConfig();
const db = openDb(config.DB_PATH);
const repo = new Repo(db);
const llm = createAnthropicLlm(config.ANTHROPIC_API_KEY, config.AI_MODEL);
const http = createHttpGet(config.HOST_MIN_GAP_MS);

const classifier = new Classifier(repo, llm);
const batch = new BatchClassifier(repo, llm);
const watches = new WatchService(repo, http, llm, Date.now, batch);
const scans = new ScanService(repo, http, batch);
const reports =
  config.REPORTS_BUCKET && config.REPORTS_BASE_URL
    ? createS3Publisher({
        bucket: config.REPORTS_BUCKET,
        baseUrl: config.REPORTS_BASE_URL,
        region: config.REPORTS_REGION || process.env.AWS_REGION || "eu-north-1",
      })
    : undefined;
const bot = createBot({ config, repo, watches, aiEnabled: llm !== null, scans, reports });
const poller = new Poller(repo, http, classifier, createTelegramNotifier(bot));

async function main() {
  // Cosmetic (command menu): never block startup on it
  void registerCommands(bot).catch((e) => logger.warn("setMyCommands failed", { err: (e as Error).message }));
  poller.start(config.TICK_SECONDS);
  logger.info("started", { ai: llm ? config.AI_MODEL : "off", db: config.DB_PATH, reports: reports ? "s3" : "file" });
  await bot.start({ drop_pending_updates: true, allowed_updates: ["message", "callback_query"] });
}

let stopping = false;
const shutdown = async (sig: string) => {
  stopping = true;
  logger.info("shutting down", { sig });
  poller.stop();
  await bot.stop();
  db.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((e) => {
  if (stopping) return;
  logger.error("fatal", { err: (e as Error).message });
  process.exit(1);
});
