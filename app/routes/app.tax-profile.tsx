import * as React from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";

import { authenticate } from "~/shopify.server";
import { getStoredLanguage } from "~/utils/i18n";
import {
  getStoreTaxContext,
  saveStoreTaxProfile,
  type TaxProfile,
} from "~/utils/tax-profile.server";

type SupportedRegime =
  | "ITALY_STANDARD"
  | "ITALY_FORFETTARIO"
  | "ITALY_EXEMPT"
  | "UK_VAT_STANDARD"
  | "UK_VAT_EXEMPT"
  | "UK_VAT_UNREGISTERED";

type RegimeOption = {
  id: SupportedRegime;
  title: string;
  subtitle: string;
  detail: string;
};

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
  return (
    value === "ITALY_STANDARD" ||
    value === "ITALY_FORFETTARIO" ||
    value === "ITALY_EXEMPT" ||
    value === "UK_VAT_STANDARD" ||
    value === "UK_VAT_EXEMPT" ||
    value === "UK_VAT_UNREGISTERED"
  );
}

function isStandardRecoverableRegime(regime: SupportedRegime) {
  return regime === "ITALY_STANDARD" || regime === "UK_VAT_STANDARD";
}

function getDefaultStandardRegime(countryCode: string): SupportedRegime {
  return countryCode === "GB" ? "UK_VAT_STANDARD" : "ITALY_STANDARD";
}

function getDefaultRateForCountry(countryCode: string) {
  return countryCode === "GB" ? 20 : 22;
}

function getRateOptionsForCountry(countryCode: string) {
  return countryCode === "GB" ? [0, 5, 20] : [4, 5, 10, 22];
}

