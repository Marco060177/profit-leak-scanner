import * as React from "react";
import { useNavigate } from "react-router";

import DashboardNav from "~/components/dashboard/DashboardNav";
import { useI18n } from "~/components/i18n/I18nProvider";
import { en } from "~/locales/en";
import { it } from "~/locales/it";

import "~/styles/dashboard.css";

type GlossaryCategory =
  | "profit"
  | "costs"
  | "products"
  | "recovery"
  | "forecast"
  | "actions"
  | "scores"
  | "tax"
  | "data";

type GlossaryTerm = {
  id: string;
  term: string;
  category: GlossaryCategory;
  related?: string[];
};

const CATEGORY_CONFIG: Record<
  GlossaryCategory,
  {
    color: string;
    background: string;
    border: string;
  }
> = {
  profit: {
    color: "#4ade80",
    background: "rgba(34,197,94,0.09)",
    border: "rgba(34,197,94,0.22)",
  },
  costs: {
    color: "#f59e0b",
    background: "rgba(245,158,11,0.09)",
    border: "rgba(245,158,11,0.22)",
  },
  products: {
    color: "#fb7185",
    background: "rgba(251,113,133,0.09)",
    border: "rgba(251,113,133,0.22)",
  },
  recovery: {
    color: "#38bdf8",
    background: "rgba(56,189,248,0.09)",
    border: "rgba(56,189,248,0.22)",
  },
  forecast: {
    color: "#a78bfa",
    background: "rgba(167,139,250,0.09)",
    border: "rgba(167,139,250,0.22)",
  },
  actions: {
    color: "#ff8a5c",
    background: "rgba(255,115,60,0.09)",
    border: "rgba(255,115,60,0.22)",
  },
  scores: {
    color: "#c084fc",
    background: "rgba(192,132,252,0.09)",
    border: "rgba(192,132,252,0.22)",
  },
  tax: {
    color: "#2dd4bf",
    background: "rgba(45,212,191,0.09)",
    border: "rgba(45,212,191,0.22)",
  },
  data: {
    color: "#94a3b8",
    background: "rgba(148,163,184,0.09)",
    border: "rgba(148,163,184,0.20)",
  },
};

