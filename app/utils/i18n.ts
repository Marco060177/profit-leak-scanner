import { en } from "~/locales/en";
import { it } from "~/locales/it";
import { fr } from "~/locales/fr";
import { de } from "~/locales/de";

export type Language = "en" | "it" | "fr" | "de";

export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_STORAGE_KEY = "marginlab-language";

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "it" || value === "fr" || value === "de";
}

export const isSupportedLanguage = isLanguage;

export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function getLanguageLocale(language: Language) {
  if (language === "it") return "it-IT";
  if (language === "fr") return "fr-FR";
  if (language === "de") return "de-DE";
  return "en-US";
}

export const translations = {
  en,
  it,
  fr,
  de,
};

export function getStoredLanguage(): Language {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  return normalizeLanguage(
    window.localStorage.getItem(LANGUAGE_STORAGE_KEY),
  );
}

export function setStoredLanguage(language: Language) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.cookie = `${LANGUAGE_STORAGE_KEY}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
