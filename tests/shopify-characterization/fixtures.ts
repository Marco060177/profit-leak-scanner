type Money = { shopMoney: { amount: string } };

const money = (amount: number): Money => ({ shopMoney: { amount: String(amount) } });
const taxLine = (amount: number) => ({ title: "Tax", rate: 0.2, priceSet: money(amount) });

export function lineItem({
  id,
  productId,
  title,
  quantity = 1,
  original,
  discounted = original,
  allocations = [],
  cost,
  taxable = true,
  tax = 0,
}: {
  id: string;
  productId?: string;
  title?: string;
  quantity?: number;
  original: number;
  discounted?: number;
  allocations?: number[];
  cost?: number | null;
  taxable?: boolean;
  tax?: number;
}) {
  return {
    node: {
      id: `gid://shopify/LineItem/${id}`,
      quantity,
      taxable,
      taxLines: tax ? [taxLine(tax)] : [],
      discountedTotalSet: money(discounted),
      originalTotalSet: money(original),
      discountAllocations: allocations.map((value) => ({ allocatedAmountSet: money(value) })),
      variant: productId
        ? {
            product: { id: `gid://shopify/Product/${productId}`, title: title ?? `Product ${productId}` },
            inventoryItem: { unitCost: cost === undefined || cost === null ? null : { amount: String(cost) } },
          }
        : null,
    },
  };
}

export function refundLine({
  line,
  quantity,
  subtotal,
  tax = 0,
}: {
  line: ReturnType<typeof lineItem>;
  quantity: number;
  subtotal: number;
  tax?: number;
}) {
  return {
    node: {
      quantity,
      subtotalSet: money(subtotal),
      totalTaxSet: money(tax),
      lineItem: line.node,
    },
  };
}

export function order({
  id,
  processedAt,
  lines,
  refunds = [],
  shipping = 0,
  shippingTax = 0,
  totalTax = 0,
  taxesIncluded = false,
  taxExempt = false,
  truncated = [],
}: {
  id: string;
  processedAt: string;
  lines: ReturnType<typeof lineItem>[];
  refunds?: ReturnType<typeof refundLine>[];
  shipping?: number;
  shippingTax?: number;
  totalTax?: number;
  taxesIncluded?: boolean;
  taxExempt?: boolean;
  truncated?: Array<"lineItems" | "refundLineItems" | "shippingLines">;
}) {
  return {
    node: {
      id: `gid://shopify/Order/${id}`,
      name: `#${id}`,
      processedAt,
      taxesIncluded,
      taxExempt,
      totalShippingPriceSet: money(shipping),
      totalTaxSet: money(totalTax),
      shippingLines: {
        pageInfo: { hasNextPage: truncated.includes("shippingLines") },
        edges: shipping || shippingTax
          ? [{ node: { title: "Shipping", discountedPriceSet: money(shipping), taxLines: shippingTax ? [taxLine(shippingTax)] : [] } }]
          : [],
      },
      refunds: refunds.length
        ? [{ refundLineItems: { pageInfo: { hasNextPage: truncated.includes("refundLineItems") }, edges: refunds } }]
        : [],
      lineItems: {
        pageInfo: { hasNextPage: truncated.includes("lineItems") },
        edges: lines,
      },
    },
  };
}

const currentA = lineItem({ id: "101", productId: "1", title: "Alpha", quantity: 2, original: 100, discounted: 90, allocations: [10], cost: 20, tax: 16.36 });
const currentB = lineItem({ id: "102", productId: "1", title: "Alpha", original: 60, discounted: 50, cost: 25 });
const fullRefund = lineItem({ id: "103", productId: "2", title: "Beta", original: 40, cost: null, tax: 4 });
const missingVariant = lineItem({ id: "104", original: 15, taxable: false });
const missingCost = lineItem({ id: "105", productId: "4", title: "No cost", original: 30, cost: null, taxable: false });
const fullRefundWithCost = lineItem({ id: "106", productId: "5", title: "Returned", original: 50, cost: 10, taxable: false });
const previousAlpha = lineItem({ id: "201", productId: "1", title: "Alpha", original: 100, cost: 20, tax: 16.36 });

export const comprehensiveScenario = {
  appData: { shop: { currencyCode: "EUR", ianaTimezone: "Europe/Rome", billingAddress: { countryCodeV2: "US" } } },
  currentPages: [
    [order({ id: "1", processedAt: "2026-08-10T10:00:00Z", lines: [currentA], refunds: [refundLine({ line: currentA, quantity: 1, subtotal: 45, tax: 8.18 })], shipping: 5, shippingTax: 0.91, totalTax: 17.27, taxesIncluded: true, truncated: ["lineItems"] })],
    [order({ id: "2", processedAt: "2026-08-20T10:00:00Z", lines: [currentB, fullRefund, missingVariant, fullRefundWithCost], refunds: [refundLine({ line: fullRefund, quantity: 1, subtotal: 40, tax: 4 }), refundLine({ line: missingVariant, quantity: 1, subtotal: 15 }), refundLine({ line: fullRefundWithCost, quantity: 1, subtotal: 50 })], shipping: 10, shippingTax: 1, totalTax: 5, truncated: ["refundLineItems", "shippingLines"] }), order({ id: "3", processedAt: "2026-08-25T10:00:00Z", lines: [missingCost], taxExempt: true })],
  ],
  previousPages: [[order({ id: "4", processedAt: "2026-07-15T10:00:00Z", lines: [previousAlpha], totalTax: 16.36, taxesIncluded: true, truncated: ["shippingLines"] })]],
};

export const fallbackTaxScenario = {
  appData: { shop: { currencyCode: "EUR", ianaTimezone: "Europe/Rome", billingAddress: { countryCodeV2: "IT" } } },
  currentPages: [[order({ id: "10", processedAt: "2026-08-12T10:00:00Z", lines: [lineItem({ id: "301", productId: "9", title: "Fallback", original: 122, cost: 61, taxable: false })], taxesIncluded: true })]],
  previousPages: [[]],
};

export type ShopifyScenario = typeof comprehensiveScenario;

export function createAdmin(scenario: { appData: unknown; currentPages: unknown[][]; previousPages: unknown[][] }) {
  const queries: Array<{ q?: string; after?: string | null }> = [];
  const documents: string[] = [];
  const pageIndexes = new Map<string, number>();

  return {
    queries,
    documents,
    admin: {
      async graphql(query: string, options?: { variables?: { q?: string; after?: string | null } }) {
        documents.push(query);
        if (!options?.variables?.q) {
          return new Response(JSON.stringify({ data: scenario.appData }));
        }

        const variables = { ...options.variables, q: options.variables.q };
        queries.push(variables);
        const isPrevious = variables.q.includes("processed_at:<2026-08-01");
        const key = isPrevious ? "previous" : "current";
        const pages = isPrevious ? scenario.previousPages : scenario.currentPages;
        const index = pageIndexes.get(key) ?? 0;
        pageIndexes.set(key, index + 1);
        const edges = pages[index] ?? [];
        const hasNextPage = index < pages.length - 1;
        return new Response(JSON.stringify({ data: { orders: { pageInfo: { hasNextPage, endCursor: hasNextPage ? `${key}-${index + 1}` : null }, edges } } }));
      },
    },
  };
}
