import type { Language } from "~/utils/i18n";

export const AI_LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  it: "Italian",
  fr: "French",
  de: "German",
  es: "Spanish",
  "pt-BR": "Brazilian Portuguese",
};

export const AI_REPORT_SECTIONS: Record<Language, {
  storeHealth: string;
  mainRisks: string;
  whatToCheckFirst: string;
  profitOpportunity: string;
}> = {
  en: { storeHealth: "STORE HEALTH", mainRisks: "MAIN RISKS", whatToCheckFirst: "WHAT TO CHECK FIRST", profitOpportunity: "PROFIT GAP & UPSIDE" },
  it: { storeHealth: "STATO DELLO STORE", mainRisks: "RISCHI PRINCIPALI", whatToCheckFirst: "COSA CONTROLLARE PRIMA", profitOpportunity: "GAP DI PROFITTO E POTENZIALE" },
  fr: { storeHealth: "SANTÉ DE LA BOUTIQUE", mainRisks: "PRINCIPAUX RISQUES", whatToCheckFirst: "À VÉRIFIER EN PRIORITÉ", profitOpportunity: "ÉCART DE BÉNÉFICE ET POTENTIEL" },
  de: { storeHealth: "SHOP-GESUNDHEIT", mainRisks: "HAUPTRISIKEN", whatToCheckFirst: "ZUERST PRÜFEN", profitOpportunity: "GEWINNLÜCKE UND POTENZIAL" },
  es: { storeHealth: "SALUD DE LA TIENDA", mainRisks: "PRINCIPALES RIESGOS", whatToCheckFirst: "QUÉ REVISAR PRIMERO", profitOpportunity: "BRECHA DE BENEFICIO Y POTENCIAL" },
  "pt-BR": { storeHealth: "SAÚDE DA LOJA", mainRisks: "PRINCIPAIS RISCOS", whatToCheckFirst: "O QUE VERIFICAR PRIMEIRO", profitOpportunity: "DIFERENÇA DE LUCRO E POTENCIAL" },
};

export function getAiLanguageName(language: Language) {
  return AI_LANGUAGE_NAMES[language];
}

export function getAiReportSections(language: Language) {
  return AI_REPORT_SECTIONS[language];
}
