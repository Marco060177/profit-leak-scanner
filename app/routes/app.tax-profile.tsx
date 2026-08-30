import * as React from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";

import { authenticate } from "~/shopify.server";
import { useI18n } from "~/components/i18n/I18nProvider";
import DashboardNav from "~/components/dashboard/DashboardNav";
import type { Language } from "~/utils/i18n";
import MetricTooltip from "~/components/ui/MetricTooltip";
import { TaxJurisdictionMap } from "~/components/tax-profile/TaxJurisdictionMap";
import {
  getStoreTaxContext,
  saveStoreTaxProfile,
} from "~/utils/tax-profile.server";

import "~/styles/dashboard.css";
import "~/styles/tax-profile-map.css";

type SupportedRegime =
  | "ITALY_STANDARD"
  | "ITALY_FORFETTARIO"
  | "ITALY_EXEMPT"
  | "UK_VAT_STANDARD"
  | "UK_VAT_EXEMPT"
  | "UK_VAT_UNREGISTERED"
  | "CANADA_GST_HST_REGISTERED"
  | "CANADA_GST_HST_EXEMPT"
  | "CANADA_GST_HST_UNREGISTERED"
  | "AUSTRALIA_GST_REGISTERED"
  | "AUSTRALIA_GST_FREE"
  | "AUSTRALIA_GST_UNREGISTERED"
  | "GERMANY_VAT_STANDARD"
  | "GERMANY_VAT_EXEMPT"
  | "GERMANY_VAT_UNREGISTERED"
  | "FRANCE_VAT_STANDARD"
  | "FRANCE_VAT_EXEMPT"
  | "FRANCE_VAT_UNREGISTERED"
  | "SPAIN_VAT_STANDARD"
  | "SPAIN_VAT_EXEMPT"
  | "SPAIN_VAT_UNREGISTERED"
  | "NETHERLANDS_VAT_STANDARD"
  | "NETHERLANDS_VAT_EXEMPT"
  | "NETHERLANDS_VAT_UNREGISTERED"
  | "IRELAND_VAT_STANDARD"
  | "IRELAND_VAT_EXEMPT"
  | "IRELAND_VAT_UNREGISTERED"
  | "NEW_ZEALAND_GST_REGISTERED"
  | "NEW_ZEALAND_GST_EXEMPT"
  | "NEW_ZEALAND_GST_UNREGISTERED";

type RegimeOption = {
  id: SupportedRegime;
  title: string;
  subtitle: string;
  detail: string;
};

type CountryUiConfig = {
  countryCode: string;
  nameIt: string;
  nameEn: string;
  taxLabel: string;
  standardRegime: SupportedRegime;
  profilePrefix: string;
  defaultRate: number;
  rateOptions: number[];
  regimes: {
    standard: SupportedRegime;
    exempt: SupportedRegime;
    unregistered: SupportedRegime;
  };
  noticeIt?: string;
  noticeEn?: string;
};

const COUNTRY_UI_CONFIGS: Record<string, CountryUiConfig> = {
  IT: {
    countryCode: "IT",
    nameIt: "Italia",
    nameEn: "Italy",
    taxLabel: "VAT",
    standardRegime: "ITALY_STANDARD",
    profilePrefix: "ITALY_",
    defaultRate: 22,
    rateOptions: [4, 5, 10, 22],
    regimes: {
      standard: "ITALY_STANDARD",
      exempt: "ITALY_EXEMPT",
      unregistered: "ITALY_FORFETTARIO",
    },
  },
  GB: {
    countryCode: "GB",
    nameIt: "Regno Unito",
    nameEn: "United Kingdom",
    taxLabel: "VAT",
    standardRegime: "UK_VAT_STANDARD",
    profilePrefix: "UK_",
    defaultRate: 20,
    rateOptions: [0, 5, 20],
    regimes: {
      standard: "UK_VAT_STANDARD",
      exempt: "UK_VAT_EXEMPT",
      unregistered: "UK_VAT_UNREGISTERED",
    },
  },
  CA: {
    countryCode: "CA",
    nameIt: "Canada",
    nameEn: "Canada",
    taxLabel: "GST/HST",
    standardRegime: "CANADA_GST_HST_REGISTERED",
    profilePrefix: "CANADA_",
    defaultRate: 5,
    rateOptions: [0, 5, 13, 14, 15],
    regimes: {
      standard: "CANADA_GST_HST_REGISTERED",
      exempt: "CANADA_GST_HST_EXEMPT",
      unregistered: "CANADA_GST_HST_UNREGISTERED",
    },
    noticeIt:
      "In Canada l'aliquota effettiva può variare in base al luogo della fornitura e alla provincia. Il 5% è usato solo come baseline di fallback: quando Shopify fornisce tax line reali, MarginLab usa quelle come fonte prioritaria.",
    noticeEn:
      "In Canada, the actual rate can vary by place of supply and province. The 5% rate is only a fallback baseline: when Shopify provides actual tax lines, MarginLab treats them as authoritative.",
  },
  AU: {
    countryCode: "AU",
    nameIt: "Australia",
    nameEn: "Australia",
    taxLabel: "GST",
    standardRegime: "AUSTRALIA_GST_REGISTERED",
    profilePrefix: "AUSTRALIA_",
    defaultRate: 10,
    rateOptions: [0, 10],
    regimes: {
      standard: "AUSTRALIA_GST_REGISTERED",
      exempt: "AUSTRALIA_GST_FREE",
      unregistered: "AUSTRALIA_GST_UNREGISTERED",
    },
    noticeIt:
      "In Australia la GST standard è generalmente del 10% sulle vendite imponibili. MarginLab usa comunque le tax line Shopify reali come fonte prioritaria e applica il 10% solo come fallback del profilo avanzato.",
    noticeEn:
      "In Australia, the standard GST rate is generally 10% on taxable sales. MarginLab still treats actual Shopify tax lines as authoritative and uses 10% only as the advanced-profile fallback.",
  },
  DE: {
    countryCode: "DE",
    nameIt: "Germania",
    nameEn: "Germany",
    taxLabel: "VAT",
    standardRegime: "GERMANY_VAT_STANDARD",
    profilePrefix: "GERMANY_",
    defaultRate: 19,
    rateOptions: [0, 7, 19],
    regimes: {
      standard: "GERMANY_VAT_STANDARD",
      exempt: "GERMANY_VAT_EXEMPT",
      unregistered: "GERMANY_VAT_UNREGISTERED",
    },
  },
  FR: {
    countryCode: "FR",
    nameIt: "Francia",
    nameEn: "France",
    taxLabel: "VAT",
    standardRegime: "FRANCE_VAT_STANDARD",
    profilePrefix: "FRANCE_",
    defaultRate: 20,
    rateOptions: [0, 5.5, 10, 20],
    regimes: {
      standard: "FRANCE_VAT_STANDARD",
      exempt: "FRANCE_VAT_EXEMPT",
      unregistered: "FRANCE_VAT_UNREGISTERED",
    },
  },
  ES: {
    countryCode: "ES",
    nameIt: "Spagna",
    nameEn: "Spain",
    taxLabel: "VAT",
    standardRegime: "SPAIN_VAT_STANDARD",
    profilePrefix: "SPAIN_",
    defaultRate: 21,
    rateOptions: [0, 4, 10, 21],
    regimes: {
      standard: "SPAIN_VAT_STANDARD",
      exempt: "SPAIN_VAT_EXEMPT",
      unregistered: "SPAIN_VAT_UNREGISTERED",
    },
  },
  NL: {
    countryCode: "NL",
    nameIt: "Paesi Bassi",
    nameEn: "Netherlands",
    taxLabel: "VAT",
    standardRegime: "NETHERLANDS_VAT_STANDARD",
    profilePrefix: "NETHERLANDS_",
    defaultRate: 21,
    rateOptions: [0, 9, 21],
    regimes: {
      standard: "NETHERLANDS_VAT_STANDARD",
      exempt: "NETHERLANDS_VAT_EXEMPT",
      unregistered: "NETHERLANDS_VAT_UNREGISTERED",
    },
  },
  IE: {
    countryCode: "IE",
    nameIt: "Irlanda",
    nameEn: "Ireland",
    taxLabel: "VAT",
    standardRegime: "IRELAND_VAT_STANDARD",
    profilePrefix: "IRELAND_",
    defaultRate: 23,
    rateOptions: [0, 9, 13.5, 23],
    regimes: {
      standard: "IRELAND_VAT_STANDARD",
      exempt: "IRELAND_VAT_EXEMPT",
      unregistered: "IRELAND_VAT_UNREGISTERED",
    },
  },
  NZ: {
    countryCode: "NZ",
    nameIt: "Nuova Zelanda",
    nameEn: "New Zealand",
    taxLabel: "GST",
    standardRegime: "NEW_ZEALAND_GST_REGISTERED",
    profilePrefix: "NEW_ZEALAND_",
    defaultRate: 15,
    rateOptions: [0, 15],
    regimes: {
      standard: "NEW_ZEALAND_GST_REGISTERED",
      exempt: "NEW_ZEALAND_GST_EXEMPT",
      unregistered: "NEW_ZEALAND_GST_UNREGISTERED",
    },
  },
};

