import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { action } from "../../app/routes/ebay.marketplace-account-deletion";
import { handleEbayDeletionNotificationPost, type EbayDeletionHmacConfig } from
  "../../app/connectors/ebay/ebay-deletion-notification-inbox.server";
import { ebayDeletionDiagnosticSink, type EbayDeletionDiagnostic } from
  "../../app/connectors/ebay/ebay-deletion-notification-diagnostics.server";
import { createEbayNotificationPublicKeyProvider, EbayNotificationVerificationError } from
  "../../app/connectors/ebay/ebay-notification-signature.server";
import type { EbayApplicationConfig, EbayHttpTransport } from "../../app/connectors/ebay/ebay-types";

const originalEnvironment = { ...process.env };
const originalConsoleError = console.error;
const consoleEntries: unknown[][] = [];
console.error = (...values: unknown[]) => { consoleEntries.push(values); };

const request = (body = "{}", contentType = "application/json") => new Request(
  "https://marginlab.example/ebay/marketplace-account-deletion",
  { method: "POST", headers: { "content-type": contentType }, body },
);
const routeArgs = (value: Request) => ({ request: value, params: {}, context: {} }) as never;
const diagnostics: EbayDeletionDiagnostic[] = [];
const observedStages = new Set<string>();
const sink = (diagnostic: EbayDeletionDiagnostic) => {
  diagnostics.push(diagnostic);
  observedStages.add(diagnostic.stage);
};
const hmacConfig: EbayDeletionHmacConfig = { activeKeyVersion: "v1",
  keys: new Map([["v1", new Uint8Array(32)]]) };
const validNotification = { notificationId: "safe-test-notification", topic: "MARKETPLACE_ACCOUNT_DELETION" as const,
  schemaVersion: "1.0" as const, eventDate: "2026-10-24T12:00:00.000Z", userId: "private-user-id" };

