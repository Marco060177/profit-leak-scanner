import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { executeEbayApiRequest, ebayApiBaseUrl, extractSafeEbayRequestId,
  type EbayApiOperation } from "../../app/connectors/ebay/ebay-api-client.server";
import { ebayContentDigest, ebaySignatureBase, signEbayHttpRequest,
  type EbaySigningKeyProvider } from "../../app/connectors/ebay/ebay-http-signature.server";
import { EbayConnectorError, type EbayApplicationConfig, type EbayHttpRequest,
  type EbayHttpResponse, type EbayHttpTransport } from "../../app/connectors/ebay/ebay-types";

const encoder = new TextEncoder();
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyJwe = "test-public-key-jwe-sensitive";
const accessToken = "test-access-token-sensitive";
const keyProvider: EbaySigningKeyProvider = { async getSigningMaterial() {
  return { privateKey, publicKeyJwe, keyVersion: "test-key-v1" };
} };
const config: EbayApplicationConfig = { environment: "SANDBOX", clientId: "client", clientSecret: "secret",
  ruName: "runame", timeoutMs: 1500, maxAttempts: 3, maxRetryAfterMs: 2000 };

class MockTransport implements EbayHttpTransport {
  readonly requests: EbayHttpRequest[] = [];
  private readonly handlers: Array<(request: EbayHttpRequest) => EbayHttpResponse | Promise<EbayHttpResponse>>;
  constructor(handlers: Array<(request: EbayHttpRequest) => EbayHttpResponse | Promise<EbayHttpResponse>>) {
    this.handlers = handlers;
  }
  async request(request: EbayHttpRequest) {
    this.requests.push(request);
    const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected real/unmocked request");
    return handler(request);
  }
}

const response = (status: number, body = "{}", headers: Record<string, string> = {}): EbayHttpResponse =>
  ({ status, body: encoder.encode(body), headers });
const signatureBytes = (header: string) => Buffer.from(header.slice("sig1=:".length, -1), "base64");
const createdFrom = (header: string) => Number(/;created=(\d+)$/.exec(header)?.[1]);
const signedBase = (request: EbayHttpRequest) => ebaySignatureBase({ method: request.method,
  url: new URL(request.url), publicKeyJwe: request.headers["x-ebay-signature-key"],
  created: createdFrom(request.headers["signature-input"]),
  contentDigest: request.headers["content-digest"] }).signatureBase;
const verifies = (request: EbayHttpRequest, base = signedBase(request)) =>
  verify(null, Buffer.from(base), publicKey, signatureBytes(request.headers.signature));

const financesPath = "/sell/finances/v1/transaction";
const getRequest = (overrides: Partial<Parameters<typeof executeEbayApiRequest>[0]> = {}) => ({
  config, accessToken, method: "GET" as const, path: financesPath, operation: "FINANCES" as EbayApiOperation,
  transport: new MockTransport([() => response(200)]), keyProvider, signingKeyProvider: keyProvider,
  now: () => 1_700_000_000_000, sleep: async () => {}, ...overrides,
});

// F0-compatible path-only signing: query is transmitted but excluded from @path.
const getTransport = new MockTransport([(request) => {
  assert.equal(request.url, `${ebayApiBaseUrl(config)}${financesPath}?limit=10&filter=status%3A%7BSALE%7D`);
  assert.equal(request.headers["content-digest"], undefined);
  assert.match(request.headers["signature-input"],
    /^sig1=\("x-ebay-signature-key" "@method" "@path" "@authority"\);created=1700000000$/);
  assert.equal(signedBase(request).includes("?limit"), false);
  assert.equal(verifies(request), true);
  return response(200);
}]);
await executeEbayApiRequest(getRequest({ transport: getTransport,
  query: { limit: "10", filter: "status:{SALE}" } }));

const body = encoder.encode('{"refundAmount":"7.25"}');
const postTransport = new MockTransport([(request) => {
  assert.equal(request.headers["content-digest"], ebayContentDigest(body));
  assert.equal(Buffer.compare(Buffer.from(request.body), Buffer.from(body)), 0);
  assert.equal(verifies(request), true);
  const base = signedBase(request);
  for (const changed of [
    base.replace('"@method": POST', '"@method": PUT'),
    base.replace('"@authority": api.sandbox.ebay.com', '"@authority": api.ebay.com'),
    base.replace('"@path": /post-order/', '"@path": /post-order-mutated/'),
    base.replace(request.headers["content-digest"], ebayContentDigest(encoder.encode("mutated"))),
    base.replace("created=1700000000", "created=1700000001"),
    base.replace(publicKeyJwe, `${publicKeyJwe}-mutated`),
  ]) assert.equal(verify(null, Buffer.from(changed), publicKey,
    signatureBytes(request.headers.signature)), false);
  return response(200);
}]);
await executeEbayApiRequest(getRequest({ method: "POST", path: "/post-order/v2/return/123/issue_refund",
  operation: "EU_UK_ISSUE_REFUND", body, contentType: "application/json", transport: postTransport }));

const direct = await signEbayHttpRequest({ request: { method: "GET",
  url: `${ebayApiBaseUrl(config)}${financesPath}`, body: new Uint8Array() }, hasBody: false,
  created: 1_700_000_000, keyProvider });
