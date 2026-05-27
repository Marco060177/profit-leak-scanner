type Props = {
  period: string;
  setPeriod: (next: "7" | "30" | "90") => void;
  navigate: (path: string) => void;
  scrollToSection: (id: string) => void;

  analysisLoading: boolean;
  analysisText: string;
  analysisSteps: string[];

  setAnalysisLoading: (value: boolean) => void;
  setAnalysisText: (value: string) => void;
};

export default function DashboardHero({
  period,
  setPeriod,
  navigate,
  scrollToSection,
  analysisLoading,
  analysisText,
  analysisSteps,
  setAnalysisLoading,
  setAnalysisText,
}: Props) {
  return (
    <>
      <div className="navbar">
        <div className="logo">
          MARGIN<span>LAB</span>
        </div>

        <div className="nav-tabs">
          <div className="nav-tab active">
            Overview
          </div>

          <div
            className="nav-tab"
            onClick={() => navigate("/app/products")}
          >
            Products
          </div>

          <div
            className="nav-tab"
            onClick={() => navigate("/app/recommendations")}
          >
            Recommendations
          </div>

          <div
            className="nav-tab"
            onClick={() => navigate("/app/billing")}
          >
            Billing
          </div>
        </div>
      </div>

      <div className="hero-header">
        <div>
          <div className="eyebrow">
            Profit Leak Scanner
          </div>

          <div className="hero-title">
            Profit Leak Dashboard
          </div>

          <div className="hero-description">
            Track hidden margin leaks,
            underpriced products and pricing
            issues affecting your Shopify
            store profitability.
          </div>

          <div className="period-tabs">
            {(["7", "30", "90"] as const).map(
              (item) => (
                <button
                  key={item}
                  className={
                    period === item
                      ? "period-tab active"
                      : "period-tab"
                  }
                  onClick={() =>
                    setPeriod(item)
                  }
                >
                  {item}d
                </button>
              ),
            )}
          </div>
        </div>

        <button
          className="primary-button"
          disabled={analysisLoading}
          onClick={() => {
            if (analysisLoading) return;

            setAnalysisLoading(true);

            let step = 0;

            const interval = setInterval(() => {
              step++;

              if (
                step <
                analysisSteps.length
              ) {
                setAnalysisText(
                  analysisSteps[step],
                );
              }
            }, 700);

            setTimeout(() => {
              clearInterval(interval);

              setAnalysisLoading(false);

              setAnalysisText(
                analysisSteps[0],
              );
            }, 2800);
          }}
        >
          <span>
            {analysisLoading
              ? "⏳"
              : "✦"}
          </span>

          <span>
            {analysisLoading
              ? analysisText
              : "Run analysis"}
          </span>
        </button>
      </div>
    </>
  );
}