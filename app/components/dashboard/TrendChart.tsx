import { pct } from "~/utils/margin";

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

export default function TrendChart({
  chartData,
  maxChartValue,
  revenuePoints,
  profitPoints,
  visualMarginPct,
}: Props) {
  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <div className="section-title">Profit Trend</div>

          <div className="section-subtitle">
            Current profit performance based on Shopify orders.
          </div>
        </div>

        <div className="positive-trend">
          {pct(visualMarginPct)} margin
        </div>
      </div>

      <div className="chart-card">
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#d6d9e0",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: "#60a5fa",
                }}
              />

              Revenue
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#d6d9e0",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: "#22c55e",
                }}
              />

              Profit
            </div>
          </div>

          <div
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            X = Time • Y = Revenue / Profit
          </div>
        </div>

        <svg
          viewBox="0 0 1000 280"
          preserveAspectRatio="none"
          className="chart-svg"
        >
          {/* GRID */}

          <line
            x1="0"
            y1="230"
            x2="1000"
            y2="230"
            stroke="rgba(255,255,255,0.08)"
          />

          <line
            x1="0"
            y1="170"
            x2="1000"
            y2="170"
            stroke="rgba(255,255,255,0.05)"
          />

          <line
            x1="0"
            y1="110"
            x2="1000"
            y2="110"
            stroke="rgba(255,255,255,0.05)"
          />

          <line
            x1="0"
            y1="50"
            x2="1000"
            y2="50"
            stroke="rgba(255,255,255,0.05)"
          />

          {/* Y AXIS LABELS */}

          <text
            x="0"
            y="235"
            fill="rgba(255,255,255,0.35)"
            fontSize="20"
            fontWeight="700"
          >
            0
          </text>

          <text
            x="0"
            y="175"
            fill="rgba(255,255,255,0.35)"
            fontSize="20"
            fontWeight="700"
          >
            Mid
          </text>

          <text
            x="0"
            y="55"
            fill="rgba(255,255,255,0.35)"
            fontSize="20"
            fontWeight="700"
          >
            High
          </text>

          {/* REVENUE */}

          <polyline
            fill="none"
            stroke="#60a5fa"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={revenuePoints}
          />

          {/* PROFIT */}

          <polyline
            fill="none"
            stroke="#22c55e"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={profitPoints}
          />

          {/* POINTS */}

          {chartData.map((point, index) => {
            const x =
              chartData.length === 1
                ? 500
                : (index / (chartData.length - 1)) * 1000;

            const revenueY =
              230 - (point.revenue / maxChartValue) * 170;

            const profitY =
              230 - (point.profit / maxChartValue) * 170;

            return (
              <g key={point.date}>
                <circle
                  cx={x}
                  cy={revenueY}
                  r="6"
                  fill="#60a5fa"
                />

                <circle
                  cx={x}
                  cy={profitY}
                  r="5"
                  fill="#22c55e"
                />

                {/* X AXIS */}

                <text
                  x={x}
                  y="262"
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.45)"
                  fontSize="22"
                  fontWeight="700"
                >
                  {point.date}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}