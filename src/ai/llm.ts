import Anthropic from "@anthropic-ai/sdk";

/** The only thing the app needs from a model. Tests pass a fake. */
export type Llm = (system: string, user: string, maxTokens: number) => Promise<string>;

/**
 * Newer models (e.g. Haiku 5.5) think adaptively, and thinking tokens count toward max_tokens.
 * A tight max_tokens can be spent entirely on thinking, leaving no text. So:
 * - low effort: these are short structured tasks, deep thinking buys nothing
 * - generous headroom on top of the caller's expected answer size
 */
export const THINKING_HEADROOM = 3000;

type MessagesClient = { messages: { create: (body: any) => Promise<any> } };

export class LlmEmptyReplyError extends Error {
  constructor(public stopReason: string | null, public blockTypes: string[]) {
    super(`model returned no text (stop_reason=${stopReason}, blocks=${blockTypes.join(",") || "none"})`);
  }
}

export function createAnthropicLlm(apiKey: string, model: string, client?: MessagesClient): Llm | null {
  if (!apiKey && !client) return null;
  const c: MessagesClient = client ?? new Anthropic({ apiKey });
  return async (system, user, maxTokens) => {
    const res = await c.messages.create({
      model,
      max_tokens: maxTokens + THINKING_HEADROOM,
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: user }],
    });
    const blocks: { type: string; text?: string }[] = res.content ?? [];
    const text = blocks.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("");
    if (!text.trim()) throw new LlmEmptyReplyError(res.stop_reason ?? null, blocks.map((b) => b.type));
    return text;
  };
}

/** Pulls the first JSON object out of a model reply (tolerates ```json fences and chatter). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON in model reply");
  return JSON.parse(text.slice(start, end + 1));
}
