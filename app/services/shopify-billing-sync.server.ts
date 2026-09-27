import type { PrismaClient } from "@prisma/client";
import { ingestShopifySubscriptionSale, type ShopifySubscriptionSale } from "~/services/shopify-billing-adapter.server";

export type PartnerApiPageClient = (input: { shopDomain: string; after: string | null }) => Promise<unknown>;
export type BillingSyncDiagnostic = { scope: "RECORD" | "PAGE"; code: string; shopDomain: string; externalEventId?: string };
export type ShopifyBillingSyncResult = { ok: boolean; shopsAttempted: number; pagesProcessed: number; recordsObserved: number; recordsProcessed: number; diagnostics: BillingSyncDiagnostic[] };
type Connection = { edges: Array<{ cursor: string; node: ShopifySubscriptionSale }>; lastCursor: string | null; pageInfo: { hasNextPage: boolean } };

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export function createShopifyPartnerApiClient(input: {
  organizationId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): PartnerApiPageClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  return async ({ shopDomain, after }) => {
    const response = await fetchImpl(`https://partners.shopify.com/${input.organizationId}/api/2026-07/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": input.accessToken },
      body: JSON.stringify({
        query: `query P3($shop: String!, $after: String) { transactions(first: 100, after: $after, myshopifyDomain: $shop, types: [APP_SUBSCRIPTION_SALE]) { edges { cursor node { ... on AppSubscriptionSale { id createdAt chargeId billingInterval grossAmount { amount currencyCode } app { apiKey } shop { myshopifyDomain } } } } pageInfo { hasNextPage } } }`,
        variables: { shop: shopDomain, after },
      }),
    });
    if (!response.ok) throw new Error("PARTNER_API_HTTP_ERROR");
    return response.json();
  };
}

function validateSale(value: unknown): ShopifySubscriptionSale {
  const node = object(value), app = object(node?.app), shop = object(node?.shop);
  const gross = node?.grossAmount === null || node?.grossAmount === undefined ? null : object(node.grossAmount);
  const id = text(node?.id), createdAt = text(node?.createdAt), apiKey = text(app?.apiKey), shopDomain = text(shop?.myshopifyDomain);
  if (!id || !createdAt || !Number.isFinite(Date.parse(createdAt)) || !apiKey || !shopDomain) throw new Error("INVALID_TRANSACTION_IDENTITY");
  if (gross && (!text(gross.amount) || !/^[A-Z]{3}$/.test(text(gross.currencyCode) ?? ""))) throw new Error("INVALID_GROSS_AMOUNT");
  if (node?.grossAmount !== null && node?.grossAmount !== undefined && !gross) throw new Error("INVALID_GROSS_AMOUNT");
  return {
    id, createdAt,
    chargeId: node?.chargeId === null || node?.chargeId === undefined ? null : text(node.chargeId),
    billingInterval: node?.billingInterval === null || node?.billingInterval === undefined ? null : text(node.billingInterval),
    grossAmount: gross ? { amount: text(gross.amount)!, currencyCode: text(gross.currencyCode)! } : null,
    app: { apiKey }, shop: { myshopifyDomain: shopDomain },
  };
}

function validatePage(value: unknown): { connection: Connection; failures: Array<{ code: string; externalEventId?: string }> } {
  const body = object(value);
  if (!body) throw new Error("INVALID_RESPONSE");
  if (body.errors !== undefined && !Array.isArray(body.errors)) throw new Error("INVALID_GRAPHQL_ERRORS");
  if (Array.isArray(body.errors) && body.errors.length) throw new Error("GRAPHQL_ERROR");
  const data = object(body.data), transactions = object(data?.transactions), pageInfo = object(transactions?.pageInfo);
  if (!transactions || !Array.isArray(transactions.edges) || typeof pageInfo?.hasNextPage !== "boolean") throw new Error("INVALID_CONNECTION");
  const edges: Connection["edges"] = [], failures: Array<{ code: string; externalEventId?: string }> = [];
  let lastCursor: string | null = null;
  for (const rawEdge of transactions.edges) {
    const edge = object(rawEdge), cursor = text(edge?.cursor);
    if (!cursor) throw new Error("INVALID_EDGE_CURSOR");
    lastCursor = cursor;
    try { edges.push({ cursor, node: validateSale(edge?.node) }); }
    catch (error) {
      const rawNode = object(edge?.node), id = text(rawNode?.id);
      failures.push({ code: error instanceof Error ? error.message : "INVALID_TRANSACTION", ...(id ? { externalEventId: id } : {}) });
    }
  }
  return { connection: { edges, lastCursor, pageInfo: { hasNextPage: pageInfo.hasNextPage } }, failures };
}

const processingCode = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (/another app/i.test(message)) return "APP_MISMATCH";
  if (/trusted canonical Account/i.test(message)) return "UNKNOWN_OR_INCONSISTENT_SHOP";
  if (/money/i.test(message)) return "INVALID_GROSS_AMOUNT";
  if (/replay conflicts/i.test(message)) return "EVENT_REPLAY_CONFLICT";
  return "RECORD_PROCESSING_FAILED";
};

/** Correctness-first full-history polling. Before roughly 1,000 Shopify mappings,
 * replace with an app-scoped query plus a durable overlapping watermark. */
export async function synchronizeShopifyPartnerBilling(input: { db: PrismaClient; expectedApiKey: string; fetchPage: PartnerApiPageClient }): Promise<ShopifyBillingSyncResult> {
  const diagnostics: BillingSyncDiagnostic[] = [];
  let shopsAttempted = 0, pagesProcessed = 0, recordsObserved = 0, recordsProcessed = 0;
  const mappings = await input.db.legacyShopMapping.findMany({ include: { channelConnection: true } });
  for (const mapping of mappings) {
    if (mapping.channelConnection.channel !== "SHOPIFY" || mapping.channelConnection.externalAccountId !== mapping.shopDomain) continue;
    shopsAttempted += 1;
    let after: string | null = null;
    const seenCursors = new Set<string>();
    for (;;) {
      let rawPage: unknown;
      try { rawPage = await input.fetchPage({ shopDomain: mapping.shopDomain, after }); }
      catch { diagnostics.push({ scope: "PAGE", code: "PARTNER_API_REQUEST_FAILED", shopDomain: mapping.shopDomain }); break; }
      let validated: ReturnType<typeof validatePage>;
      try { validated = validatePage(rawPage); }
      catch (error) { diagnostics.push({ scope: "PAGE", code: error instanceof Error ? error.message : "INVALID_PAGE", shopDomain: mapping.shopDomain }); break; }
      pagesProcessed += 1;
      recordsObserved += validated.connection.edges.length + validated.failures.length;
      diagnostics.push(...validated.failures.map((failure) => ({ scope: "RECORD" as const, shopDomain: mapping.shopDomain, ...failure })));
      for (const edge of validated.connection.edges) {
        try { await ingestShopifySubscriptionSale(input.db, edge.node, input.expectedApiKey); recordsProcessed += 1; }
        catch (error) { diagnostics.push({ scope: "RECORD", code: processingCode(error), shopDomain: mapping.shopDomain, externalEventId: edge.node.id }); }
      }
      if (!validated.connection.pageInfo.hasNextPage) break;
      const nextCursor = validated.connection.lastCursor;
      if (!nextCursor) { diagnostics.push({ scope: "PAGE", code: "MISSING_NEXT_CURSOR", shopDomain: mapping.shopDomain }); break; }
      if (nextCursor === after || seenCursors.has(nextCursor)) { diagnostics.push({ scope: "PAGE", code: "NON_PROGRESSING_CURSOR", shopDomain: mapping.shopDomain }); break; }
      seenCursors.add(nextCursor); after = nextCursor;
    }
  }
  return { ok: diagnostics.length === 0, shopsAttempted, pagesProcessed, recordsObserved, recordsProcessed, diagnostics };
}

export async function executeBillingSyncCli(input: { run: () => Promise<ShopifyBillingSyncResult>; disconnect: () => Promise<void>; report: (result: ShopifyBillingSyncResult) => void; reportFatal: (code: string) => void; setExitCode: (code: number) => void }) {
  try { const result = await input.run(); input.report(result); if (!result.ok) input.setExitCode(1); }
  catch { input.reportFatal("BILLING_SYNC_FATAL"); input.setExitCode(1); }
  finally { await input.disconnect(); }
}