const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "action-score",
    term: "Action Score",
    category: "scores",
    related: ["Priority","Profit Action Center"],
  },
  {
    id: "annual-impact",
    term: "Annual Impact",
    category: "recovery",
  },
  {
    id: "annual-net-profit",
    term: "Annual Net Profit",
    category: "profit",
  },
  {
    id: "average-margin",
    term: "Average Margin",
    category: "profit",
  },
  {
    id: "baseline",
    term: "Baseline",
    category: "data",
  },
  {
    id: "break-even-price",
    term: "Break-even Price",
    category: "profit",
  },
  {
    id: "break-even-revenue",
    term: "Break-even Revenue",
    category: "profit",
  },
  {
    id: "business-tax-reserve",
    term: "Business Tax Reserve",
    category: "tax",
  },
  {
    id: "cogs",
    term: "COGS",
    category: "costs",
  },
  {
    id: "cogs-coverage",
    term: "COGS Coverage",
    category: "data",
  },
  {
    id: "commercial-risk",
    term: "Commercial Risk",
    category: "scores",
  },
  {
    id: "confidence",
    term: "Confidence",
    category: "scores",
  },
  {
    id: "contribution-margin",
    term: "Contribution Margin",
    category: "profit",
  },
  {
    id: "cumulative-profit",
    term: "Cumulative Profit",
    category: "forecast",
  },
  {
    id: "cumulative-profit-lift",
    term: "Cumulative Profit Lift",
    category: "forecast",
  },
  {
    id: "data-quality",
    term: "Data Quality",
    category: "scores",
  },
  {
    id: "default-tax-rate",
    term: "Default Tax Rate",
    category: "tax",
  },
  {
    id: "discount-exposure",
    term: "Discount Exposure",
    category: "profit",
  },
  {
    id: "economic-cogs",
    term: "Economic COGS",
    category: "costs",
  },
  {
    id: "economic-margin",
    term: "Economic Margin",
    category: "profit",
  },
  {
    id: "economic-profit",
    term: "Economic Profit",
    category: "profit",
  },
  {
    id: "economic-revenue",
    term: "Economic Revenue",
    category: "profit",
  },
  {
    id: "estimated-profit-model",
    term: "Estimated Profit Model",
    category: "profit",
  },
  {
    id: "estimated-timing",
    term: "Estimated Timing",
    category: "forecast",
  },
  {
    id: "fixed-costs",
    term: "Fixed Costs",
    category: "costs",
  },
  {
    id: "forecast-health",
    term: "Forecast Health",
    category: "forecast",
  },
  {
    id: "gross-margin",
    term: "Gross Margin",
    category: "profit",
  },
  {
    id: "gross-profit",
    term: "Gross Profit",
    category: "profit",
  },
  {
    id: "input-tax-recovery",
    term: "Input Tax Recovery",
    category: "tax",
  },
  {
    id: "low-margin-product",
    term: "Low-Margin Product",
    category: "products",
  },
  {
    id: "margin-deterioration",
    term: "Margin Deterioration",
    category: "profit",
  },
  {
    id: "margin-improvement",
    term: "Margin Improvement",
    category: "forecast",
  },
  {
    id: "missing-cost",
    term: "Missing Cost",
    category: "data",
  },
  {
    id: "model-health",
    term: "Model Health",
    category: "scores",
  },
  {
    id: "monthly-net-profit",
    term: "Monthly Net Profit",
    category: "profit",
  },
  {
    id: "monthly-profit-gap",
    term: "Monthly Profit Gap to Target",
    category: "recovery",
  },
  {
    id: "net-margin",
    term: "Net Margin",
    category: "profit",
  },
  {
    id: "net-monthly-recovery",
    term: "Net Monthly Recovery",
    category: "recovery",
  },
  {
    id: "opportunity",
    term: "Opportunity",
    category: "actions",
  },
  {
    id: "priority",
    term: "Priority",
    category: "actions",
  },
  {
    id: "profit-action-center",
    term: "Profit Action Center",
    category: "actions",
  },
  {
    id: "profit-health",
    term: "Profit Health",
    category: "scores",
  },
  {
    id: "profit-leak",
    term: "Profit Leak",
    category: "profit",
  },
  {
    id: "recoverable-profit",
    term: "Recoverable Profit",
    category: "recovery",
  },
  {
    id: "recovery-opportunities-captured",
    term: "Recovery Opportunities Captured",
    category: "forecast",
  },
  {
    id: "refund-exposure",
    term: "Refund Exposure",
    category: "profit",
  },
  {
    id: "revenue-growth",
    term: "Revenue Growth",
    category: "forecast",
  },
  {
    id: "scenario",
    term: "Scenario",
    category: "forecast",
  },
  {
    id: "tax-aware-economic-basis",
    term: "Tax-aware Economic Basis",
    category: "tax",
  },
  {
    id: "tax-lines",
    term: "Tax Lines",
    category: "tax",
  },
  {
    id: "target-margin",
    term: "Target Margin",
    category: "profit",
  },
  {
    id: "variable-fees",
    term: "Variable Fees",
    category: "costs",
  },
  {
    id: "weak-best-seller",
    term: "Weak Best Seller",
    category: "products",
  },
];