const ALL_SUPPORTED_REGIMES = new Set<SupportedRegime>(
  Object.values(COUNTRY_UI_CONFIGS).flatMap((config) => [
    config.regimes.standard,
    config.regimes.exempt,
    config.regimes.unregistered,
  ]),
);

const SHOP_QUERY = `#graphql
  query MarginLabTaxProfileShop {
    shop {
      billingAddress {
        countryCodeV2
      }
    }
  }
`;

function parseBoolean(value: FormDataEntryValue | null) {
  return String(value ?? "false") === "true";
}

function parseRate(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
}

function isSupportedRegime(value: string): value is SupportedRegime {
  return ALL_SUPPORTED_REGIMES.has(value as SupportedRegime);
}

function getCountryUiConfig(countryCode: string) {
  return COUNTRY_UI_CONFIGS[countryCode];
}

function isStandardRecoverableRegime(regime: SupportedRegime) {
  return Object.values(COUNTRY_UI_CONFIGS).some(
    (config) => config.regimes.standard === regime,
  );
}

function getDefaultStandardRegime(countryCode: string): SupportedRegime {
  return getCountryUiConfig(countryCode)?.standardRegime ?? "ITALY_STANDARD";
}

function getDefaultRateForCountry(countryCode: string) {
  return getCountryUiConfig(countryCode)?.defaultRate ?? 0;
}

function getRateOptionsForCountry(countryCode: string) {
  return getCountryUiConfig(countryCode)?.rateOptions ?? [0];
}

function getCountryName(countryCode: string, language: Language) {
  const config = getCountryUiConfig(countryCode);

  if (config) {
    if (language === "fr") {
      return (
        new Intl.DisplayNames(["fr-FR"], { type: "region" }).of(countryCode) ??
        config.nameEn
      );
    }
    if (language === "de") {
      return (
        new Intl.DisplayNames(["de-DE"], { type: "region" }).of(countryCode) ??
        config.nameEn
      );
    }
    if (language === "es") {
      return (
        new Intl.DisplayNames(["es-ES"], { type: "region" }).of(countryCode) ??
        config.nameEn
      );
    }
    if (language === "pt-BR") {
      return (
        new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(countryCode) ??
        config.nameEn
      );
    }
    return language === "it" ? config.nameIt : config.nameEn;
  }

  if (countryCode === "US") {
    if (language === "fr") return "États-Unis";
    if (language === "de") return "Vereinigte Staaten";
    if (language === "es") return "Estados Unidos";
    if (language === "pt-BR") return "Estados Unidos";
    return language === "it" ? "Stati Uniti" : "United States";
  }

  return (
    countryCode ||
    (language === "it"
      ? "Sconosciuto"
      : language === "fr"
        ? "Inconnu"
        : language === "de"
          ? "Unbekannt"
          : language === "es"
            ? "Desconocido"
            : language === "pt-BR"
              ? "Desconhecido"
              : "Unknown")
  );
}

