import type { FeatureAvailability, FeatureCompleteness, FeatureData, FeatureMoney, FeatureOptionalMoney,
  FeatureProductEconomics, FeatureSummaryEconomics } from "./feature-data-contract";
import { addFeatureMoney, compareFeatureMoney, deriveFeaturePercentage, subtractFeatureMoney } from "./feature-money";

type Unavailable = Readonly<{ status: "UNAVAILABLE"; reasonCodes: readonly string[] }>;
type Available<T> = Readonly<{ status: "AVAILABLE"; value: T }>;
type Result<T> = Available<T> | Unavailable;
const unavailable = (...reasonCodes: string[]): Unavailable => ({ status: "UNAVAILABLE", reasonCodes });
const available = <T>(value: T): Available<T> => ({ status: "AVAILABLE", value });
const money = (value: FeatureOptionalMoney) => value.status === "AVAILABLE" ? value.value : null;
const zeroFor = (value: FeatureMoney): FeatureMoney => ({ amountAtoms: 0n, amountScale: value.amountScale,
  currencyCode: value.currencyCode });

export type ProfitIntelligenceProduct = Readonly<{
  productId: string | null; skuId: string | null; title: string | null;
  revenue: FeatureOptionalMoney; cogs: FeatureOptionalMoney; profit: FeatureOptionalMoney;
  marginPercentage: Result<number>; losing: Result<boolean>; lowMargin: Result<boolean>;
}>;

export type ProfitIntelligenceReady = Readonly<{
  status: "READY"; accountId: string; channelConnectionId: string; source: FeatureData["source"];
  currencyCode: string; completeness: FeatureCompleteness;
  summary: FeatureSummaryEconomics;
  store: Result<Readonly<{ marginPercentage: number; profitability: "PROFITABLE" | "BREAK_EVEN" | "LOSS" }>>;
  products: Result<readonly ProfitIntelligenceProduct[]>;
  productQuality: Result<Readonly<{ losingProducts: number; weakMarginProducts: number;
    healthyMarginProducts: number; level: "WEAK" | "MIXED" | "HEALTHY" }>>;
  revenueConcentration: Result<Readonly<{ topProductPercentage: number; top3Percentage: number;
    top5Percentage: number; dependencyLevel: "HIGH" | "MODERATE" | "LOW" }>>;
  periodComparison: Result<Readonly<{ revenueChange: FeatureMoney; revenueChangePercentage: number }>>;
  trendMovement: Result<Readonly<{ revenueChangePercentage: number; profitChangePercentage: number }>>;
  businessDrivers: Result<readonly Readonly<{ kind: "DISCOUNTS" | "REFUNDS" | "SHIPPING_REVENUE";
    value: FeatureMoney; impactPercentage: number }>[]>;
}>;

export type ProfitIntelligenceBlocked = Readonly<{
  status: "BLOCKED"; accountId: string; channelConnectionId: string; source: FeatureData["source"];
  reasonCodes: readonly string[];
}>;
export type ProfitIntelligenceModel = ProfitIntelligenceReady | ProfitIntelligenceBlocked;

function percentage(numerator: FeatureMoney, denominator: FeatureMoney): Result<number> {
  const result = deriveFeaturePercentage(numerator, denominator);
  return result.status === "DEFINED" ? available(result.value) : unavailable(`RATIO_${result.reason}`);
}

function productModel(product: FeatureProductEconomics): ProfitIntelligenceProduct {
  const revenue = money(product.revenue), profit = money(product.profit);
  const marginPercentage = revenue && profit ? percentage(profit, revenue) : unavailable("PRODUCT_MARGIN_UNAVAILABLE");
  const losing = profit ? available(compareFeatureMoney(profit, zeroFor(profit)) < 0) :
    unavailable("PRODUCT_PROFIT_UNAVAILABLE");
  const lowMargin = marginPercentage.status === "AVAILABLE" ?
    available(marginPercentage.value > 0 && marginPercentage.value < 10) : unavailable(...marginPercentage.reasonCodes);
  return { productId: product.productId, skuId: product.skuId, title: product.title,
    revenue: product.revenue, cogs: product.cogs, profit: product.profit, marginPercentage, losing, lowMargin };
}

