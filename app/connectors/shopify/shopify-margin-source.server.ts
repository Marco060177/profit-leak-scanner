import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type {
  MarginLabAppDataQuery,
  MarginLabOrdersQuery,
} from "~/types/admin.generated";

export type ShopifyMarginOrderEdge =
  MarginLabOrdersQuery["orders"]["edges"][number];

type GraphqlError = {
  message?: string;
  extensions?: { code?: string };
};
type ShopifyThrottleStatus = {
  maximumAvailable?: number;
  currentlyAvailable?: number;
  restoreRate?: number;
};
type ShopifyGraphqlExtensions = {
  cost?: {
    requestedQueryCost?: number;
    throttleStatus?: ShopifyThrottleStatus;
  };
};
type AppDataGraphqlResponse = {
  errors?: GraphqlError[];
  data?: MarginLabAppDataQuery;
};

type OrdersGraphqlResponse = {
  errors?: GraphqlError[];
  data?: MarginLabOrdersQuery;
  extensions?: ShopifyGraphqlExtensions;
};

type ShopifyMarginFetchOptions = {
  maxAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const THROTTLE_SAFETY_MARGIN_MS = 250;
const MAX_THROTTLE_WAIT_MS = 30_000;

const ORDERS_QUERY = `#graphql
  query MarginLabOrders($q: String!, $after: String) {
    orders(
      first: 25
      after: $after
      sortKey: PROCESSED_AT
      reverse: true
      query: $q
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id name processedAt taxesIncluded taxExempt
          totalShippingPriceSet { shopMoney { amount } }
          totalTaxSet { shopMoney { amount } }
          shippingLines(first: 10) {
            pageInfo { hasNextPage }
            edges { node { title discountedPriceSet { shopMoney { amount } } taxLines { title rate priceSet { shopMoney { amount } } } } }
          }
          refunds {
            refundLineItems(first: 100) {
              pageInfo { hasNextPage }
              edges {
                node {
                  quantity subtotalSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } }
                  lineItem { id variant { product { id title } inventoryItem { unitCost { amount } } } }
                }
              }
            }
          }
          lineItems(first: 150) {
            pageInfo { hasNextPage }
            edges {
              node {
                id quantity taxable
                taxLines { title rate priceSet { shopMoney { amount } } }
                discountedTotalSet { shopMoney { amount } }
                originalTotalSet { shopMoney { amount } }
                discountAllocations { allocatedAmountSet { shopMoney { amount } } }
                variant { product { id title } inventoryItem { unitCost { amount } } }
              }
            }
          }
        }
      }
    }
  }
`;

const APP_DATA_QUERY = `#graphql
  query MarginLabAppData {
    shop {
      currencyCode
      ianaTimezone
      billingAddress { countryCodeV2 }
    }
  }
`;

const graphqlErrorDetails = (error: unknown) =>
  typeof error === "object" && error !== null && "graphQLErrors" in error
    ? (error.graphQLErrors ?? error)
    : error;

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function extractThrownGraphqlErrors(error: unknown): GraphqlError[] {
  const value = objectValue(error);
  const body = objectValue(value?.body);
  const bodyErrors = objectValue(body?.errors);
  const candidates = value?.graphQLErrors ?? bodyErrors?.graphQLErrors;
  return Array.isArray(candidates) ? candidates as GraphqlError[] : [];
}

function extractThrownExtensions(error: unknown): ShopifyGraphqlExtensions | undefined {
  const value = objectValue(error);
  const response = objectValue(value?.response);
  const responseBody = objectValue(response?.body);
  const body = objectValue(value?.body);
  return (response?.extensions ?? responseBody?.extensions ?? body?.extensions ?? value?.extensions) as
    | ShopifyGraphqlExtensions
    | undefined;
}

function isOnlyThrottled(errors: GraphqlError[] | undefined) {
  return Boolean(
    errors?.length &&
    errors.every((error) => error.extensions?.code === "THROTTLED"),
  );
}

function throttleDelayMs(
  extensions: ShopifyGraphqlExtensions | undefined,
  attempt: number,
) {
  const requested = extensions?.cost?.requestedQueryCost;
  const status = extensions?.cost?.throttleStatus;
  const available = status?.currentlyAvailable;
  const restoreRate = status?.restoreRate;

  if (
    Number.isFinite(requested) &&
    Number.isFinite(available) &&
    Number.isFinite(restoreRate) &&
    (restoreRate ?? 0) > 0
  ) {
    const deficit = Math.max(0, (requested ?? 0) - (available ?? 0));
    return Math.min(
      MAX_THROTTLE_WAIT_MS,
      Math.ceil((deficit / (restoreRate ?? 1)) * 1000) + THROTTLE_SAFETY_MARGIN_MS,
    );
  }

  return Math.min(MAX_THROTTLE_WAIT_MS, 1000 * 2 ** (attempt - 1));
}

function requestedCostExceedsMaximum(extensions: ShopifyGraphqlExtensions | undefined) {
  const requested = extensions?.cost?.requestedQueryCost;
  const maximum = extensions?.cost?.throttleStatus?.maximumAvailable;
  return Number.isFinite(requested) && Number.isFinite(maximum) && (requested ?? 0) > (maximum ?? 0);
}

async function defaultSleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchShopifyMarginAppData(admin: AdminApiContext) {
  const response = await admin.graphql(APP_DATA_QUERY);
  const json: AppDataGraphqlResponse = await response.json();

  if (json?.errors?.length) {
    throw new Error(
      `Unable to load Shopify app data: ${json.errors
        .map((error) => error?.message ?? "Unknown GraphQL error")
        .join("; ")} `,
    );
  }

  return json?.data?.shop;
}

export async function fetchShopifyMarginOrders(
  admin: AdminApiContext,
  query: string,
  options: ShopifyMarginFetchOptions = {},
) {
  const edges: ShopifyMarginOrderEdge[] = [];
  let after: string | null = null;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const sleep = options.sleep ?? defaultSleep;

  do {
    let json: OrdersGraphqlResponse | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await admin.graphql(ORDERS_QUERY, {
          variables: { q: query, after },
        });
        json = await response.json() as OrdersGraphqlResponse;

        if (!json.errors?.length) break;
        if (!isOnlyThrottled(json.errors)) {
          throw new Error(
            `Unable to load Shopify orders: ${json.errors
              .map((error) => error?.message ?? "Unknown GraphQL error")
              .join("; ")} `,
          );
        }

        if (requestedCostExceedsMaximum(json.extensions) || attempt === maxAttempts) {
          throw new Error("Unable to load Shopify orders: Shopify GraphQL throttle retry limit reached.");
        }
        await sleep(throttleDelayMs(json.extensions, attempt));
      } catch (error: unknown) {
        const errors = extractThrownGraphqlErrors(error);
        const extensions = extractThrownExtensions(error);
        if (!isOnlyThrottled(errors)) {
          const details = graphqlErrorDetails(error);
          console.error("[SHOPIFY GRAPHQL ERROR]", details instanceof Error
            ? details.message
            : "Shopify GraphQL request failed");
          throw error;
        }
        if (requestedCostExceedsMaximum(extensions) || attempt === maxAttempts) throw error;
        await sleep(throttleDelayMs(extensions, attempt));
      }
    }

    if (!json || json.errors?.length) {
      throw new Error("Unable to load Shopify orders: Shopify GraphQL throttle retry limit reached.");
    }

    const connection = json?.data?.orders;
    edges.push(...(connection?.edges ?? []));
    after = connection?.pageInfo?.hasNextPage
      ? connection?.pageInfo?.endCursor ?? null
      : null;
  } while (after);

  return edges;
}
