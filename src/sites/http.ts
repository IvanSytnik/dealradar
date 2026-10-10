import type { HttpGet } from "./types.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export class HttpError extends Error {
  constructor(
    public status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${new URL(url).hostname}`);
  }
}

/**
 * Polite fetcher: at most one request per host at a time and a minimum gap between them.
 * Every watch on the same host goes through this queue, so 100 users do not mean 100 parallel hits.
 */
export function createHttpGet(minGapMs: number, fetchImpl: typeof fetch = fetch): HttpGet {
  const lastByHost = new Map<string, Promise<number>>();

  return async (url) => {
    const host = new URL(url).hostname;
    const prev = lastByHost.get(host) ?? Promise.resolve(0);
    let release!: (t: number) => void;
    const mine = new Promise<number>((r) => (release = r));
    lastByHost.set(host, mine);

    const lastAt = await prev.catch(() => 0);
    const wait = lastAt + minGapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    try {
      const res = await fetchImpl(url, {
        headers: {
          "user-agent": UA,
          "accept-language": "de-AT,de;q=0.9,en;q=0.8",
          accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new HttpError(res.status, url);
      return await res.text();
    } finally {
      release(Date.now());
    }
  };
}
