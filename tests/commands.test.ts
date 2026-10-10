import { describe, expect, it } from "vitest";
import { cb, parseId, parseIdAndList, parseIdAndRest, parsePriceArgs } from "../src/bot/commands.js";

describe("parsePriceArgs", () => {
  it.each([
    ["3 100 250", { id: 3, min: 100, max: 250 }],
    ["3 100-250", { id: 3, min: 100, max: 250 }],
    ["#3 - 250", { id: 3, min: null, max: 250 }],
    ["3 80", { id: 3, min: 80, max: null }],
    ["3 80,5 120€", { id: 3, min: 80.5, max: 120 }],
  ])("%s", (args, expected) => {
    expect(parsePriceArgs(args)).toEqual(expected);
  });

  it.each(["", "abc", "3", "3 abc", "0 10 20", "3 -5 10"])("rejects %j", (args) => {
    expect(parsePriceArgs(args)).toBeNull();
  });
});

describe("list / rest parsers", () => {
  it("splits words by comma, keeps phrases", () => {
    expect(parseIdAndList("4 hülle, case cover;spiel")).toEqual({ id: 4, words: ["hülle", "case cover", "spiel"] });
    expect(parseIdAndList("4")).toBeNull();
    expect(parseIdAndList("x hülle")).toBeNull();
  });

  it("keeps the rest verbatim", () => {
    expect(parseIdAndRest("2 series s | xbox s")).toEqual({ id: 2, rest: "series s | xbox s" });
    expect(parseIdAndRest("2")).toBeNull();
  });

  it("parseId", () => {
    expect(parseId("#12")).toBe(12);
    expect(parseId("1.5")).toBeNull();
    expect(parseId(undefined)).toBeNull();
  });
});

describe("cb", () => {
  it("joins parts and enforces Telegram's 64-byte limit", () => {
    expect(cb("fb", 0, 12, "1500000001")).toBe("fb:0:12:1500000001");
    expect(() => cb("x", "y".repeat(70))).toThrow(/too long/);
  });
});
