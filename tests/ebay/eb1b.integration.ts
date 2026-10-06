import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { exchangeEbayAuthorizationCode, exchangeEbayRefreshToken, ebayOAuthTokenEndpoint,
  refreshEbaySellerAccessToken } from "../../app/connectors/ebay/ebay-api-client.server";
import { getEbayAuthorizationMetadata, markEbayAuthorizationReauthRequired,
  persistEbaySellerAuthorization, resolveEbayRefreshTokenForUse,
  revokeEbaySellerAuthorization } from "../../app/connectors/ebay/ebay-authorization.server";
import { resolveEbayApplicationConfig } from "../../app/connectors/ebay/ebay-config.server";
import { canonicalizeEbayScopes, EbayConnectorError, EBAY_REQUIRED_SCOPES,
  type EbayApplicationConfig, type EbayHttpRequest, type EbayHttpResponse,
  type EbayHttpTransport } from "../../app/connectors/ebay/ebay-types";
import { testEbayCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
const oauthResponse = (status: number, value: unknown, headers: Record<string, string> = {}): EbayHttpResponse => ({
  status, headers, body: encoder.encode(JSON.stringify(value)),
});
class MockTransport implements EbayHttpTransport {
  readonly requests: EbayHttpRequest[] = [];
  private readonly handlers: Array<
    (request: EbayHttpRequest) => EbayHttpResponse | Promise<EbayHttpResponse>
  >;
  constructor(
    handlers: Array<
      (request: EbayHttpRequest) => EbayHttpResponse | Promise<EbayHttpResponse>
    >,
  ) {
    this.handlers = handlers;
  }
  async request(request: EbayHttpRequest) {
    this.requests.push(request);
    const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected eBay mock request");
    return handler(request);
  }
}

const sandbox: EbayApplicationConfig = { environment: "SANDBOX", clientId: "sandbox-client",
  clientSecret: "sandbox-secret", ruName: "MarginLab-MarginLa-SBX-ru-name", timeoutMs: 5000,
  maxAttempts: 3, maxRetryAfterMs: 5000 };
const production: EbayApplicationConfig = { ...sandbox, environment: "PRODUCTION",
  clientId: "production-client", clientSecret: "production-secret", ruName: "MarginLab-MarginLa-PRD-ru-name" };
const refreshOne = "ebay-refresh-token-one";
const refreshTwo = "ebay-refresh-token-two";
const accessToken = "ebay-access-token-memory-only";
const authorizationCode = "ebay-one-use-authorization-code";
const scopes = [...EBAY_REQUIRED_SCOPES].reverse();

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-eb1b-"));
const databasePath = path.join(directory, "eb1b.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  assert.deepEqual(canonicalizeEbayScopes([...scopes, scopes[0]]), [...EBAY_REQUIRED_SCOPES]);
  assert.throws(() => canonicalizeEbayScopes(EBAY_REQUIRED_SCOPES.slice(1)),
    (error) => error instanceof EbayConnectorError && error.kind === "AUTHORIZATION");
  assert.throws(() => resolveEbayApplicationConfig({ EBAY_ENVIRONMENT: "STAGING", EBAY_CLIENT_ID: "x",
    EBAY_CLIENT_SECRET: "configuration-secret-must-not-leak", EBAY_RUNAME: "z" }),
  (error) => error instanceof EbayConnectorError && error.kind === "CONFIGURATION" &&
      !JSON.stringify(error).includes("configuration-secret-must-not-leak"));
  assert.equal(ebayOAuthTokenEndpoint(sandbox), "https://api.sandbox.ebay.com/identity/v1/oauth2/token");
  assert.equal(ebayOAuthTokenEndpoint(production), "https://api.ebay.com/identity/v1/oauth2/token");

  const accountA = await db.account.create({ data: {} });
  const accountB = await db.account.create({ data: {} });
  const ebayA = await db.channelConnection.create({ data: { accountId: accountA.id, channel: "EBAY",
    externalAccountId: "ebay-eb1b-a" } });
  const ebayB = await db.channelConnection.create({ data: { accountId: accountB.id, channel: "EBAY",
    externalAccountId: "ebay-eb1b-b" } });
  const shopifyA = await db.channelConnection.create({ data: { accountId: accountA.id, channel: "SHOPIFY",
    externalAccountId: "eb1b.myshopify.com" } });
  const amazonA = await db.channelConnection.create({ data: { accountId: accountA.id, channel: "AMAZON",
    externalAccountId: "amazon-eb1b-a" } });
  const tenantA = { accountId: accountA.id, channelConnectionId: ebayA.id };
  const grant = { refreshToken: refreshOne, grantedScopes: scopes,
    grantedAt: new Date("2026-10-06T12:00:00Z"), refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z") };

  await assert.rejects(persistEbaySellerAuthorization(db, tenantA, grant), /encryption provider unavailable/i);
  await assert.rejects(persistEbaySellerAuthorization(db,
    { accountId: accountA.id, channelConnectionId: shopifyA.id }, grant, testEbayCredentialEncryptionProvider));
  await assert.rejects(persistEbaySellerAuthorization(db,
    { accountId: accountA.id, channelConnectionId: amazonA.id }, grant, testEbayCredentialEncryptionProvider));
  await assert.rejects(persistEbaySellerAuthorization(db,
    { accountId: accountA.id, channelConnectionId: ebayB.id }, grant, testEbayCredentialEncryptionProvider));
  await db.channelConnection.update({ where: { id: ebayB.id }, data: { status: "INACTIVE" } });
  await assert.rejects(persistEbaySellerAuthorization(db,
    { accountId: accountB.id, channelConnectionId: ebayB.id }, grant, testEbayCredentialEncryptionProvider));
  await db.channelConnection.update({ where: { id: ebayB.id }, data: { status: "ACTIVE" } });
  await db.account.update({ where: { id: accountB.id }, data: { status: "INACTIVE" } });
  await assert.rejects(persistEbaySellerAuthorization(db,
    { accountId: accountB.id, channelConnectionId: ebayB.id }, grant, testEbayCredentialEncryptionProvider));

  const first = await persistEbaySellerAuthorization(db, tenantA, grant, testEbayCredentialEncryptionProvider);
  const stored = await db.ebaySellerAuthorization.findUniqueOrThrow({ where: { channelConnectionId: ebayA.id } });
  assert.equal(Buffer.from(stored.encryptedRefreshToken).includes(Buffer.from(refreshOne)), false);
  assert.equal(JSON.stringify(first).includes(refreshOne), false);
  assert.deepEqual(first.grantedScopes, [...EBAY_REQUIRED_SCOPES]);
  assert.equal(await resolveEbayRefreshTokenForUse(db, tenantA, testEbayCredentialEncryptionProvider), refreshOne);
  const replay = await persistEbaySellerAuthorization(db, tenantA, grant, testEbayCredentialEncryptionProvider);
  assert.equal(replay.replayed, true);
  assert.equal(replay.authorizationVersion, first.authorizationVersion);
  const metadataRefresh = await persistEbaySellerAuthorization(db, tenantA,
    { ...grant, validatedAt: new Date("2026-10-06T12:05:00Z") }, testEbayCredentialEncryptionProvider);
  assert.equal(metadataRefresh.replayed, false);
  assert.notEqual(metadataRefresh.authorizationVersion, first.authorizationVersion);
  const rotated = await persistEbaySellerAuthorization(db, tenantA, { ...grant, refreshToken: refreshTwo },
    testEbayCredentialEncryptionProvider);
  assert.notEqual(rotated.authorizationVersion, first.authorizationVersion);

  await db.coreChannelAuthorization.update({ where: { channelConnectionId: ebayA.id },
    data: { authorizationVersion: "stale-epoch" } });
  await assert.rejects(resolveEbayRefreshTokenForUse(db, tenantA, testEbayCredentialEncryptionProvider));
  await db.coreChannelAuthorization.update({ where: { channelConnectionId: ebayA.id },
    data: { authorizationVersion: rotated.authorizationVersion } });
  const reauth = await markEbayAuthorizationReauthRequired(db, tenantA, new Date("2026-10-07T00:00:00Z"));
  const reauthReplay = await markEbayAuthorizationReauthRequired(db, tenantA, new Date("2026-10-08T00:00:00Z"));
  assert.equal(reauthReplay.replayed, true);
  assert.equal(reauthReplay.authorizationVersion, reauth.authorizationVersion);
  await assert.rejects(resolveEbayRefreshTokenForUse(db, tenantA, testEbayCredentialEncryptionProvider));
  const restored = await persistEbaySellerAuthorization(db, tenantA, { ...grant, refreshToken: refreshTwo },
    testEbayCredentialEncryptionProvider);
  const revoked = await revokeEbaySellerAuthorization(db, tenantA, new Date("2026-10-09T00:00:00Z"));
  const revokedReplay = await revokeEbaySellerAuthorization(db, tenantA, new Date("2026-10-10T00:00:00Z"));
  assert.equal(revokedReplay.replayed, true);
  assert.equal(revokedReplay.authorizationVersion, revoked.authorizationVersion);
  await assert.rejects(resolveEbayRefreshTokenForUse(db, tenantA, testEbayCredentialEncryptionProvider));
  await persistEbaySellerAuthorization(db, tenantA, { ...grant, refreshToken: refreshTwo },
    testEbayCredentialEncryptionProvider);

  const authTransport = new MockTransport([(request) => {
    assert.equal(request.url, ebayOAuthTokenEndpoint(sandbox));
    assert.equal(request.headers.authorization,
      `Basic ${Buffer.from(`${sandbox.clientId}:${sandbox.clientSecret}`).toString("base64")}`);
    assert.equal(request.headers["content-type"], "application/x-www-form-urlencoded");
    const form = new URLSearchParams(new TextDecoder().decode(request.body));
    assert.equal(form.get("grant_type"), "authorization_code");
    assert.equal(form.get("code"), authorizationCode);
    assert.equal(form.get("redirect_uri"), sandbox.ruName);
    return oauthResponse(200, { access_token: accessToken, token_type: "User Access Token", expires_in: 7200,
      refresh_token: refreshTwo, refresh_token_expires_in: 47304000 });
  }]);
  const exchanged = await exchangeEbayAuthorizationCode({ authorizationCode, config: sandbox, transport: authTransport });
  assert.equal(exchanged.accessToken, accessToken);
  assert.equal(exchanged.refreshToken, refreshTwo);

  const refreshTransport = new MockTransport([(request) => {
    assert.equal(request.url, ebayOAuthTokenEndpoint(production));
    const form = new URLSearchParams(new TextDecoder().decode(request.body));
    assert.equal(form.get("grant_type"), "refresh_token");
    assert.equal(form.get("refresh_token"), refreshTwo);
    assert.equal(form.get("scope"), EBAY_REQUIRED_SCOPES.join(" "));
    return oauthResponse(200, { access_token: accessToken, token_type: "bearer", expires_in: 7200 });
  }]);
  const refreshed = await exchangeEbayRefreshToken({ refreshToken: refreshTwo, grantedScopes: scopes,
    config: production, transport: refreshTransport });
  assert.equal(refreshed.accessToken, accessToken);
  assert.equal(refreshed.refreshToken, null);

  for (const value of [null, {}, { access_token: accessToken, token_type: "bearer" },
    { access_token: accessToken, token_type: "wrong", expires_in: 7200 },
    { access_token: accessToken, token_type: "bearer", expires_in: -1 },
    { access_token: accessToken, token_type: "bearer", expires_in: 7200,
      refresh_token: refreshTwo, refresh_token_expires_in: "bad" }]) {
    const malformed = new MockTransport([() => oauthResponse(200, value)]);
    await assert.rejects(exchangeEbayRefreshToken({ refreshToken: refreshTwo, grantedScopes: scopes,
      config: sandbox, transport: malformed }),
      (error) => error instanceof EbayConnectorError && error.kind === "MALFORMED_RESPONSE");
  }
  const oversized = new MockTransport([() => ({ status: 200, headers: {},
    body: new Uint8Array(64 * 1024 + 1) })]);
  await assert.rejects(exchangeEbayRefreshToken({ refreshToken: refreshTwo, grantedScopes: scopes,
    config: sandbox, transport: oversized }),
  (error) => error instanceof EbayConnectorError && error.kind === "MALFORMED_RESPONSE");

  const integrated = new MockTransport([() => oauthResponse(200,
    { access_token: accessToken, token_type: "User Access Token", expires_in: 7200 })]);
  assert.equal((await refreshEbaySellerAccessToken({ db, tenant: tenantA, config: sandbox, transport: integrated,
    encryptionProvider: testEbayCredentialEncryptionProvider })).accessToken, accessToken);
  const invalidGrant = new MockTransport([() => oauthResponse(400,
    { error: "invalid_grant", error_description: `do not expose ${refreshTwo}` }, { "x-ebay-c-request-id": "safe-id" })]);
  await assert.rejects(refreshEbaySellerAccessToken({ db, tenant: tenantA, config: sandbox,
    transport: invalidGrant, encryptionProvider: testEbayCredentialEncryptionProvider,
    now: new Date("2026-10-11T00:00:00Z") }), (error) => {
      assert(error instanceof EbayConnectorError);
      assert.equal(error.kind, "REAUTH_REQUIRED");
      assert.equal(error.requestId, "safe-id");
      assert.equal(JSON.stringify(error).includes(refreshTwo), false);
      return true;
    });
  assert.equal((await getEbayAuthorizationMetadata(db, tenantA)).status, "REAUTH_REQUIRED");
  await assert.rejects(resolveEbayRefreshTokenForUse(db, tenantA, testEbayCredentialEncryptionProvider));

  const persistedText = JSON.stringify(sqlite.prepare("SELECT * FROM EbaySellerAuthorization").all());
  for (const secret of [refreshOne, refreshTwo, accessToken, authorizationCode,
    sandbox.clientSecret, production.clientSecret]) assert.equal(persistedText.includes(secret), false);
  const columns = sqlite.prepare("PRAGMA table_info('EbaySellerAuthorization')").all() as Array<{ name: string }>;
  assert.equal(columns.some((column) => /accessToken|authorizationCode|clientSecret|callbackState/i.test(column.name)), false);
  const safeSurface = JSON.stringify({ first, replay, rotated, restored, revoked,
    errors: [new EbayConnectorError("AUTHENTICATION")], endpoints: [ebayOAuthTokenEndpoint(sandbox)] });
  for (const secret of [refreshOne, refreshTwo, accessToken, authorizationCode,
    sandbox.clientSecret, production.clientSecret]) assert.equal(safeSurface.includes(secret), false);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("eBay EB1-B authorization, OAuth, lifecycle, tenancy and secret safety: PASS");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