function getRegimeOptions({
  countryCode,
  language,
}: {
  countryCode: string;
  language: Language;
}): RegimeOption[] {
  const config = getCountryUiConfig(countryCode);

  if (!config) {
    return [];
  }

  if (countryCode === "IT") {
    return [
      {
        id: "ITALY_STANDARD",
        title:
          language === "it"
            ? "Regime ordinario"
            : language === "fr"
              ? "Régime de TVA standard"
              : language === "de"
                ? "Standard-Mehrwertsteuerregelung"
                : language === "es"
                  ? "Régimen de IVA estándar"
                  : language === "pt-BR"
                    ? "Regime padrão de IVA"
                    : "Standard VAT regime",
        subtitle:
          language === "it"
            ? "IVA applicata alle vendite"
            : language === "fr"
              ? "TVA appliquée aux ventes"
              : language === "de"
                ? "Mehrwertsteuer auf Verkäufe"
                : language === "es"
                  ? "IVA aplicado a las ventas"
                  : language === "pt-BR"
                    ? "IVA aplicado às vendas"
                    : "VAT applied to sales",
        detail:
          language === "it"
            ? "Configura aliquote, prezzi, costi e recuperabilità dell'IVA."
            : language === "fr"
              ? "Configurez les taux, les prix de vente, la base de coûts et la récupération de la TVA déductible."
              : language === "de"
                ? "Konfigurieren Sie Steuersätze, Verkaufspreise, Kostenbasis und Vorsteuerabzug."
                : language === "es"
                  ? "Configura tipos, precios de venta, base de costes y recuperación del IVA soportado."
                  : language === "pt-BR"
                    ? "Configure alíquotas, preços de venda, base de custos e recuperação do IVA sobre compras."
                    : "Configure rates, selling prices, cost basis and input VAT recovery.",
      },
      {
        id: "ITALY_FORFETTARIO",
        title:
          language === "it"
            ? "Regime forfettario"
            : language === "fr"
              ? "Régime fiscal forfaitaire"
              : language === "de"
                ? "Pauschalbesteuerung"
                : language === "es"
                  ? "Régimen fiscal de tipo fijo"
                  : language === "pt-BR"
                    ? "Regime tributário de alíquota fixa"
                    : "Flat-rate tax regime",
        subtitle:
          language === "it"
            ? "Vendite senza addebito IVA"
            : language === "fr"
              ? "Ventes sans TVA facturée"
              : language === "de"
                ? "Verkäufe ohne berechnete Mehrwertsteuer"
                : language === "es"
                  ? "Ventas sin IVA repercutido"
                  : language === "pt-BR"
                    ? "Vendas sem cobrança de IVA"
                    : "Sales without VAT charged",
        detail:
          language === "it"
            ? "Preset senza IVA sulle vendite e senza recupero IVA sui costi."
            : language === "fr"
              ? "Préréglage sans TVA collectée et sans récupération de la TVA déductible."
              : language === "de"
                ? "Voreinstellung ohne Umsatzsteuer und ohne Vorsteuerabzug."
                : language === "es"
                  ? "Configuración sin IVA repercutido y sin recuperación del IVA soportado."
                  : language === "pt-BR"
                    ? "Configuração sem IVA sobre vendas e sem recuperação do IVA sobre compras."
                    : "Preset with no output VAT and no input VAT recovery.",
      },
      {
        id: "ITALY_EXEMPT",
        title:
          language === "it"
            ? "Operazioni esenti"
            : language === "fr"
              ? "Activité exonérée de TVA"
              : language === "de"
                ? "Mehrwertsteuerbefreite Tätigkeit"
                : language === "es"
                  ? "Actividad exenta de IVA"
                  : language === "pt-BR"
                    ? "Atividade isenta de IVA"
                    : "VAT-exempt activity",
        subtitle:
          language === "it"
            ? "Vendite configurate come esenti"
            : language === "fr"
              ? "Ventes configurées comme exonérées de TVA"
              : language === "de"
                ? "Als mehrwertsteuerfrei konfigurierte Verkäufe"
                : language === "es"
                  ? "Ventas configuradas como exentas de IVA"
                  : language === "pt-BR"
                    ? "Vendas configuradas como isentas de IVA"
                    : "Sales configured as VAT exempt",
        detail:
          language === "it"
            ? "Per attività in cui le vendite analizzate non espongono IVA."
            : language === "fr"
              ? "Pour les activités dont les ventes analysées ne comportent pas de TVA collectée."
              : language === "de"
                ? "Für Tätigkeiten, deren analysierte Verkäufe keine Umsatzsteuer enthalten."
                : language === "es"
                  ? "Para actividades cuyas ventas analizadas no incluyen IVA repercutido."
                  : language === "pt-BR"
                    ? "Para atividades cujas vendas analisadas não incluem IVA sobre vendas."
                    : "For activities where analyzed sales do not carry output VAT.",
      },
    ];
  }

  const isGst = config.taxLabel === "GST" || config.taxLabel === "GST/HST";

  return [
    {
      id: config.regimes.standard,
      title:
        language === "it"
          ? `Registrato ${config.taxLabel}`
          : language === "fr"
            ? `Enregistré à la ${config.taxLabel}`
            : language === "de"
              ? `${config.taxLabel}-registriert`
              : language === "es"
                ? `Registrado para ${config.taxLabel}`
                : language === "pt-BR"
                  ? `Registrado para ${config.taxLabel}`
                  : `${config.taxLabel} registered`,
      subtitle:
        language === "it"
          ? `Store registrato ${config.taxLabel}`
          : language === "fr"
            ? `Boutique enregistrée à la ${config.taxLabel}`
            : language === "de"
              ? `${config.taxLabel}-registrierter Shop`
              : language === "es"
                ? `Tienda registrada para ${config.taxLabel}`
                : language === "pt-BR"
                  ? `Loja registrada para ${config.taxLabel}`
                  : `${config.taxLabel}-registered store`,
      detail:
        language === "it"
          ? `Configura aliquote, prezzi, costi, spedizioni e recuperabilità dell'imposta sugli acquisti. Le tax line Shopify reali restano prioritarie.`
          : language === "fr"
            ? `Configurez les taux, les prix, les coûts, l'expédition et la récupération de la taxe sur les achats. Les lignes fiscales Shopify réelles restent prioritaires.`
            : language === "de"
              ? `Konfigurieren Sie Steuersätze, Preise, Kosten, Versand und Vorsteuerabzug. Tatsächliche Shopify-Steuerpositionen haben weiterhin Vorrang.`
              : language === "es"
                ? `Configura tipos, precios, costes, envíos y recuperación del impuesto soportado. Las líneas fiscales reales de Shopify siguen teniendo prioridad.`
                : language === "pt-BR"
                  ? `Configure alíquotas, preços, custos, frete e recuperação de impostos sobre compras. As linhas fiscais reais da Shopify continuam sendo prioritárias.`
                  : `Configure rates, prices, costs, shipping and input-tax recovery. Actual Shopify tax lines remain authoritative.`,
    },
    {
      id: config.regimes.exempt,
      title:
        language === "it"
          ? isGst
            ? `Vendite ${config.taxLabel}-free / esenti`
            : `Attività esente ${config.taxLabel}`
          : language === "fr"
            ? isGst
              ? `Ventes sans ${config.taxLabel} / exonérées`
              : `Activité exonérée de ${config.taxLabel}`
            : language === "de"
              ? isGst
                ? `${config.taxLabel}-freie / steuerbefreite Verkäufe`
                : `${config.taxLabel}-befreite Tätigkeit`
              : language === "es"
                ? isGst
                  ? `Ventas sin ${config.taxLabel} / exentas`
                  : `Actividad exenta de ${config.taxLabel}`
                : language === "pt-BR"
                  ? isGst
                    ? `Vendas sem ${config.taxLabel} / isentas`
                    : `Atividade isenta de ${config.taxLabel}`
                  : isGst
                    ? `${config.taxLabel}-free / exempt sales`
                    : `${config.taxLabel}-exempt activity`,
      subtitle:
        language === "it"
          ? "Vendite trattate come esenti"
          : language === "fr"
            ? "Ventes traitées comme exonérées de taxe"
            : language === "de"
              ? "Als steuerfrei behandelte Verkäufe"
              : language === "es"
                ? "Ventas tratadas como exentas de impuestos"
                : language === "pt-BR"
                  ? "Vendas tratadas como isentas de impostos"
                  : "Sales treated as tax exempt",
      detail:
        language === "it"
          ? `Preset senza output ${config.taxLabel} nel fallback MarginLab e senza recupero automatico dell'imposta sugli acquisti.`
          : language === "fr"
            ? `Préréglage sans ${config.taxLabel} collectée dans le fallback MarginLab et sans récupération automatique de la taxe sur les achats.`
            : language === "de"
              ? `Voreinstellung ohne erhobene ${config.taxLabel} im MarginLab-Fallback und ohne automatischen Vorsteuerabzug.`
              : language === "es"
                ? `Configuración sin ${config.taxLabel} repercutido en el fallback de MarginLab y sin recuperación automática del impuesto soportado.`
                : language === "pt-BR"
                  ? `Configuração sem ${config.taxLabel} sobre vendas no fallback da MarginLab e sem recuperação automática do imposto sobre compras.`
                  : `Preset with no output ${config.taxLabel} in the MarginLab fallback and no automatic input-tax recovery.`,
    },
    {
      id: config.regimes.unregistered,
      title:
        language === "it"
          ? `Non registrato ${config.taxLabel}`
          : language === "fr"
            ? `Non enregistré à la ${config.taxLabel}`
            : language === "de"
              ? `Nicht für ${config.taxLabel} registriert`
              : language === "es"
                ? `No registrado para ${config.taxLabel}`
                : language === "pt-BR"
                  ? `Não registrado para ${config.taxLabel}`
                  : `Not ${config.taxLabel} registered`,
      subtitle:
        language === "it"
          ? `Nessun addebito ${config.taxLabel}`
          : language === "fr"
            ? `Aucune ${config.taxLabel} facturée`
            : language === "de"
              ? `Keine ${config.taxLabel} berechnet`
              : language === "es"
                ? `Sin ${config.taxLabel} repercutido`
                : language === "pt-BR"
                  ? `Sem cobrança de ${config.taxLabel}`
                  : `No ${config.taxLabel} charged`,
      detail:
        language === "it"
          ? `Per merchant che non addebitano ${config.taxLabel} sulle vendite analizzate.`
          : language === "fr"
            ? `Pour les marchands qui ne facturent pas de ${config.taxLabel} sur les ventes analysées.`
            : language === "de"
              ? `Für Händler, die auf die analysierten Verkäufe keine ${config.taxLabel} berechnen.`
              : language === "es"
                ? `Para comerciantes que no cobran ${config.taxLabel} en las ventas analizadas.`
                : language === "pt-BR"
                  ? `Para lojistas que não cobram ${config.taxLabel} nas vendas analisadas.`
                  : `For merchants that do not charge ${config.taxLabel} on analyzed sales.`,
    },
  ];
}

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(SHOP_QUERY);
  const json = (await response.json()) as any;

  if (json?.errors?.length) {
    throw new Error(
      `Unable to load Shopify tax profile data: ${json.errors
        .map((error: any) => error?.message ?? "Unknown GraphQL error")
        .join("; ")}`,
    );
  }

  const shopCountryCode = json?.data?.shop?.billingAddress?.countryCodeV2 ?? "";

  const taxContext = await getStoreTaxContext({
    shop: session.shop,
    shopCountryCode,
  });

  return {
    taxContext,
    shopHandle: session.shop.replace(".myshopify.com", ""),
  };
}

