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

export default function AiAdvisorPage() {
    const navigate = useNavigate();
    const { summary, rows } = useLoaderData() as LoaderData;

    const losingProducts = rows.filter((row) => row.losing);
    const missingCostProducts = rows.filter((row) => row.missingCost);
    const lowMarginProducts = rows.filter((row) => row.lowMargin);

    const topProfitLeak = [...rows].sort((a, b) => a.profit - b.profit)[0];

    const recoverableProducts = rows.filter((row) => row.targetDelta > 0);
    const recoverableProfit = recoverableProducts.reduce(
        (sum, row) => sum + row.targetDelta * row.qty,
        0,
    );

    const aiFindings = [
        losingProducts.length > 0
            ? `${losingProducts.length} products are currently selling below cost.`
            : null,
        missingCostProducts.length > 0
            ? `${missingCostProducts.length} products are missing cost data.`
            : null,
        lowMarginProducts.length > 0
            ? `${lowMarginProducts.length} products are operating below healthy margin.`
            : null,
        summary.discounts > 0
            ? `Discounts reduced revenue by ${summary.discounts.toFixed(2)} during this period.`
            : null,
        summary.refunds > 0
            ? `Refunds reduced net revenue by ${summary.refunds.toFixed(2)} during this period.`
            : null,
        recoverableProfit > 0
            ? `MarginLab detected approximately ${recoverableProfit.toFixed(0)} in recoverable profit opportunities.`
            : null,
    ].filter(Boolean) as string[];

    const aiAnswers = {
        profitRisk: topProfitLeak
            ? `Your store is currently exposed to profitability risk because ${topProfitLeak.productTitle} has the strongest negative impact in the selected period. ${losingProducts.length} products are selling below cost, which means they generate revenue but reduce overall profit. MarginLab also detected approximately ${recoverableProfit.toFixed(0)} in recoverable profit opportunities if pricing gaps are reviewed.`
            : `MarginLab did not detect a single dominant product risk during this period. Based on available cost and order data, your current profitability risk appears more distributed across the catalog.`,

        marginPressure: `Your margin is being affected by a combination of discounts, refunds and product-level profitability. Discounts reduced revenue by ${summary.discounts.toFixed(2)}, while refunds reduced net revenue by ${summary.refunds.toFixed(2)}. ${lowMarginProducts.length} products are operating below healthy margin levels, which can make revenue look acceptable while profit quality weakens.`,

        priority: missingCostProducts.length > 0
            ? `Start by fixing missing cost data for ${missingCostProducts.length} products. Without accurate costs, MarginLab cannot fully trust margin calculations or pricing recommendations. After that, review ${topProfitLeak ? topProfitLeak.productTitle : "the highest-risk products"} and focus on recoverable profit opportunities.`
            : `Cost data appears complete enough for the selected period. The next priority is to review ${topProfitLeak ? topProfitLeak.productTitle : "the highest-risk products"} and focus on recoverable profit opportunities before making broader pricing changes.`,

        fastestImprovement:
            recoverableProfit > 0
                ? `The fastest profit improvement would come from reviewing products with recoverable pricing opportunities. MarginLab estimates approximately ${recoverableProfit.toFixed(0)} in potential recoverable profit. Start with products selling below cost, then complete missing cost data, and only after that review pricing gaps.`
                : `The fastest improvement right now is improving data accuracy. Start with missing cost data and high-risk products before making pricing changes.`,
    };



    const [selectedQuestion, setSelectedQuestion] =
        React.useState<
            | "profitRisk"
            | "marginPressure"
            | "priority"
            | "fastestImprovement"
        >("profitRisk");

    const [showFullAnalysis, setShowFullAnalysis] =
        React.useState(false);

    const healthScore = Math.max(
        0,
        Math.min(
            100,
            Math.round(
                100 -
                losingProducts.length * 15 -
                missingCostProducts.length * 10 -
                lowMarginProducts.length * 4,
            ),
        ),
    );

    const healthLabel =
        healthScore < 40
            ? "High Risk"
            : healthScore < 70
                ? "Moderate Risk"
                : "Healthy";

    const fullAnalysis = {
        health: healthLabel,

        summary:
            healthScore < 40
                ? "MarginLab detected significant profitability risk in the selected period."
                : healthScore < 70
                    ? "MarginLab detected moderate profitability risk in the selected period."
                    : "MarginLab detected a generally healthy margin profile in the selected period.",

        risks: [
            losingProducts.length > 0
                ? `${losingProducts.length} products are selling below cost.`
                : null,

            missingCostProducts.length > 0
                ? `${missingCostProducts.length} products are missing cost data.`
                : null,

            lowMarginProducts.length > 0
                ? `${lowMarginProducts.length} products are operating below healthy margin.`
                : null,

            summary.discounts > 0
                ? `Discounts reduced revenue by ${summary.discounts.toFixed(2)}.`
                : null,

            summary.refunds > 0
                ? `Refunds reduced net revenue by ${summary.refunds.toFixed(2)}.`
                : null,
        ].filter(Boolean) as string[],

        actions: [
            missingCostProducts.length > 0
                ? "Complete missing product costs before relying on margin recommendations."
                : null,

            topProfitLeak
                ? `Review ${topProfitLeak.productTitle} because it is currently the strongest profitability risk.`
                : null,

            recoverableProfit > 0
                ? `Review pricing gaps with approximately ${recoverableProfit.toFixed(0)} in recoverable profit opportunity.`
                : null,

            summary.discounts > 0
                ? "Review discount campaigns to confirm they are creating enough incremental revenue."
                : null,

            summary.refunds > 0
                ? "Investigate refund activity for product, fulfillment or customer expectation issues."
                : null,
        ].filter(Boolean) as string[],
    };

    return (
        <div className="dashboard-shell">
            <div className="dashboard-container">
                <DashboardNav active="ai-advisor" navigate={navigate} />

                <div className="hero-header">
                    <div>
                        <div className="alert-pill">
                            <span className="alert-dot" />
                            Growth Plan Preview
                        </div>

                        <div className="eyebrow">AI MARGIN ADVISOR</div>

                        <div className="hero-title">
                            Ask MarginLab what is hurting your profit
                        </div>

                        <div className="hero-description">
                            AI Advisor will analyze your Shopify profitability data, explain
                            margin issues, identify hidden profit leaks and recommend what to
                            fix first.
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
                    <div className="section-header">
                        <div>
                            <div className="section-title">AI Advisor Preview</div>

                            <div className="section-subtitle">
                                Future Growth feature. Built to turn margin data into clear
                                business decisions.
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1.1fr 0.9fr",
                            gap: 24,
                            marginTop: 24,
                        }}
                    >
                        <div
                            style={{
                                borderRadius: 26,
                                padding: 28,
                                background:
                                    "radial-gradient(circle at top left, rgba(255,115,60,0.08), transparent 36%), linear-gradient(135deg, rgba(17,24,39,0.98), rgba(6,12,24,0.98))",
                                border: "1px solid rgba(255,115,60,0.22)",
                                boxShadow:
                                    "inset 0 1px 0 rgba(255,255,255,0.035), 0 24px 70px rgba(0,0,0,0.32)",
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
                                AI Store Health Report
                            </div>

                            <div
                                style={{
                                    marginTop: 18,
                                    fontSize: 34,
                                    fontWeight: 950,
                                    lineHeight: 1.08,
                                    color: "#ffffff",
                                    letterSpacing: "-0.04em",
                                }}
                            >
                                {topProfitLeak
                                    ? `${topProfitLeak.productTitle} is currently the biggest profitability risk.`
                                    : "MarginLab did not detect a critical product risk during this period."}
                            </div>

                            <div
                                style={{
                                    marginTop: 24,
                                    padding: 20,
                                    borderRadius: 18,
                                    background: "rgba(255,115,60,0.08)",
                                    border: "1px solid rgba(255,115,60,0.18)",
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 900,
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                        color: "#ff9a70",
                                    }}
                                >
                                    AI Executive Summary
                                </div>

                                <div
                                    style={{
                                        marginTop: 12,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 14,
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 42,
                                            fontWeight: 950,
                                            color:
                                                healthScore < 40
                                                    ? "#ff6b4a"
                                                    : healthScore < 70
                                                        ? "#f59e0b"
                                                        : "#22c55e",
                                        }}
                                    >
                                        {healthScore}
                                    </div>

                                    <div>
                                        <div
                                            style={{
                                                fontWeight: 900,
                                                color: "#f3f4f6",
                                            }}
                                        >
                                            {healthLabel}
                                        </div>

                                        <div
                                            style={{
                                                marginTop: 4,
                                                color: "rgba(255,255,255,0.62)",
                                                fontSize: 13,
                                            }}
                                        >
                                            MarginLab store health assessment
                                        </div>
                                    </div>
                                </div>

                                <div
                                    style={{
                                        marginTop: 16,
                                        color: "rgba(255,255,255,0.75)",
                                        lineHeight: 1.6,
                                        fontSize: 14,
                                    }}
                                >
                                    MarginLab analyzed your store and detected
                                    profitability risks related to product margins,
                                    missing costs and recoverable profit opportunities.
                                </div>
                            </div>

                            <div
                                style={{
                                    marginTop: 22,
                                    display: "grid",
                                    gap: 14,
                                }}
                            >
                                {(aiFindings.length > 0
                                    ? aiFindings
                                    : [
                                        "No critical margin issues detected during the selected period.",
                                        "Product costs, discounts and refunds appear stable based on available data.",
                                    ]
                                ).map((text) => (
                                    <div
                                        key={text}
                                        style={{
                                            padding: 16,
                                            borderRadius: 16,
                                            background: "rgba(255,255,255,0.045)",
                                            border: "1px solid rgba(255,115,60,0.14)",
                                            color: "rgba(255,255,255,0.76)",
                                            fontWeight: 750,
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        {text}
                                    </div>
                                ))}
                            </div>
                        </div>

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
                                    color: "rgba(255,255,255,0.55)",
                                }}
                            >
                                Ask MarginLab
                            </div>

                            <div
                                style={{
                                    marginTop: 20,
                                    display: "grid",
                                    gap: 12,
                                }}
                            >
                                {[
                                    {
                                        id: "profitRisk",
                                        label: "Why is my profit at risk?",
                                    },
                                    {
                                        id: "marginPressure",
                                        label: "What is hurting my margin?",
                                    },
                                    {
                                        id: "priority",
                                        label: "What should I check first?",
                                    },
                                    {
                                        id: "fastestImprovement",
                                        label: "What would improve profit fastest?",
                                    },
                                ].map((question) => (
                                    <button
                                        key={question.id}
                                        onClick={() =>
                                            setSelectedQuestion(
                                                question.id as
                                                | "profitRisk"
                                                | "marginPressure"
                                                | "priority"
                                                | "fastestImprovement",
                                            )
                                        }
                                        style={{
                                            padding: "14px 16px",
                                            borderRadius: 14,
                                            border:
                                                selectedQuestion === question.id
                                                    ? "1px solid rgba(255,115,60,0.45)"
                                                    : "1px solid rgba(255,115,60,0.14)",
                                            background:
                                                selectedQuestion === question.id
                                                    ? "rgba(255,115,60,0.14)"
                                                    : "rgba(255,115,60,0.08)",
                                            color: "#f8fafc",
                                            fontWeight: 800,
                                            textAlign: "left",
                                            cursor: "pointer",
                                        }}
                                    >
                                        {question.label}
                                    </button>
                                ))}
                            </div>

                            <div
                                style={{
                                    marginTop: 18,
                                    padding: 20,
                                    borderRadius: 18,
                                    background:
                                        "linear-gradient(180deg, rgba(255,115,60,0.10), rgba(8,13,22,0.86))",
                                    border: "1px solid rgba(255,115,60,0.22)",
                                    minHeight: 150,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 900,
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                        color: "#ff9a70",
                                        marginBottom: 14,
                                    }}
                                >
                                    MarginLab answer
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gap: 12,
                                        color: "rgba(255,255,255,0.78)",
                                        fontSize: 14,
                                        lineHeight: 1.6,
                                        fontWeight: 700,
                                    }}
                                >
                                    <div>
                                        {aiAnswers[selectedQuestion]}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowFullAnalysis((value) => !value)}
                                style={{
                                    marginTop: 18,
                                    width: "100%",
                                    padding: "15px 18px",
                                    borderRadius: 16,
                                    border: "1px solid rgba(255,115,60,0.34)",
                                    background:
                                        "linear-gradient(135deg, rgba(255,90,54,0.24), rgba(255,115,60,0.12))",
                                    color: "#ffffff",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                }}
                            >
                                {showFullAnalysis ? "Hide Full Analysis" : "Generate Full Analysis"}
                            </button>
                            {showFullAnalysis && (
                                <div
                                    style={{
                                        marginTop: 18,
                                        padding: 20,
                                        borderRadius: 20,
                                        background:
                                            "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                                        border: "1px solid rgba(255,115,60,0.22)",
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 900,
                                            letterSpacing: "0.12em",
                                            textTransform: "uppercase",
                                            color: "#ff9a70",
                                        }}
                                    >
                                        Full AI Analysis
                                    </div>

                                    <div
                                        style={{
                                            marginTop: 14,
                                            color: "#f8fafc",
                                            fontSize: 20,
                                            fontWeight: 950,
                                            lineHeight: 1.25,
                                        }}
                                    >
                                        {fullAnalysis.summary}
                                    </div>

                                    <div
                                        style={{
                                            marginTop: 18,
                                            color: "rgba(255,255,255,0.55)",
                                            fontSize: 11,
                                            fontWeight: 900,
                                            letterSpacing: "0.10em",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        Key Risks
                                    </div>

                                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                                        {fullAnalysis.risks.length > 0 ? (
                                            fullAnalysis.risks.map((risk) => (
                                                <div
                                                    key={risk}
                                                    style={{
                                                        color: "rgba(255,255,255,0.76)",
                                                        fontSize: 14,
                                                        lineHeight: 1.55,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    • {risk}
                                                </div>
                                            ))
                                        ) : (
                                            <div style={{ color: "rgba(255,255,255,0.68)" }}>
                                                No major risk detected.
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        style={{
                                            marginTop: 18,
                                            color: "rgba(255,255,255,0.55)",
                                            fontSize: 11,
                                            fontWeight: 900,
                                            letterSpacing: "0.10em",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        Recommended Focus
                                    </div>

                                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                                        {fullAnalysis.actions.length > 0 ? (
                                            fullAnalysis.actions.map((action) => (
                                                <div
                                                    key={action}
                                                    style={{
                                                        color: "rgba(255,255,255,0.76)",
                                                        fontSize: 14,
                                                        lineHeight: 1.55,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    • {action}
                                                </div>
                                            ))
                                        ) : (
                                            <div style={{ color: "rgba(255,255,255,0.68)" }}>
                                                Continue monitoring margin performance.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

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
                                🔒 Growth preview
                                This analysis is currently available in preview mode. 
                                Advanced AI answers and full conversational analysis will be part 
                                of the Growth plan.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}