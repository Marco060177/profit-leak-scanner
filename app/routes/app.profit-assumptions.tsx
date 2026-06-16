import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";

import DashboardNav from "~/components/dashboard/DashboardNav";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import type { LoaderData } from "~/utils/margin";

import "~/styles/dashboard.css";

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "30";

  return loadMarginDashboardData({
    admin,
    session,
    period,
  });
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ProfitAssumptionsPage() {
  const navigate = useNavigate();
  const { summary } = useLoaderData() as LoaderData;

  const [monthlyAds, setMonthlyAds] = React.useState(500);
  const [monthlyShipping, setMonthlyShipping] = React.useState(300);
  const [monthlyOperating, setMonthlyOperating] = React.useState(200);
  const [paymentFeePct, setPaymentFeePct] = React.useState(2.9);
  const [transactionFeePct, setTransactionFeePct] = React.useState(0.5);
  const [taxReservePct, setTaxReservePct] = React.useState(0);

  const estimatedPaymentFees = summary.revenue * (paymentFeePct / 100);
  const estimatedTransactionFees = summary.revenue * (transactionFeePct / 100);
  const estimatedTaxReserve = summary.revenue * (taxReservePct / 100);

  const totalEstimatedCosts =
    monthlyAds +
    monthlyShipping +
    monthlyOperating +
    estimatedPaymentFees +
    estimatedTransactionFees +
    estimatedTaxReserve;

  const estimatedNetProfit = summary.profit - totalEstimatedCosts;

  const estimatedNetMargin =
    summary.revenue > 0 ? (estimatedNetProfit / summary.revenue) * 100 : 0;

  const fields = [
    {
      label: "Monthly Advertising Spend",
      value: monthlyAds,
      setter: setMonthlyAds,
      prefix: "$",
    },
    {
      label: "Monthly Shipping Costs",
      value: monthlyShipping,
      setter: setMonthlyShipping,
      prefix: "$",
    },
    {
      label: "Monthly Operating Costs",
      value: monthlyOperating,
      setter: setMonthlyOperating,
      prefix: "$",
    },
    {
      label: "Payment Processing Fee",
      value: paymentFeePct,
      setter: setPaymentFeePct,
      suffix: "%",
    },
    {
      label: "Transaction Fee",
      value: transactionFeePct,
      setter: setTransactionFeePct,
      suffix: "%",
    },
    {
      label: "Tax Reserve",
      value: taxReservePct,
      setter: setTaxReservePct,
      suffix: "%",
    },
  ];

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav
          active="profit-assumptions"
          navigate={navigate}
        />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              Growth Plan Preview
            </div>

            <div className="eyebrow">PROFIT ASSUMPTIONS</div>

            <div className="hero-title">
              Estimate net profit with monthly cost assumptions
            </div>

            <div className="hero-description">
              Add estimated monthly ads, shipping, fees and operating costs to
              turn gross margin into a more realistic net profit view.
            </div>
          </div>

          <button
            className="primary-button"
            onClick={() => navigate("/app/billing")}
          >
            Upgrade to Growth →
          </button>
        </div>

        <div className="panel">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
            }}
          >
            <div
              style={{
                borderRadius: 26,
                padding: 28,
                background:
                  "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                border: "1px solid rgba(255,115,60,0.18)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#ff9a70",
                }}
              >
                Monthly Cost Assumptions
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gap: 14,
                }}
              >
                {fields.map((field) => (
                  <label key={field.label}>
                    <div
                      style={{
                        marginBottom: 6,
                        color: "rgba(255,255,255,0.58)",
                        fontSize: 12,
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {field.label}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 14px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,115,60,0.16)",
                        background: "rgba(255,255,255,0.045)",
                      }}
                    >
                      {field.prefix && (
                        <span style={{ color: "rgba(255,255,255,0.55)" }}>
                          {field.prefix}
                        </span>
                      )}

                      <input
                        type="number"
                        value={field.value}
                        onChange={(event) =>
                          field.setter(Number(event.target.value))
                        }
                        style={{
                          width: "100%",
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          color: "#f8fafc",
                          fontWeight: 900,
                          fontSize: 16,
                        }}
                      />

                      {field.suffix && (
                        <span style={{ color: "rgba(255,255,255,0.55)" }}>
                          {field.suffix}
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 26,
                padding: 28,
                background:
                  "radial-gradient(circle at top left, rgba(34,197,94,0.16), transparent 35%), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                border: "1px solid rgba(34,197,94,0.28)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#4ade80",
                }}
              >
                Estimated Net Profit
              </div>

              <div
                style={{
                  marginTop: 18,
                  color: "#22c55e",
                  fontSize: 54,
                  fontWeight: 950,
                  lineHeight: 1,
                  letterSpacing: "-0.05em",
                }}
              >
                {money(estimatedNetProfit)}
              </div>

              <div
                style={{
                  marginTop: 10,
                  color: "rgba(255,255,255,0.68)",
                  fontWeight: 800,
                }}
              >
                Estimated net margin: {estimatedNetMargin.toFixed(1)}%
              </div>

              <div
                style={{
                  marginTop: 26,
                  display: "grid",
                  gap: 12,
                }}
              >
                {[
                  ["Gross Profit", money(summary.profit)],
                  ["Advertising", `-${money(monthlyAds)}`],
                  ["Shipping", `-${money(monthlyShipping)}`],
                  ["Operating Costs", `-${money(monthlyOperating)}`],
                  ["Payment Fees", `-${money(estimatedPaymentFees)}`],
                  ["Transaction Fees", `-${money(estimatedTransactionFees)}`],
                  ["Tax Reserve", `-${money(estimatedTaxReserve)}`],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      paddingBottom: 10,
                      borderBottom: "1px solid rgba(255,255,255,0.07)",
                      color: "rgba(255,255,255,0.72)",
                      fontWeight: 800,
                    }}
                  >
                    <span>{label}</span>
                    <span
                      style={{
                        color:
                          label === "Gross Profit"
                            ? "#22c55e"
                            : "rgba(255,255,255,0.86)",
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 18,
              borderRadius: 18,
              background: "rgba(255,115,60,0.08)",
              border: "1px solid rgba(255,115,60,0.20)",
              color: "rgba(255,255,255,0.70)",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            Growth preview. These values are manual assumptions and are not
            imported automatically. Use them to estimate a more realistic net
            profit view before connecting advanced integrations..
          </div>
        </div>
      </div>
    </div>
  );
}