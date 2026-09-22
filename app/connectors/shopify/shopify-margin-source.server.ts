import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type {
  MarginLabAppDataQuery,
  MarginLabOrdersQuery,
} from "~/types/admin.generated";

export type ShopifyMarginOrderEdge =
  MarginLabOrdersQuery["orders"]["edges"][number];

type GraphqlError = { message?: string };
type AppDataGraphqlResponse = {
  errors?: GraphqlError[];
  data?: MarginLabAppDataQuery;
};

const ORDERS_QUERY = `#graphql
  query MarginLabOrders($q: String!, $after: String) {
    orders(
      first: 50
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
) {
  const edges: ShopifyMarginOrderEdge[] = [];
  let after: string | null = null;

  do {
    let response: Response;

    try {
      response = await admin.graphql(ORDERS_QUERY, {
        variables: { q: query, after },
      });
    } catch (error: unknown) {
      console.error(
        "[SHOPIFY GRAPHQL ERROR]",
        JSON.stringify(graphqlErrorDetails(error), null, 2),
      );
      throw error;
    }

    const json = await response.json();
    if (json?.errors?.length) {
      throw new Error(
        `Unable to load Shopify orders: ${json.errors
          .map((error: GraphqlError) => error?.message ?? "Unknown GraphQL error")
          .join("; ")} `,
      );
    }

    const connection = json?.data?.orders;
    edges.push(...(connection?.edges ?? []));
    after = connection?.pageInfo?.hasNextPage
      ? connection?.pageInfo?.endCursor ?? null
      : null;
  } while (after);

  return edges;
}
