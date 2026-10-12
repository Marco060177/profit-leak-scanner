import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  Aes256GcmEncryptionCore,
  Aes256GcmEncryptionError,
  loadAes256GcmKeyringFromEnvironment,
  type EncryptionContext,
} from "../../app/services/aes-256-gcm-encryption.server";

const currentKey = randomBytes(32).toString("base64");
const historicalKey = randomBytes(32).toString("base64");
const environment = {
  MARGINLAB_ENCRYPTION_KEYRING: JSON.stringify([
    { version: "prod-v1", key: historicalKey },
    { version: "prod-v2", key: currentKey },
  ]),
  MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "prod-v2",
};
const credentialContext: EncryptionContext = {
  dataClass: "CREDENTIAL",
  accountId: "account-1",
  channelConnectionId: "channel-1",
  recordIdentity: "ebay-refresh-token",
};
const d1Context: EncryptionContext = {
  dataClass: "D1",
  accountId: "account-1",
  channelConnectionId: "channel-1",
  recordIdentity: "raw-record-1",
  chunkIndex: 3,
};

const core = new Aes256GcmEncryptionCore(loadAes256GcmKeyringFromEnvironment(environment));
const credential = Buffer.from("refresh-token-secret", "utf8");
const credentialEnvelope = core.encrypt(credential, credentialContext);
assert.deepEqual(Buffer.from(core.decrypt(credentialEnvelope, credentialContext)), credential);

const d1 = Buffer.from('{"amount":"12345678901234567890.123456789"}', "utf8");
const d1Envelope = core.encrypt(d1, d1Context);
assert.deepEqual(Buffer.from(core.decrypt(d1Envelope, d1Context)), d1);

const nonceOffset = 4 + 2 + Buffer.byteLength(core.currentKeyVersion) + 4;
const first = core.encrypt(credential, credentialContext);
const second = core.encrypt(credential, credentialContext);
assert.notDeepEqual(
  Buffer.from(first).subarray(nonceOffset, nonceOffset + 12),
  Buffer.from(second).subarray(nonceOffset, nonceOffset + 12),
);
assert.notDeepEqual(Buffer.from(first), Buffer.from(second));

function tampered(source: Uint8Array, index: number) {
  const copy = Buffer.from(source);
  copy[index] ^= 0x01;
  return copy;
}

const tagOffset = nonceOffset + 12;
const ciphertextOffset = tagOffset + 16;
for (const mutation of [
  tampered(credentialEnvelope, ciphertextOffset),
  tampered(credentialEnvelope, tagOffset),
  tampered(credentialEnvelope, nonceOffset),
]) assert.throws(
  () => core.decrypt(mutation, credentialContext),
  (error) => error instanceof Aes256GcmEncryptionError && error.code === "DECRYPTION",
);

const truncatedTagEnvelope = Buffer.concat([
  Buffer.from(credentialEnvelope).subarray(0, tagOffset + 15),
  Buffer.from(credentialEnvelope).subarray(ciphertextOffset),
]);
assert.throws(
  () => core.decrypt(truncatedTagEnvelope, credentialContext),
  (error) => error instanceof Aes256GcmEncryptionError && error.code === "ENVELOPE",
);

for (const malformedEnvelope of [
  Buffer.from([]),
  tampered(credentialEnvelope, 0),
  tampered(credentialEnvelope, 4),
  Buffer.from(credentialEnvelope).subarray(0, nonceOffset + 12),
]) assert.throws(
  () => core.decrypt(malformedEnvelope, credentialContext),
  (error) => error instanceof Aes256GcmEncryptionError && error.code === "ENVELOPE",
);

assert.throws(
  () => core.decrypt(credentialEnvelope, { ...d1Context, recordIdentity: credentialContext.recordIdentity }),
  (error) => error instanceof Aes256GcmEncryptionError && error.code === "DECRYPTION",
);