const FRENCH_GLOSSARY_TERMS: Record<string, string> = {
  "action-score": "Score d'action", "annual-impact": "Impact annuel", "annual-net-profit": "Bénéfice net annuel", "average-margin": "Marge moyenne", baseline: "Référence", "break-even-price": "Prix d'équilibre", "break-even-revenue": "Chiffre d'affaires à l'équilibre", "business-tax-reserve": "Réserve fiscale du modèle", cogs: "COGS", "cogs-coverage": "Couverture COGS", "commercial-risk": "Risque commercial", confidence: "Confiance", "contribution-margin": "Marge sur coûts variables", "cumulative-profit": "Bénéfice cumulé", "cumulative-profit-lift": "Gain de bénéfice cumulé", "data-quality": "Qualité des données", "default-tax-rate": "Taux d'imposition par défaut", "discount-exposure": "Exposition aux remises", "economic-cogs": "COGS économique", "economic-margin": "Marge économique", "economic-profit": "Bénéfice économique", "economic-revenue": "Chiffre d'affaires économique", "estimated-profit-model": "Modèle de bénéfice estimé", "estimated-timing": "Délai estimé", "fixed-costs": "Coûts fixes", "forecast-health": "Santé de la prévision", "gross-margin": "Marge brute", "gross-profit": "Bénéfice brut", "input-tax-recovery": "Récupération de la taxe sur les achats", "low-margin-product": "Produit à faible marge", "margin-deterioration": "Détérioration de la marge", "margin-improvement": "Amélioration de la marge", "missing-cost": "Coût manquant", "model-health": "Santé du modèle", "monthly-net-profit": "Bénéfice net mensuel", "monthly-profit-gap-to-target": "Écart mensuel de bénéfice par rapport à l'objectif", "net-margin": "Marge nette", "net-monthly-recovery": "Récupération mensuelle nette", opportunity: "Opportunité", priority: "Priorité", "profit-action-center": "Profit Action Center", "profit-health": "Santé du bénéfice", "profit-leak": "Fuite de bénéfice", "recoverable-profit": "Bénéfice récupérable", "recovery-opportunities-captured": "Opportunités de récupération exploitées", "refund-exposure": "Exposition aux remboursements", "revenue-growth": "Croissance du chiffre d'affaires", scenario: "Scénario", "tax-aware-economic-basis": "Base économique tenant compte de la fiscalité", "tax-lines": "Lignes fiscales", "target-margin": "Marge cible", "variable-fees": "Frais variables", "weak-best-seller": "Best-seller à faible rentabilité",
};

const GERMAN_GLOSSARY_TERMS: Record<string, string> = {
  "action-score": "Aktionsbewertung", "annual-impact": "Jährliche Auswirkung", "annual-net-profit": "Jährlicher Nettogewinn", "average-margin": "Durchschnittsmarge", baseline: "Ausgangswert", "break-even-price": "Break-even-Preis", "break-even-revenue": "Break-even-Umsatz", "business-tax-reserve": "Steuerrücklage des Modells", cogs: "COGS", "cogs-coverage": "COGS-Abdeckung", "commercial-risk": "Geschäftsrisiko", confidence: "Konfidenz", "contribution-margin": "Deckungsbeitrag", "cumulative-profit": "Kumulierter Gewinn", "cumulative-profit-lift": "Kumulierter Gewinnzuwachs", "data-quality": "Datenqualität", "default-tax-rate": "Standardsteuersatz", "discount-exposure": "Rabattbelastung", "economic-cogs": "Wirtschaftliche COGS", "economic-margin": "Wirtschaftliche Marge", "economic-profit": "Wirtschaftlicher Gewinn", "economic-revenue": "Wirtschaftlicher Umsatz", "estimated-profit-model": "Geschätztes Gewinnmodell", "estimated-timing": "Geschätzter Zeitrahmen", "fixed-costs": "Fixkosten", "forecast-health": "Prognosequalität", "gross-margin": "Bruttomarge", "gross-profit": "Bruttogewinn", "input-tax-recovery": "Vorsteuerabzug", "low-margin-product": "Produkt mit niedriger Marge", "margin-deterioration": "Margenverschlechterung", "margin-improvement": "Margenverbesserung", "missing-cost": "Fehlende Kosten", "model-health": "Modellqualität", "monthly-net-profit": "Monatlicher Nettogewinn", "monthly-profit-gap": "Monatliche Gewinnlücke zum Zielwert", "net-margin": "Nettomarge", "net-monthly-recovery": "Monatlicher Nettogewinnzuwachs", opportunity: "Chance", priority: "Priorität", "profit-action-center": "Profit Action Center", "profit-health": "Gewinnlage", "profit-leak": "Gewinnverlust", "recoverable-profit": "Realisierbarer Gewinn", "recovery-opportunities-captured": "Genutzte Gewinnpotenziale", "refund-exposure": "Erstattungsbelastung", "revenue-growth": "Umsatzwachstum", scenario: "Szenario", "tax-aware-economic-basis": "Steuerberücksichtigte wirtschaftliche Basis", "tax-lines": "Steuerpositionen", "target-margin": "Zielmarge", "variable-fees": "Variable Gebühren", "weak-best-seller": "Margenschwacher Bestseller",
};

