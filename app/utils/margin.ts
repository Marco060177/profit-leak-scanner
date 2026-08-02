import {
  formatMoney,
  formatPercent,
} from "~/utils/formatting";

export type Summary = {
  /*
   * CAMPI COMPATIBILI
   *
   * revenue = ricavo netto dei prodotti
   * profit = profitto lordo dei prodotti
   * marginPct = margine lordo dei prodotti
   */
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

  /*
   * NUOVO MODELLO ECONOMICO
   *
   * Questi campi vengono introdotti progressivamente.
   * Restano opzionali durante la migrazione per mantenere
   * compatibili le pagine che usano ancora il vecchio modello.
   */
  grossProductSales?: number;
  refundedProductRevenue?: number;
  netProductRevenue?: number;

  shippingRevenue?: number;
  productCogs?: number;

  grossProfit?: number;
  grossMarginPct?: number;

  orderedQuantity?: number;
  refundedQuantity?: number;
  netQuantity?: number;

  discountRatePct?: number;
  refundRatePct?: number;

  losingProductRevenue?: number;
  lowMarginProductRevenue?: number;
  missingCostRevenue?: number;
  revenueCoveragePct?: number;

  /*
   * MODELLO GROWTH
   */
  allocatedAds?: number;
  allocatedShippingCost?: number;
  allocatedOperatingCost?: number;

  paymentFees?: number;
  transactionFees?: number;
  taxReserve?: number;

  adjustedProfit?: number;
  adjustedMarginPct?: number;
};

export type Row = {
  productId: string;
  productTitle: string;

  /*
   * CAMPI COMPATIBILI
   *
   * qty = quantità netta dopo i resi
   * revenue = ricavo netto prodotto
   * profit = profitto lordo prodotto
   * marginPct = margine lordo prodotto
   */
  qty: number;
  revenue: number;
  cogs: number;
  discounts: number;
  refunds: number;
  profit: number;
  marginPct: number;

  previousMarginPct: number | null;
  productMarginDelta: number | null;

  losing: boolean;
  lowMargin: boolean;

  avgPrice: number;
  avgCost: number;
  breakEvenPrice: number;
  targetPrice: number;
  targetDelta: number;

  suggestion: string;
  missingCost: boolean;

  /*
   * NUOVO MODELLO ECONOMICO PER PRODOTTO
   */
  orderedQuantity?: number;
  refundedQuantity?: number;
  netQuantity?: number;

  grossProductSales?: number;
  netProductSales?: number;
  refundedProductRevenue?: number;
  salesTaxes?: number;
  netProductRevenue?: number;

  productCogs?: number;
  grossProfit?: number;
  grossMarginPct?: number;

  discountRatePct?: number;
  refundRatePct?: number;

  revenueSharePct?: number;
  profitSharePct?: number;

  /*
   * MODELLO GROWTH PER PRODOTTO
   */
  allocatedAds?: number;
  allocatedShippingCost?: number;
  allocatedOperatingCost?: number;

  paymentFees?: number;
  transactionFees?: number;
  taxReserve?: number;

  adjustedProfit?: number;
  adjustedMarginPct?: number;
};

export type TrendPoint = {
  date: string;

  /*
   * CAMPI COMPATIBILI
   *
   * revenue = ricavo netto prodotti
   * profit = profitto lordo prodotti
   */
  revenue: number;
  profit: number;

  /*
   * NUOVO MODELLO ECONOMICO DEL TREND
   */
  grossProductSales?: number;
  discounts?: number;
  refundedProductRevenue?: number;
  netProductRevenue?: number;

  shippingRevenue?: number;
  productCogs?: number;

  grossProfit?: number;
  adjustedProfit?: number;
};

export type BillingPlan =
  | "NONE"
  | "STARTER"
  | "GROWTH";

export type BillingStatus = {
  active: boolean;
  plan: BillingPlan;
  subscriptionName: string | null;
};

export type LoaderData = {
  summary: Summary;
  rows: Row[];
  marginDeterioration: Row[];
  trend: TrendPoint[];

  /*
   * Manteniamo billingActive per non rompere
   * le pagine esistenti.
   */
  billingActive: boolean;

  /*
   * Verrà popolato quando realizzeremo
   * l'autorizzazione definitiva per piano.
   */
  billing?: BillingStatus;

  period: string;
  shopHandle: string;

  currencyCode: string;
  timeZone: string;
};

export function money(
  n: number,
  currencyCode = "USD",
  locale = "en-US",
  digits = 2,
) {
  return formatMoney(n, {
    currencyCode,
    locale,
    digits,
  });
}

export function pct(
  n: number,
  locale = "en-US",
  digits = 1,
) {
  return formatPercent(n, {
    locale,
    digits,
  });
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