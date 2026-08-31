/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.d.ts';

export type MarginLabTaxProfileShopQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type MarginLabTaxProfileShopQuery = { shop: { billingAddress: Pick<AdminTypes.ShopAddress, 'countryCodeV2'> } };

export type MarginLabProductSaleCostsQueryVariables = AdminTypes.Exact<{
  ids: Array<AdminTypes.Scalars['ID']['input']> | AdminTypes.Scalars['ID']['input'];
}>;


export type MarginLabProductSaleCostsQuery = { nodes: Array<AdminTypes.Maybe<(
    Pick<AdminTypes.ProductVariant, 'id'>
    & { product: Pick<AdminTypes.Product, 'id' | 'title'>, inventoryItem: { unitCost?: AdminTypes.Maybe<Pick<AdminTypes.MoneyV2, 'amount' | 'currencyCode'>> } }
  )>> };

export type ProfitImpactShopContextQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type ProfitImpactShopContextQuery = { shop: Pick<AdminTypes.Shop, 'ianaTimezone'> };

export type ProfitImpactMeasurementShopContextQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type ProfitImpactMeasurementShopContextQuery = { shop: Pick<AdminTypes.Shop, 'ianaTimezone'> };

export type MarginLabBillingIdentityQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type MarginLabBillingIdentityQuery = { shop: Pick<AdminTypes.Shop, 'id'>, currentAppInstallation: { app: Pick<AdminTypes.App, 'id'>, activeSubscriptions: Array<Pick<AdminTypes.AppSubscription, 'id' | 'name' | 'status'>> } };

export type MarginLabOrdersQueryVariables = AdminTypes.Exact<{
  q: AdminTypes.Scalars['String']['input'];
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type MarginLabOrdersQuery = { orders: { pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'endCursor'>, edges: Array<{ node: (
        Pick<AdminTypes.Order, 'id' | 'name' | 'processedAt' | 'taxesIncluded' | 'taxExempt'>
        & { totalShippingPriceSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount'> }, totalTaxSet?: AdminTypes.Maybe<{ shopMoney: Pick<AdminTypes.MoneyV2, 'amount'> }>, shippingLines: { pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage'>, edges: Array<{ node: (
              Pick<AdminTypes.ShippingLine, 'title'>
              & { discountedPriceSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount'> }, taxLines: Array<(
                Pick<AdminTypes.TaxLine, 'title' | 'rate'>
                & { priceSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount'> } }
              )> }
            ) }> }, refunds: Array<{ refundLineItems: { pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage'>, edges: Array<{ node: (
                Pick<AdminTypes.RefundLineItem, 'quantity'>
                & { subtotalSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount'> }, totalTaxSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount'> }, lineItem: (
                  Pick<AdminTypes.LineItem, 'id'>
                  & { variant?: AdminTypes.Maybe<{ product: Pick<AdminTypes.Product, 'id' | 'title'>, inventoryItem: { unitCost?: AdminTypes.Maybe<Pick<AdminTypes.MoneyV2, 'amount'>> } }> }
                ) }
              ) }> } }>, lineItems: { pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage'>, edges: Array<{ node: (
              Pick<AdminTypes.LineItem, 'id' | 'quantity' | 'taxable'>
              & { taxLines: Array<(
                Pick<AdminTypes.TaxLine, 'title' | 'rate'>
                & { priceSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount'> } }
              )>, discountedTotalSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount'> }, originalTotalSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount'> }, discountAllocations: Array<{ allocatedAmountSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount'> } }>, variant?: AdminTypes.Maybe<{ product: Pick<AdminTypes.Product, 'id' | 'title'>, inventoryItem: { unitCost?: AdminTypes.Maybe<Pick<AdminTypes.MoneyV2, 'amount'>> } }> }
            ) }> } }
      ) }> } };

export type MarginLabAppDataQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type MarginLabAppDataQuery = { shop: (
    Pick<AdminTypes.Shop, 'currencyCode' | 'ianaTimezone'>
    & { billingAddress: Pick<AdminTypes.ShopAddress, 'countryCodeV2'> }
  ) };

