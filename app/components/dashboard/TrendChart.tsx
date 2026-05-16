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

function formatDateLabel(date: string) {
  if (date.length >= 10) {
    const [, month, day] = date.split("-");
    return `${month}/${day}`;
  }

  return date;
}

export default function TrendChart({
  chartData,
  maxChartValue,
  visualMarginPct,
}: Props) {
  const chartWidth = 1000;
  const chartHeight = 320;

  const paddingLeft = 70;
  const paddingRight = 40;
  const paddingTop = 55;
  const paddingBottom = 58;

  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;
  const plotBottom = paddingTop + plotHeight;

  function getX(index: number) {
    if (chartData.length === 1) return paddingLeft + plotWidth / 2;

    return paddingLeft + (index / (chartData.length - 1)) * plotWidth;
  }

  function getY(value: number) {
    return plotBottom - (value / maxChartValue) * plotHeight;
  }

  const revenuePoints = chartData
    .map((point, index) => `${getX(index)},${getY(point.revenue)}`)
    .join(" ");

  const profitPoints = chartData
    .map((point, index) => `${getX(index)},${getY(point.profit)}`)
    .join(" ");

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

        <div className="positive-trend">{pct(visualMarginPct)} margin</div>
      </div>

      <div className="chart-card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 14,
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
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: "#60a5fa",
                  display: "inline-block",
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
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: "#22c55e",
                  display: "inline-block",
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
            X = Time • Y = Amount
          </div>
        </div>

        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="none"
          className="chart-svg"
        >
          <line
            x1={paddingLeft}
            y1={plotBottom}
            x2={chartWidth - paddingRight}
            y2={plotBottom}
            stroke="rgba(255,255,255,0.10)"
          />

          <line
            x1={paddingLeft}
            y1={paddingTop + plotHeight * 0.66}
            x2={chartWidth - paddingRight}
            y2={paddingTop + plotHeight * 0.66}
            stroke="rgba(255,255,255,0.05)"
          />

          <line
            x1={paddingLeft}
            y1={paddingTop + plotHeight * 0.33}
            x2={chartWidth - paddingRight}
            y2={paddingTop + plotHeight * 0.33}
            stroke="rgba(255,255,255,0.05)"
          />

          <text
            x="12"
            y={paddingTop + 4}
            fill="rgba(255,255,255,0.38)"
            fontSize="13"
            fontWeight="700"
          >
            High
          </text>

          <text
            x="12"
            y={paddingTop + plotHeight * 0.66 + 4}
            fill="rgba(255,255,255,0.38)"
            fontSize="13"
            fontWeight="700"
          >
            Mid
          </text>

          <text
            x="12"
            y={plotBottom + 4}
            fill="rgba(255,255,255,0.38)"
            fontSize="13"
            fontWeight="700"
          >
            0
          </text>

          <polyline
            fill="none"
            stroke="#60a5fa"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={revenuePoints}
          />

          <polyline
            fill="none"
            stroke="#22c55e"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={profitPoints}
          />

          {chartData.map((point, index) => {
            const x = getX(index);
            const revenueY = getY(point.revenue);
            const profitY = getY(point.profit);

            const showDate = visibleDateIndexes.includes(index);

            return (
              <g key={`${point.date}-${index}`}>
                <circle cx={x} cy={revenueY} r="6" fill="#60a5fa" />
                <circle cx={x} cy={profitY} r="5" fill="#22c55e" />

                {showDate ? (
                  <text
                    x={x}
                    y={plotBottom + 34}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.48)"
                    fontSize="13"
                    fontWeight="700"
                  >
                    {formatDateLabel(point.date)}
                  </text>
                ) : null}
              </g>
            );
          })}

          <text
            x={chartWidth / 2}
            y={chartHeight - 20}
            textAnchor="middle"
            fill="rgba(255,255,255,0.34)"
            fontSize="12"
            fontWeight="700"
          >
            Time period
          </text>
        </svg>
      </div>
    </div>
  );
}