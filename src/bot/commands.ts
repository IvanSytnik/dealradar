// Pure argument parsers for text commands. No Telegram here, so they are trivially testable.

const toNum = (s: string | undefined): number | null | undefined => {
  if (s === undefined) return undefined;
  if (s === "-" || s === "0" || s.toLowerCase() === "any") return null;
  const n = Number(s.replace(",", ".").replace(/[€\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function parseId(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/^#/, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** "/price 3 100 250", "/price 3 - 250", "/price 3 100-250" */
export function parsePriceArgs(args: string): { id: number; min: number | null; max: number | null } | null {
  const parts = args.trim().replace(/(\s\d+(?:[.,]\d+)?)-(\d)/, "$1 $2").split(/\s+/);
  const id = parseId(parts[0]);
  const min = toNum(parts[1]);
  const max = toNum(parts[2] ?? "-");
  if (id === null || min === undefined || max === undefined) return null;
  return { id, min, max };
}

/** "/exclude 3 hülle, case cover" -> { id: 3, words: ["hülle", "case cover"] } */
export function parseIdAndList(args: string): { id: number; words: string[] } | null {
  const m = args.trim().match(/^#?(\d+)\s+(.+)$/s);
  if (!m) return null;
  const words = m[2]!
    .split(/[,;\n]/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (!words.length) return null;
  return { id: Number(m[1]), words };
}

/** "/rename 3 My Xbox" -> { id: 3, rest: "My Xbox" } */
export function parseIdAndRest(args: string): { id: number; rest: string } | null {
  const m = args.trim().match(/^#?(\d+)\s+(.+)$/s);
  return m ? { id: Number(m[1]), rest: m[2]!.trim() } : null;
}

/** Callback data must fit in 64 bytes. Format: "<action>:<a>:<b>" */
export function cb(action: string, ...parts: (string | number)[]): string {
  const s = [action, ...parts].join(":");
  if (Buffer.byteLength(s) > 64) throw new Error(`callback data too long: ${s}`);
  return s;
}