function productAnalysis(products: readonly FeatureProductEconomics[], capability: FeatureAvailability) {
  if (capability.status !== "AVAILABLE") return unavailable(...(capability.reasonCodes ?? ["PRODUCT_ECONOMICS_UNAVAILABLE"]));
  return available(products.map(productModel));
}

function concentration(products: readonly FeatureProductEconomics[], summary: FeatureSummaryEconomics) {
  const total = money(summary.revenue);
  if (!total) return unavailable("STORE_REVENUE_UNAVAILABLE");
  const revenues = products.map((product) => money(product.revenue));
  if (revenues.some((value) => value === null)) return unavailable("PRODUCT_REVENUE_UNAVAILABLE");
  const sorted = (revenues as FeatureMoney[]).sort((left, right) => compareFeatureMoney(right, left));
  const sum = (values: readonly FeatureMoney[]) => values.reduce(addFeatureMoney, zeroFor(total));
  const topProduct = percentage(sum(sorted.slice(0, 1)), total);
  const top3 = percentage(sum(sorted.slice(0, 3)), total);
  const top5 = percentage(sum(sorted.slice(0, 5)), total);
  if (topProduct.status !== "AVAILABLE" || top3.status !== "AVAILABLE" || top5.status !== "AVAILABLE")
    return unavailable("REVENUE_CONCENTRATION_UNAVAILABLE");
  return available({ topProductPercentage: topProduct.value, top3Percentage: top3.value,
    top5Percentage: top5.value, dependencyLevel: top3.value > 60 ? "HIGH" as const :
      top3.value > 35 ? "MODERATE" as const : "LOW" as const });
}

function productQuality(products: readonly ProfitIntelligenceProduct[]) {
  if (products.some((product) => product.losing.status !== "AVAILABLE" ||
      product.marginPercentage.status !== "AVAILABLE" || money(product.revenue) === null))
    return unavailable("PRODUCT_QUALITY_ECONOMICS_UNAVAILABLE");
  const economicallyActive = products.filter((product) => {
    const revenue = money(product.revenue)!;
    return compareFeatureMoney(revenue, zeroFor(revenue)) > 0;
  });
  const losingProducts = products.filter((product) => product.losing.status === "AVAILABLE" && product.losing.value).length;
  const weakMarginProducts = economicallyActive.filter((product) => product.marginPercentage.status === "AVAILABLE" &&
    product.marginPercentage.value < 15).length;
  const healthyMarginProducts = economicallyActive.filter((product) => product.marginPercentage.status === "AVAILABLE" &&
    product.marginPercentage.value >= 30).length;
  return available({ losingProducts, weakMarginProducts, healthyMarginProducts,
    level: weakMarginProducts > healthyMarginProducts ? "WEAK" as const :
      weakMarginProducts > 0 ? "MIXED" as const : "HEALTHY" as const });
}

function comparison(data: Extract<FeatureData, { status: "READY" }>) {
  if (!data.previous || data.capabilities.periodComparison.status !== "AVAILABLE")
    return unavailable("PERIOD_COMPARISON_UNAVAILABLE");
  const current = money(data.current.summary.revenue), previous = money(data.previous.summary.revenue);
  if (!current || !previous) return unavailable("PERIOD_REVENUE_UNAVAILABLE");
  const change = subtractFeatureMoney(current, previous), changePercentage = percentage(change, previous);
  return changePercentage.status === "AVAILABLE" ? available({ revenueChange: change,
    revenueChangePercentage: changePercentage.value }) : unavailable(...changePercentage.reasonCodes);
}

