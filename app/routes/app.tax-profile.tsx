import * as React from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";

import { authenticate } from "~/shopify.server";
import { getStoredLanguage } from "~/utils/i18n";
import {
  getStoreTaxContext,
  saveStoreTaxProfile,
} from "~/utils/tax-profile.server";

type SupportedRegime =
  | "ITALY_STANDARD"
  | "ITALY_FORFETTARIO"
  | "ITALY_EXEMPT";

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
    value === "ITALY_EXEMPT"
  );
}

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(SHOP_QUERY);
  const json = await response.json();

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
  const json = await response.json();

  if (json?.errors?.length) {
    return Response.json(
      { ok: false, error: "Unable to verify the Shopify tax jurisdiction." },
      { status: 400 },
    );
  }

  const shopCountryCode =
    json?.data?.shop?.billingAddress?.countryCodeV2 ?? "";

  const context = await getStoreTaxContext({
    shop: session.shop,
    shopCountryCode,
  });

  if (!context.isItalianStore) {
    return Response.json(
      {
        ok: false,
        error:
          "Tax Profile configuration is not available for this jurisdiction yet.",
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

  let defaultVatRatePct = parseRate(
    formData.get("defaultVatRatePct"),
    22,
  );
  let pricesIncludeVat = parseBoolean(formData.get("pricesIncludeVat"));
  const costsIncludeVat = parseBoolean(formData.get("costsIncludeVat"));
  let recoverInputVat = parseBoolean(formData.get("recoverInputVat"));
  let shippingIncludeVat = parseBoolean(formData.get("shippingIncludeVat"));
  let shippingVatRatePct = parseRate(
    formData.get("shippingVatRatePct"),
    defaultVatRatePct,
  );

  if (regime === "ITALY_FORFETTARIO") {
    defaultVatRatePct = 0;
    pricesIncludeVat = false;
    recoverInputVat = false;
    shippingIncludeVat = false;
    shippingVatRatePct = 0;
  }

  if (regime === "ITALY_EXEMPT") {
    defaultVatRatePct = 0;
    pricesIncludeVat = false;
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
  const { taxContext } = useLoaderData() as Awaited<ReturnType<typeof loader>>;
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const navigate = useNavigate();
  const language = getStoredLanguage() === "it" ? "it" : "en";

  const [regime, setRegime] = React.useState<SupportedRegime>(
    taxContext.profile === "ITALY_FORFETTARIO" ||
      taxContext.profile === "ITALY_EXEMPT"
      ? taxContext.profile
      : "ITALY_STANDARD",
  );
  const [defaultVatRatePct, setDefaultVatRatePct] = React.useState(
    taxContext.defaultVatRatePct || 22,
  );
  const [pricesIncludeVat, setPricesIncludeVat] = React.useState(
    taxContext.pricesIncludeVat,
  );
  const [costsIncludeVat, setCostsIncludeVat] = React.useState(
    taxContext.costsIncludeVat,
  );
  const [recoverInputVat, setRecoverInputVat] = React.useState(
    taxContext.recoverInputVat,
  );
  const [shippingIncludeVat, setShippingIncludeVat] = React.useState(
    taxContext.shippingIncludeVat,
  );
  const [shippingVatRatePct, setShippingVatRatePct] = React.useState(
    taxContext.shippingVatRatePct || 22,
  );

  const supported = taxContext.isItalianStore;
  const saving = fetcher.state !== "idle";

  React.useEffect(() => {
    if (regime === "ITALY_STANDARD") {
      if (defaultVatRatePct === 0) setDefaultVatRatePct(22);
      if (shippingVatRatePct === 0) setShippingVatRatePct(22);
      return;
    }

    if (regime === "ITALY_FORFETTARIO") {
      setDefaultVatRatePct(0);
      setPricesIncludeVat(false);
      setRecoverInputVat(false);
      setShippingIncludeVat(false);
      setShippingVatRatePct(0);
      return;
    }

    setDefaultVatRatePct(0);
    setPricesIncludeVat(false);
    setShippingIncludeVat(false);
    setShippingVatRatePct(0);
  }, [regime]);

  const regimes = [
    {
      id: "ITALY_STANDARD" as const,
      title: language === "it" ? "Regime ordinario" : "Standard VAT regime",
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
      id: "ITALY_FORFETTARIO" as const,
      title:
        language === "it" ? "Regime forfettario" : "Flat-rate tax regime",
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
      id: "ITALY_EXEMPT" as const,
      title: language === "it" ? "Operazioni esenti" : "VAT-exempt activity",
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

  const rateOptions = [4, 5, 10, 22];

  return (
    <div style={styles.page}>
      <div style={styles.glowOne} />
      <div style={styles.glowTwo} />

      <div style={styles.container}>
        <div style={styles.topBar}>
          <div style={styles.logo}>
            MARGIN<span style={{ color: "#ff5a36" }}>LAB</span>
          </div>

          <button
            type="button"
            style={styles.backBtn}
            onClick={() => navigate("/app")}
          >
            {language === "it" ? "Torna alla dashboard" : "Back to dashboard"}
          </button>
        </div>

        <section style={styles.hero}>
          <div>
            <div style={styles.badge}>
              <span style={styles.badgeDot} />
              {language === "it" ? "PROFILO FISCALE" : "TAX PROFILE"}
            </div>

            <h1 style={styles.title}>
              {language === "it"
                ? "Configura come MarginLab interpreta imposte, prezzi e costi."
                : "Configure how MarginLab interprets taxes, prices and costs."}
            </h1>

            <p style={styles.subtitle}>
              {language === "it"
                ? "Una configurazione a livello store, disponibile sia su Starter sia su Growth, progettata per alimentare analisi di redditività fiscalmente più coerenti."
                : "A store-level configuration available on both Starter and Growth, designed to power more tax-aware profitability analysis."}
            </p>
          </div>

          <div style={styles.statusCard}>
            <div style={styles.kicker}>
              {language === "it" ? "GIURISDIZIONE" : "JURISDICTION"}
            </div>

            <div style={styles.countryRow}>
              <div style={styles.countryBadge}>
                {taxContext.effectiveCountryCode || "—"}
              </div>
              <div>
                <div style={styles.countryTitle}>
                  {taxContext.effectiveCountryCode === "IT"
                    ? language === "it"
                      ? "Italia"
                      : "Italy"
                    : taxContext.effectiveCountryCode || "Unknown"}
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
                  {language === "it" ? "Stato" : "Status"}
                </div>
                <div
                  style={{
                    ...styles.miniValue,
                    color: taxContext.configured ? "#4ade80" : "#f59e0b",
                  }}
                >
                  {taxContext.configured
                    ? language === "it"
                      ? "Configurato"
                      : "Configured"
                    : language === "it"
                      ? "Da completare"
                      : "Incomplete"}
                </div>
              </div>

              <div style={styles.miniCard}>
                <div style={styles.miniLabel}>
                  {language === "it" ? "Supporto" : "Support"}
                </div>
                <div style={styles.miniValue}>
                  {supported
                    ? language === "it"
                      ? "Disponibile"
                      : "Available"
                    : language === "it"
                      ? "In arrivo"
                      : "Coming later"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {!supported ? (
          <section style={styles.section}>
            <div style={styles.kicker}>
              {language === "it"
                ? "PAESE NON ANCORA SUPPORTATO"
                : "COUNTRY NOT YET SUPPORTED"}
            </div>
            <div style={styles.sectionTitle}>
              {language === "it"
                ? "Tax Profile è già pronto per espandersi ad altre giurisdizioni."
                : "Tax Profile is already structured for additional jurisdictions."}
            </div>
            <p style={styles.sectionText}>
              {language === "it"
                ? "MarginLab continua a usare i calcoli attuali senza trasformazioni fiscali. Il supporto specifico per questo paese potrà essere aggiunto successivamente."
                : "MarginLab continues using the current calculations without tax transformations. Country-specific support can be added later."}
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
                {language === "it" ? "1 · REGIME FISCALE" : "1 · TAX REGIME"}
              </div>
              <div style={styles.sectionTitle}>
                {language === "it"
                  ? "Come opera fiscalmente lo store?"
                  : "How does the store operate for tax purposes?"}
              </div>
              <p style={styles.sectionText}>
                {language === "it"
                  ? "Shopify può rilevare il paese, ma non il regime fiscale. Questa scelta deve essere confermata dal merchant."
                  : "Shopify can detect the country, but not the merchant's tax regime. The merchant must confirm this setting."}
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
                {language === "it"
                  ? "2 · CONFIGURAZIONE IVA"
                  : "2 · VAT CONFIGURATION"}
              </div>
              <div style={styles.sectionTitle}>
                {language === "it"
                  ? "Definisci la base economica di prezzi e costi"
                  : "Define the economic basis of prices and costs"}
              </div>

              {regime === "ITALY_STANDARD" ? (
                <>
                  <div style={styles.rateRow}>
                    <div>
                      <div style={styles.fieldLabel}>
                        {language === "it"
                          ? "Aliquota IVA predefinita"
                          : "Default VAT rate"}
                      </div>
                      <div style={styles.fieldText}>
                        {language === "it"
                          ? "Fallback quando non è disponibile un'aliquota più specifica."
                          : "Fallback when a more specific tax rate is unavailable."}
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
                      label={
                        language === "it"
                          ? "Prezzi Shopify IVA inclusa"
                          : "Shopify prices include VAT"
                      }
                      description={
                        language === "it"
                          ? "I prezzi vendita analizzati comprendono già l'IVA."
                          : "Analyzed selling prices already include VAT."
                      }
                    />

                    <Toggle
                      checked={costsIncludeVat}
                      onChange={setCostsIncludeVat}
                      label={
                        language === "it"
                          ? "COGS Shopify IVA inclusa"
                          : "Shopify COGS include VAT"
                      }
                      description={
                        language === "it"
                          ? "I costi unitari salvati in Shopify comprendono l'IVA."
                          : "Unit costs stored in Shopify include VAT."
                      }
                    />

                    <Toggle
                      checked={recoverInputVat}
                      onChange={setRecoverInputVat}
                      label={
                        language === "it"
                          ? "IVA sui costi recuperabile"
                          : "Input VAT recoverable"
                      }
                      description={
                        language === "it"
                          ? "Consente al motore economico di scorporare l'IVA recuperabile dai costi."
                          : "Allows the economic engine to remove recoverable input VAT from costs."
                      }
                    />
                  </div>
                </>
              ) : (
                <div style={styles.notice}>
                  {language === "it"
                    ? "Per questo regime l'IVA sulle vendite viene impostata a 0% nel profilo MarginLab. Il trattamento dei costi rimane configurabile."
                    : "For this regime, output VAT is set to 0% in MarginLab. Cost treatment remains configurable."}
                </div>
              )}

              {regime !== "ITALY_STANDARD" && (
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
                        ? "Questa informazione resta utile anche quando le vendite non espongono IVA."
                        : "This remains useful even when sales do not carry output VAT."
                    }
                  />
                </div>
              )}
            </section>

            <section style={styles.section}>
              <div style={styles.kicker}>
                {language === "it" ? "3 · SPEDIZIONI" : "3 · SHIPPING"}
              </div>
              <div style={styles.sectionTitle}>
                {language === "it"
                  ? "Trattamento fiscale dei ricavi da spedizione"
                  : "Tax treatment of shipping revenue"}
              </div>

              {regime === "ITALY_STANDARD" ? (
                <div style={styles.shippingGrid}>
                  <Toggle
                    checked={shippingIncludeVat}
                    onChange={setShippingIncludeVat}
                    label={
                      language === "it"
                        ? "Spedizione addebitata IVA inclusa"
                        : "Shipping charge includes VAT"
                    }
                    description={
                      language === "it"
                        ? "Il prezzo di spedizione pagato dal cliente comprende già IVA."
                        : "The customer-paid shipping charge already includes VAT."
                    }
                  />

                  <div style={styles.ratePanel}>
                    <div style={styles.fieldLabel}>
                      {language === "it"
                        ? "Aliquota spedizione"
                        : "Shipping VAT rate"}
                    </div>
                    <div style={{ ...styles.rateButtons, marginTop: 12 }}>
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
                  {language === "it"
                    ? "Nel preset selezionato la spedizione non viene trattata come ricavo soggetto a IVA."
                    : "In the selected preset, shipping is not treated as VAT-bearing revenue."}
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
                  ? "La struttura che useremo nel motore fiscale"
                  : "The structure the tax engine will use"}
              </div>

              <div style={styles.flowGrid}>
                {[
                  ["01", language === "it" ? "Vendite lorde" : "Gross sales"],
                  ["02", language === "it" ? "Componente fiscale" : "Tax component"],
                  ["03", language === "it" ? "Ricavi netti" : "Net revenue"],
                  ["04", language === "it" ? "COGS netti" : "Net COGS"],
                  ["05", language === "it" ? "Margine" : "Margin"],
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
                {language === "it"
                  ? "Profilo fiscale salvato correttamente. I calcoli economici non sono ancora stati modificati."
                  : "Tax Profile saved successfully. Economic calculations have not been changed yet."}
              </div>
            )}

            {fetcher.data?.error && (
              <div style={styles.error}>{fetcher.data.error}</div>
            )}

            <div style={styles.saveBar}>
              <div>
                <div style={styles.saveTitle}>
                  {language === "it"
                    ? "Salva il Tax Profile"
                    : "Save Tax Profile"}
                </div>
                <div style={styles.saveText}>
                  {language === "it"
                    ? "Configurazione dello store disponibile sia su Starter sia su Growth."
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
            ? "Tax Profile serve a migliorare la base economica delle analisi MarginLab. Non sostituisce contabilità, liquidazioni IVA o consulenza fiscale e non determina automaticamente gli obblighi tributari del merchant."
            : "Tax Profile improves the economic basis used by MarginLab. It does not replace accounting, VAT filings or tax advice and does not automatically determine the merchant's tax obligations."}
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