import { de } from "./de.js";
import { en } from "./en.js";
import { ru, type Dict } from "./ru.js";
import { uk } from "./uk.js";

export type { Dict };

export const LANGS = ["de", "en", "uk", "ru"] as const;
export type Lang = (typeof LANGS)[number];

const DICTS: Record<Lang, Dict> = { de, en, uk, ru };

export const t = (lang: Lang): Dict => DICTS[lang];

export const isLang = (s: unknown): s is Lang => typeof s === "string" && (LANGS as readonly string[]).includes(s);

/** Native names for the language picker. */
export const LANG_LABELS: Record<Lang, string> = {
  de: "🇦🇹 Deutsch",
  en: "🇬🇧 English",
  uk: "🇺🇦 Українська",
  ru: "Русский",
};

/** What the model is told to write in. */
export const AI_LANGUAGE: Record<Lang, string> = {
  de: "German",
  en: "English",
  uk: "Ukrainian",
  ru: "Russian",
};

/**
 * Telegram's language_code is an IETF tag ("de", "de-AT", "uk", "en-GB") or missing.
 * Belarusian and Kazakh users usually read Russian; everyone else without a locale gets English.
 */
export function detectLang(code: string | undefined | null): Lang {
  const base = (code ?? "").toLowerCase().split("-")[0]!;
  if (isLang(base)) return base;
  if (base === "be" || base === "kk") return "ru";
  return "en";
}
