import { getStoredLanguage } from "~/utils/i18n";
import { pct } from "~/utils/margin";
import MetricTooltip from "~/components/ui/MetricTooltip";

type Props = {
  cogsPercentage: number;
  profitPercentage: number;
  leakPercentage: number;
};

export default function MarginBreakdown({
  cogsPercentage,
  profitPercentage,
  leakPercentage,
}: Props) {
  const language = getStoredLanguage();

  const items = [
    {
      label: "COGS",
      value: cogsPercentage,
      color: "#3b82f6",
      description:
        language === "it"
          ? "Quota dei ricavi assorbita dai costi dei prodotti."
          : "Revenue absorbed by product costs.",
      tooltip: {
        title:
          language === "it"
            ? "COGS"
            : "COGS",
        description:
          language === "it"
            ? "Indica quale parte dei ricavi viene assorbita dal costo dei prodotti venduti."
            : "Shows what share of revenue is absorbed by the cost of products sold.",
        note:
          language === "it"
            ? "Una percentuale più alta lascia meno spazio al profitto."
            : "A higher percentage leaves less room for profit.",
      },
    },
    {
      label: language === "it" ? "Profitto" : "Profit",
      value: profitPercentage,
      color: "#22c55e",
      description:
        language === "it"
          ? "Quota dei ricavi che genera profitto."
          : "Revenue retained as gross profit.",
      tooltip: {
        title:
          language === "it"
            ? "Profitto"
            : "Profit",
        description:
          language === "it"
            ? "Indica quale percentuale dei ricavi rimane come profitto dopo i COGS."
            : "Shows what percentage of revenue remains as profit after COGS.",
        note:
          language === "it"
            ? "In questa sezione il valore è calcolato sulla base economica normalizzata."
            : "In this section the value is calculated using the normalized economic basis.",
      },
    },
    {
      label:
        language === "it"
          ? "Perdite di margine"
          : "Margin Loss",
      value: leakPercentage,
      color: "#ef4444",
      description:
        language === "it"
          ? "Margini persi a causa delle inefficienze rilevate."
          : "Detected margin leakage across products.",
      tooltip: {
        title:
          language === "it"
            ? "Perdita di margine"
            : "Margin loss",
        description:
          language === "it"
            ? "Indica la quota dei ricavi associata a prodotti che hanno generato profitto economico negativo nel periodo."
            : "Shows the share of revenue associated with products that generated negative economic profit during the period.",
        note:
          language === "it"
            ? "Non è una seconda voce di costo e non va sommata a COGS e Profitto."
            : "It is not a second cost category and should not be added to COGS and Profit.",
      },
    },
  ];

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <div className="section-title">
            {language === "it"
              ? "Composizione dei margini"
              : "Margin Breakdown"}
          </div>

          <div className="section-subtitle">
            {language === "it"
              ? "Distribuzione dei ricavi tra costi, profitti e perdite di margine rilevate."
              : "Revenue allocation across costs, profit and detected leaks."}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 18,
          marginTop: 24,
        }}
      >
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              borderRadius: 24,
              padding: 24,
              background:
                "radial-gradient(circle at top left, rgba(255,115,60,0.05), transparent 36%), linear-gradient(135deg, rgba(17,24,39,0.98), rgba(6,12,24,0.98))",
              border: "1px solid rgba(255,115,60,0.18)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.035), 0 22px 55px rgba(0,0,0,0.30)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.54)",
                }}
              >
                <span>{item.label}</span>

                <MetricTooltip content={item.tooltip} />
              </div>

              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: item.color,
                  boxShadow: `0 0 18px ${item.color}66`,
                }}
              />
            </div>

            <div
              style={{
                marginTop: 18,
                fontSize: 46,
                fontWeight: 950,
                lineHeight: 1,
                color: item.color,
                letterSpacing: "-0.04em",
              }}
            >
              {pct(item.value)}
            </div>

            <div
              style={{
                marginTop: 10,
                minHeight: 42,
                color: "rgba(255,255,255,0.50)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {item.description}
            </div>

            <div
              style={{
                height: 9,
                borderRadius: 999,
                background: "rgba(255,255,255,0.07)",
                overflow: "hidden",
                marginTop: 20,
              }}
            >
              <div
                style={{
                  width: `${Math.min(Math.max(item.value, 0), 100)}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: item.color,
                  boxShadow: `0 0 18px ${item.color}55`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}