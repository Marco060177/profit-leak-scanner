import type { CanonicalProfitResult } from "~/core/canonical-profit-result";
import type { LoaderData } from "~/utils/margin";
import { buildEconomicSnapshot } from "~/utils/economic-snapshot";

export const LEGACY_MARGIN_PROJECTION_VERSION = 1 as const;

/**
 * V1 adapter for existing route/intelligence consumers. The sidecar contains
 * legacy-only product and presentation fields calculated by the current
 * orchestration; the canonical result supplies the economic totals. Keeping
 * the sidecar explicit avoids mislabelling UI fields as canonical ledger data.
 */
export function projectLegacyMarginV1(
  canonical: CanonicalProfitResult,
  sidecar: Omit<LoaderData, "economicSnapshot">,
): LoaderData {
  const summary: LoaderData["summary"] = {
    ...sidecar.summary,
    revenue: canonical.totals.netSales,
    netRevenue: canonical.totals.netSales,
    netProductRevenue: canonical.totals.netSales,
    grossProductSales: canonical.components.grossProductSales,
    discounts: -canonical.components.discounts,
    refunds: -canonical.components.productRefunds,
    refundedProductRevenue: -canonical.components.productRefunds,
    cogs: -canonical.components.productCogs,
    productCogs: -canonical.components.productCogs,
    profit: canonical.totals.grossProfit,
    grossProfit: canonical.totals.grossProfit,
    marginPct: canonical.totals.grossMarginPct,
    grossMarginPct: canonical.totals.grossMarginPct,
    shipping: canonical.components.shippingRevenue,
    shippingRevenue: canonical.components.shippingRevenue,
    contributionProfit: canonical.totals.legacyShippingContribution,
    contributionMarginPct: canonical.totals.legacyShippingContributionMarginPct,
    taxes: canonical.tax.reportedTax,
    revenueCoveragePct: canonical.coverage.revenueCoveragePct,
    economicRevenue: canonical.tax.economicRevenue,
    economicCogs: canonical.tax.economicCogs,
    economicProfit: canonical.tax.economicProfit,
    economicMarginPct: canonical.tax.economicMarginPct,
  };
  const projected: LoaderData = { ...sidecar, summary };
  return {
    ...projected,
    economicSnapshot: buildEconomicSnapshot({
      summary,
      rows: projected.rows,
      period: projected.period,
      currencyCode: projected.currencyCode,
      analysisContext: projected.analysisContext,
    }),
  };
}
