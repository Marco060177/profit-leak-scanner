import { en } from "~/locales/en";
import { it } from "~/locales/it";

export type Language = "en" | "it";

export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_STORAGE_KEY = "marginlab-language";

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "it";
}

export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function getLanguageLocale(language: Language) {
  return language === "it" ? "it-IT" : "en-US";
}

export const translations = {
  en,
  it,
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
