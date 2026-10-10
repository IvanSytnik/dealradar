type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = order[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 20;

function log(level: Level, msg: string, extra?: Record<string, unknown>) {
  if (order[level] < min || process.env.VITEST) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export const logger = {
  debug: (m: string, e?: Record<string, unknown>) => log("debug", m, e),
  info: (m: string, e?: Record<string, unknown>) => log("info", m, e),
  warn: (m: string, e?: Record<string, unknown>) => log("warn", m, e),
  error: (m: string, e?: Record<string, unknown>) => log("error", m, e),
};
