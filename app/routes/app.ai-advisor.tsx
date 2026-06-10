import { useNavigate } from "react-router";

import DashboardNav from "~/components/dashboard/DashboardNav";
import "~/styles/dashboard.css";

export default function AiAdvisorPage() {
    const navigate = useNavigate();

    return (
        <div className="dashboard-shell">
            <div className="dashboard-container">
                <DashboardNav
                    active="ai-advisor"
                    navigate={navigate}
                />

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
                                Example analysis
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
                                Your margin is under pressure from discounts and weak product
                                profitability.
                            </div>

                            <div
                                style={{
                                    marginTop: 22,
                                    display: "grid",
                                    gap: 14,
                                }}
                            >
                                {[
                                    "3 products are operating below target margin.",
                                    "Discount activity is reducing realized profit.",
                                    "Refunds are lowering net revenue during this period.",
                                    "Recoverable profit opportunities should be reviewed first.",
                                ].map((text) => (
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
                                Ask questions like
                            </div>

                            <div
                                style={{
                                    marginTop: 20,
                                    display: "grid",
                                    gap: 12,
                                }}
                            >
                                {[
                                    "Why is my margin declining?",
                                    "Which products are hurting profitability?",
                                    "Where can I recover profit fastest?",
                                    "What changed compared to last month?",
                                    "Which discounts are causing the most damage?",
                                ].map((question) => (
                                    <div
                                        key={question}
                                        style={{
                                            padding: "14px 16px",
                                            borderRadius: 14,
                                            background: "rgba(255,115,60,0.08)",
                                            border: "1px solid rgba(255,115,60,0.14)",
                                            color: "#f8fafc",
                                            fontWeight: 800,
                                        }}
                                    >
                                        {question}
                                    </div>
                                ))}
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
                                🔒 Available in the future Growth plan. This preview does not
                                use live AI yet.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}