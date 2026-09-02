import * as React from "react";

import {
  getLanguageLocale,
  setStoredLanguage,
  type Language,
  type Messages,
} from "~/utils/i18n";

type TranslationVariables = Record<string, string | number>;

type I18nContextValue = {
  language: Language;
  locale: string;
  messages: Messages;
  t: (key: string, variables?: TranslationVariables) => string;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

function getNestedTranslation(
  messages: Messages,
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
  initialMessages,
  children,
}: {
  initialLanguage: Language;
  initialMessages: Messages;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    setStoredLanguage(initialLanguage);
  }, [initialLanguage]);

  const language = initialLanguage;
  const messages = initialMessages;

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
      t,
    }),
    [language, messages, t],
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