const SPANISH_GLOSSARY_TERMS: Record<string, string> = {
  "action-score": "Puntuación de acción", "annual-impact": "Impacto anual", "annual-net-profit": "Beneficio neto anual", "average-margin": "Margen medio", baseline: "Referencia", "break-even-price": "Precio de equilibrio", "break-even-revenue": "Ingresos de equilibrio", "business-tax-reserve": "Reserva fiscal del modelo", cogs: "COGS", "cogs-coverage": "Cobertura de COGS", "commercial-risk": "Riesgo comercial", confidence: "Confianza", "contribution-margin": "Margen de contribución", "cumulative-profit": "Beneficio acumulado", "cumulative-profit-lift": "Aumento acumulado del beneficio", "data-quality": "Calidad de datos", "default-tax-rate": "Tipo impositivo predeterminado", "discount-exposure": "Exposición a descuentos", "economic-cogs": "COGS económicos", "economic-margin": "Margen económico", "economic-profit": "Beneficio económico", "economic-revenue": "Ingresos económicos", "estimated-profit-model": "Modelo de beneficio estimado", "estimated-timing": "Plazo estimado", "fixed-costs": "Costes fijos", "forecast-health": "Estado de la previsión", "gross-margin": "Margen bruto", "gross-profit": "Beneficio bruto", "input-tax-recovery": "Recuperación del impuesto soportado", "low-margin-product": "Producto con margen bajo", "margin-deterioration": "Deterioro del margen", "margin-improvement": "Mejora del margen", "missing-cost": "Coste faltante", "model-health": "Estado del modelo", "monthly-net-profit": "Beneficio neto mensual", "monthly-profit-gap": "Diferencia mensual de beneficio respecto al objetivo", "net-margin": "Margen neto", "net-monthly-recovery": "Recuperación mensual neta", opportunity: "Oportunidad", priority: "Prioridad", "profit-action-center": "Profit Action Center", "profit-health": "Estado del beneficio", "profit-leak": "Fuga de beneficio", "recoverable-profit": "Beneficio recuperable", "recovery-opportunities-captured": "Oportunidades de recuperación aprovechadas", "refund-exposure": "Exposición a reembolsos", "revenue-growth": "Crecimiento de ingresos", scenario: "Escenario", "tax-aware-economic-basis": "Base económica con fiscalidad integrada", "tax-lines": "Líneas fiscales", "target-margin": "Margen objetivo", "variable-fees": "Comisiones variables", "weak-best-seller": "Producto superventas con margen débil",
};