interface GeneratedQueryTypes {
  "#graphql\n  query MarginLabTaxProfileShop {\n    shop {\n      billingAddress {\n        countryCodeV2\n      }\n    }\n  }\n": {return: MarginLabTaxProfileShopQuery, variables: MarginLabTaxProfileShopQueryVariables},
  "#graphql\n      query MarginLabProductSaleCosts($ids: [ID!]!) {\n        nodes(ids: $ids) {\n          ... on ProductVariant {\n            id\n            product { id title }\n            inventoryItem {\n              unitCost { amount currencyCode }\n            }\n          }\n        }\n      }\n    ": {return: MarginLabProductSaleCostsQuery, variables: MarginLabProductSaleCostsQueryVariables},
  "\n    #graphql\n    query ProfitImpactShopContext {\n      shop { ianaTimezone }\n    }\n  ": {return: ProfitImpactShopContextQuery, variables: ProfitImpactShopContextQueryVariables},
  "\n    #graphql\n    query ProfitImpactMeasurementShopContext { shop { ianaTimezone } }\n  ": {return: ProfitImpactMeasurementShopContextQuery, variables: ProfitImpactMeasurementShopContextQueryVariables},
  "\n    #graphql\n    query MarginLabBillingIdentity {\n      shop {\n        id\n      }\n\n      currentAppInstallation {\n        app {\n          id\n        }\n\n        activeSubscriptions {\n          id\n          name\n          status\n        }\n      }\n    }\n  ": {return: MarginLabBillingIdentityQuery, variables: MarginLabBillingIdentityQueryVariables},
  "#graphql\n  query MarginLabOrders($q: String!, $after: String) {\n    orders(\n      first: 50\n      after: $after\n      sortKey: PROCESSED_AT\n      reverse: true\n      query: $q\n    ) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n\n      edges {\n        node {\n          id\n          name\n          processedAt\n          taxesIncluded\n          taxExempt\n\n          totalShippingPriceSet {\n            shopMoney {\n              amount\n            }\n          }\n\n          totalTaxSet {\n            shopMoney {\n              amount\n            }\n          }\n\n          shippingLines(first: 10) {\n            pageInfo {\n              hasNextPage\n            }\n            edges {\n              node {\n                title\n\n                discountedPriceSet {\n                  shopMoney {\n                    amount\n                  }\n                }\n\n                taxLines {\n                  title\n                  rate\n\n                  priceSet {\n                    shopMoney {\n                      amount\n                    }\n                  }\n                }\n              }\n            }\n          }\n\n          refunds {\n            refundLineItems(first: 100) {\n              pageInfo {\n                hasNextPage\n              }\n              edges {\n                node {\n                  quantity\n\n                  subtotalSet {\n                    shopMoney {\n                      amount\n                    }\n                  }\n\n                  totalTaxSet {\n                    shopMoney {\n                      amount\n                    }\n                  }\n\n                  lineItem {\n                    id\n\n                    variant {\n                      product {\n                        id\n                        title\n                      }\n\n                      inventoryItem {\n                        unitCost {\n                          amount\n                        }\n                      }\n                    }\n                  }\n                }\n              }\n            }\n          }\n\n          lineItems(first: 150) {\n            pageInfo {\n              hasNextPage\n            }\n            edges {\n              node {\n                id\n                quantity\n                taxable\n\n                taxLines {\n                  title\n                  rate\n\n                  priceSet {\n                    shopMoney {\n                      amount\n                    }\n                  }\n                }\n\n                discountedTotalSet {\n                  shopMoney {\n                    amount\n                  }\n                }\n\n                originalTotalSet {\n                  shopMoney {\n                    amount\n                  }\n                }\n\n                discountAllocations {\n                  allocatedAmountSet {\n                    shopMoney {\n                      amount\n                    }\n                  }\n                }\n\n                variant {\n                  product {\n                    id\n                    title\n                  }\n\n                  inventoryItem {\n                    unitCost {\n                      amount\n                    }\n                  }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: MarginLabOrdersQuery, variables: MarginLabOrdersQueryVariables},
  "\n#graphql\n    query MarginLabAppData {\n      shop {\n    currencyCode\n    ianaTimezone\n        billingAddress {\n      countryCodeV2\n    }\n  }\n}\n": {return: MarginLabAppDataQuery, variables: MarginLabAppDataQueryVariables},
}

interface GeneratedMutationTypes {
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
