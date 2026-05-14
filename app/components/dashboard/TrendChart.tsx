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

        <div className="positive-trend">{pct(visualMarginPct)} margin</div>
      </div>

      <div className="chart-card">
        <div className="chart-labels">
          <span>Revenue</span>
          <span>COGS</span>
          <span>Profit</span>
        </div>

        <svg viewBox="0 0 1000 260" preserveAspectRatio="none" className="chart-svg">
          <line x1="0" y1="230" x2="1000" y2="230" stroke="rgba(255,255,255,0.08)" />
          <line x1="0" y1="170" x2="1000" y2="170" stroke="rgba(255,255,255,0.05)" />
          <line x1="0" y1="110" x2="1000" y2="110" stroke="rgba(255,255,255,0.05)" />
          <line x1="0" y1="50" x2="1000" y2="50" stroke="rgba(255,255,255,0.05)" />

          <polyline
            fill="none"
            stroke="#ff5a36"
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
            const x =
              chartData.length === 1
                ? 500
                : (index / (chartData.length - 1)) * 1000;

            const revenueY = 230 - (point.revenue / maxChartValue) * 170;
            const profitY = 230 - (point.profit / maxChartValue) * 170;

            return (
              <g key={point.date}>
                <circle cx={x} cy={revenueY} r="6" fill="#ff5a36" />
                <circle cx={x} cy={profitY} r="5" fill="#22c55e" />
              </g>
            );
          })}
        </svg>

        <div className="chart-overlay" />
      </div>
    </div>
  );
}