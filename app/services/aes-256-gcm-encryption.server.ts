import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const ENV_KEYRING = "MARGINLAB_ENCRYPTION_KEYRING";
const ENV_CURRENT_KEY_VERSION = "MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION";
const ENVELOPE_MAGIC = Buffer.from("MLAE", "ascii");
const ENVELOPE_FORMAT_VERSION = 1;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const MASTER_KEY_BYTES = 32;
const MAX_KEY_VERSION_BYTES = 64;
const MAX_CONTEXT_FIELD_BYTES = 512;
const KEY_VERSION_PATTERN = /^[A-Za-z0-9_-]+$/;
const HKDF_SALT = Buffer.from("marginlab:aes-256-gcm:v1", "utf8");
const AAD_PREFIX = Buffer.from("marginlab:aes-256-gcm:aad:v1", "utf8");

export type EncryptionDataClass = "CREDENTIAL" | "D1";

export type EncryptionContext = Readonly<{
  dataClass: EncryptionDataClass;
  accountId: string;
  channelConnectionId: string;
  recordIdentity: string;
  chunkIndex?: number;
}>;

type KeyringEntry = Readonly<{
  version: string;
  key: Buffer;
}>;

export type Aes256GcmKeyring = Readonly<{
  currentKeyVersion: string;
  keys: ReadonlyMap<string, Uint8Array>;
}>;

export class Aes256GcmEncryptionError extends Error {
  readonly code: "CONFIGURATION" | "CONTEXT" | "ENVELOPE" | "DECRYPTION";

  constructor(code: Aes256GcmEncryptionError["code"]) {
    super(`AES-256-GCM ${code.toLowerCase()} rejected`);
    this.name = "Aes256GcmEncryptionError";
    this.code = code;
  }
}

function reject(code: Aes256GcmEncryptionError["code"]): never {
  throw new Aes256GcmEncryptionError(code);
}

function validKeyVersion(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_KEY_VERSION_BYTES &&
    KEY_VERSION_PATTERN.test(value);
}

function decodeCanonicalKey(value: unknown): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) reject("CONFIGURATION");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== MASTER_KEY_BYTES || decoded.toString("base64") !== value) reject("CONFIGURATION");
  return decoded;
}

function parseKeyringEntries(value: string | undefined): KeyringEntry[] {
  if (!value) reject("CONFIGURATION");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    reject("CONFIGURATION");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 32) reject("CONFIGURATION");
  const seen = new Set<string>();
  return parsed.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) reject("CONFIGURATION");
    const fields = Object.keys(candidate).sort();
    if (fields.length !== 2 || fields[0] !== "key" || fields[1] !== "version") reject("CONFIGURATION");
    const { version, key } = candidate as { version?: unknown; key?: unknown };
    if (!validKeyVersion(version) || seen.has(version)) reject("CONFIGURATION");
    seen.add(version);
    return { version, key: decodeCanonicalKey(key) };
  });
}

export function loadAes256GcmKeyringFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Aes256GcmKeyring {
  const entries = parseKeyringEntries(environment[ENV_KEYRING]);
  const currentKeyVersion = environment[ENV_CURRENT_KEY_VERSION];
  if (!validKeyVersion(currentKeyVersion)) reject("CONFIGURATION");
  const keys = new Map(entries.map((entry) => [entry.version, new Uint8Array(entry.key)]));
  if (!keys.has(currentKeyVersion)) reject("CONFIGURATION");
  return { currentKeyVersion, keys };
}

