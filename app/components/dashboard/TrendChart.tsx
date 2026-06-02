import { money, pct } from "~/utils/margin";

type ChartPoint = {
  date: string;
  revenue: number;
  profit: number;
};

type Props = {
  chartData: ChartPoint[];
  maxChartValue: number;
  revenuePoints: string;
  profitPoints: string;
  visualMarginPct: number;
};

function formatDateLabel(date: string) {
  if (date.length >= 10) {
    const [, month, day] = date.split("-");
    return `${month}/${day}`;
  }

  return date;
}

function buildPath(
  chartData: ChartPoint[],
  getX: (index: number) => number,
  getY: (value: number) => number,
  key: "revenue" | "profit",
) {
  return chartData
    .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(index)} ${getY(point[key])}`)
    .join(" ");
}

function buildAreaPath(
  chartData: ChartPoint[],
  getX: (index: number) => number,
  getY: (value: number) => number,
  key: "revenue" | "profit",
  plotBottom: number,
) {
  if (chartData.length === 0) return "";

  const line = buildPath(chartData, getX, getY, key);
  const firstX = getX(0);
  const lastX = getX(chartData.length - 1);

  return `${line} L ${lastX} ${plotBottom} L ${firstX} ${plotBottom} Z`;
}

export default function TrendChart({
  chartData,
  maxChartValue,
  visualMarginPct,
}: Props) {
  const chartWidth = 1000;
  const chartHeight = 360;

  const paddingLeft = 58;
  const paddingRight = 44;
  const paddingTop = 58;
  const paddingBottom = 64;

  const safeMax = Math.max(maxChartValue, 1);

  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;
  const plotBottom = paddingTop + plotHeight;

  const totalRevenue = chartData.reduce((sum, p) => sum + p.revenue, 0);
  const totalProfit = chartData.reduce((sum, p) => sum + p.profit, 0);

  const firstDate = chartData[0]?.date ?? "";
  const lastDate = chartData[chartData.length - 1]?.date ?? "";

  function getX(index: number) {
    if (chartData.length === 1) return paddingLeft + plotWidth / 2;

    return paddingLeft + (index / (chartData.length - 1)) * plotWidth;
  }

  function getY(value: number) {
    return plotBottom - (value / safeMax) * plotHeight;
  }

  const revenuePath = buildPath(chartData, getX, getY, "revenue");
  const profitPath = buildPath(chartData, getX, getY, "profit");

  const revenueAreaPath = buildAreaPath(
    chartData,
    getX,
    getY,
    "revenue",
    plotBottom,
  );

  const profitAreaPath = buildAreaPath(
    chartData,
    getX,
    getY,
    "profit",
    plotBottom,
  );

  const visibleDateIndexes = chartData
    .map((_, index) => index)
    .filter((index) => {
      if (chartData.length <= 7) return true;
      if (index === 0) return true;
      if (index === chartData.length - 1) return true;
      if (index === Math.floor(chartData.length / 2)) return true;

      return false;
    });

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <div className="section-title">Profit Trend</div>

          <div className="section-subtitle">
            Current profit performance based on Shopify orders.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 999,
            background:
              "linear-gradient(135deg, rgba(34,197,94,0.16), rgba(15,23,42,0.88))",
            border: "1px solid rgba(34,197,94,0.20)",
            boxShadow: "0 18px 50px rgba(34,197,94,0.10)",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 950, color: "#22c55e" }}>
            ↗ {pct(visualMarginPct)}
          </div>

          <div
            style={{
              color: "rgba(255,255,255,0.58)",
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            Profit Margin
            <br />
            Current Period
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 26,
          borderRadius: 28,
          padding: 26,
          background:
            "radial-gradient(circle at 50% 10%, rgba(59,130,246,0.16), transparent 38%), linear-gradient(180deg, rgba(15,23,42,0.72), rgba(3,7,18,0.86))",
          border: "1px solid rgba(148,163,184,0.14)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.04), 0 30px 90px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 999,
                  background: "#60a5fa",
                  display: "inline-block",
                  boxShadow: "0 0 20px rgba(96,165,250,0.75)",
                }}
              />
              <div>
                <div style={{ color: "#f3f4f6", fontWeight: 900 }}>
                  Revenue
                </div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                  Total revenue
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 999,
                  background: "#22c55e",
                  display: "inline-block",
                  boxShadow: "0 0 20px rgba(34,197,94,0.70)",
                }}
              />
              <div>
                <div style={{ color: "#f3f4f6", fontWeight: 900 }}>Profit</div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                  Total profit
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.045)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.66)",
              fontSize: 13,
              fontWeight: 850,
            }}
          >
            Daily
          </div>
        </div>

        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="none"
          className="chart-svg"
          style={{ width: "100%", height: 360, display: "block" }}
        >
          <defs>
            <linearGradient id="revenueAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.42" />
              <stop offset="68%" stopColor="#3b82f6" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="profitAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.38" />
              <stop offset="72%" stopColor="#22c55e" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
            </linearGradient>

            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {[0, 0.33, 0.66, 1].map((ratio) => {
            const y = paddingTop + plotHeight * ratio;

            return (
              <line
                key={ratio}
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke="rgba(148,163,184,0.13)"
                strokeDasharray={ratio === 1 ? "0" : "6 8"}
              />
            );
          })}

          {chartData.length > 1 && (
            <>
              <path d={revenueAreaPath} fill="url(#revenueAreaGradient)" />
              <path d={profitAreaPath} fill="url(#profitAreaGradient)" />

              <path
                d={revenuePath}
                fill="none"
                stroke="#60a5fa"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#lineGlow)"
              />

              <path
                d={profitPath}
                fill="none"
                stroke="#22c55e"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#lineGlow)"
              />
            </>
          )}

          {chartData.map((point, index) => {
            const x = getX(index);
            const revenueY = getY(point.revenue);
            const profitY = getY(point.profit);

            const showDate = visibleDateIndexes.includes(index);

            return (
              <g key={`${point.date}-${index}`}>
                <circle
                  cx={x}
                  cy={revenueY}
                  r="8"
                  fill="#60a5fa"
                  opacity="0.22"
                />
                <circle cx={x} cy={revenueY} r="4.5" fill="#60a5fa" />

                <circle
                  cx={x}
                  cy={profitY}
                  r="7"
                  fill="#22c55e"
                  opacity="0.20"
                />
                <circle cx={x} cy={profitY} r="4" fill="#22c55e" />

                {showDate ? (
                  <text
                    x={x}
                    y={plotBottom + 34}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.56)"
                    fontSize="13"
                    fontWeight="800"
                  >
                    {formatDateLabel(point.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 14,
          }}
        >
          {[
            ["Total Revenue", money(totalRevenue), "#60a5fa"],
            ["Total Profit", money(totalProfit), "#22c55e"],
            ["Profit Margin", pct(visualMarginPct), "#a855f7"],
          ].map(([label, value, color]) => (
            <div
              key={label}
              style={{
                padding: 16,
                borderRadius: 18,
                background: "rgba(255,255,255,0.045)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                style={{
                  color: "rgba(255,255,255,0.52)",
                  fontSize: 12,
                  fontWeight: 850,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {label}
              </div>

              <div
                style={{
                  marginTop: 8,
                  color,
                  fontSize: 24,
                  fontWeight: 950,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {firstDate && lastDate ? (
          <div
            style={{
              marginTop: 14,
              color: "rgba(255,255,255,0.42)",
              fontSize: 12,
              fontWeight: 750,
              textAlign: "right",
            }}
          >
            {formatDateLabel(firstDate)} – {formatDateLabel(lastDate)}
          </div>
        ) : null}
      </div>
    </div>
  );
}