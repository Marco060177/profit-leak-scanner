import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import {
  EbayNotificationVerificationError,
  createEbayNotificationPublicKeyProvider,
  createEbayNotificationSignatureVerifier,
  type EbayNotificationPublicKeyProvider,
} from "../../app/connectors/ebay/ebay-notification-signature.server";
import type { EbayApplicationConfig, EbayHttpRequest, EbayHttpResponse,
  EbayHttpTransport } from "../../app/connectors/ebay/ebay-types";

const encoder = new TextEncoder();
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
const ebayApiPublicKey = publicKeyPem.replace(/\r?\n/g, "");
const message = {
  metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", deprecated: false },
  notification: { notificationId: "notification-1", eventDate: "2026-10-11T10:00:00.000Z",
    publishDate: "2026-10-11T10:00:01.000Z", publishAttemptCount: 1,
    data: { username: "masked-user", userId: "immutable-user-1", eiasToken: "legacy-token" } },
};
const raw = encoder.encode(JSON.stringify(message));

function signatureFor(value: unknown, keyId = "official-compatible-key-1") {
  const signer = createSign("ssl3-sha1");
  signer.update(JSON.stringify(value), "utf8");
  signer.end();
  const signature = signer.sign(privateKey).toString("base64");
  return Buffer.from(JSON.stringify({ alg: "ecdsa", kid: keyId, signature, digest: "sha1" }), "ascii")
    .toString("base64");
}

let clock = 1_000;
let keyCalls = 0;
const processorCalls = 0;
const provider: EbayNotificationPublicKeyProvider = { async getPublicKey(keyId) {
  keyCalls += 1;
  if (keyId === "unknown-key") throw new Error("unknown");
  return publicKeyPem;
} };
const verifier = createEbayNotificationSignatureVerifier({ publicKeyProvider: provider,
  cacheTtlMs: 1_000, maxCacheEntries: 2, now: () => clock });

assert.deepEqual(await verifier.verify(raw, signatureFor(message)),
  { verified: true, keyId: "official-compatible-key-1", notification: {
    notificationId: "notification-1", topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0",
    eventDate: "2026-10-11T10:00:00.000Z", userId: "immutable-user-1",
  } });
assert.equal(keyCalls, 1);
await verifier.verify(encoder.encode(`  ${JSON.stringify(message)}\n`), signatureFor(message));
assert.equal(keyCalls, 1, "SDK semantics serialize the parsed message and cache the key");
clock = 2_001;
await verifier.verify(raw, signatureFor(message));
assert.equal(keyCalls, 2, "expired keys are retrieved again");
assert.equal(processorCalls, 0, "the verifier has no notification processor callback");

async function rejects(code: EbayNotificationVerificationError["code"], body: Uint8Array, signature?: string | null) {
  await assert.rejects(verifier.verify(body, signature),
    (error) => error instanceof EbayNotificationVerificationError && error.code === code);
}

await rejects("MISSING_SIGNATURE", raw, null);
await rejects("MALFORMED_SIGNATURE", raw, "not-base64");
await rejects("MALFORMED_SIGNATURE", raw,
  Buffer.from('{"kid":"a","kid":"b","signature":"YQ=="}').toString("base64"));
await rejects("INVALID_SIGNATURE", raw, signatureFor({ ...message,
  notification: { ...message.notification, notificationId: "different" } }));
await rejects("INVALID_SIGNATURE", encoder.encode(JSON.stringify({ ...message,
  notification: { ...message.notification, notificationId: "tampered" } })), signatureFor(message));
await rejects("MALFORMED_PAYLOAD", encoder.encode('{"metadata":{"topic":"A","topic":"B"}}'),
  signatureFor(message));
await rejects("MALFORMED_PAYLOAD", encoder.encode('{"metadata":{"t\\u006fpic":"A","topic":"B"}}'),
  signatureFor(message));
await rejects("UNSUPPORTED_PAYLOAD", encoder.encode(JSON.stringify({ ...message,
  metadata: { ...message.metadata, schemaVersion: "2.0" } })), signatureFor(message));
await rejects("UNSUPPORTED_PAYLOAD", encoder.encode(JSON.stringify({ ...message,
  metadata: { ...message.metadata, topic: "OTHER_TOPIC" } })), signatureFor(message));