function validatedKeyring(keyring: Aes256GcmKeyring): Readonly<{
  currentKeyVersion: string;
  keys: ReadonlyMap<string, Buffer>;
}> {
  if (!validKeyVersion(keyring.currentKeyVersion) || !(keyring.keys instanceof Map) ||
      keyring.keys.size === 0 || keyring.keys.size > 32) reject("CONFIGURATION");
  const keys = new Map<string, Buffer>();
  for (const [version, sourceKey] of keyring.keys) {
    if (!validKeyVersion(version) || keys.has(version) || !(sourceKey instanceof Uint8Array) ||
        sourceKey.byteLength !== MASTER_KEY_BYTES) reject("CONFIGURATION");
    keys.set(version, Buffer.from(sourceKey));
  }
  if (!keys.has(keyring.currentKeyVersion)) reject("CONFIGURATION");
  return { currentKeyVersion: keyring.currentKeyVersion, keys };
}

function contextField(value: unknown): Buffer {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() ||
      [...value].some((character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f))
    reject("CONTEXT");
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length > MAX_CONTEXT_FIELD_BYTES) reject("CONTEXT");
  return encoded;
}

function lengthPrefixed(value: Buffer): Buffer {
  const size = Buffer.allocUnsafe(4);
  size.writeUInt32BE(value.length);
  return Buffer.concat([size, value]);
}

function serializeContext(context: EncryptionContext): Buffer {
  if (!context || (context.dataClass !== "CREDENTIAL" && context.dataClass !== "D1")) reject("CONTEXT");
  const chunkIndex = context.chunkIndex;
  if (context.dataClass === "D1") {
    if (!Number.isSafeInteger(chunkIndex) || chunkIndex === undefined || chunkIndex < 0 || chunkIndex > 0xffff_ffff)
      reject("CONTEXT");
  } else if (chunkIndex !== undefined) {
    reject("CONTEXT");
  }
  const chunk = Buffer.allocUnsafe(5);
  chunk.writeUInt8(chunkIndex === undefined ? 0 : 1, 0);
  chunk.writeUInt32BE(chunkIndex ?? 0, 1);
  return Buffer.concat([
    lengthPrefixed(AAD_PREFIX),
    lengthPrefixed(contextField(context.dataClass)),
    lengthPrefixed(contextField(context.accountId)),
    lengthPrefixed(contextField(context.channelConnectionId)),
    lengthPrefixed(contextField(context.recordIdentity)),
    chunk,
  ]);
}

function deriveSubkey(masterKey: Buffer, domain: "credential" | "credential-fingerprint" | "d1"): Buffer {
  return Buffer.from(hkdfSync(
    "sha256",
    masterKey,
    HKDF_SALT,
    Buffer.from(`marginlab:${domain}:v1`, "utf8"),
    MASTER_KEY_BYTES,
  ));
}

function encodeEnvelope(keyVersion: string, nonce: Buffer, tag: Buffer, ciphertext: Buffer): Uint8Array {
  if (ciphertext.length > 0xffff_ffff) reject("ENVELOPE");
  const version = Buffer.from(keyVersion, "ascii");
  const ciphertextLength = Buffer.allocUnsafe(4);
  ciphertextLength.writeUInt32BE(ciphertext.length);
  return new Uint8Array(Buffer.concat([
    ENVELOPE_MAGIC,
    Buffer.from([ENVELOPE_FORMAT_VERSION, version.length]),
    version,
    ciphertextLength,
    nonce,
    tag,
    ciphertext,
  ]));
}

