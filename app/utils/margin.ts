export type Summary = {
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;

  discounts: number;
  shipping: number;
  taxes: number;
  refunds: number;

  netRevenue: number;
  contributionProfit: number;
  contributionMarginPct: number;

  totalLeak: number;
  losingCount: number;
  missingCostCount: number;

  previousMarginPct: number;
  marginDelta: number;
  previousRevenue: number;
  revenueDeltaPct: number;
};

export type Row = {
  productId: string;
  productTitle: string;
  qty: number;
  revenue: number;
  cogs: number;
  discounts: number;
  refunds: number;
  profit: number;
  marginPct: number;
  losing: boolean;
  lowMargin: boolean;
  avgPrice: number;
  avgCost: number;
  breakEvenPrice: number;
  targetPrice: number;
  targetDelta: number;
  suggestion: string;
  missingCost: boolean;
};

export type TrendPoint = {
  date: string;
  revenue: number;
  profit: number;
};

export type LoaderData = {
  summary: Summary;
  rows: Row[];
  trend: TrendPoint[];
  billingActive: boolean;
  period: string;
  shopHandle: string;
};

export function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

export function toYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function extractNumericId(gid: string) {
  return gid.split("/").pop() || "";
}