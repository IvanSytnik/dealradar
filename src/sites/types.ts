import type { Listing, SearchQuery } from "../types.js";

export type HttpGet = (url: string) => Promise<string>;

/** Adding a marketplace = implementing this interface and registering it in sites/index.ts. */
export interface SiteAdapter {
  id: string;
  name: string;
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