for (const wrongContext of [
  { ...credentialContext, accountId: "account-2" },
  { ...credentialContext, channelConnectionId: "channel-2" },
  { ...credentialContext, recordIdentity: "another-credential" },
]) assert.throws(
  () => core.decrypt(credentialEnvelope, wrongContext),
  (error) => error instanceof Aes256GcmEncryptionError && error.code === "DECRYPTION",
);
for (const wrongContext of [
  { ...d1Context, recordIdentity: "raw-record-2" },
  { ...d1Context, chunkIndex: 4 },
]) assert.throws(
  () => core.decrypt(d1Envelope, wrongContext),
  (error) => error instanceof Aes256GcmEncryptionError && error.code === "DECRYPTION",
);

const historicalWriter = new Aes256GcmEncryptionCore(loadAes256GcmKeyringFromEnvironment({
  ...environment,
  MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "prod-v1",
}));
const historicalEnvelope = historicalWriter.encrypt(credential, credentialContext);
assert.deepEqual(Buffer.from(core.decrypt(historicalEnvelope, credentialContext)), credential);

const currentOnly = new Aes256GcmEncryptionCore(loadAes256GcmKeyringFromEnvironment({
  MARGINLAB_ENCRYPTION_KEYRING: JSON.stringify([{ version: "prod-v2", key: currentKey }]),
  MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "prod-v2",
}));
assert.throws(
  () => currentOnly.decrypt(historicalEnvelope, credentialContext),
  (error) => error instanceof Aes256GcmEncryptionError && error.code === "DECRYPTION",
);

for (const invalidEnvironment of [
  {},
  { MARGINLAB_ENCRYPTION_KEYRING: "not-json", MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "prod-v1" },
  { MARGINLAB_ENCRYPTION_KEYRING: "[]", MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "prod-v1" },
  { MARGINLAB_ENCRYPTION_KEYRING: JSON.stringify([{ version: "prod-v1", key: "bad" }]),
    MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "prod-v1" },
  { MARGINLAB_ENCRYPTION_KEYRING: JSON.stringify([{ version: "bad version", key: currentKey }]),
    MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "bad version" },
  { MARGINLAB_ENCRYPTION_KEYRING: JSON.stringify([
    { version: "prod-v1", key: currentKey }, { version: "prod-v1", key: historicalKey },
  ]), MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "prod-v1" },
  { MARGINLAB_ENCRYPTION_KEYRING: JSON.stringify([{ version: "prod-v1", key: currentKey, extra: true }]),
    MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "prod-v1" },
  { MARGINLAB_ENCRYPTION_KEYRING: JSON.stringify([{ version: "prod-v1", key: currentKey }]),
    MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "missing" },
]) assert.throws(
  () => loadAes256GcmKeyringFromEnvironment(invalidEnvironment),
  (error) => error instanceof Aes256GcmEncryptionError && error.code === "CONFIGURATION",
);

for (const invalidContext of [
  { ...credentialContext, accountId: "" },
  { ...credentialContext, recordIdentity: " bad" },
  { ...credentialContext, chunkIndex: 0 },
  { ...d1Context, chunkIndex: -1 },
  { ...d1Context, chunkIndex: 1.5 },
]) assert.throws(() => core.encrypt(credential, invalidContext as EncryptionContext), Aes256GcmEncryptionError);

const secondInstance = new Aes256GcmEncryptionCore(loadAes256GcmKeyringFromEnvironment(environment));
assert.deepEqual(Buffer.from(secondInstance.decrypt(credentialEnvelope, credentialContext)), credential);
assert.deepEqual(Buffer.from(core.decrypt(secondInstance.encrypt(d1, d1Context), d1Context)), d1);

const originalConsole = { log: console.log, warn: console.warn, error: console.error };
const logged: unknown[][] = [];
console.log = (...values: unknown[]) => { logged.push(values); };
console.warn = (...values: unknown[]) => { logged.push(values); };
console.error = (...values: unknown[]) => { logged.push(values); };
try {
  assert.throws(() => core.decrypt(tampered(credentialEnvelope, ciphertextOffset), credentialContext));
  assert.throws(() => loadAes256GcmKeyringFromEnvironment({}));
  assert.equal(logged.length, 0);
} finally {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

console.log("ED3-G production AES-256-GCM encryption core tests passed");
