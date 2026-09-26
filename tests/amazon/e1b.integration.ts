import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { markAmazonAuthorizationReauthRequired, persistAmazonSellerAuthorization,
  revokeAmazonSellerAuthorization } from "../../app/connectors/amazon/amazon-authorization.server";
import { resolveAmazonApplicationConfig } from "../../app/connectors/amazon/amazon-config.server";
import { discoverAmazonMarketplaces } from "../../app/connectors/amazon/amazon-marketplaces.server";
import { amazonEndpointForRegion, amazonRegionForMarketplace, exchangeLwaAccessToken,
  getMarketplaceParticipations } from "../../app/connectors/amazon/amazon-sp-api-client.server";
import { AmazonConnectorError, type AmazonApplicationConfig, type AmazonHttpRequest,
  type AmazonHttpResponse, type AmazonHttpTransport } from "../../app/connectors/amazon/amazon-types";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
const response = (status: number, value: unknown, headers: Record<string, string> = {}): AmazonHttpResponse =>
  ({ status, headers, body: encoder.encode(JSON.stringify(value)) });
const config: AmazonApplicationConfig = { lwaClientId: "lwa-client-canary", lwaClientSecret: "lwa-secret-canary",
  userAgent: "MarginLab/1.0 (Language=TypeScript)", timeoutMs: 5000, maxAttempts: 3 };
const refreshCanary = "refresh-canary-e1b";
const accessCanary = "access-canary-e1b";

class MockTransport implements AmazonHttpTransport {
  readonly requests: AmazonHttpRequest[] = [];
  private readonly handlers: Array<(request: AmazonHttpRequest) => Promise<AmazonHttpResponse> | AmazonHttpResponse>;
  constructor(handlers: Array<(request: AmazonHttpRequest) => Promise<AmazonHttpResponse> | AmazonHttpResponse>) {
    this.handlers = handlers;
  }
  async request(request: AmazonHttpRequest) {
    this.requests.push(request);
    const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected mock request");
    return handler(request);
  }
}

