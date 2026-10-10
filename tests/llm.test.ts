import { describe, expect, it } from "vitest";
import { createAnthropicLlm, LlmEmptyReplyError, THINKING_HEADROOM } from "../src/ai/llm.js";

function fakeClient(response: unknown) {
  const bodies: any[] = [];
  return {
    bodies,
    client: {
      messages: {
        create: async (body: any) => {
          bodies.push(body);
          return response;
        },
      },
    },
  };
}

describe("createAnthropicLlm", () => {
  it("asks for low effort and leaves headroom for adaptive thinking", async () => {
    const f = fakeClient({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "…" }, { type: "text", text: '{"a":1}' }] });
    const llm = createAnthropicLlm("", "claude-haiku-5-5", f.client)!;
    expect(await llm("sys", "user", 600)).toBe('{"a":1}');
    expect(f.bodies[0]).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 600 + THINKING_HEADROOM,
      output_config: { effort: "low" },
      system: "sys",
    });
  });

  it("explains an empty reply instead of returning an empty string (the live bug)", async () => {
    const f = fakeClient({ stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "long…" }] });
    const llm = createAnthropicLlm("", "m", f.client)!;
    const err = await llm("s", "u", 10).catch((e) => e);
    expect(err).toBeInstanceOf(LlmEmptyReplyError);
    expect(err.message).toBe("model returned no text (stop_reason=max_tokens, blocks=thinking)");
  });

  it("is disabled without a key", () => {
    expect(createAnthropicLlm("", "m")).toBeNull();
  });
});