function trend(data: Extract<FeatureData, { status: "READY" }>) {
  if (data.capabilities.trend.status !== "AVAILABLE")
    return unavailable(...(data.capabilities.trend.reasonCodes ?? ["TREND_UNAVAILABLE"]));
  const first = data.current.trend[0], last = data.current.trend[data.current.trend.length - 1];
  if (!first || !last) return unavailable("TREND_POINTS_UNAVAILABLE");
  const firstRevenue = money(first.economics.revenue), lastRevenue = money(last.economics.revenue);
  const firstProfit = money(first.economics.profit), lastProfit = money(last.economics.profit);
  if (!firstRevenue || !lastRevenue || !firstProfit || !lastProfit) return unavailable("TREND_ECONOMICS_UNAVAILABLE");
  const revenue = percentage(subtractFeatureMoney(lastRevenue, firstRevenue), firstRevenue);
  const profit = percentage(subtractFeatureMoney(lastProfit, firstProfit), firstProfit);
  return revenue.status === "AVAILABLE" && profit.status === "AVAILABLE" ?
    available({ revenueChangePercentage: revenue.value, profitChangePercentage: profit.value }) :
    unavailable("TREND_RATIO_UNAVAILABLE");
}

function drivers(summary: FeatureSummaryEconomics) {
  const values = [
    ["DISCOUNTS", money(summary.discounts)], ["REFUNDS", money(summary.refunds)],
    ["SHIPPING_REVENUE", money(summary.shippingRevenue)],
  ] as const;
  if (values.some(([, value]) => value === null)) return unavailable("BUSINESS_DRIVER_ECONOMICS_UNAVAILABLE");
  const exact = values as readonly (readonly ["DISCOUNTS" | "REFUNDS" | "SHIPPING_REVENUE", FeatureMoney])[];
  const total = exact.map(([, value]) => value).reduce(addFeatureMoney, zeroFor(exact[0][1]));
  if (compareFeatureMoney(total, zeroFor(total)) === 0) return available([]);
  const result = [];
  for (const [kind, value] of exact.filter(([, candidate]) => compareFeatureMoney(candidate, zeroFor(candidate)) > 0)) {
    const impact = percentage(value, total);
    if (impact.status !== "AVAILABLE") return unavailable(...impact.reasonCodes);
    result.push({ kind, value, impactPercentage: impact.value });
  }
  return available(result);
}

export function buildProfitIntelligenceModel(data: FeatureData): ProfitIntelligenceModel {
  if (data.status === "BLOCKED") return { status: "BLOCKED", accountId: data.accountId,
    channelConnectionId: data.channelConnectionId, source: data.source, reasonCodes: data.reasonCodes };
  const revenue = money(data.current.summary.revenue), profit = money(data.current.summary.profit);
  const margin = revenue && profit ? percentage(profit, revenue) : unavailable("STORE_PROFITABILITY_UNAVAILABLE");
  const store = margin.status === "AVAILABLE" && profit ? available({ marginPercentage: margin.value,
    profitability: compareFeatureMoney(profit, zeroFor(profit)) < 0 ? "LOSS" as const :
      compareFeatureMoney(profit, zeroFor(profit)) === 0 ? "BREAK_EVEN" as const : "PROFITABLE" as const }) :
    unavailable("STORE_PROFITABILITY_UNAVAILABLE");
  const products = productAnalysis(data.current.products, data.capabilities.productEconomics);
  return { status: "READY", accountId: data.accountId, channelConnectionId: data.channelConnectionId,
    source: data.source, currencyCode: data.currencyCode, completeness: data.completeness,
    summary: data.current.summary, store, products, productQuality: products.status === "AVAILABLE" ?
      productQuality(products.value) : unavailable(...products.reasonCodes), revenueConcentration: concentration(data.current.products,
      data.current.summary), periodComparison: comparison(data), trendMovement: trend(data),
    businessDrivers: drivers(data.current.summary) };
}