function getCountryName(
  countryCode: string,
  language: "it" | "en",
) {
  if (countryCode === "IT") {
    return language === "it" ? "Italia" : "Italy";
  }

  if (countryCode === "GB") {
    return language === "it" ? "Regno Unito" : "United Kingdom";
  }

  if (countryCode === "US") {
    return language === "it" ? "Stati Uniti" : "United States";
  }

  if (countryCode === "CA") {
    return "Canada";
  }

  if (countryCode === "AU") {
    return language === "it" ? "Australia" : "Australia";
  }

  return countryCode || (language === "it" ? "Sconosciuto" : "Unknown");
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

  const shopCountryCode =
    json?.data?.shop?.billingAddress?.countryCodeV2 ?? "";

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

  const shopCountryCode =
    json?.data?.shop?.billingAddress?.countryCodeV2 ?? "";

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

  const regimeMatchesCountry =
    (context.effectiveCountryCode === "IT" &&
      regime.startsWith("ITALY_")) ||
    (context.effectiveCountryCode === "GB" &&
      regime.startsWith("UK_"));

  if (!regimeMatchesCountry) {
    return Response.json(
      {
        ok: false,
        error:
          "The selected tax regime does not match the store jurisdiction.",
      },
      { status: 400 },
    );
  }

  const countryDefaultRate =
    getDefaultRateForCountry(context.effectiveCountryCode);

  let defaultVatRatePct = parseRate(
    formData.get("defaultVatRatePct"),
    countryDefaultRate,
  );

  let pricesIncludeVat =
    parseBoolean(formData.get("pricesIncludeVat"));

  const costsIncludeVat =
    parseBoolean(formData.get("costsIncludeVat"));

  let inputVatRecoveryPct = parseRate(
    formData.get("inputVatRecoveryPct"),
    100,
  );

  let recoverInputVat =
    inputVatRecoveryPct > 0;

  let shippingIncludeVat =
    parseBoolean(formData.get("shippingIncludeVat"));

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
        background: checked
          ? "rgba(34,197,94,0.07)"
          : "rgba(255,255,255,0.03)",
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
  const { taxContext } =
    useLoaderData() as Awaited<ReturnType<typeof loader>>;

  const fetcher =
    useFetcher<{ ok: boolean; error?: string }>();

  const navigate = useNavigate();

  const language =
    getStoredLanguage() === "it" ? "it" : "en";

  const countryCode =
    taxContext.effectiveCountryCode;

  const supported =
    taxContext.advancedProfileAvailable;

  const defaultStandardRegime =
    getDefaultStandardRegime(countryCode);

  const profileFromContext =
    isSupportedRegime(taxContext.profile)
      ? taxContext.profile
      : defaultStandardRegime;

  const profileMatchesCurrentCountry =
    (countryCode === "IT" &&
      profileFromContext.startsWith("ITALY_")) ||
    (countryCode === "GB" &&
      profileFromContext.startsWith("UK_"));

  const initialRegime =
    profileMatchesCurrentCountry
      ? profileFromContext
      : defaultStandardRegime;

  const countryDefaultRate =
    getDefaultRateForCountry(countryCode);

  const [regime, setRegime] =
    React.useState<SupportedRegime>(initialRegime);

  const [defaultVatRatePct, setDefaultVatRatePct] =
    React.useState(
      taxContext.defaultVatRatePct ||
        countryDefaultRate,
    );

  const [pricesIncludeVat, setPricesIncludeVat] =
    React.useState(taxContext.pricesIncludeVat);

  const [costsIncludeVat, setCostsIncludeVat] =
    React.useState(taxContext.costsIncludeVat);

  const [
    inputVatRecoveryPct,
    setInputVatRecoveryPct,
  ] = React.useState(
    taxContext.inputVatRecoveryPct,
  );

  const recoverInputVat =
    inputVatRecoveryPct > 0;

  const [shippingIncludeVat, setShippingIncludeVat] =
    React.useState(taxContext.shippingIncludeVat);

  const [shippingVatRatePct, setShippingVatRatePct] =
    React.useState(
      taxContext.shippingVatRatePct ||
        countryDefaultRate,
    );

  const saving =
    fetcher.state !== "idle";

  const standardRegime =
    isStandardRecoverableRegime(regime);

  const rateOptions =
    getRateOptionsForCountry(countryCode);

  const taxSystemLabel =
    taxContext.taxSystem === "GST_HST"
      ? "GST/HST"
      : taxContext.taxSystem === "SALES_TAX"
        ? "Sales Tax"
        : taxContext.taxSystem;

  const regimes: RegimeOption[] =
    countryCode === "GB"
      ? [
          {
            id: "UK_VAT_STANDARD",
            title:
              language === "it"
                ? "VAT ordinaria"
                : "Standard VAT",
            subtitle:
              language === "it"
                ? "Store registrato VAT"
                : "VAT-registered store",
            detail:
              language === "it"
                ? "Configura aliquote, prezzi, costi e percentuale di input VAT recuperabile."
                : "Configure rates, selling prices, cost basis and recoverable input VAT.",
          },
          {
            id: "UK_VAT_EXEMPT",
            title:
              language === "it"
                ? "Attività esente VAT"
                : "VAT-exempt activity",
            subtitle:
              language === "it"
                ? "Vendite trattate come esenti"
                : "Sales treated as VAT exempt",
            detail:
              language === "it"
                ? "Preset senza output VAT e senza recupero input VAT nel modello MarginLab."
                : "Preset with no output VAT and no input VAT recovery in MarginLab.",
          },
          {
            id: "UK_VAT_UNREGISTERED",
            title:
              language === "it"
                ? "Non registrato VAT"
                : "Not VAT registered",
            subtitle:
              language === "it"
                ? "Nessun addebito VAT"
                : "No VAT charged",
            detail:
              language === "it"
                ? "Per merchant che non addebitano VAT sulle vendite analizzate."
                : "For merchants that do not charge VAT on analyzed sales.",
          },
        ]
      : [
          {
            id: "ITALY_STANDARD",
            title:
              language === "it"
                ? "Regime ordinario"
                : "Standard VAT regime",
            subtitle:
              language === "it"
                ? "IVA applicata alle vendite"
                : "VAT applied to sales",
            detail:
              language === "it"
                ? "Configura aliquote, prezzi, costi e recuperabilità dell'IVA."
                : "Configure rates, selling prices, cost basis and input VAT recovery.",
          },
          {
            id: "ITALY_FORFETTARIO",
            title:
              language === "it"
                ? "Regime forfettario"
                : "Flat-rate tax regime",
            subtitle:
              language === "it"
                ? "Vendite senza addebito IVA"
                : "Sales without VAT charged",
            detail:
              language === "it"
                ? "Preset senza IVA sulle vendite e senza recupero IVA sui costi."
                : "Preset with no output VAT and no input VAT recovery.",
          },
          {
            id: "ITALY_EXEMPT",
            title:
              language === "it"
                ? "Operazioni esenti"
                : "VAT-exempt activity",
            subtitle:
              language === "it"
                ? "Vendite configurate come esenti"
                : "Sales configured as VAT exempt",
            detail:
              language === "it"
                ? "Per attività in cui le vendite analizzate non espongono IVA."
                : "For activities where analyzed sales do not carry output VAT.",
          },
        ];

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
      <div style={styles.glowOne} />
      <div style={styles.glowTwo} />

      <div style={styles.container}>
        <div style={styles.topBar}>
          <div style={styles.logo}>
            MARGIN
            <span style={{ color: "#ff5a36" }}>
              LAB
            </span>
          </div>

          <button
            type="button"
            style={styles.backBtn}
            onClick={() => navigate("/app")}
          >
            {language === "it"
              ? "Torna alla dashboard"
              : "Back to dashboard"}
          </button>
        </div>

        <section style={styles.hero}>
          <div>
            <div style={styles.badge}>
              <span style={styles.badgeDot} />
              {language === "it"
                ? "PROFILO FISCALE AVANZATO"
                : "ADVANCED TAX PROFILE"}
            </div>

            <h1 style={styles.title}>
              {language === "it"
                ? "Configura come MarginLab interpreta imposte, prezzi e costi."
                : "Configure how MarginLab interprets taxes, prices and costs."}
            </h1>

            <p style={styles.subtitle}>
              {language === "it"
                ? "Una configurazione a livello store che completa i dati fiscali reali Shopify e migliora la base economica usata da MarginLab."
                : "A store-level configuration that complements real Shopify tax data and improves the economic basis used by MarginLab."}
            </p>
          </div>

          <div style={styles.statusCard}>
            <div style={styles.kicker}>
              {language === "it"
                ? "GIURISDIZIONE"
                : "JURISDICTION"}
            </div>

            <div style={styles.countryRow}>
              <div style={styles.countryBadge}>
                {countryCode || "—"}
              </div>

              <div>
                <div style={styles.countryTitle}>
                  {getCountryName(
                    countryCode,
                    language,
                  )}
                </div>

                <div style={styles.countryText}>
                  {taxContext.shopCountryCode !==
                  taxContext.effectiveCountryCode
                    ? language === "it"
                      ? `Ambiente test · Shopify rileva ${taxContext.shopCountryCode || "—"}`
                      : `Test environment · Shopify reports ${taxContext.shopCountryCode || "—"}`
                    : language === "it"
                      ? "Rilevata da Shopify"
                      : "Detected from Shopify"}
                </div>
              </div>
            </div>

            <div style={styles.statusGrid}>
              <div style={styles.miniCard}>
                <div style={styles.miniLabel}>
                  {language === "it"
                    ? "Sistema"
                    : "System"}
                </div>

                <div style={styles.miniValue}>
                  {taxSystemLabel || "—"}
                </div>
              </div>

              <div style={styles.miniCard}>
                <div style={styles.miniLabel}>
                  {language === "it"
                    ? "Profilo avanzato"
                    : "Advanced profile"}
                </div>

                <div
                  style={{
                    ...styles.miniValue,
                    color: supported
                      ? taxContext.configured
                        ? "#4ade80"
                        : "#f59e0b"
                      : "rgba(255,255,255,0.52)",
                  }}
                >
                  {supported
                    ? taxContext.configured
                      ? language === "it"
                        ? "Configurato"
                        : "Configured"
                      : language === "it"
                        ? "Da completare"
                        : "Incomplete"
                    : language === "it"
                      ? "Non disponibile"
                      : "Not available"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {!supported ? (
          <section style={styles.section}>
            <div style={styles.kicker}>
              {language === "it"
                ? "MOTORE GLOBALE ATTIVO"
                : "GLOBAL ENGINE ACTIVE"}
            </div>

            <div style={styles.sectionTitle}>
              {language === "it"
                ? `MarginLab utilizza già i dati ${taxSystemLabel || "fiscali"} reali di Shopify.`
                : `MarginLab already uses real Shopify ${taxSystemLabel || "tax"} data.`}
            </div>

            <p style={styles.sectionText}>
              {language === "it"
                ? "Il profilo fiscale avanzato specifico per questa giurisdizione non è ancora disponibile. MarginLab non inventa aliquote o recuperi fiscali: utilizza i dati transazionali Shopify e applica un trattamento prudenziale quando le informazioni non sono sufficienti."
                : "An advanced country-specific tax profile is not available for this jurisdiction yet. MarginLab does not manufacture tax rates or recoverability assumptions: it uses Shopify transaction data and applies conservative treatment when evidence is insufficient."}
            </p>
          </section>
        ) : (
          <fetcher.Form method="post">
            <input
              type="hidden"
              name="regime"
              value={regime}
            />

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
              <div style={styles.kicker}>
                {language === "it"
                  ? "1 · REGIME FISCALE"
                  : "1 · TAX REGIME"}
              </div>

              <div style={styles.sectionTitle}>
                {language === "it"
                  ? "Come opera fiscalmente lo store?"
                  : "How does the store operate for tax purposes?"}
              </div>

              <p style={styles.sectionText}>
                {language === "it"
                  ? "Shopify può rilevare il paese e le imposte applicate agli ordini, ma non il regime fiscale o la recuperabilità dell'imposta sugli acquisti. Queste informazioni devono essere confermate dal merchant."
                  : "Shopify can detect the country and taxes applied to orders, but not the merchant's tax regime or input-tax recoverability. The merchant must confirm these settings."}
              </p>

              <div style={styles.regimeGrid}>
                {regimes.map((item) => {
                  const selected =
                    regime === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setRegime(item.id)
                      }
                      style={{
                        ...styles.regimeCard,
                        ...(selected
                          ? styles.regimeSelected
                          : {}),
                      }}
                    >
                      <div
                        style={{
                          ...styles.check,
                          ...(selected
                            ? styles.checkSelected
                            : {}),
                        }}
                      >
                        {selected ? "✓" : ""}
                      </div>

                      <div style={styles.regimeTitle}>
                        {item.title}
                      </div>

                      <div
                        style={styles.regimeSubtitle}
                      >
                        {item.subtitle}
                      </div>

                      <div style={styles.regimeText}>
                        {item.detail}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={styles.section}>
              <div style={styles.kicker}>
                {language === "it"
                  ? `2 · CONFIGURAZIONE ${taxSystemLabel}`
                  : `2 · ${taxSystemLabel} CONFIGURATION`}
              </div>

              <div style={styles.sectionTitle}>
                {language === "it"
                  ? "Definisci la base economica di prezzi e costi"
                  : "Define the economic basis of prices and costs"}
              </div>

              {standardRegime ? (
                <>
                  <div style={styles.rateRow}>
                    <div>
                      <div style={styles.fieldLabel}>
                        {language === "it"
                          ? `Aliquota ${taxSystemLabel} predefinita`
                          : `Default ${taxSystemLabel} rate`}
                      </div>

                      <div style={styles.fieldText}>
                        {language === "it"
                          ? "Fallback utilizzato solo quando il motore non dispone di un'aliquota Shopify più specifica e il profilo avanzato consente una stima."
                          : "Fallback used only when the engine lacks a more specific Shopify rate and the advanced profile permits an estimate."}
                      </div>
                    </div>

                    <div style={styles.rateButtons}>
                      {rateOptions.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() =>
                            setDefaultVatRatePct(rate)
                          }
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
                            Math.max(
                              0,
                              Number(
                                event.target.value,
                              ) || 0,
                            ),
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
                      label={
                        language === "it"
                          ? `I prezzi Shopify includono ${taxSystemLabel}`
                          : `Shopify prices include ${taxSystemLabel}`
                      }
                      description={
                        language === "it"
                          ? "I prezzi vendita analizzati comprendono già l'imposta."
                          : "Analyzed selling prices already include tax."
                      }
                    />

                    <Toggle
                      checked={costsIncludeVat}
                      onChange={setCostsIncludeVat}
                      label={
                        language === "it"
                          ? `I COGS Shopify includono ${taxSystemLabel}`
                          : `Shopify COGS include ${taxSystemLabel}`
                      }
                      description={
                        language === "it"
                          ? "I costi unitari salvati in Shopify comprendono già l'imposta sugli acquisti."
                          : "Unit costs stored in Shopify already include input tax."
                      }
                    />

                    <div style={styles.recoveryCard}>
                      <div>
                        <div style={styles.fieldLabel}>
                          {language === "it"
                            ? "Recuperabilità imposta sugli acquisti"
                            : "Input tax recovery"}
                        </div>

                        <div style={styles.fieldText}>
                          {language === "it"
                            ? "Definisci quanta imposta contenuta nei costi può essere recuperata economicamente."
                            : "Define how much tax embedded in costs can be economically recovered."}
                        </div>
                      </div>

                      <div style={styles.recoveryOptions}>
                        <button
                          type="button"
                          onClick={() =>
                            setInputVatRecoveryPct(0)
                          }
                          style={{
                            ...styles.recoveryOption,
                            ...(inputVatRecoveryPct === 0
                              ? styles.recoveryOptionSelected
                              : {}),
                          }}
                        >
                          <div
                            style={
                              styles.recoveryOptionTitle
                            }
                          >
                            {language === "it"
                              ? "Nessuna"
                              : "None"}
                          </div>

                          <div
                            style={
                              styles.recoveryOptionValue
                            }
                          >
                            0%
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setInputVatRecoveryPct(100)
                          }
                          style={{
                            ...styles.recoveryOption,
                            ...(inputVatRecoveryPct ===
                            100
                              ? styles.recoveryOptionSelected
                              : {}),
                          }}
                        >
                          <div
                            style={
                              styles.recoveryOptionTitle
                            }
                          >
                            {language === "it"
                              ? "Completa"
                              : "Full"}
                          </div>

                          <div
                            style={
                              styles.recoveryOptionValue
                            }
                          >
                            100%
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setInputVatRecoveryPct(
                              (current) =>
                                current > 0 &&
                                current < 100
                                  ? current
                                  : 50,
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
                          <div
                            style={
                              styles.recoveryOptionTitle
                            }
                          >
                            {language === "it"
                              ? "Parziale"
                              : "Partial"}
                          </div>

                          <div
                            style={
                              styles.recoveryOptionValue
                            }
                          >
                            {inputVatRecoveryPct > 0 &&
                            inputVatRecoveryPct < 100
                              ? `${inputVatRecoveryPct}%`
                              : "—"}
                          </div>
                        </button>
                      </div>

                      {inputVatRecoveryPct > 0 &&
                        inputVatRecoveryPct < 100 && (
                          <div
                            style={
                              styles.partialRecoveryPanel
                            }
                          >
                            <div>
                              <div
                                style={styles.fieldLabel}
                              >
                                {language === "it"
                                  ? "Percentuale recuperabile"
                                  : "Recoverable percentage"}
                              </div>

                              <div
                                style={styles.fieldText}
                              >
                                {language === "it"
                                  ? "Inserisci la percentuale effettivamente recuperabile."
                                  : "Enter the percentage that is actually recoverable."}
                              </div>
                            </div>

                            <div
                              style={
                                styles.partialRecoveryControl
                              }
                            >
                              <input
                                type="range"
                                min={1}
                                max={99}
                                step={1}
                                value={
                                  inputVatRecoveryPct
                                }
                                onChange={(event) =>
                                  setInputVatRecoveryPct(
                                    Math.min(
                                      99,
                                      Math.max(
                                        1,
                                        Number(
                                          event.target
                                            .value,
                                        ) || 1,
                                      ),
                                    ),
                                  )
                                }
                                style={
                                  styles.recoveryRange
                                }
                              />

                              <input
                                type="number"
                                min={1}
                                max={99}
                                step={1}
                                value={
                                  inputVatRecoveryPct
                                }
                                onChange={(event) =>
                                  setInputVatRecoveryPct(
                                    Math.min(
                                      99,
                                      Math.max(
                                        1,
                                        Number(
                                          event.target
                                            .value,
                                        ) || 1,
                                      ),
                                    ),
                                  )
                                }
                                style={
                                  styles.recoveryInput
                                }
                              />

                              <div
                                style={
                                  styles.recoveryPercent
                                }
                              >
                                %
                              </div>
                            </div>
                          </div>
                        )}

                      <div
                        style={styles.recoverySummary}
                      >
                        {language === "it"
                          ? inputVatRecoveryPct === 0
                            ? "L'imposta sugli acquisti resta interamente nel costo economico."
                            : inputVatRecoveryPct === 100
                              ? "L'imposta sugli acquisti viene considerata interamente recuperabile."
                              : `MarginLab considera recuperabile il ${inputVatRecoveryPct}% dell'imposta sugli acquisti.`
                          : inputVatRecoveryPct === 0
                            ? "Input tax remains fully included in economic cost."
                            : inputVatRecoveryPct ===
                                100
                              ? "Input tax is treated as fully recoverable."
                              : `MarginLab treats ${inputVatRecoveryPct}% of input tax as recoverable.`}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={styles.notice}>
                  {language === "it"
                    ? `Per questo profilo l'output ${taxSystemLabel} viene impostato a 0% nel fallback MarginLab e non viene applicato recupero dell'imposta sugli acquisti. I dati fiscali reali Shopify continuano ad avere priorità quando disponibili.`
                    : `For this profile, fallback output ${taxSystemLabel} is set to 0% and no input-tax recovery is applied. Real Shopify tax data still takes priority when available.`}
                </div>
              )}

              {!standardRegime && (
                <div style={{ marginTop: 14 }}>
                  <Toggle
                    checked={costsIncludeVat}
                    onChange={setCostsIncludeVat}
                    label={
                      language === "it"
                        ? "I costi Shopify comprendono imposte"
                        : "Shopify costs include tax"
                    }
                    description={
                      language === "it"
                        ? "Questa informazione resta utile per descrivere correttamente la base dei costi, anche quando il profilo non consente recupero dell'imposta."
                        : "This remains useful for describing the cost basis correctly, even when the profile does not allow input-tax recovery."
                    }
                  />
                </div>
              )}
            </section>

            <section style={styles.section}>
              <div style={styles.kicker}>
                {language === "it"
                  ? "3 · SPEDIZIONI"
                  : "3 · SHIPPING"}
              </div>

              <div style={styles.sectionTitle}>
                {language === "it"
                  ? "Trattamento fiscale dei ricavi da spedizione"
                  : "Tax treatment of shipping revenue"}
              </div>

              {standardRegime ? (
                <div style={styles.shippingGrid}>
                  <Toggle
                    checked={shippingIncludeVat}
                    onChange={
                      setShippingIncludeVat
                    }
                    label={
                      language === "it"
                        ? `La spedizione include ${taxSystemLabel}`
                        : `Shipping charge includes ${taxSystemLabel}`
                    }
                    description={
                      language === "it"
                        ? "Il prezzo di spedizione pagato dal cliente comprende già l'imposta."
                        : "The customer-paid shipping charge already includes tax."
                    }
                  />

                  <div style={styles.ratePanel}>
                    <div style={styles.fieldLabel}>
                      {language === "it"
                        ? "Aliquota spedizione"
                        : "Shipping tax rate"}
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
                          onClick={() =>
                            setShippingVatRatePct(
                              rate,
                            )
                          }
                          style={{
                            ...styles.rateBtn,
                            ...(shippingVatRatePct ===
                            rate
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
                            Math.max(
                              0,
                              Number(
                                event.target.value,
                              ) || 0,
                            ),
                          )
                        }
                        style={styles.rateInput}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={styles.notice}>
                  {language === "it"
                    ? "Nel profilo selezionato MarginLab non applica una stima fiscale alla spedizione. Le tax line Shopify effettive restano comunque utilizzabili dal motore globale."
                    : "In the selected profile, MarginLab does not estimate tax on shipping. Actual Shopify tax lines remain available to the global engine."}
                </div>
              )}
            </section>

            <section style={styles.engineSection}>
              <div style={styles.kicker}>
                {language === "it"
                  ? "BASE DI CALCOLO MARGINLAB"
                  : "MARGINLAB CALCULATION BASIS"}
              </div>

              <div style={styles.sectionTitle}>
                {language === "it"
                  ? "Come il profilo completa il motore fiscale globale"
                  : "How the profile complements the global tax engine"}
              </div>

              <div style={styles.flowGrid}>
                {[
                  [
                    "01",
                    language === "it"
                      ? "Vendite Shopify"
                      : "Shopify sales",
                  ],
                  [
                    "02",
                    language === "it"
                      ? "Tax line reali"
                      : "Actual tax lines",
                  ],
                  [
                    "03",
                    language === "it"
                      ? "Profilo costi"
                      : "Cost profile",
                  ],
                  [
                    "04",
                    language === "it"
                      ? "COGS economici"
                      : "Economic COGS",
                  ],
                  [
                    "05",
                    language === "it"
                      ? "Profitto economico"
                      : "Economic profit",
                  ],
                ].map(([n, label]) => (
                  <div
                    key={n}
                    style={styles.flowCard}
                  >
                    <div
                      style={styles.flowNumber}
                    >
                      {n}
                    </div>

                    <div
                      style={styles.flowLabel}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {fetcher.data?.ok && (
              <div style={styles.success}>
                {language === "it"
                  ? "Profilo fiscale salvato correttamente. MarginLab userà questa configurazione insieme ai dati fiscali reali Shopify."
                  : "Tax Profile saved successfully. MarginLab will use this configuration together with real Shopify tax data."}
              </div>
            )}

            {fetcher.data?.error && (
              <div style={styles.error}>
                {fetcher.data.error}
              </div>
            )}

            <div style={styles.saveBar}>
              <div>
                <div style={styles.saveTitle}>
                  {language === "it"
                    ? "Salva il profilo fiscale"
                    : "Save Tax Profile"}
                </div>

                <div style={styles.saveText}>
                  {language === "it"
                    ? "Configurazione a livello store disponibile sia su Starter sia su Growth."
                    : "Store-level configuration available on both Starter and Growth."}
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
                {saving
                  ? language === "it"
                    ? "Salvataggio..."
                    : "Saving..."
                  : language === "it"
                    ? "Salva configurazione"
                    : "Save configuration"}
              </button>
            </div>
          </fetcher.Form>
        )}

        <div style={styles.disclaimer}>
          {language === "it"
            ? "Tax Profile serve a migliorare la base economica delle analisi MarginLab. Non sostituisce contabilità, dichiarazioni fiscali o consulenza professionale e non determina automaticamente gli obblighi tributari del merchant."
            : "Tax Profile improves the economic basis used by MarginLab. It does not replace accounting, tax filings or professional tax advice and does not automatically determine the merchant's tax obligations."}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(255,115,60,0.16), transparent 30%), radial-gradient(circle at bottom right, rgba(56,189,248,0.07), transparent 30%), linear-gradient(180deg, #03050a 0%, #070b12 100%)",
    color: "#f3f4f6",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: 32,
    position: "relative",
    overflow: "hidden",
  },
  glowOne: {
    position: "absolute",
    top: -180,
    left: -160,
    width: 420,
    height: 420,
    borderRadius: "50%",
    background: "rgba(255,115,60,0.10)",
    filter: "blur(70px)",
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
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 28,
    padding: "14px 16px",
    borderRadius: 18,
    background: "rgba(8,13,22,0.92)",
    border: "1px solid rgba(255,115,60,0.18)",
  },
  logo: { fontWeight: 950, letterSpacing: 0.5 },
  backBtn: {
    background: "rgba(255,115,60,0.08)",
    border: "1px solid rgba(255,115,60,0.18)",
    color: "#f3f4f6",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
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