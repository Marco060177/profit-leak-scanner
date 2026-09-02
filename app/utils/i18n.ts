export type Language = "en" | "it" | "fr" | "de" | "es" | "pt-BR";
export type Messages = typeof import("~/locales/en").en;

export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_STORAGE_KEY = "marginlab-language";

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "it" || value === "fr" || value === "de" || value === "es" || value === "pt-BR";
}

export const isSupportedLanguage = isLanguage;

export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function getLanguageLocale(language: Language) {
  if (language === "it") return "it-IT";
  if (language === "fr") return "fr-FR";
  if (language === "de") return "de-DE";
  if (language === "es") return "es-ES";
  if (language === "pt-BR") return "pt-BR";
  return "en-US";
}

export function getStoredLanguage(): Language {
  return getStoredLanguageOrNull() ?? DEFAULT_LANGUAGE;
}

export function getStoredLanguageOrNull(): Language | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguage(storedLanguage) ? storedLanguage : null;
}

export function setStoredLanguage(language: Language) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.cookie = `${LANGUAGE_STORAGE_KEY}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