function parseEnvelope(envelope: Uint8Array): Readonly<{
  keyVersion: string;
  nonce: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}> {
  if (!(envelope instanceof Uint8Array)) reject("ENVELOPE");
  const bytes = Buffer.from(envelope);
  const fixedBytes = ENVELOPE_MAGIC.length + 2 + 4 + NONCE_BYTES + AUTH_TAG_BYTES;
  if (bytes.length < fixedBytes + 1 || !bytes.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC) ||
      bytes[ENVELOPE_MAGIC.length] !== ENVELOPE_FORMAT_VERSION) reject("ENVELOPE");
  const versionLength = bytes[ENVELOPE_MAGIC.length + 1];
  if (versionLength === 0 || versionLength > MAX_KEY_VERSION_BYTES || bytes.length < fixedBytes + versionLength)
    reject("ENVELOPE");
  const versionStart = ENVELOPE_MAGIC.length + 2;
  const keyVersion = bytes.subarray(versionStart, versionStart + versionLength).toString("ascii");
  if (!validKeyVersion(keyVersion)) reject("ENVELOPE");
  const ciphertextLengthStart = versionStart + versionLength;
  const ciphertextLength = bytes.readUInt32BE(ciphertextLengthStart);
  if (bytes.length !== fixedBytes + versionLength + ciphertextLength) reject("ENVELOPE");
  const nonceStart = ciphertextLengthStart + 4;
  const tagStart = nonceStart + NONCE_BYTES;
  const ciphertextStart = tagStart + AUTH_TAG_BYTES;
  return {
    keyVersion,
    nonce: bytes.subarray(nonceStart, tagStart),
    tag: bytes.subarray(tagStart, ciphertextStart),
    ciphertext: bytes.subarray(ciphertextStart),
  };
}

export class Aes256GcmEncryptionCore {
  readonly currentKeyVersion: string;
  readonly #keys: ReadonlyMap<string, Buffer>;

  constructor(keyring: Aes256GcmKeyring) {
    const validated = validatedKeyring(keyring);
    this.currentKeyVersion = validated.currentKeyVersion;
    this.#keys = validated.keys;
  }

  encrypt(plaintext: Uint8Array, context: EncryptionContext): Uint8Array {
    if (!(plaintext instanceof Uint8Array) || plaintext.byteLength > 0xffff_ffff) reject("CONTEXT");
    const aad = serializeContext(context);
    const masterKey = this.#keys.get(this.currentKeyVersion);
    if (!masterKey) reject("CONFIGURATION");
    const nonce = randomBytes(NONCE_BYTES);
    const domain = context.dataClass === "CREDENTIAL" ? "credential" : "d1";
    const cipher = createCipheriv("aes-256-gcm", deriveSubkey(masterKey, domain), nonce,
      { authTagLength: AUTH_TAG_BYTES });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    if (tag.length !== AUTH_TAG_BYTES) reject("ENVELOPE");
    return encodeEnvelope(this.currentKeyVersion, nonce, tag, ciphertext);
  }

  decrypt(envelope: Uint8Array, context: EncryptionContext, expectedKeyVersion?: string): Uint8Array {
    const aad = serializeContext(context);
    const parsed = parseEnvelope(envelope);
    if (expectedKeyVersion !== undefined && parsed.keyVersion !== expectedKeyVersion) reject("DECRYPTION");
    const masterKey = this.#keys.get(parsed.keyVersion);
    if (!masterKey) reject("DECRYPTION");
    try {
      const domain = context.dataClass === "CREDENTIAL" ? "credential" : "d1";
      const decipher = createDecipheriv("aes-256-gcm", deriveSubkey(masterKey, domain), parsed.nonce,
        { authTagLength: AUTH_TAG_BYTES });
      decipher.setAAD(aad);
      decipher.setAuthTag(parsed.tag);
      return new Uint8Array(Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]));
    } catch {
      return reject("DECRYPTION");
    }
  }

  credentialFingerprint(plaintext: Uint8Array, context: EncryptionContext): string {
    if (!(plaintext instanceof Uint8Array) || context.dataClass !== "CREDENTIAL") reject("CONTEXT");
    const masterKey = this.#keys.get(this.currentKeyVersion);
    if (!masterKey) reject("CONFIGURATION");
    return createHmac("sha256", deriveSubkey(masterKey, "credential-fingerprint"))
      .update(serializeContext(context))
      .update(Buffer.from([0]))
      .update(plaintext)
      .digest("hex");
  }
}

export const AES_256_GCM_ENVIRONMENT_VARIABLES = Object.freeze({
  keyring: ENV_KEYRING,
  currentKeyVersion: ENV_CURRENT_KEY_VERSION,
});
