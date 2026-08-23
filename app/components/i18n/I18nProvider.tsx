import * as React from "react";

import {
  getLanguageLocale,
  getStoredLanguage,
  setStoredLanguage,
  translations,
  type Language,
} from "~/utils/i18n";

type TranslationVariables = Record<string, string | number>;

type I18nContextValue = {
  language: Language;
  locale: string;
  messages: (typeof translations)[Language];
  setLanguage: (language: Language) => void;
  t: (key: string, variables?: TranslationVariables) => string;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

function getNestedTranslation(
  messages: (typeof translations)[Language],
  key: string,
) {
  let current: unknown = messages;

  for (const segment of key.split(".")) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" ? current : null;
}

function interpolate(value: string, variables?: TranslationVariables) {
  if (!variables) return value;

  return value.replace(/{{\s*([^{}\s]+)\s*}}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name)
      ? String(variables[name])
      : match,
  );
}

export function I18nProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: React.ReactNode;
}) {
  const [language, setLanguageState] =
    React.useState<Language>(initialLanguage);

  React.useEffect(() => {
    const storedLanguage = getStoredLanguage();

    setLanguageState(storedLanguage);
    setStoredLanguage(storedLanguage);
  }, []);

  const setLanguage = React.useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    setStoredLanguage(nextLanguage);
  }, []);

  const messages = translations[language];

  const t = React.useCallback(
    (key: string, variables?: TranslationVariables) => {
      const value = getNestedTranslation(messages, key);
      return value === null ? key : interpolate(value, variables);
    },
    [messages],
  );

  const value = React.useMemo<I18nContextValue>(
    () => ({
      language,
      locale: getLanguageLocale(language),
      messages,
      setLanguage,
      t,
    }),
    [language, messages, setLanguage, t],
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = React.useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }

  return context;
}
