import type { SiteAdapter } from "./types.js";
import { willhaben } from "./willhaben.js";

export const SITES: SiteAdapter[] = [willhaben];
export const DEFAULT_SITE = willhaben;

export function siteById(id: string): SiteAdapter {
  const s = SITES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown site ${id}`);
  return s;
}

/** Finds the first http(s) URL in a message. */
export function extractUrl(text: string): URL | null {
  const m = text.match(/https?:\/\/[^\s<>"]+/i);
  if (!m) return null;
  try {
    return new URL(m[0]);
  } catch {
    return null;
  }
}

export function adapterForUrl(url: URL): SiteAdapter | null {
  return SITES.find((s) => s.matches(url)) ?? null;
}