const lwa = (request: AmazonHttpRequest) => {
  assert.equal(request.url, "https://api.amazon.com/auth/o2/token");
  assert.equal(request.method, "POST");
  const form = new URLSearchParams(new TextDecoder().decode(request.body));
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("refresh_token"), refreshCanary);
  assert.equal(form.get("client_id"), config.lwaClientId);
  assert.equal(form.get("client_secret"), config.lwaClientSecret);
  return response(200, { access_token: accessCanary, token_type: "bearer", expires_in: 3600 });
};
const participation = (id: string, countryCode: string, currency: string, state = true) => ({
  marketplace: { id, name: `Amazon ${countryCode}`, countryCode, defaultCurrencyCode: currency,
    defaultLanguageCode: countryCode === "GB" ? "en_GB" : "it_IT", domainName: `amazon.${countryCode.toLowerCase()}` },
  participation: { isParticipating: state, hasSuspendedListings: !state }, storeName: "Canary Store",
});
const sellers = (payload: unknown[]) => (request: AmazonHttpRequest) => {
  assert.equal(request.url, "https://sellingpartnerapi-eu.amazon.com/sellers/v1/marketplaceParticipations");
  assert.equal(request.method, "GET");
  assert.equal(request.headers["x-amz-access-token"], accessCanary);
  assert.equal(request.headers.host, "sellingpartnerapi-eu.amazon.com");
  assert.equal(request.headers["user-agent"], config.userAgent);
  assert.match(request.headers["x-amz-date"], /^\d{8}T\d{6}Z$/);
  assert.equal(request.headers.authorization, undefined);
  return response(200, { payload });
};

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-e1b-"));
const databasePath = path.join(directory, "e1b.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  assert.throws(() => resolveAmazonApplicationConfig({ AMAZON_LWA_CLIENT_SECRET: "x", AMAZON_SP_API_USER_AGENT: "ua" }),
    (error) => error instanceof AmazonConnectorError && error.kind === "CONFIGURATION");
  assert.throws(() => resolveAmazonApplicationConfig({ AMAZON_LWA_CLIENT_ID: "x", AMAZON_SP_API_USER_AGENT: "ua" }),
    (error) => error instanceof AmazonConnectorError && error.kind === "CONFIGURATION");
  assert.equal(amazonEndpointForRegion("NA"), "https://sellingpartnerapi-na.amazon.com");
  assert.equal(amazonEndpointForRegion("FE"), "https://sellingpartnerapi-fe.amazon.com");
  assert.equal(amazonRegionForMarketplace("ATVPDKIKX0DER"), "NA");
  assert.equal(amazonRegionForMarketplace("A1VC38T7YXB528"), "FE");
  assert.throws(() => amazonRegionForMarketplace("UNKNOWN"), (error) => error instanceof AmazonConnectorError && error.kind === "UNSUPPORTED_REGION");

  const accountA = await db.account.create({ data: {} });
  const accountB = await db.account.create({ data: {} });
  const amazonA = await db.channelConnection.create({ data: { accountId: accountA.id, channel: "AMAZON", externalAccountId: "seller-a" } });
  const amazonB = await db.channelConnection.create({ data: { accountId: accountB.id, channel: "AMAZON", externalAccountId: "seller-b" } });
  const shopifyA = await db.channelConnection.create({ data: { accountId: accountA.id, channel: "SHOPIFY", externalAccountId: "shop.myshopify.com" } });
  const tenantA = { accountId: accountA.id, channelConnectionId: amazonA.id };
  await persistAmazonSellerAuthorization(db, tenantA, { refreshToken: refreshCanary, grantedAt: new Date() }, testCredentialEncryptionProvider);
  await persistAmazonSellerAuthorization(db, { accountId: accountB.id, channelConnectionId: amazonB.id },
    { refreshToken: "tenant-b-refresh", grantedAt: new Date() }, testCredentialEncryptionProvider);

  const firstPayload = [participation("APJ6JRA9NG5V4", "IT", "EUR"), participation("A1F83G8C2ARO7P", "GB", "GBP", false)];
  const firstTransport = new MockTransport([lwa, sellers(firstPayload)]);
  const discovered = await discoverAmazonMarketplaces({ db, tenant: tenantA, region: "EU", config,
    transport: firstTransport, encryptionProvider: testCredentialEncryptionProvider,
    retry: { now: () => Date.UTC(2026, 8, 26), sleep: async () => undefined, random: () => 0 } });
  assert.deepEqual(discovered.map((x) => [x.externalMarketplaceId, x.status]),
    [["APJ6JRA9NG5V4", "ACTIVE"], ["A1F83G8C2ARO7P", "INACTIVE"]]);
  assert.equal(await db.marketplace.count({ where: tenantA }), 2);
  const persisted = await db.marketplace.findMany({ where: tenantA, orderBy: { externalMarketplaceId: "asc" } });
  assert.equal(JSON.stringify(persisted).includes(refreshCanary), false);
  assert.equal(JSON.stringify(persisted).includes(accessCanary), false);
  assert.equal(JSON.stringify(discovered).includes(config.lwaClientSecret), false);

  const repeatTransport = new MockTransport([lwa, sellers([
    participation("APJ6JRA9NG5V4", "IT", "EUR", false), participation("A1F83G8C2ARO7P", "GB", "GBP", true),
  ])]);
  const repeated = await discoverAmazonMarketplaces({ db, tenant: tenantA, region: "EU", config,
    transport: repeatTransport, encryptionProvider: testCredentialEncryptionProvider,
    retry: { sleep: async () => undefined, random: () => 0 } });
  assert.equal(await db.marketplace.count({ where: tenantA }), 2);
  assert.equal(repeated.find((x) => x.externalMarketplaceId === "APJ6JRA9NG5V4")?.id,
    discovered.find((x) => x.externalMarketplaceId === "APJ6JRA9NG5V4")?.id);
  assert.equal(repeated.find((x) => x.externalMarketplaceId === "APJ6JRA9NG5V4")?.status, "INACTIVE");

  const foreignMarket = await db.marketplace.create({ data: { accountId: accountB.id, channelConnectionId: amazonB.id,
    externalMarketplaceId: "APJ6JRA9NG5V4" } });
  assert.notEqual(foreignMarket.id, discovered[0].id);
  assert.equal(await db.rawSourceRecord.count(), 0);
  assert.equal(await db.sourceObservation.count(), 0);
  assert.equal(await db.normalizedOrder.count(), 0);
  assert.equal(await db.financialLedgerEntry.count(), 0);
  assert.equal(await db.inventoryEconomicEvent.count(), 0);

  const noCall = async (tenant: { accountId: string; channelConnectionId: string }) => {
    const transport = new MockTransport([]);
    await assert.rejects(discoverAmazonMarketplaces({ db, tenant, region: "EU", config, transport,
      encryptionProvider: testCredentialEncryptionProvider }),
    (error) => error instanceof AmazonConnectorError && error.kind === "AUTHORIZATION");
    assert.equal(transport.requests.length, 0);
  };
  await noCall({ accountId: accountA.id, channelConnectionId: amazonB.id });
  await noCall({ accountId: accountA.id, channelConnectionId: shopifyA.id });
  await markAmazonAuthorizationReauthRequired(db, tenantA);
  await noCall(tenantA);
  await persistAmazonSellerAuthorization(db, tenantA, { refreshToken: refreshCanary, grantedAt: new Date() }, testCredentialEncryptionProvider);
  await revokeAmazonSellerAuthorization(db, tenantA);
  await noCall(tenantA);
  await persistAmazonSellerAuthorization(db, tenantA, { refreshToken: refreshCanary, grantedAt: new Date() }, testCredentialEncryptionProvider);
  await db.channelConnection.update({ where: { id: amazonA.id }, data: { status: "INACTIVE" } });
  await noCall(tenantA);
  await db.channelConnection.update({ where: { id: amazonA.id }, data: { status: "ACTIVE" } });
  await db.account.update({ where: { id: accountB.id }, data: { status: "INACTIVE" } });
  await noCall({ accountId: accountB.id, channelConnectionId: amazonB.id });
  await db.account.update({ where: { id: accountB.id }, data: { status: "ACTIVE" } });

  const malformedToken = new MockTransport([() => response(200, { access_token: accessCanary, token_type: "bearer" })]);
  await assert.rejects(exchangeLwaAccessToken(refreshCanary, config, malformedToken),
    (error) => error instanceof AmazonConnectorError && error.kind === "MALFORMED_RESPONSE");
  const lwa401 = new MockTransport([() => response(401, { error: "invalid_client", secret: config.lwaClientSecret })]);
  await assert.rejects(exchangeLwaAccessToken(refreshCanary, config, lwa401), (error) => {
    assert(error instanceof AmazonConnectorError); assert.equal(error.kind, "AUTHENTICATION");
    assert.equal(JSON.stringify(error).includes(config.lwaClientSecret), false); return true;
  });

  const sleeps: number[] = [];
  const throttled = new MockTransport([
    () => response(429, {}, { "retry-after": "2", "x-amzn-requestid": "safe-request" }), lwa,
  ]);
  await exchangeLwaAccessToken(refreshCanary, config, throttled, { sleep: async (ms) => { sleeps.push(ms); }, random: () => 0 });
  assert.deepEqual(sleeps, [2000]);
  const servers = new MockTransport([() => response(500, {}), () => response(502, {}), () => response(503, {}), lwa]);
  await exchangeLwaAccessToken(refreshCanary, { ...config, maxAttempts: 4 }, servers,
    { sleep: async () => undefined, random: () => 0 });
  assert.equal(servers.requests.length, 4);
  const timeout = new MockTransport([
    async () => { throw new AmazonConnectorError("TIMEOUT", { retryable: true }); },
    async () => { throw new AmazonConnectorError("TIMEOUT", { retryable: true }); },
    async () => { throw new AmazonConnectorError("TIMEOUT", { retryable: true }); },
  ]);
  await assert.rejects(exchangeLwaAccessToken(refreshCanary, config, timeout, { sleep: async () => undefined }),
    (error) => error instanceof AmazonConnectorError && error.kind === "TIMEOUT");

  const sellersUnauthenticated = new MockTransport([() => response(401, {})]);
  await assert.rejects(getMarketplaceParticipations("EU", accessCanary, config, sellersUnauthenticated),
    (error) => error instanceof AmazonConnectorError && error.kind === "AUTHENTICATION");
  const sellersUnauthorized = new MockTransport([() => response(403, {})]);
  await assert.rejects(getMarketplaceParticipations("EU", accessCanary, config, sellersUnauthorized),
    (error) => error instanceof AmazonConnectorError && error.kind === "AUTHORIZATION");
  const invalidJson = new MockTransport([() => ({ status: 200, headers: {}, body: encoder.encode("not-json") })]);
  await assert.rejects(getMarketplaceParticipations("EU", accessCanary, config, invalidJson),
    (error) => error instanceof AmazonConnectorError && error.kind === "MALFORMED_RESPONSE");
  for (const payload of [{ bad: true }, { payload: [participation("APJ6JRA9NG5V4", "IT", "EUR"),
    participation("APJ6JRA9NG5V4", "IT", "EUR")] }, { payload: [{ ...participation("APJ6JRA9NG5V4", "IT", "EUR"), marketplace: {} }] }]) {
    const transport = new MockTransport([() => response(200, payload)]);
    await assert.rejects(getMarketplaceParticipations("EU", accessCanary, config, transport),
      (error) => error instanceof AmazonConnectorError && error.kind === "MALFORMED_RESPONSE");
  }
  const unsupported = new MockTransport([() => response(200, { payload: [participation("UNKNOWN", "IT", "EUR")] })]);
  await assert.rejects(getMarketplaceParticipations("EU", accessCanary, config, unsupported),
    (error) => error instanceof AmazonConnectorError && error.kind === "UNSUPPORTED_REGION");

  const secretSurface = JSON.stringify({ errors: [new AmazonConnectorError("AUTHENTICATION")], discovered, persisted });
  for (const secret of [refreshCanary, accessCanary, config.lwaClientSecret]) assert.equal(secretSurface.includes(secret), false);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("Amazon E1-B transport, Sellers discovery, retry, tenancy and secret safety: PASS");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
