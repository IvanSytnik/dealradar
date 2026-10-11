import type { Listing, SearchQuery } from "../types.js";

export type HttpGet = (url: string) => Promise<string>;

/** Adding a marketplace = implementing this interface and registering it in sites/index.ts. */
export interface SiteAdapter {
  id: string;
  name: string;
  /** Not verified against the live site yet: the bot says so when a watch is created. */
  beta?: boolean;
  /** Politeness floor for this site, above the plan's minimum (seconds) */
  minIntervalSec?: number;
  /** Interval of a new watch on this site when the plan allows faster (seconds) */
  defaultIntervalSec?: number;
  /** Does this adapter handle the URL? */
  matches(url: URL): boolean;
  /** Turn a pasted search URL into a canonical query (newest first). Throws if it is not a search page. */
  parseSearchUrl(url: URL): SearchQuery;
  /** Build a search URL from free text, e.g. "ps5 digital". */
  searchUrlFromText(text: string): string;
  /** Results per page in canonical search URLs. A full page of unseen listings triggers fetching the next one. */
  pageSize: number;
  /** URL of result page n (1-based) for a canonical search URL. */
  pageUrl(url: string, page: number): string;
  /** Parse a fetched search results page. Pure: no network. */
  parseListings(html: string): Listing[];
}