const PORTUGUESE_BRAZIL_GLOSSARY_TERMS: Record<string, string> = {
  "action-score": "Pontuação de ação", "annual-impact": "Impacto anual", "annual-net-profit": "Lucro líquido anual", "average-margin": "Margem média", baseline: "Referência", "break-even-price": "Preço de equilíbrio", "break-even-revenue": "Receita de equilíbrio", "business-tax-reserve": "Reserva fiscal do modelo", cogs: "COGS", "cogs-coverage": "Cobertura de COGS", "commercial-risk": "Risco comercial", confidence: "Confiança", "contribution-margin": "Margem de contribuição", "cumulative-profit": "Lucro acumulado", "cumulative-profit-lift": "Aumento acumulado do lucro", "data-quality": "Qualidade dos dados", "default-tax-rate": "Alíquota padrão", "discount-exposure": "Exposição a descontos", "economic-cogs": "COGS econômico", "economic-margin": "Margem econômica", "economic-profit": "Lucro econômico", "economic-revenue": "Receita econômica", "estimated-profit-model": "Modelo de lucro estimado", "estimated-timing": "Prazo estimado", "fixed-costs": "Custos fixos", "forecast-health": "Saúde da previsão", "gross-margin": "Margem bruta", "gross-profit": "Lucro bruto", "input-tax-recovery": "Recuperação de impostos sobre compras", "low-margin-product": "Produto com margem baixa", "margin-deterioration": "Deterioração da margem", "margin-improvement": "Melhoria da margem", "missing-cost": "Custo não informado", "model-health": "Saúde do modelo", "monthly-net-profit": "Lucro líquido mensal", "monthly-profit-gap": "Diferença mensal de lucro em relação à meta", "net-margin": "Margem líquida", "net-monthly-recovery": "Recuperação mensal líquida", opportunity: "Oportunidade", priority: "Prioridade", "profit-action-center": "Profit Action Center", "profit-health": "Saúde do lucro", "profit-leak": "Vazamento de lucro", "recoverable-profit": "Lucro recuperável", "recovery-opportunities-captured": "Oportunidades de recuperação capturadas", "refund-exposure": "Exposição a reembolsos", "revenue-growth": "Crescimento da receita", scenario: "Cenário", "tax-aware-economic-basis": "Base econômica com impacto fiscal", "tax-lines": "Linhas fiscais", "target-margin": "Margem-alvo", "variable-fees": "Taxas variáveis", "weak-best-seller": "Produto campeão de vendas com margem baixa",
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function GlossaryPage() {
  const navigate = useNavigate();
  const { language, messages } = useI18n();
  const copy = messages.glossary;
  const termCopy = copy.terms as Record<
    string,
    { short: string; detail: string }
  >;
  const englishTerms = en.glossary.terms as Record<
    string,
    { short: string; detail: string }
  >;
  const italianTerms = it.glossary.terms as Record<
    string,
    { short: string; detail: string }
  >;

  const [query, setQuery] = React.useState("");
  const [category, setCategory] =
    React.useState<GlossaryCategory | "all">("all");
  const [expandedId, setExpandedId] =
    React.useState<string | null>(null);
  const displayTerm = React.useCallback(
    (item: GlossaryTerm) => language === "fr"
      ? FRENCH_GLOSSARY_TERMS[item.id] ?? item.term
      : language === "de"
        ? GERMAN_GLOSSARY_TERMS[item.id] ?? item.term
        : language === "es"
          ? SPANISH_GLOSSARY_TERMS[item.id] ?? item.term
        : language === "pt-BR"
          ? PORTUGUESE_BRAZIL_GLOSSARY_TERMS[item.id] ?? item.term
        : item.term,
    [language],
  );

  const filteredTerms = React.useMemo(() => {
    const normalizedQuery = normalize(query.trim());

    return [...GLOSSARY_TERMS]
      .filter((item) => {
        if (category !== "all" && item.category !== category) {
          return false;
        }

        if (!normalizedQuery) return true;

        const searchable = normalize(
          [
            displayTerm(item),
            italianTerms[item.id].short,
            englishTerms[item.id].short,
            italianTerms[item.id].detail,
            englishTerms[item.id].detail,
            ...(item.related ?? []),
          ].join(" "),
        );

        return searchable.includes(normalizedQuery);
      })
      .sort((a, b) => displayTerm(a).localeCompare(displayTerm(b)));
  }, [query, category, displayTerm, englishTerms, italianTerms]);

  const alphabet = React.useMemo(
    () =>
      Array.from(
        new Set(
          GLOSSARY_TERMS.map((item) =>
            displayTerm(item).charAt(0).toUpperCase(),
          ),
        ),
      ).sort(),
    [displayTerm],
  );

  const scrollToLetter = (letter: string) => {
    const first = filteredTerms.find(
      (item) => displayTerm(item).charAt(0).toUpperCase() === letter,
    );

    if (!first) return;

    document
      .getElementById(`glossary-${first.id}`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  };

  const categoryEntries = Object.entries(
    CATEGORY_CONFIG,
  ) as Array<
    [
      GlossaryCategory,
      (typeof CATEGORY_CONFIG)[GlossaryCategory],
    ]
  >;

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="glossary" navigate={navigate} />

        <section
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 32,
            padding: 34,
            background:
              "radial-gradient(circle at 12% 12%, rgba(255,115,60,0.16), transparent 34%), radial-gradient(circle at 88% 15%, rgba(124,58,237,0.15), transparent 34%), linear-gradient(135deg, rgba(16,23,37,0.99), rgba(6,11,20,0.99))",
            border: "1px solid rgba(255,115,60,0.24)",
            boxShadow:
              "0 28px 90px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.035)",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 300,
              height: 300,
              borderRadius: "50%",
              right: -120,
              bottom: -170,
              background: "rgba(124,58,237,0.14)",
              filter: "blur(30px)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "1.3fr 0.7fr",
              gap: 28,
              alignItems: "end",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 999,
                  color: "#ff9a70",
                  background: "rgba(255,115,60,0.09)",
                  border: "1px solid rgba(255,115,60,0.22)",
                  fontSize: 10,
                  fontWeight: 950,
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#ff7346",
                    boxShadow: "0 0 12px rgba(255,115,70,0.8)",
                  }}
                />
                {copy.knowledgeBase}
              </div>

              <h1
                style={{
                  margin: "19px 0 0",
                  maxWidth: 850,
                  color: "#f8fafc",
                  fontSize: 46,
                  lineHeight: 1.05,
                  fontWeight: 950,
                  letterSpacing: "-0.055em",
                }}
              >
                {copy.heroTitle}
              </h1>

              <p
                style={{
                  margin: "16px 0 0",
                  maxWidth: 820,
                  color: "rgba(255,255,255,0.64)",
                  fontSize: 15,
                  lineHeight: 1.7,
                  fontWeight: 700,
                }}
              >
                {copy.heroDescription}
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 11,
              }}
            >
              {[
                {
                  value: GLOSSARY_TERMS.length,
                  label: copy.statsTerms,
                },
                {
                  value: categoryEntries.length,
                  label: copy.statsAreas,
                },
                {
                  value: 6,
                  label: copy.statsLanguages,
                },
                {
                  value: "100%",
                  label: copy.statsMarginLab,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: 17,
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.035)",
                    border:
                      "1px solid rgba(255,255,255,0.075)",
                  }}
                >
                  <div
                    style={{
                      color: "#f8fafc",
                      fontSize: 23,
                      fontWeight: 950,
                    }}
                  >
                    {item.value}
                  </div>

                  <div
                    style={{
                      marginTop: 5,
                      color: "rgba(255,255,255,0.42)",
                      fontSize: 9,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.10em",
                    }}
                  >
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            marginTop: 22,
            padding: 22,
            borderRadius: 25,
            background:
              "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
            border: "1px solid rgba(255,115,60,0.18)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr auto",
              gap: 18,
              alignItems: "center",
            }}
          >
            <div
              style={{
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 16,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "rgba(255,255,255,0.34)",
                  fontSize: 18,
                }}
              >
                ⌕
              </span>

              <input
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder={copy.searchPlaceholder}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  minHeight: 52,
                  padding: "0 18px 0 46px",
                  borderRadius: 16,
                  outline: "none",
                  color: "#f8fafc",
                  background: "rgba(255,255,255,0.035)",
                  border:
                    "1px solid rgba(255,115,60,0.20)",
                  fontSize: 14,
                  fontWeight: 800,
                }}
              />
            </div>

            <div
              style={{
                color: "rgba(255,255,255,0.46)",
                fontSize: 11,
                fontWeight: 850,
                whiteSpace: "nowrap",
              }}
            >
              {filteredTerms.length}{" "}
              {copy.results}
            </div>
          </div>

          <div
            style={{
              marginTop: 15,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => setCategory("all")}
              style={{
                padding: "9px 12px",
                borderRadius: 999,
                cursor: "pointer",
                color:
                  category === "all"
                    ? "#fff"
                    : "rgba(255,255,255,0.55)",
                background:
                  category === "all"
                    ? "rgba(255,115,60,0.16)"
                    : "rgba(255,255,255,0.03)",
                border:
                  category === "all"
                    ? "1px solid rgba(255,115,60,0.38)"
                    : "1px solid rgba(255,255,255,0.07)",
                fontSize: 10,
                fontWeight: 900,
              }}
            >
              {copy.all}
            </button>

            {categoryEntries.map(([key, config]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                style={{
                  padding: "9px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  color:
                    category === key
                      ? config.color
                      : "rgba(255,255,255,0.52)",
                  background:
                    category === key
                      ? config.background
                      : "rgba(255,255,255,0.03)",
                  border:
                    category === key
                      ? `1px solid ${config.border}`
                      : "1px solid rgba(255,255,255,0.07)",
                  fontSize: 10,
                  fontWeight: 900,
                }}
              >
                {copy.categories[key]}
              </button>
            ))}
          </div>
        </section>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            gap: 7,
            flexWrap: "wrap",
          }}
        >
          {alphabet.map((letter) => {
            const available = filteredTerms.some(
              (item) =>
                displayTerm(item).charAt(0).toUpperCase() === letter,
            );

            return (
              <button
                key={letter}
                type="button"
                disabled={!available}
                onClick={() => scrollToLetter(letter)}
                style={{
                  width: 34,
                  height: 34,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 10,
                  cursor: available
                    ? "pointer"
                    : "default",
                  color: available
                    ? "#f8fafc"
                    : "rgba(255,255,255,0.18)",
                  background: available
                    ? "rgba(255,255,255,0.035)"
                    : "rgba(255,255,255,0.015)",
                  border:
                    "1px solid rgba(255,255,255,0.065)",
                  fontSize: 11,
                  fontWeight: 950,
                }}
              >
                {letter}
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(360px,1fr))",
            gap: 14,
          }}
        >
          {filteredTerms.map((item) => {
            const config =
              CATEGORY_CONFIG[item.category];
            const expanded = expandedId === item.id;

            return (
              <article
                id={`glossary-${item.id}`}
                key={item.id}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  padding: 20,
                  borderRadius: 21,
                  background: expanded
                    ? `radial-gradient(circle at top right, ${config.background}, transparent 45%), linear-gradient(180deg, rgba(16,23,37,0.99), rgba(7,12,21,0.99))`
                    : "linear-gradient(180deg, rgba(16,23,37,0.97), rgba(7,12,21,0.99))",
                  border: expanded
                    ? `1px solid ${config.border}`
                    : "1px solid rgba(255,255,255,0.07)",
                  transition:
                    "border-color 180ms ease, transform 180ms ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "inline-flex",
                        padding: "6px 8px",
                        borderRadius: 999,
                        color: config.color,
                        background: config.background,
                        border: `1px solid ${config.border}`,
                        fontSize: 8,
                        lineHeight: 1,
                        fontWeight: 950,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {copy.categories[item.category]}
                    </div>

                    <h2
                      style={{
                        margin: "11px 0 0",
                        color: "#f8fafc",
                        fontSize: 19,
                        lineHeight: 1.25,
                        fontWeight: 950,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {displayTerm(item)}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(
                        expanded ? null : item.id,
                      )
                    }
                    aria-label={
                      expanded
                        ? copy.collapse
                        : copy.expand
                    }
                    style={{
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      borderRadius: 11,
                      cursor: "pointer",
                      color: expanded
                        ? config.color
                        : "rgba(255,255,255,0.52)",
                      background: expanded
                        ? config.background
                        : "rgba(255,255,255,0.035)",
                      border: expanded
                        ? `1px solid ${config.border}`
                        : "1px solid rgba(255,255,255,0.07)",
                      fontSize: 17,
                      fontWeight: 900,
                    }}
                  >
                    {expanded ? "−" : "+"}
                  </button>
                </div>

                <p
                  style={{
                    margin: "13px 0 0",
                    color: "rgba(255,255,255,0.70)",
                    fontSize: 13,
                    lineHeight: 1.6,
                    fontWeight: 760,
                  }}
                >
                  {termCopy[item.id].short}
                </p>

                {expanded && (
                  <div
                    style={{
                      marginTop: 15,
                      paddingTop: 15,
                      borderTop:
                        "1px solid rgba(255,255,255,0.065)",
                    }}
                  >
                    <div
                      style={{
                        color: config.color,
                        fontSize: 9,
                        fontWeight: 950,
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                      }}
                    >
                      {copy.howMarginLabUsesIt}
                    </div>

                    <p
                      style={{
                        margin: "8px 0 0",
                        color:
                          "rgba(255,255,255,0.58)",
                        fontSize: 12,
                        lineHeight: 1.65,
                        fontWeight: 720,
                      }}
                    >
                      {termCopy[item.id].detail}
                    </p>

                    {item.related &&
                      item.related.length > 0 && (
                        <div
                          style={{
                            marginTop: 13,
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          {item.related.map((related) => (
                            <span
                              key={related}
                              style={{
                                padding: "6px 8px",
                                borderRadius: 999,
                                color:
                                  "rgba(255,255,255,0.48)",
                                background:
                                  "rgba(255,255,255,0.025)",
                                border:
                                  "1px solid rgba(255,255,255,0.06)",
                                fontSize: 9,
                                fontWeight: 800,
                              }}
                            >
                              {related}
                            </span>
                          ))}
                        </div>
                      )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {filteredTerms.length === 0 && (
          <div
            style={{
              marginTop: 20,
              padding: 38,
              borderRadius: 22,
              textAlign: "center",
              background: "rgba(255,255,255,0.025)",
              border:
                "1px dashed rgba(255,255,255,0.10)",
            }}
          >
            <div
              style={{
                color: "#f8fafc",
                fontSize: 18,
                fontWeight: 950,
              }}
            >
              {copy.noTermsFound}
            </div>

            <div
              style={{
                marginTop: 7,
                color: "rgba(255,255,255,0.45)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {copy.noTermsHint}
            </div>
          </div>
        )}

        <section
          style={{
            marginTop: 24,
            marginBottom: 24,
            padding: 22,
            borderRadius: 22,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
            background:
              "radial-gradient(circle at top left, rgba(255,115,60,0.10), transparent 38%), linear-gradient(135deg, rgba(16,23,37,0.99), rgba(7,12,21,0.99))",
            border: "1px solid rgba(255,115,60,0.18)",
          }}
        >
          <div>
            <div
              style={{
                color: "#ff9a70",
                fontSize: 9,
                fontWeight: 950,
                letterSpacing: "0.11em",
                textTransform: "uppercase",
              }}
            >
              {copy.reference}
            </div>

            <div
              style={{
                marginTop: 7,
                color: "#f8fafc",
                fontSize: 18,
                fontWeight: 950,
              }}
            >
              {copy.referenceTitle}
            </div>

            <div
              style={{
                marginTop: 5,
                color: "rgba(255,255,255,0.50)",
                fontSize: 11,
                lineHeight: 1.55,
                fontWeight: 720,
              }}
            >
              {copy.referenceDescription}
            </div>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/app")}
          >
            {copy.backToDashboard}
          </button>
        </section>
      </div>
    </div>
  );
}