try {
  delete process.env.EBAY_ENVIRONMENT;
  assert.equal((await action(routeArgs(request()))).status, 503);
  assert.equal((consoleEntries.at(-1)?.[1] as { stage?: string }).stage, "APPLICATION_CONFIG");
  assert.equal((consoleEntries.at(-1)?.[1] as { category?: string }).category, "CONFIGURATION_INVALID");
  observedStages.add("APPLICATION_CONFIG");

  Object.assign(process.env, { EBAY_ENVIRONMENT: "PRODUCTION", EBAY_CLIENT_ID: "client-id",
    EBAY_CLIENT_SECRET: "client-secret", EBAY_RUNAME: "runame" });
  delete process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_HMAC_ACTIVE_KEY_VERSION;
  delete process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_HMAC_KEYS_JSON;
  assert.equal((await action(routeArgs(request()))).status, 503);
  assert.equal((consoleEntries.at(-1)?.[1] as { stage?: string }).stage, "HMAC_CONFIG");
  assert.equal((consoleEntries.at(-1)?.[1] as { category?: string }).category, "CONFIGURATION_INVALID");
  observedStages.add("HMAC_CONFIG");

  diagnostics.length = 0;
  const noDatabase = {} as PrismaClient;
  const neverVerifier = { async verify() { throw new Error("must not run"); } };
  assert.equal((await handleEbayDeletionNotificationPost({ request: request("{}", "text/plain"),
    db: noDatabase, verifier: neverVerifier, hmacConfig, diagnostics: sink, nowMs: () => 10 })).status, 415);
  assert.equal(diagnostics.at(-1)?.stage, "BODY_VALIDATION");

  const verificationFailure = async (error: EbayNotificationVerificationError) => {
    diagnostics.length = 0;
    const response = await handleEbayDeletionNotificationPost({ request: request(), db: noDatabase,
      verifier: { async verify() { throw error; } }, hmacConfig, diagnostics: sink, nowMs: () => 20 });
    return { response, diagnostic: diagnostics.at(-1) };
  };
  let failure = await verificationFailure(new EbayNotificationVerificationError("MISSING_SIGNATURE"));
  assert.equal(failure.response.status, 400);
  assert.equal(failure.diagnostic?.stage, "SIGNATURE_VERIFICATION");

  failure = await verificationFailure(new EbayNotificationVerificationError("KEY_RETRIEVAL_FAILED", {
    stage: "APPLICATION_TOKEN", category: "UPSTREAM_HTTP_ERROR", upstreamStatus: 401, durationMs: 12,
  }));
  assert.equal(failure.response.status, 503);
  assert.deepEqual(failure.diagnostic, { stage: "APPLICATION_TOKEN", category: "UPSTREAM_HTTP_ERROR",
    upstreamStatus: 401, durationMs: 12 });

  failure = await verificationFailure(new EbayNotificationVerificationError("KEY_RETRIEVAL_FAILED", {
    stage: "PUBLIC_KEY_RETRIEVAL", category: "TRANSPORT_FAILURE", durationMs: 15,
  }));
  assert.equal(failure.response.status, 503);
  assert.equal(failure.diagnostic?.stage, "PUBLIC_KEY_RETRIEVAL");

  diagnostics.length = 0;
  const databaseFailure = { ebayDeletionNotificationInbox: {
    async findUnique() { return null; }, async create() { throw new Error("database-secret-detail"); },
  } } as unknown as PrismaClient;
  const persisted = await handleEbayDeletionNotificationPost({ request: request(), db: databaseFailure,
    verifier: { async verify() { return { verified: true as const, notification: validNotification }; } },
    hmacConfig, diagnostics: sink, nowMs: () => 30 });
  assert.equal(persisted.status, 503);
  assert.equal(diagnostics.at(-1)?.stage, "INBOX_PERSISTENCE");
  assert.equal(diagnostics.at(-1)?.category, "PERSISTENCE_FAILURE");

  const applicationConfig: EbayApplicationConfig = { environment: "PRODUCTION", clientId: "private-client",
    clientSecret: "private-secret", ruName: "private-runame", timeoutMs: 1_000,
    maxAttempts: 1, maxRetryAfterMs: 0 };
  const statuses = [401, 404];
  const transport: EbayHttpTransport = { async request() {
    const status = statuses.shift() ?? 500;
    return { status, headers: {}, body: new TextEncoder().encode("{}") };
  } };
  await assert.rejects(createEbayNotificationPublicKeyProvider(applicationConfig, transport,
    { now: () => 50 }).getPublicKey("safe-key-id"),
  (error) => error instanceof EbayNotificationVerificationError &&
    error.diagnosticStage === "APPLICATION_TOKEN" && error.upstreamStatus === 401);
  observedStages.add("APPLICATION_TOKEN");

  const tokenThenKeyTransport: EbayHttpTransport = { async request(value) {
    if (value.method === "POST") return { status: 200, headers: {}, body: new TextEncoder().encode(JSON.stringify({
      access_token: "private-token", token_type: "Application Access Token", expires_in: 3600,
    })) };
    return { status: 404, headers: {}, body: new Uint8Array() };
  } };
  await assert.rejects(createEbayNotificationPublicKeyProvider(applicationConfig, tokenThenKeyTransport,
    { now: () => 60 }).getPublicKey("safe-key-id"),
  (error) => error instanceof EbayNotificationVerificationError &&
    error.diagnosticStage === "PUBLIC_KEY_RETRIEVAL" && error.upstreamStatus === 404);
  observedStages.add("PUBLIC_KEY_RETRIEVAL");

  ebayDeletionDiagnosticSink({ stage: "APPLICATION_TOKEN", category: "UPSTREAM_HTTP_ERROR",
    upstreamStatus: 401, durationMs: 7, payload: "private-payload", token: "private-token" } as never);
  const serializedLogs = JSON.stringify(consoleEntries);
  for (const forbidden of ["private-payload", "private-token", "private-secret", "private-user-id",
    "database-secret-detail"]) assert.equal(serializedLogs.includes(forbidden), false);
  assert.deepEqual(Object.keys(consoleEntries.at(-1)?.[1] as object),
    ["event", "stage", "category", "upstreamStatus", "durationMs"]);

  for (const stage of ["APPLICATION_CONFIG", "HMAC_CONFIG", "BODY_VALIDATION", "APPLICATION_TOKEN",
    "PUBLIC_KEY_RETRIEVAL", "SIGNATURE_VERIFICATION", "INBOX_PERSISTENCE"])
    assert(observedStages.has(stage), `missing diagnostic stage ${stage}`);

  console.log("eBay deletion notification safe diagnostics: PASS");
} finally {
  console.error = originalConsoleError;
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
}