export async function action({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(SHOP_QUERY);
  const json = (await response.json()) as any;

  if (json?.errors?.length) {
    return Response.json(
      {
        ok: false,
        error: "Unable to verify the Shopify tax jurisdiction.",
      },
      { status: 400 },
    );
  }

  const shopCountryCode = json?.data?.shop?.billingAddress?.countryCodeV2 ?? "";

  const context = await getStoreTaxContext({
    shop: session.shop,
    shopCountryCode,
  });

  if (!context.advancedProfileAvailable) {
    return Response.json(
      {
        ok: false,
        error:
          "Advanced Tax Profile configuration is not available for this jurisdiction yet.",
      },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const regime = String(formData.get("regime") ?? "");

  if (!isSupportedRegime(regime)) {
    return Response.json(
      { ok: false, error: "Select a valid tax regime." },
      { status: 400 },
    );
  }

  const countryConfig = getCountryUiConfig(context.effectiveCountryCode);

  const regimeMatchesCountry = Boolean(
    countryConfig &&
    countryConfig.profilePrefix &&
    regime.startsWith(countryConfig.profilePrefix),
  );

  if (!regimeMatchesCountry) {
    return Response.json(
      {
        ok: false,
        error: "The selected tax regime does not match the store jurisdiction.",
      },
      { status: 400 },
    );
  }

  const countryDefaultRate = getDefaultRateForCountry(
    context.effectiveCountryCode,
  );

  let defaultVatRatePct = parseRate(
    formData.get("defaultVatRatePct"),
    countryDefaultRate,
  );

  let pricesIncludeVat = parseBoolean(formData.get("pricesIncludeVat"));

  const costsIncludeVat = parseBoolean(formData.get("costsIncludeVat"));

  let inputVatRecoveryPct = parseRate(formData.get("inputVatRecoveryPct"), 100);

  let recoverInputVat = inputVatRecoveryPct > 0;

  let shippingIncludeVat = parseBoolean(formData.get("shippingIncludeVat"));

  let shippingVatRatePct = parseRate(
    formData.get("shippingVatRatePct"),
    defaultVatRatePct,
  );

  if (!isStandardRecoverableRegime(regime)) {
    defaultVatRatePct = 0;
    pricesIncludeVat = false;
    recoverInputVat = false;
    inputVatRecoveryPct = 0;
    shippingIncludeVat = false;
    shippingVatRatePct = 0;
  }

  await saveStoreTaxProfile({
    shop: session.shop,
    countryCode: context.effectiveCountryCode,
    regime,
    defaultVatRatePct,
    pricesIncludeVat,
    costsIncludeVat,
    recoverInputVat,
    inputVatRecoveryPct,
    shippingIncludeVat,
    shippingVatRatePct,
  });

  return Response.json({ ok: true });
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 16,
        alignItems: "center",
        padding: 18,
        borderRadius: 18,
        textAlign: "left",
        cursor: "pointer",
        background: checked ? "rgba(34,197,94,0.07)" : "rgba(255,255,255,0.03)",
        border: checked
          ? "1px solid rgba(34,197,94,0.24)"
          : "1px solid rgba(255,255,255,0.075)",
      }}
    >
      <div>
        <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 900 }}>
          {label}
        </div>
        <div
          style={{
            marginTop: 5,
            color: "rgba(255,255,255,0.48)",
            fontSize: 11,
            lineHeight: 1.5,
            fontWeight: 720,
          }}
        >
          {description}
        </div>
      </div>

      <div
        style={{
          width: 48,
          height: 27,
          padding: 3,
          borderRadius: 999,
          display: "flex",
          justifyContent: checked ? "flex-end" : "flex-start",
          background: checked
            ? "rgba(34,197,94,0.22)"
            : "rgba(255,255,255,0.08)",
          border: checked
            ? "1px solid rgba(34,197,94,0.35)"
            : "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div
          style={{
            width: 19,
            height: 19,
            borderRadius: "50%",
            background: checked ? "#4ade80" : "#94a3b8",
          }}
        />
      </div>
    </button>
  );
}

