import assert from "node:assert/strict";
import { generateKeyPairSync, KeyObject, verify } from "node:crypto";
import {
  createEnvironmentEbaySigningKeyProvider,
  EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES,
} from "../../app/connectors/ebay/ebay-signing-key-provider.server";
import { executeEbayApiRequest } from "../../app/connectors/ebay/ebay-api-client.server";
import { ebaySignatureBase, signEbayHttpRequest } from "../../app/connectors/ebay/ebay-http-signature.server";
import { EbayConnectorError, type EbayApplicationConfig,
  type EbayHttpRequest } from "../../app/connectors/ebay/ebay-types";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKeyJwe = "ed3j-production-shaped-public-key-jwe";
const keyVersion = "production-v1";
const environment = {
  [EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES.privateKeyPem]: privateKeyPem,
  [EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES.publicKeyJwe]: publicKeyJwe,
  [EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES.keyVersion]: keyVersion,
};
const provider = createEnvironmentEbaySigningKeyProvider(environment);
const material = await provider.getSigningMaterial();
assert(material.privateKey instanceof KeyObject);
assert.equal(material.privateKey.type, "private");
assert.equal(material.privateKey.asymmetricKeyType, "ed25519");
assert.equal(material.publicKeyJwe, publicKeyJwe);
assert.equal(material.keyVersion, keyVersion);

const request = { method: "POST" as const, url: "https://api.ebay.com/sell/finances/v1/transaction",
  body: new TextEncoder().encode('{"amount":"7.25"}') };
const headers = await signEbayHttpRequest({ request, hasBody: true, created: 1_700_000_000, keyProvider: provider });
assert.equal(headers["x-ebay-signature-key"], publicKeyJwe);
assert.match(headers.signature, /^sig1=:[A-Za-z0-9+/]+={0,2}:$/);
const signature = Buffer.from(headers.signature.slice("sig1=:".length, -1), "base64");
const signatureBase = ebaySignatureBase({ method: request.method, url: new URL(request.url), publicKeyJwe,
  created: 1_700_000_000, contentDigest: headers["content-digest"] }).signatureBase;
assert.equal(verify(null, Buffer.from(signatureBase, "utf8"), publicKey, signature), true);

const config: EbayApplicationConfig = { environment: "PRODUCTION", clientId: "client", clientSecret: "secret",
  ruName: "runame", timeoutMs: 1000, maxAttempts: 1, maxRetryAfterMs: 0 };
let captured: EbayHttpRequest | null = null;
const response = await executeEbayApiRequest({ config, accessToken: "memory-only-access-token",
  method: "GET", path: "/sell/finances/v1/transaction", operation: "FINANCES", signingKeyProvider: provider,
  now: () => 1_700_000_000_000, transport: { async request(value) {
    captured = value;
    return { status: 200, headers: {}, body: new Uint8Array() };
  } } });
assert.equal(response.status, 200);
assert(captured);
const capturedRequest = captured as EbayHttpRequest;
assert.equal(capturedRequest.headers["x-ebay-signature-key"], publicKeyJwe);
const capturedSignature = Buffer.from(capturedRequest.headers.signature.slice("sig1=:".length, -1), "base64");
const capturedBase = ebaySignatureBase({ method: capturedRequest.method, url: new URL(capturedRequest.url),
  publicKeyJwe, created: 1_700_000_000 }).signatureBase;
assert.equal(verify(null, Buffer.from(capturedBase, "utf8"), publicKey, capturedSignature), true);

const { privateKey: rsaPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const rsaPem = rsaPrivateKey.export({ format: "pem", type: "pkcs8" }).toString();
for (const invalidEnvironment of [
  {},
  { ...environment, [EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES.privateKeyPem]: "not-a-pem" },
  { ...environment, [EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES.privateKeyPem]: rsaPem },
  { ...environment, [EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES.publicKeyJwe]: "" },
  { ...environment, [EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES.publicKeyJwe]: "bad\nvalue" },
  { ...environment, [EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES.keyVersion]: "bad version" },
]) assert.throws(
  () => createEnvironmentEbaySigningKeyProvider(invalidEnvironment),
  (error) => error instanceof EbayConnectorError && error.kind === "SIGNING_REQUIRED",
);

const originalConsole = { log: console.log, warn: console.warn, error: console.error };
const logged: unknown[][] = [];
console.log = (...values: unknown[]) => { logged.push(values); };
console.warn = (...values: unknown[]) => { logged.push(values); };
console.error = (...values: unknown[]) => { logged.push(values); };
try {
  assert.throws(() => createEnvironmentEbaySigningKeyProvider({
    ...environment,
    [EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES.privateKeyPem]: `${privateKeyPem}corrupt`,
  }));
  assert.equal(logged.length, 0);
} finally {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

assert.equal(JSON.stringify(new EbayConnectorError("SIGNING_REQUIRED")).includes(privateKeyPem), false);
console.log("ED3-J eBay production Ed25519 signing-key provider tests passed");
