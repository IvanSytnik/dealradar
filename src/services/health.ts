/**
 * Parser health. If Willhaben changes its frontend or starts blocking the server, every search
 * suddenly returns nothing or fails, and users simply stop getting alerts without knowing why.
 * This watches the outcome of every fetch and tells the owner once, then again when it recovers.
 *
 * One empty search is normal (a rare item); many different searches all empty or failing is not.
 */
export interface FetchOutcome {
  site: string;
  url: string;
  /** listings parsed, or null when the fetch or the parse threw */
  count: number | null;
  error?: string;
}

export const HEALTH_WINDOW = 20;
export const HEALTH_MIN_SAMPLES = 6;
export const HEALTH_MIN_URLS = 2;
export const HEALTH_BAD_RATIO = 0.9;
export const HEALTH_RECOVERED_RATIO = 0.5;
export const HEALTH_REALERT_MS = 6 * 3600_000;

interface SiteState {
  window: FetchOutcome[];
  alertedAt: number | null;
}

export class HealthMonitor {
  private sites = new Map<string, SiteState>();

  constructor(
    private alert: (text: string) => Promise<void>,
    private now: () => number = Date.now,
  ) {}

  async record(o: FetchOutcome): Promise<void> {
    const s = this.sites.get(o.site) ?? { window: [], alertedAt: null };
    this.sites.set(o.site, s);
    s.window.push(o);
    if (s.window.length > HEALTH_WINDOW) s.window.shift();

    const bad = s.window.filter((x) => !x.count);
    const ratio = bad.length / s.window.length;
    const badUrls = new Set(bad.map((x) => x.url)).size;

    const broken = s.window.length >= HEALTH_MIN_SAMPLES && badUrls >= HEALTH_MIN_URLS && ratio >= HEALTH_BAD_RATIO;
    if (broken && (s.alertedAt === null || this.now() - s.alertedAt >= HEALTH_REALERT_MS)) {
      s.alertedAt = this.now();
      const lastError = [...bad].reverse().find((x) => x.error)?.error;
      await this.alert(
        `🚨 <b>${o.site}: парсер, похоже, сломан</b>\n` +
          `${bad.length} из ${s.window.length} последних загрузок пустые или с ошибкой, разных поисков: ${badUrls}.\n` +
          (lastError ? `Последняя ошибка: <code>${escape(lastError.slice(0, 200))}</code>\n` : "") +
          `Проверь вёрстку (__NEXT_DATA__) или блокировку IP сервера.`,
      );
      return;
    }
    if (s.alertedAt !== null && o.count && ratio < HEALTH_RECOVERED_RATIO) {
      s.alertedAt = null;
      await this.alert(`✅ <b>${o.site}: снова работает</b>, объявления загружаются.`);
    }
  }
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