const directAgain = await signEbayHttpRequest({ request: { method: "GET",
  url: `${ebayApiBaseUrl(config)}${financesPath}`, body: new Uint8Array() }, hasBody: false,
  created: 1_700_000_000, keyProvider });
assert.deepEqual(direct, directAgain);

let unsignedCalls = 0;
const shouldNotRun = new MockTransport([() => { unsignedCalls += 1; return response(200); }]);
for (const request of [
  getRequest({ signingKeyProvider: undefined, transport: shouldNotRun }),
  getRequest({ signingKeyProvider: undefined, transport: shouldNotRun, method: "POST",
    path: "/post-order/v2/return/123/issue_refund", operation: "EU_UK_ISSUE_REFUND", body }),
  getRequest({ signingKeyProvider: undefined, transport: shouldNotRun, operation: "STANDARD" }),
]) await assert.rejects(executeEbayApiRequest(request),
  (error) => error instanceof EbayConnectorError && error.kind === "SIGNING_REQUIRED");
assert.equal(unsignedCalls, 0);
await assert.rejects(signEbayHttpRequest({ request: { method: "GET", url: ebayApiBaseUrl(config),
  body: new Uint8Array() }, hasBody: false, created: 1, keyProvider: undefined }),
(error) => error instanceof EbayConnectorError && error.kind === "SIGNING_REQUIRED");

const ordinary = new MockTransport([(request) => {
  assert.equal(request.headers.signature, undefined);
  assert.equal(request.headers.authorization, `Bearer ${accessToken}`);
  return response(204, "");
}]);
await executeEbayApiRequest(getRequest({ path: "/sell/account/v1/privilege", operation: "STANDARD",
  signingKeyProvider: undefined, transport: ordinary }));

let clock = 1_700_000_000_000;
const retrySignatures: string[] = [];
const retryTransport = new MockTransport([
  (request) => { retrySignatures.push(request.headers.signature); return response(503); },
  (request) => { retrySignatures.push(request.headers.signature); return response(200); },
]);
await executeEbayApiRequest(getRequest({ transport: retryTransport, now: () => { const value = clock; clock += 1000; return value; } }));
assert.equal(retrySignatures.length, 2);
assert.notEqual(retrySignatures[0], retrySignatures[1]);

const waits: number[] = [];
const throttled = new MockTransport([() => response(429, "{}", { "Retry-After": "90" }), () => response(200)]);
await executeEbayApiRequest(getRequest({ transport: throttled, sleep: async (milliseconds) => { waits.push(milliseconds); } }));
assert.deepEqual(waits, [config.maxRetryAfterMs]);

const transient = new MockTransport([
  () => { throw new EbayConnectorError("TIMEOUT", { retryable: true }); },
  () => { throw new EbayConnectorError("RETRYABLE_UPSTREAM", { retryable: true }); },
  () => response(502),
]);
await assert.rejects(executeEbayApiRequest(getRequest({ transport: transient })),
  (error) => error instanceof EbayConnectorError && error.kind === "RETRYABLE_UPSTREAM" && error.retryable);
assert.equal(transient.requests.length, 3);

const timedOut = new MockTransport([() => {
  throw new EbayConnectorError("TIMEOUT", { retryable: true });
}]);
await assert.rejects(executeEbayApiRequest(getRequest({ config: { ...config, maxAttempts: 1 },
  transport: timedOut })),
(error) => error instanceof EbayConnectorError && error.kind === "TIMEOUT" && error.retryable);
assert.equal(timedOut.requests.length, 1);

const unexpected = new MockTransport([() => { throw new Error("transport-secret"); }]);
await assert.rejects(executeEbayApiRequest(getRequest({ transport: unexpected })),
  (error) => error instanceof EbayConnectorError && error.kind === "NON_RETRYABLE_UPSTREAM" &&
    !JSON.stringify(error).includes("transport-secret"));
assert.equal(unexpected.requests.length, 1);

for (const [status, expected, bodyValue] of [
  [400, "NON_RETRYABLE_UPSTREAM", '{"message":"raw-secret-body"}'],
  [401, "AUTHENTICATION", "{}"],
  [403, "AUTHORIZATION", "{}"],
  [400, "INVALID_SIGNATURE", '{"errors":[{"errorId":215120,"message":"signature-secret"}]}'],
] as const) {
  const transport = new MockTransport([() => response(status, bodyValue,
    { "X-EBAY-C-REQUEST-ID": "safe-request-123" })]);
  await assert.rejects(executeEbayApiRequest(getRequest({ transport })), (error) => {
    assert.ok(error instanceof EbayConnectorError);
    assert.equal(error.kind, expected);
    assert.equal(error.requestId, "safe-request-123");
    const serialized = JSON.stringify(error);
    for (const secret of ["raw-secret-body", "signature-secret", accessToken, publicKeyJwe,
      "PRIVATE KEY", "sig1=:", "sig1=("]) assert.equal(serialized.includes(secret), false);
    return true;
  });
  assert.equal(transport.requests.length, 1);
}

assert.equal(extractSafeEbayRequestId({ "X-EBAY-CORRELATION-ID": "correlation-123" }), "correlation-123");
assert.equal(extractSafeEbayRequestId({ "x-ebay-request-id": "unsafe\r\nsecret" }), null);
assert.equal(extractSafeEbayRequestId({ "x-ebay-request-id": "x".repeat(257) }), null);

console.log("eBay EB1-C HTTP transport, retry policy and Ed25519 signatures: PASS");
