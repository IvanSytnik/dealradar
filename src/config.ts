import "dotenv/config";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(10, "TELEGRAM_BOT_TOKEN is required"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().default("claude-haiku-5-5"),
  DB_PATH: z.string().default("data/dealradar.db"),
  ADMIN_IDS: z
    .string()
    .optional()
    .default("")
    .transform((s) => s.split(",").map((x) => Number(x.trim())).filter(Boolean)),
  // Global politeness towards marketplaces: min gap between two requests to one host
  HOST_MIN_GAP_MS: z.coerce.number().default(2000),
  TICK_SECONDS: z.coerce.number().default(15),
  // When true every new user starts on "pro" (handy for a private deployment)
  EVERYONE_PRO: bool,
  // Shown in /privacy as the contact for data questions (e-mail or @username). Optional.
  CONTACT: z.string().optional().default(""),
  // Optional: publish /scan reports to S3 + CloudFront so they open in a real browser (see infra/terraform)
  REPORTS_BUCKET: z.string().optional().default(""),
  REPORTS_BASE_URL: z.string().optional().default(""),
  REPORTS_REGION: z.string().optional().default(""),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  return parsed.data;
}
