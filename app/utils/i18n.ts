import { en } from "~/locales/en";
import { it } from "~/locales/it";

export type Language = "en" | "it";

export const translations = {
  en,
  it,
};

export function getStoredLanguage(): Language {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem("marginlab-language");

  if (stored === "it" || stored === "en") {
    return stored;
  }

  return "en";
}

export function setStoredLanguage(language: Language) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("marginlab-language", language);
}