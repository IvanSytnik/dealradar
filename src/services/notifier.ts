import type { AiVerdict, Listing, User, Watch } from "../types.js";

export interface ListingInfo {
  defect: boolean;
  verdict: AiVerdict | null;
  oldPrice: number | null;
}

/** Transport-agnostic: Telegram today, maybe e-mail/push later. Tests use a recording fake. */
export interface Notifier {
  sendListing(user: User, watch: Watch, listing: Listing, info: ListingInfo): Promise<void>;
  sendText(user: User, text: string): Promise<void>;
}

/** Thrown by a notifier when the user blocked the bot; the poller then deactivates the user. */
export class RecipientGoneError extends Error {}
