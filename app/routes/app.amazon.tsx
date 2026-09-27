import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import DashboardNav from "~/components/dashboard/DashboardNav";
import { useI18n } from "~/components/i18n/I18nProvider";
import { MetricCard, PremiumEmptyState, PremiumHero, ResponsiveGrid, StatusChip } from
  "~/components/ui/VisualSystem";
import { loadAmazonProfitDiagnostic } from "~/connectors/amazon/amazon-profit-ui.server";
import prisma from "~/db.server";
import { authenticateShopifyTenant } from "~/services/authenticated-shopify-context.server";
import amazonStylesUrl from "~/styles/amazon-profit.css?url";
import dashboardStylesUrl from "~/styles/dashboard.css?url";

export const links = () => [
  { rel: "stylesheet", href: dashboardStylesUrl },
  { rel: "stylesheet", href: amazonStylesUrl },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { tenant } = await authenticateShopifyTenant(request);
  return loadAmazonProfitDiagnostic({ db: prisma, accountId: tenant.accountId });
};

export default function AmazonProfitPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { messages } = useI18n();
  const copy = messages.amazonProfit;
  const reason = (key: keyof typeof copy.reasons) => copy.reasons[key];

  return <div className="amazon-profit-page">
    <DashboardNav active="amazon" navigate={navigate} />
    <main className="amazon-profit-content">
      <PremiumHero eyebrow="Amazon" title={copy.title} description={copy.description} tone="orange" />
      {data.state === "NO_CONNECTION" ?
        <PremiumEmptyState title={copy.noConnection} description={copy.noConnectionHint} tone="neutral" /> : null}
      {data.state === "NO_ORDERS" ?
        <PremiumEmptyState title={copy.noOrders} description={copy.noOrdersHint} tone="neutral" /> : null}
      {data.state === "RESULT" ? <section aria-labelledby="amazon-order-heading">
        <header className="amazon-profit-order-header">
          <div><p>{copy.order}</p><h2 id="amazon-order-heading">{data.result.sourceOrderId ?? copy.unknownOrder}</h2>
            <span>{copy.marketplace} {data.result.marketplaceId ?? copy.unknownMarketplace}</span></div>
          <StatusChip tone={data.result.status === "READY" ? "green" : "amber"}>
            {data.result.status === "READY" ? copy.ready : copy.blocked}
          </StatusChip>
        </header>
        {data.result.status === "READY" ? <ResponsiveGrid columns={5} className="amazon-profit-grid">
          <MetricCard label={copy.revenue} value={data.result.revenue} tone="blue" />
          <MetricCard label={copy.fees} value={data.result.amazonFees} tone="red" />
          <MetricCard label={copy.cogs} value={data.result.cogs} tone="amber" />
          <MetricCard label={copy.tax} value={data.result.tax} tone="neutral" />
          <MetricCard label={copy.profit} value={data.result.profit} detail={copy.exactCanonicalResult}
            tone="green" className="amazon-profit-primary" />
        </ResponsiveGrid> : <div className="amazon-profit-blocked" role="status">
          <h3>{copy.profitUnavailable}</h3><p>{reason(data.result.reasonKey)}</p>
        </div>}
      </section> : null}
    </main>
  </div>;
}
