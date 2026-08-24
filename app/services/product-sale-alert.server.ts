import type { ProfitAlert } from "~/utils/profit-monitor";
import {
    createAlertNotificationDelivery,
    getNotificationPreferences,
    normalizeNotificationLanguage,
    shouldNotifyAlert,
    type NotificationLanguage,
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

const PRODUCT_ALERT_COPY: Record<NotificationLanguage, {
    lossTitle: string;
    missingTitle: string;
    weakTitle: string;
    lossDescription: (product: string, order: string) => string;
    missingDescription: (product: string, order: string) => string;
    weakDescription: (product: string, order: string) => string;
    action: string;
    lossSubject: (product: string) => string;
    missingSubject: (product: string) => string;
    weakSubject: (product: string) => string;
}> = {
    en: {
        lossTitle: "Product sold at a loss", missingTitle: "Missing cost", weakTitle: "Weak margin", action: "Review product",
        lossDescription: (product, order) => `${product} was just sold in order ${order} and the sale is loss-making based on the order's net product revenue and the current Shopify cost.`,
        missingDescription: (product, order) => `${product} was just sold in order ${order}, but its Shopify cost is missing.`,
        weakDescription: (product, order) => `${product} was just sold in order ${order} with a margin below 10%.`,
        lossSubject: (product) => `MarginLab: product sold at a loss — ${product}`, missingSubject: (product) => `MarginLab: missing cost on a product just sold — ${product}`, weakSubject: (product) => `MarginLab: weak margin on a product just sold — ${product}`,
    },
    it: {
        lossTitle: "Prodotto venduto in perdita", missingTitle: "Costo mancante", weakTitle: "Margine debole", action: "Controlla prodotto",
        lossDescription: (product, order) => `${product} è stato appena venduto nell'ordine ${order} e la vendita risulta in perdita sulla base del prezzo netto dell'ordine e del costo Shopify corrente.`,
        missingDescription: (product, order) => `${product} è stato appena venduto nell'ordine ${order}, ma il costo Shopify non è disponibile.`,
        weakDescription: (product, order) => `${product} è stato appena venduto nell'ordine ${order} con un margine inferiore al 10%.`,
        lossSubject: (product) => `MarginLab: prodotto venduto in perdita — ${product}`, missingSubject: (product) => `MarginLab: costo mancante su un prodotto appena venduto — ${product}`, weakSubject: (product) => `MarginLab: margine debole su un prodotto appena venduto — ${product}`,
    },
    fr: {
        lossTitle: "Produit vendu à perte", missingTitle: "Coût manquant", weakTitle: "Marge faible", action: "Examiner le produit",
        lossDescription: (product, order) => `${product} vient d'être vendu dans la commande ${order} et la vente est déficitaire d'après le chiffre d'affaires net de la commande et le coût Shopify actuel.`,
        missingDescription: (product, order) => `${product} vient d'être vendu dans la commande ${order}, mais son coût Shopify n'est pas disponible.`,
        weakDescription: (product, order) => `${product} vient d'être vendu dans la commande ${order} avec une marge inférieure à 10 %.` ,
        lossSubject: (product) => `MarginLab : produit vendu à perte — ${product}`, missingSubject: (product) => `MarginLab : coût manquant sur un produit qui vient d'être vendu — ${product}`, weakSubject: (product) => `MarginLab : marge faible sur un produit qui vient d'être vendu — ${product}`,
    },
    de: {
        lossTitle: "Produkt mit Verlust verkauft", missingTitle: "Fehlende Kosten", weakTitle: "Schwache Marge", action: "Produkt prüfen",
        lossDescription: (product, order) => `${product} wurde soeben in Bestellung ${order} verkauft. Auf Basis des Nettoproduktumsatzes der Bestellung und der aktuellen Shopify-Kosten ist der Verkauf verlustbringend.`,
        missingDescription: (product, order) => `${product} wurde soeben in Bestellung ${order} verkauft, aber die Shopify-Kosten sind nicht verfügbar.`,
        weakDescription: (product, order) => `${product} wurde soeben in Bestellung ${order} mit einer Marge von unter 10 % verkauft.`,
        lossSubject: (product) => `MarginLab: Produkt mit Verlust verkauft — ${product}`, missingSubject: (product) => `MarginLab: fehlende Kosten bei einem soeben verkauften Produkt — ${product}`, weakSubject: (product) => `MarginLab: schwache Marge bei einem soeben verkauften Produkt — ${product}`,
    },
    es: {
        lossTitle: "Producto vendido con pérdidas", missingTitle: "Coste faltante", weakTitle: "Margen débil", action: "Revisar producto",
        lossDescription: (product, order) => `${product} se acaba de vender en el pedido ${order} y la venta genera pérdidas según los ingresos netos del pedido y el coste actual de Shopify.`,
        missingDescription: (product, order) => `${product} se acaba de vender en el pedido ${order}, pero su coste de Shopify no está disponible.`,
        weakDescription: (product, order) => `${product} se acaba de vender en el pedido ${order} con un margen inferior al 10 %.`,
        lossSubject: (product) => `MarginLab: producto vendido con pérdidas — ${product}`, missingSubject: (product) => `MarginLab: coste faltante en un producto recién vendido — ${product}`, weakSubject: (product) => `MarginLab: margen débil en un producto recién vendido — ${product}`,
    },
    "pt-BR": {
        lossTitle: "Produto vendido com prejuízo", missingTitle: "Custo não informado", weakTitle: "Margem baixa", action: "Revisar produto",
        lossDescription: (product, order) => `${product} acaba de ser vendido no pedido ${order} e a venda gera prejuízo com base na receita líquida do pedido e no custo atual da Shopify.`,
        missingDescription: (product, order) => `${product} acaba de ser vendido no pedido ${order}, mas seu custo na Shopify não está disponível.`,
        weakDescription: (product, order) => `${product} acaba de ser vendido no pedido ${order} com margem inferior a 10%.`,
        lossSubject: (product) => `MarginLab: produto vendido com prejuízo — ${product}`, missingSubject: (product) => `MarginLab: custo não informado em um produto recém-vendido — ${product}`, weakSubject: (product) => `MarginLab: margem baixa em um produto recém-vendido — ${product}`,
    },
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
    language: NotificationLanguage;
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

    const copy = PRODUCT_ALERT_COPY[language];
    const title = `${issue === "loss" ? copy.lossTitle : issue === "missing-cost" ? copy.missingTitle : copy.weakTitle}: ${group.productTitle}`;
    const description = issue === "loss" ? copy.lossDescription(group.productTitle, orderName) : issue === "missing-cost" ? copy.missingDescription(group.productTitle, orderName) : copy.weakDescription(group.productTitle, orderName);

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
            actionLabel: copy.action,
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

function subjectFor(language: NotificationLanguage, productTitle: string, issue: "loss" | "low-margin" | "missing-cost") {
    const copy = PRODUCT_ALERT_COPY[language];
    return issue === "loss" ? copy.lossSubject(productTitle) : issue === "missing-cost" ? copy.missingSubject(productTitle) : copy.weakSubject(productTitle);
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

    const language = normalizeNotificationLanguage(preferences.language);
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
