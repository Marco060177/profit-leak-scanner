import { de } from "~/locales/de";
import { en } from "~/locales/en";
import { es } from "~/locales/es";
import { fr } from "~/locales/fr";
import { it } from "~/locales/it";
import { ptBR } from "~/locales/pt-BR";
import { normalizeLanguage, type Language, type Messages } from "~/utils/i18n";

const catalogs: Record<Language, Messages> = {
  en,
  it,
  fr,
  de,
  es,
  "pt-BR": ptBR,
};

export async function loadLocaleMessages(language: unknown): Promise<Messages> {
  return catalogs[normalizeLanguage(language)];
}