export default function TaxProfilePage() {
  const { taxContext } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

  const fetcher = useFetcher<{ ok: boolean; error?: string }>();

  const navigate = useNavigate();

  const { language, messages, t } = useI18n();
  const copy = messages.taxProfilePage;

  const countryCode = taxContext.effectiveCountryCode;

  const supported = taxContext.advancedProfileAvailable;

  const defaultStandardRegime = getDefaultStandardRegime(countryCode);

  const profileFromContext = isSupportedRegime(taxContext.profile)
    ? taxContext.profile
    : defaultStandardRegime;

  const countryUiConfig = getCountryUiConfig(countryCode);

  const profileMatchesCurrentCountry = Boolean(
    countryUiConfig &&
    profileFromContext.startsWith(countryUiConfig.profilePrefix),
  );

  const initialRegime = profileMatchesCurrentCountry
    ? profileFromContext
    : defaultStandardRegime;

  const countryDefaultRate = getDefaultRateForCountry(countryCode);

  const [regime, setRegime] = React.useState<SupportedRegime>(initialRegime);

  const [defaultVatRatePct, setDefaultVatRatePct] = React.useState(
    taxContext.defaultVatRatePct || countryDefaultRate,
  );

  const [pricesIncludeVat, setPricesIncludeVat] = React.useState(
    taxContext.pricesIncludeVat,
  );

  const [costsIncludeVat, setCostsIncludeVat] = React.useState(
    taxContext.costsIncludeVat,
  );

  const [inputVatRecoveryPct, setInputVatRecoveryPct] = React.useState(
    taxContext.inputVatRecoveryPct,
  );

  const recoverInputVat = inputVatRecoveryPct > 0;

  const [shippingIncludeVat, setShippingIncludeVat] = React.useState(
    taxContext.shippingIncludeVat,
  );

  const [shippingVatRatePct, setShippingVatRatePct] = React.useState(
    taxContext.shippingVatRatePct || countryDefaultRate,
  );

  const saving = fetcher.state !== "idle";

  const standardRegime = isStandardRecoverableRegime(regime);

  const rateOptions = getRateOptionsForCountry(countryCode);

  const taxSystemLabel =
    countryUiConfig?.taxLabel ??
    (taxContext.taxSystem === "GST_HST"
      ? "GST/HST"
      : taxContext.taxSystem === "SALES_TAX"
        ? "Sales Tax"
        : taxContext.taxSystem);

  const regimes = getRegimeOptions({
    countryCode,
    language,
  });

  React.useEffect(() => {
    if (standardRegime) {
      if (defaultVatRatePct === 0) {
        setDefaultVatRatePct(countryDefaultRate);
      }

      if (shippingVatRatePct === 0) {
        setShippingVatRatePct(countryDefaultRate);
      }

      return;
    }

    setDefaultVatRatePct(0);
    setPricesIncludeVat(false);
    setInputVatRecoveryPct(0);
    setShippingIncludeVat(false);
    setShippingVatRatePct(0);
  }, [
    regime,
    standardRegime,
    countryDefaultRate,
    defaultVatRatePct,
    shippingVatRatePct,
  ]);

  return (
    <div style={styles.page}>
      <div style={styles.glowTwo} />

      <div style={styles.container}>
        <DashboardNav active="tax-profile" navigate={navigate} />

        <section className="tax-profile-hero" style={styles.hero}>
          <div>
            <div style={styles.badge}>
              <span style={styles.badgeDot} />
              {copy.advanced_tax_profile}
            </div>

            <h1 style={styles.title}>
              {copy.configure_how_marginlab_interprets_taxes_prices_and}
            </h1>

            <p style={styles.subtitle}>
              {copy.a_store_level_configuration_that_complements_real}
            </p>
          </div>

          <div className="tax-profile-map-card">
            <div className="tax-profile-map-card__kicker">
              {copy.jurisdiction}
            </div>
            <TaxJurisdictionMap
              countryCode={countryCode}
              countryName={getCountryName(countryCode, language)}
            />
            <div className="tax-profile-map-card__identity">
              <div className="tax-profile-map-card__code">
                {countryCode || "—"}
              </div>
              <div className="tax-profile-map-card__country">
                <strong>{getCountryName(countryCode, language)}</strong>
                <small>
                  {taxContext.shopCountryCode !==
                  taxContext.effectiveCountryCode
                    ? t("taxProfilePage.test_environment_shopify_reports", {
                        country: taxContext.shopCountryCode || "—",
                      })
                    : copy.detected_from_shopify}
                </small>
              </div>
              <div className="tax-profile-map-card__profile">
                <small>{copy.advanced_profile}</small>
                <strong
                  className={`tax-profile-map-card__status ${
                    !supported
                      ? "is-unavailable"
                      : taxContext.configured
                        ? ""
                        : "is-incomplete"
                  }`}
                >
                  {supported
                    ? taxContext.configured
                      ? copy.configured
                      : copy.incomplete
                    : copy.not_available}
                </strong>
              </div>
            </div>
            <div className="tax-profile-map-card__meta">
              <div>
                <span>{copy.system}</span>
                <strong>{taxSystemLabel || "—"}</strong>
              </div>
            </div>
          </div>
        </section>

        {!supported ? (
          <section style={styles.section}>
            <div style={styles.kicker}>{copy.global_engine_active}</div>

            <div style={styles.sectionTitle}>
              {t("taxProfilePage.marginlab_already_uses_shopify_tax_data", {
                taxSystem: taxSystemLabel || copy.tax,
              })}
            </div>

            <p style={styles.sectionText}>
              {copy.an_advanced_country_specific_tax_profile_is}
            </p>
          </section>
        ) : (
          <fetcher.Form method="post">
            <input type="hidden" name="regime" value={regime} />

            <input
              type="hidden"
              name="defaultVatRatePct"
              value={defaultVatRatePct}
            />

            <input
              type="hidden"
              name="pricesIncludeVat"
              value={String(pricesIncludeVat)}
            />

            <input
              type="hidden"
              name="costsIncludeVat"
              value={String(costsIncludeVat)}
            />

            <input
              type="hidden"
              name="recoverInputVat"
              value={String(recoverInputVat)}
            />

            <input
              type="hidden"
              name="inputVatRecoveryPct"
              value={inputVatRecoveryPct}
            />

            <input
              type="hidden"
              name="shippingIncludeVat"
              value={String(shippingIncludeVat)}
            />

            <input
              type="hidden"
              name="shippingVatRatePct"
              value={shippingVatRatePct}
            />

            <section style={styles.section}>
              <div style={styles.kicker}>{copy.text_1_tax_regime}</div>

              <div style={styles.sectionTitle}>
                {copy.how_does_the_store_operate_for_tax}
              </div>

              <p style={styles.sectionText}>
                {copy.shopify_can_detect_the_country_and_taxes}
              </p>

              <div style={styles.regimeGrid}>
                {regimes.map((item) => {
                  const selected = regime === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setRegime(item.id)}
                      style={{
                        ...styles.regimeCard,
                        ...(selected ? styles.regimeSelected : {}),
                      }}
                    >
                      <div
                        style={{
                          ...styles.check,
                          ...(selected ? styles.checkSelected : {}),
                        }}
                      >
                        {selected ? "✓" : ""}
                      </div>

                      <div style={styles.regimeTitle}>{item.title}</div>

                      <div style={styles.regimeSubtitle}>{item.subtitle}</div>

                      <div style={styles.regimeText}>{item.detail}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={styles.section}>
              <div style={styles.kicker}>
                {t("taxProfilePage.tax_configuration_step", {
                  taxSystem: taxSystemLabel,
                })}
              </div>

              <div style={styles.sectionTitle}>
                {copy.define_the_economic_basis_of_prices_and}
              </div>

              {standardRegime ? (
                <>
                  {countryUiConfig?.noticeIt && countryUiConfig?.noticeEn && (
                    <div style={styles.notice}>
                      {language === "it"
                        ? countryUiConfig.noticeIt
                        : language === "fr"
                          ? countryCode === "CA"
                            ? "Au Canada, le taux réel peut varier selon le lieu de fourniture et la province. Le taux de 5 % sert uniquement de référence de secours : lorsque Shopify fournit des lignes fiscales réelles, MarginLab les considère comme prioritaires."
                            : "En Australie, le taux standard de GST est généralement de 10 % sur les ventes imposables. MarginLab considère toutefois les lignes fiscales Shopify réelles comme prioritaires et utilise 10 % uniquement comme valeur de secours du profil avancé."
                          : language === "de"
                            ? countryCode === "CA"
                              ? "In Kanada kann der tatsächliche Steuersatz je nach Leistungsort und Provinz variieren. Der Satz von 5 % dient nur als Fallback-Referenz; wenn Shopify tatsächliche Steuerpositionen liefert, behandelt MarginLab diese als maßgeblich."
                              : "In Australien beträgt der Standard-GST-Satz auf steuerpflichtige Verkäufe in der Regel 10 %. MarginLab behandelt tatsächliche Shopify-Steuerpositionen jedoch als maßgeblich und verwendet 10 % nur als Fallback-Wert des erweiterten Profils."
                            : language === "es"
                              ? countryCode === "CA"
                                ? "En Canadá, el tipo real puede variar según el lugar de suministro y la provincia. El 5 % se utiliza únicamente como referencia de fallback; cuando Shopify proporciona líneas fiscales reales, MarginLab les da prioridad."
                                : "En Australia, el tipo estándar de GST suele ser del 10 % en las ventas sujetas a impuestos. MarginLab da prioridad a las líneas fiscales reales de Shopify y utiliza el 10 % únicamente como valor de fallback del perfil avanzado."
                              : language === "pt-BR"
                                ? countryCode === "CA"
                                  ? "No Canadá, a alíquota real pode variar conforme o local de fornecimento e a província. A alíquota de 5% é usada apenas como referência de fallback; quando a Shopify fornece linhas fiscais reais, a MarginLab dá prioridade a elas."
                                  : "Na Austrália, a alíquota padrão de GST costuma ser de 10% sobre vendas tributáveis. A MarginLab dá prioridade às linhas fiscais reais da Shopify e usa 10% apenas como valor de fallback do perfil avançado."
                                : countryUiConfig.noticeEn}
                    </div>
                  )}
                  <div style={styles.rateRow}>
                    <div>
                      <div
                        style={{
                          ...styles.fieldLabel,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>
                          {t("taxProfilePage.default_tax_rate", {
                            taxSystem: taxSystemLabel,
                          })}
                        </span>

                        <MetricTooltip
                          content={{
                            title: t("taxProfilePage.default_tax_rate", {
                              taxSystem: taxSystemLabel,
                            }),
                            description:
                              copy.fallback_rate_used_by_marginlab_only_when,
                          }}
                        />
                      </div>

                      <div style={styles.fieldText}>
                        {copy.fallback_used_only_when_the_engine_lacks}
                      </div>
                    </div>

                    <div style={styles.rateButtons}>
                      {rateOptions.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setDefaultVatRatePct(rate)}
                          style={{
                            ...styles.rateBtn,
                            ...(defaultVatRatePct === rate
                              ? styles.rateBtnSelected
                              : {}),
                          }}
                        >
                          {rate}%
                        </button>
                      ))}

                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={defaultVatRatePct}
                        onChange={(event) =>
                          setDefaultVatRatePct(
                            Math.max(0, Number(event.target.value) || 0),
                          )
                        }
                        style={styles.rateInput}
                      />
                    </div>
                  </div>

                  <div style={styles.toggleGrid}>
                    <Toggle
                      checked={pricesIncludeVat}
                      onChange={setPricesIncludeVat}
                      label={t(
                        "taxProfilePage.shopify_prices_include_tax_system",
                        { taxSystem: taxSystemLabel },
                      )}
                      description={
                        copy.analyzed_selling_prices_already_include_tax
                      }
                    />

                    <Toggle
                      checked={costsIncludeVat}
                      onChange={setCostsIncludeVat}
                      label={t(
                        "taxProfilePage.shopify_cogs_include_tax_system",
                        { taxSystem: taxSystemLabel },
                      )}
                      description={
                        copy.unit_costs_stored_in_shopify_already_include
                      }
                    />

                    <div style={styles.recoveryCard}>
                      <div>
                        <div
                          style={{
                            ...styles.fieldLabel,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>{copy.input_tax_recovery}</span>

                          <MetricTooltip
                            content={{
                              title: copy.input_tax_recovery,
                              description:
                                copy.indicates_what_percentage_of_tax_included_in,
                            }}
                          />
                        </div>

                        <div style={styles.fieldText}>
                          {copy.define_how_much_tax_embedded_in_costs}
                        </div>
                      </div>

                      <div style={styles.recoveryOptions}>
                        <button
                          type="button"
                          onClick={() => setInputVatRecoveryPct(0)}
                          style={{
                            ...styles.recoveryOption,
                            ...(inputVatRecoveryPct === 0
                              ? styles.recoveryOptionSelected
                              : {}),
                          }}
                        >
                          <div style={styles.recoveryOptionTitle}>
                            {copy.none}
                          </div>

                          <div style={styles.recoveryOptionValue}>0%</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setInputVatRecoveryPct(100)}
                          style={{
                            ...styles.recoveryOption,
                            ...(inputVatRecoveryPct === 100
                              ? styles.recoveryOptionSelected
                              : {}),
                          }}
                        >
                          <div style={styles.recoveryOptionTitle}>
                            {copy.full}
                          </div>

                          <div style={styles.recoveryOptionValue}>100%</div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setInputVatRecoveryPct((current) =>
                              current > 0 && current < 100 ? current : 50,
                            )
                          }
                          style={{
                            ...styles.recoveryOption,
                            ...(inputVatRecoveryPct > 0 &&
                            inputVatRecoveryPct < 100
                              ? styles.recoveryOptionSelected
                              : {}),
                          }}
                        >
                          <div style={styles.recoveryOptionTitle}>
                            {copy.partial}
                          </div>

                          <div style={styles.recoveryOptionValue}>
                            {inputVatRecoveryPct > 0 &&
                            inputVatRecoveryPct < 100
                              ? `${inputVatRecoveryPct}%`
                              : "—"}
                          </div>
                        </button>
                      </div>

                      {inputVatRecoveryPct > 0 && inputVatRecoveryPct < 100 && (
                        <div style={styles.partialRecoveryPanel}>
                          <div>
                            <div style={styles.fieldLabel}>
                              {copy.recoverable_percentage}
                            </div>

                            <div style={styles.fieldText}>
                              {
                                copy.enter_the_percentage_that_is_actually_recoverable
                              }
                            </div>
                          </div>

                          <div style={styles.partialRecoveryControl}>
                            <input
                              type="range"
                              min={1}
                              max={99}
                              step={1}
                              value={inputVatRecoveryPct}
                              onChange={(event) =>
                                setInputVatRecoveryPct(
                                  Math.min(
                                    99,
                                    Math.max(
                                      1,
                                      Number(event.target.value) || 1,
                                    ),
                                  ),
                                )
                              }
                              style={styles.recoveryRange}
                            />

                            <input
                              type="number"
                              min={1}
                              max={99}
                              step={1}
                              value={inputVatRecoveryPct}
                              onChange={(event) =>
                                setInputVatRecoveryPct(
                                  Math.min(
                                    99,
                                    Math.max(
                                      1,
                                      Number(event.target.value) || 1,
                                    ),
                                  ),
                                )
                              }
                              style={styles.recoveryInput}
                            />

                            <div style={styles.recoveryPercent}>%</div>
                          </div>
                        </div>
                      )}

                      <div style={styles.recoverySummary}>
                        {inputVatRecoveryPct === 0
                          ? copy.input_tax_fully_included
                          : inputVatRecoveryPct === 100
                            ? copy.input_tax_fully_recoverable
                            : t(
                                "taxProfilePage.input_tax_partially_recoverable",
                                { value: inputVatRecoveryPct },
                              )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={styles.notice}>
                  {t("taxProfilePage.nonstandard_profile_notice", {
                    taxSystem: taxSystemLabel,
                  })}
                </div>
              )}

              {!standardRegime && (
                <div style={{ marginTop: 14 }}>
                  <Toggle
                    checked={costsIncludeVat}
                    onChange={setCostsIncludeVat}
                    label={copy.shopify_costs_include_tax}
                    description={
                      copy.this_remains_useful_for_describing_the_cost
                    }
                  />
                </div>
              )}
            </section>

            <section style={styles.section}>
              <div style={styles.kicker}>{copy.text_3_shipping}</div>

              <div style={styles.sectionTitle}>
                {copy.tax_treatment_of_shipping_revenue}
              </div>

              {standardRegime ? (
                <div style={styles.shippingGrid}>
                  <Toggle
                    checked={shippingIncludeVat}
                    onChange={setShippingIncludeVat}
                    label={t("taxProfilePage.shipping_includes_tax_system", {
                      taxSystem: taxSystemLabel,
                    })}
                    description={
                      copy.the_customer_paid_shipping_charge_already_includes
                    }
                  />

                  <div style={styles.ratePanel}>
                    <div style={styles.fieldLabel}>
                      {copy.shipping_tax_rate}
                    </div>

                    <div
                      style={{
                        ...styles.rateButtons,
                        marginTop: 12,
                      }}
                    >
                      {rateOptions.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setShippingVatRatePct(rate)}
                          style={{
                            ...styles.rateBtn,
                            ...(shippingVatRatePct === rate
                              ? styles.rateBtnSelected
                              : {}),
                          }}
                        >
                          {rate}%
                        </button>
                      ))}

                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={shippingVatRatePct}
                        onChange={(event) =>
                          setShippingVatRatePct(
                            Math.max(0, Number(event.target.value) || 0),
                          )
                        }
                        style={styles.rateInput}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={styles.notice}>
                  {copy.in_the_selected_profile_marginlab_does_not}
                </div>
              )}
            </section>

            <section style={styles.engineSection}>
              <div style={styles.kicker}>
                {copy.marginlab_calculation_basis}
              </div>

              <div style={styles.sectionTitle}>
                {copy.how_the_profile_complements_the_global_tax}
              </div>

              <div style={styles.flowGrid}>
                {[
                  ["01", copy.shopify_sales],
                  ["02", copy.actual_tax_lines],
                  ["03", copy.cost_profile],
                  ["04", copy.economic_cogs],
                  ["05", copy.economic_profit],
                ].map(([n, label]) => (
                  <div key={n} style={styles.flowCard}>
                    <div style={styles.flowNumber}>{n}</div>

                    <div style={styles.flowLabel}>{label}</div>
                  </div>
                ))}
              </div>
            </section>

            {fetcher.data?.ok && (
              <div style={styles.success}>
                {copy.tax_profile_saved_successfully_marginlab_will_use}
              </div>
            )}

            {fetcher.data?.error && (
              <div style={styles.error}>{fetcher.data.error}</div>
            )}

            <div style={styles.saveBar}>
              <div>
                <div style={styles.saveTitle}>{copy.save_tax_profile}</div>

                <div style={styles.saveText}>
                  {copy.store_level_configuration_available_on_both_starter}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  ...styles.primaryBtn,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? copy.saving : copy.save_configuration}
              </button>
            </div>
          </fetcher.Form>
        )}

        <div style={styles.disclaimer}>
          {copy.tax_profile_improves_the_economic_basis_used}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at bottom right, rgba(56,189,248,0.07), transparent 30%), linear-gradient(180deg, #03050a 0%, #070b12 100%)",
    color: "#f3f4f6",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: 32,
    position: "relative",
    overflow: "hidden",
  },
  glowTwo: {
    position: "absolute",
    bottom: -200,
    right: -140,
    width: 480,
    height: 480,
    borderRadius: "50%",
    background: "rgba(56,189,248,0.06)",
    filter: "blur(90px)",
  },
  container: {
    width: "min(1480px, 100%)",
    margin: "0 auto",
    position: "relative",
    zIndex: 2,
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "1.45fr 0.55fr",
    gap: 24,
    padding: 30,
    borderRadius: 30,
    background:
      "radial-gradient(circle at top left, rgba(255,115,60,0.11), transparent 34%), linear-gradient(180deg, rgba(17,24,39,0.97), rgba(8,13,22,0.99))",
    border: "1px solid rgba(255,115,60,0.22)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.32)",
    marginBottom: 24,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    padding: "8px 13px",
    borderRadius: 999,
    background: "rgba(255,115,60,0.10)",
    border: "1px solid rgba(255,115,60,0.22)",
    color: "#ff9a70",
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: 0.8,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ff5a36",
    boxShadow: "0 0 12px rgba(255,90,54,0.8)",
  },
  title: {
    margin: "22px 0 0",
    maxWidth: 900,
    fontSize: 44,
    lineHeight: 1.05,
    letterSpacing: -1.4,
    fontWeight: 950,
  },
  subtitle: {
    margin: "16px 0 0",
    maxWidth: 900,
    color: "rgba(243,244,246,0.67)",
    fontSize: 16,
    lineHeight: 1.7,
  },
  statusCard: {
    borderRadius: 24,
    padding: 22,
    background: "rgba(255,255,255,0.028)",
    border: "1px solid rgba(255,255,255,0.075)",
  },
  kicker: {
    color: "#ff9a70",
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: "0.13em",
    textTransform: "uppercase",
  },
  countryRow: {
    display: "flex",
    alignItems: "center",
    gap: 13,
    marginTop: 15,
  },
  countryBadge: {
    width: 46,
    height: 46,
    borderRadius: 15,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,115,60,0.12)",
    border: "1px solid rgba(255,115,60,0.24)",
    color: "#ff9a70",
    fontWeight: 950,
  },
  countryTitle: { fontSize: 18, fontWeight: 950 },
  countryText: {
    marginTop: 4,
    color: "rgba(255,255,255,0.43)",
    fontSize: 10,
    fontWeight: 700,
  },
  statusGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 18,
  },
  miniCard: {
    padding: 13,
    borderRadius: 14,
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  miniLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 8,
    fontWeight: 950,
    textTransform: "uppercase",
  },
  miniValue: { marginTop: 6, fontSize: 13, fontWeight: 900 },
  section: {
    padding: 26,
    marginTop: 20,
    borderRadius: 26,
    background:
      "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
    border: "1px solid rgba(255,115,60,0.18)",
  },
  engineSection: {
    padding: 26,
    marginTop: 20,
    borderRadius: 26,
    background:
      "radial-gradient(circle at top left, rgba(34,197,94,0.09), transparent 36%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
    border: "1px solid rgba(34,197,94,0.20)",
  },
  sectionTitle: {
    marginTop: 8,
    fontSize: 23,
    fontWeight: 950,
    letterSpacing: -0.4,
  },
  sectionText: {
    marginTop: 8,
    maxWidth: 900,
    color: "rgba(255,255,255,0.54)",
    fontSize: 12,
    lineHeight: 1.6,
    fontWeight: 720,
  },
  regimeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: 13,
    marginTop: 20,
  },
  regimeCard: {
    minHeight: 180,
    padding: 19,
    borderRadius: 19,
    cursor: "pointer",
    textAlign: "left",
    color: "#f8fafc",
    background: "rgba(255,255,255,0.027)",
    border: "1px solid rgba(255,255,255,0.075)",
  },
  regimeSelected: {
    background:
      "radial-gradient(circle at top right, rgba(255,115,60,0.13), transparent 42%), rgba(255,115,60,0.045)",
    border: "1px solid rgba(255,115,60,0.40)",
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 9,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    fontWeight: 950,
  },
  checkSelected: {
    background: "rgba(255,115,60,0.18)",
    border: "1px solid rgba(255,115,60,0.38)",
    color: "#ff9a70",
  },
  regimeTitle: { marginTop: 16, fontSize: 17, fontWeight: 950 },
  regimeSubtitle: {
    marginTop: 6,
    color: "#ff9a70",
    fontSize: 11,
    fontWeight: 850,
  },
  regimeText: {
    marginTop: 9,
    color: "rgba(255,255,255,0.47)",
    fontSize: 11,
    lineHeight: 1.5,
    fontWeight: 700,
  },
  rateRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 20,
    alignItems: "center",
    marginTop: 20,
    padding: 18,
    borderRadius: 18,
    background: "rgba(255,255,255,0.028)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  fieldLabel: { fontSize: 14, fontWeight: 900 },
  fieldText: {
    marginTop: 5,
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontWeight: 700,
  },
  rateButtons: {
    display: "flex",
    gap: 7,
    alignItems: "center",
    flexWrap: "wrap",
  },
  rateBtn: {
    minWidth: 52,
    padding: "10px 11px",
    borderRadius: 12,
    cursor: "pointer",
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.60)",
    fontWeight: 900,
  },
  rateBtnSelected: {
    background: "rgba(255,115,60,0.14)",
    border: "1px solid rgba(255,115,60,0.36)",
    color: "#ff9a70",
  },
  rateInput: {
    width: 82,
    padding: "10px 11px",
    borderRadius: 12,
    background: "rgba(4,8,15,0.72)",
    border: "1px solid rgba(255,115,60,0.22)",
    color: "#f8fafc",
    fontWeight: 900,
    outline: "none",
  },
  toggleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: 12,
    marginTop: 14,
  },
  recoveryCard: {
    gridColumn: "1 / -1",
    padding: 18,
    borderRadius: 18,
    background:
      "linear-gradient(180deg, rgba(34,197,94,0.055), rgba(255,255,255,0.025))",
    border: "1px solid rgba(34,197,94,0.16)",
  },
  recoveryOptions: {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: 10,
    marginTop: 15,
  },
  recoveryOption: {
    padding: "13px 14px",
    borderRadius: 14,
    cursor: "pointer",
    textAlign: "left",
    color: "#f8fafc",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  recoveryOptionSelected: {
    background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.30)",
  },
  recoveryOptionTitle: {
    fontSize: 12,
    fontWeight: 900,
  },
  recoveryOptionValue: {
    marginTop: 6,
    color: "#4ade80",
    fontSize: 15,
    fontWeight: 950,
  },
  partialRecoveryPanel: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 18,
    alignItems: "center",
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.065)",
  },
  partialRecoveryControl: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minWidth: 310,
  },
  recoveryRange: {
    width: 190,
    cursor: "pointer",
    accentColor: "#4ade80",
  },
  recoveryInput: {
    width: 74,
    padding: "9px 10px",
    borderRadius: 11,
    background: "rgba(4,8,15,0.72)",
    border: "1px solid rgba(34,197,94,0.22)",
    color: "#f8fafc",
    fontWeight: 900,
    outline: "none",
  },
  recoveryPercent: {
    color: "#4ade80",
    fontSize: 13,
    fontWeight: 950,
  },
  recoverySummary: {
    marginTop: 12,
    color: "rgba(255,255,255,0.52)",
    fontSize: 10,
    lineHeight: 1.55,
    fontWeight: 720,
  },
  shippingGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginTop: 20,
  },
  ratePanel: {
    padding: 18,
    borderRadius: 18,
    background: "rgba(255,255,255,0.028)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  notice: {
    marginTop: 18,
    padding: 18,
    borderRadius: 17,
    background: "rgba(245,158,11,0.07)",
    border: "1px solid rgba(245,158,11,0.19)",
    color: "rgba(255,255,255,0.60)",
    fontSize: 11,
    lineHeight: 1.6,
    fontWeight: 700,
  },
  flowGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5,minmax(0,1fr))",
    gap: 11,
    marginTop: 20,
  },
  flowCard: {
    padding: 16,
    borderRadius: 17,
    background: "rgba(255,255,255,0.028)",
    border: "1px solid rgba(255,255,255,0.065)",
  },
  flowNumber: { color: "#4ade80", fontSize: 10, fontWeight: 950 },
  flowLabel: { marginTop: 9, fontSize: 13, fontWeight: 900 },
  success: {
    marginTop: 20,
    padding: 17,
    borderRadius: 17,
    background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.22)",
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: 800,
  },
  error: {
    marginTop: 20,
    padding: 17,
    borderRadius: 17,
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.22)",
    color: "#fecaca",
    fontSize: 12,
    fontWeight: 800,
  },
  saveBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    marginTop: 20,
    padding: 20,
    borderRadius: 22,
    background:
      "linear-gradient(135deg, rgba(255,115,60,0.10), rgba(8,13,22,0.96))",
    border: "1px solid rgba(255,115,60,0.22)",
  },
  saveTitle: { fontSize: 15, fontWeight: 950 },
  saveText: {
    marginTop: 5,
    color: "rgba(255,255,255,0.46)",
    fontSize: 10,
    fontWeight: 700,
  },
  primaryBtn: {
    minWidth: 210,
    padding: "14px 18px",
    borderRadius: 15,
    border: "1px solid rgba(255,115,60,0.34)",
    background:
      "linear-gradient(135deg, rgba(255,90,54,0.95), rgba(255,115,60,0.88))",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 14,
  },
  disclaimer: {
    marginTop: 20,
    padding: 17,
    borderRadius: 17,
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.43)",
    fontSize: 10,
    lineHeight: 1.6,
    fontWeight: 700,
  },
};