await rejects("KEY_RETRIEVAL_FAILED", raw, signatureFor(message, "unknown-key"));

const failingVerifier = createEbayNotificationSignatureVerifier({
  publicKeyProvider: { async getPublicKey() { throw new Error("network body must not escape"); } },
});
await assert.rejects(failingVerifier.verify(raw, signatureFor(message, "network-key")),
  (error) => error instanceof EbayNotificationVerificationError && error.code === "KEY_RETRIEVAL_FAILED" &&
    !error.message.includes("network body"));

class MockTransport implements EbayHttpTransport {
  readonly requests: EbayHttpRequest[] = [];
  private readonly responses: EbayHttpResponse[];
  constructor(responses: EbayHttpResponse[]) { this.responses = responses; }
  async request(request: EbayHttpRequest) {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) throw new Error("unexpected request");
    return response;
  }
}
const response = (status: number, value: unknown): EbayHttpResponse => ({ status, headers: {},
  body: encoder.encode(JSON.stringify(value)) });
const config: EbayApplicationConfig = { environment: "PRODUCTION", clientId: "client-id",
  clientSecret: "client-secret", ruName: "runame", timeoutMs: 2_000, maxAttempts: 1, maxRetryAfterMs: 0 };
const transport = new MockTransport([
  response(200, { access_token: "application-token", token_type: "Application Access Token", expires_in: 7200 }),
  response(200, { key: ebayApiPublicKey }),
]);
const apiProvider = createEbayNotificationPublicKeyProvider(config, transport);
assert.equal(await apiProvider.getPublicKey("official-compatible-key-1"),
  ebayApiPublicKey.replace("-----BEGIN PUBLIC KEY-----", "-----BEGIN PUBLIC KEY-----\n")
    .replace("-----END PUBLIC KEY-----", "\n-----END PUBLIC KEY-----"));
assert.equal(transport.requests[0].url, "https://api.ebay.com/identity/v1/oauth2/token");
assert.equal(new TextDecoder().decode(transport.requests[0].body),
  "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope");
assert.equal(transport.requests[1].url,
  "https://api.ebay.com/commerce/notification/v1/public_key/official-compatible-key-1");
assert.equal(transport.requests[1].headers.authorization, "Bearer application-token");

const multilineKeyTransport = new MockTransport([
  response(200, { access_token: "application-token", token_type: "Application Access Token", expires_in: 7200 }),
  response(200, { key: publicKeyPem }),
]);
assert.equal(await createEbayNotificationPublicKeyProvider(config, multilineKeyTransport)
  .getPublicKey("official-compatible-key-2"), publicKeyPem.trim());

const wrongFieldTransport = new MockTransport([
  response(200, { access_token: "application-token", token_type: "Application Access Token", expires_in: 7200 }),
  response(200, { publicKey: ebayApiPublicKey }),
]);
await assert.rejects(createEbayNotificationPublicKeyProvider(config, wrongFieldTransport).getPublicKey("key-2"),
  (error) => error instanceof EbayNotificationVerificationError && error.code === "KEY_RETRIEVAL_FAILED" &&
    error.diagnosticStage === "PUBLIC_KEY_RETRIEVAL" && error.diagnosticCategory === "UPSTREAM_RESPONSE_INVALID" &&
    error.upstreamStatus === 200);

for (const [badTransport, expectedStage] of [
  [new MockTransport([response(500, {})]), "APPLICATION_TOKEN"],
  [new MockTransport([response(200, { access_token: "token", token_type: "Application Access Token",
    expires_in: 7200 }), response(404, {})]), "PUBLIC_KEY_RETRIEVAL"],
  [new MockTransport([response(200, { access_token: "token", token_type: "Application Access Token",
    expires_in: 7200 }), response(200, { key: "bad" })]), "PUBLIC_KEY_RETRIEVAL"],
] as const) await assert.rejects(
  createEbayNotificationPublicKeyProvider(config, badTransport).getPublicKey("key-1"),
  (error) => error instanceof EbayNotificationVerificationError && error.code === "KEY_RETRIEVAL_FAILED" &&
    error.diagnosticStage === expectedStage);

console.log("ED3-B SDK-compatible eBay notification signature tests passed");
