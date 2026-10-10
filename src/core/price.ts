/** Parses prices as written in Austria and by models: "1.234,50", "99,0", "€ 150,-", "150", 150. */
export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s.replace(/[.,]$/, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
