import type { ProfitAlert } from "~/utils/profit-monitor";
import {
    createAlertNotificationDelivery,
    getNotificationPreferences,
    shouldNotifyAlert,
} from "~/services/notification.server";

type OrderLineItemPayload = {
    product_id?: number | string | null;
    variant_id?: number | string | null;
    title?: string | null;
    quantity?: number | null;
    price?: string | number | null;
    total_discount?: string | number | null;
    discount_allocations?: Array<{ amount?: string | number | null }> | null;
    tax_lines?: Array<{ price?: string | number | null }> | null;
};

type OrderCreatePayload = {
    id?: number | string | null;
    name?: string | null;
    currency?: string | null;
    taxes_included?: boolean | null;
    line_items?: OrderLineItemPayload[] | null;
};

type VariantCostNode = {
    id: string;
    product?: { id: string; title: string } | null;
    inventoryItem?: {
        unitCost?: { amount: string; currencyCode: string } | null;
    } | null;
};

type ProductSaleGroup = {
    productId: string;
    productTitle: string;
    quantity: number;
    revenue: number;
    cogs: number;
    missingCost: boolean;
    currencyCode: string;
};

function finite(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function sumAmounts(values: Array<{ amount?: string | number | null }> | null | undefined) {
    return (values ?? []).reduce((sum, item) => sum + Math.max(0, finite(item.amount)), 0);
}

function productGid(value: number | string) {
    return `gid://shopify/Product/${String(value)}`;
}

function variantGid(value: number | string) {
    return `gid://shopify/ProductVariant/${String(value)}`;
}

function buildAlert({
    language,
    group,
    orderName,
}: {
    language: "it" | "en";
    group: ProductSaleGroup;
    orderName: string;
}): { alert: ProfitAlert; issue: "loss" | "low-margin" | "missing-cost"; profit: number | null; marginPct: number | null } | null {
    const profit = group.missingCost ? null : group.revenue - group.cogs;
    const marginPct = profit !== null && group.revenue > 0 ? (profit / group.revenue) * 100 : null;

    const issue = group.missingCost
        ? ("missing-cost" as const)
        : profit !== null && profit < 0
            ? ("loss" as const)
            : marginPct !== null && marginPct < 10
                ? ("low-margin" as const)
                : null;

    if (!issue) return null;

    const title = language === "it"
        ? issue === "loss"
            ? `Prodotto venduto in perdita: ${group.productTitle}`
            : issue === "missing-cost"
                ? `Costo mancante: ${group.productTitle}`
                : `Margine debole: ${group.productTitle}`
        : issue === "loss"
            ? `Product sold at a loss: ${group.productTitle}`
            : issue === "missing-cost"
                ? `Missing cost: ${group.productTitle}`
                : `Weak margin: ${group.productTitle}`;

    const description = language === "it"
        ? issue === "loss"
            ? `${group.productTitle} è stato appena venduto nell'ordine ${orderName} e la vendita risulta in perdita sulla base del prezzo netto dell'ordine e del costo Shopify corrente.`
            : issue === "missing-cost"
                ? `${group.productTitle} è stato appena venduto nell'ordine ${orderName}, ma il costo Shopify non è disponibile.`
                : `${group.productTitle} è stato appena venduto nell'ordine ${orderName} con un margine inferiore al 10%.`
        : issue === "loss"
            ? `${group.productTitle} was just sold in order ${orderName} and the sale is loss-making based on the order's net product revenue and the current Shopify cost.`
            : issue === "missing-cost"
                ? `${group.productTitle} was just sold in order ${orderName}, but its Shopify cost is missing.`
                : `${group.productTitle} was just sold in order ${orderName} with a margin below 10%.`;

    return {
        issue,
        profit,
        marginPct,
        alert: {
            id: `product-sale-risk-${group.productId}`,
            severity: issue === "loss" ? "critical" : "warning",
            category:
                issue === "missing-cost"
                    ? "data-quality"
                    : "margin",
            title,
            description,
            monthlyImpact: 0,
            economicKind: "qualitative",
            priority: issue === "loss" ? 100 : issue === "missing-cost" ? 90 : 80,
            actionLabel: language === "it" ? "Controlla prodotto" : "Review product",
            route: "/app/products",
            businessAction: "action",
            effort: "easy",
            estimatedMinutes: 5,
            recommendedModule: "Products",
            productId: group.productId,
            productTitle: group.productTitle,
            metadata: {
                quantity: group.quantity,
                revenue: group.revenue,
                profit: profit ?? undefined,
                currentMargin: marginPct ?? undefined,
                missingCostCount: group.missingCost ? 1 : 0,
            },
        },
    };
}

function subjectFor(language: "it" | "en", productTitle: string, issue: "loss" | "low-margin" | "missing-cost") {
    if (language === "it") {
        if (issue === "loss") return `MarginLab: prodotto venduto in perdita — ${productTitle}`;
        if (issue === "missing-cost") return `MarginLab: costo mancante su un prodotto appena venduto — ${productTitle}`;
        return `MarginLab: margine debole su un prodotto appena venduto — ${productTitle}`;
    }
    if (issue === "loss") return `MarginLab: product sold at a loss — ${productTitle}`;
    if (issue === "missing-cost") return `MarginLab: missing cost on a product just sold — ${productTitle}`;
    return `MarginLab: weak margin on a product just sold — ${productTitle}`;
}

export async function queueProductSaleAlertsFromOrder({
    admin,
    shop,
    payload,
}: {
    admin: any;
    shop: string;
    payload: OrderCreatePayload;
}) {
    const preferences = await getNotificationPreferences(shop);

    if (!preferences || !preferences.recipientEmail || !preferences.emailAlertsEnabled) {
        return { queued: 0, reason: "email_alerts_disabled" } as const;
    }

    const lines = (payload.line_items ?? []).filter(
        (line) => line.product_id && line.variant_id && finite(line.quantity) > 0,
    );

    if (lines.length === 0) {
        return { queued: 0, reason: "no_product_lines" } as const;
    }

    const variantIds = [...new Set(lines.map((line) => variantGid(line.variant_id!)))];

    const response = await admin.graphql(
        `#graphql
      query MarginLabProductSaleCosts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            product { id title }
            inventoryItem {
              unitCost { amount currencyCode }
            }
          }
        }
      }
    `,
        { variables: { ids: variantIds } },
    );

    const json = await response.json();
    const nodes = (json?.data?.nodes ?? []) as Array<VariantCostNode | null>;
    const byVariantId = new Map(
        nodes.filter((node): node is VariantCostNode => Boolean(node?.id)).map((node) => [node.id, node]),
    );

    const groups = new Map<string, ProductSaleGroup>();

    for (const line of lines) {
        const quantity = Math.max(0, finite(line.quantity));
        const variant = byVariantId.get(variantGid(line.variant_id!));
        const productId = productGid(line.product_id!);
        const grossRevenue = Math.max(0, finite(line.price)) * quantity;
        const discount = line.discount_allocations?.length
            ? sumAmounts(line.discount_allocations)
            : Math.max(0, finite(line.total_discount));
        const includedTax = payload.taxes_included
            ? (line.tax_lines ?? []).reduce(
                (sum, item) =>
                    sum + Math.max(0, finite(item.price)),
                0,
            )
            : 0;
        const revenue = Math.max(0, grossRevenue - discount - includedTax);

        const rawCost = variant?.inventoryItem?.unitCost?.amount;
        const parsedCost = rawCost === undefined || rawCost === null ? null : Number(rawCost);
        const unitCost = parsedCost !== null && Number.isFinite(parsedCost) ? Math.max(0, parsedCost) : null;

        const current = groups.get(productId) ?? {
            productId,
            productTitle: variant?.product?.title || line.title || "Product",
            quantity: 0,
            revenue: 0,
            cogs: 0,
            missingCost: false,
            currencyCode: payload.currency || variant?.inventoryItem?.unitCost?.currencyCode || "USD",
        };

        current.quantity += quantity;
        current.revenue += revenue;
        if (unitCost === null) current.missingCost = true;
        else current.cogs += unitCost * quantity;

        groups.set(productId, current);
    }

    const language = preferences.language === "it" ? "it" : "en";
    const orderId = String(payload.id ?? "unknown-order");
    const orderName = payload.name?.trim() || `#${orderId}`;
    let queued = 0;

    for (const group of groups.values()) {
        const built = buildAlert({ language, group, orderName });
        if (!built) continue;
        if (!shouldNotifyAlert(built.alert, preferences)) continue;

        const result = await createAlertNotificationDelivery({
            shop,
            alert: built.alert,
            recipient: preferences.recipientEmail,
            periodDays: 1,
            monitorEventId: `order:${orderId}:product:${group.productId}`,
            subject: subjectFor(language, group.productTitle, built.issue),
            payload: {
                source: "product-sale-alert",
                language,
                alert: built.alert,
                sale: {
                    orderId,
                    orderName,
                    productId: group.productId,
                    productTitle: group.productTitle,
                    quantity: group.quantity,
                    revenue: group.revenue,
                    cogs: group.missingCost ? null : group.cogs,
                    profit: built.profit,
                    marginPct: built.marginPct,
                    missingCost: group.missingCost,
                    currencyCode: group.currencyCode,
                },
            },
        });

        if (result.created) queued += 1;
    }

    return { queued, reason: "processed" } as const;
}