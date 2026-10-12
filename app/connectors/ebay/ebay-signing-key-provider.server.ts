import { createPrivateKey, type KeyObject } from "node:crypto";
import { EbayConnectorError } from "./ebay-types";
import type { EbaySigningKeyProvider, EbaySigningMaterial } from "./ebay-http-signature.server";

const PRIVATE_KEY_ENV = "EBAY_ED25519_PRIVATE_KEY_PEM";
const PUBLIC_KEY_JWE_ENV = "EBAY_ED25519_PUBLIC_KEY_JWE";
const KEY_VERSION_ENV = "EBAY_ED25519_KEY_VERSION";
const KEY_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,255}$/;
const MAX_PEM_BYTES = 16 * 1024;
const MAX_PUBLIC_KEY_JWE_BYTES = 16 * 1024;

function reject(): never {
  throw new EbayConnectorError("SIGNING_REQUIRED");
}

function parsePrivateKey(value: string | undefined): KeyObject {
  if (!value || Buffer.byteLength(value, "utf8") > MAX_PEM_BYTES ||
      !value.startsWith("-----BEGIN PRIVATE KEY-----") ||
      !value.trimEnd().endsWith("-----END PRIVATE KEY-----")) reject();
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: value, format: "pem" });
  } catch {
    return reject();
  }
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") reject();
  return key;
}

function parsePublicKeyJwe(value: string | undefined): string {
  if (!value || value !== value.trim() || Buffer.byteLength(value, "utf8") > MAX_PUBLIC_KEY_JWE_BYTES ||
      /[\r\n]/.test(value)) reject();
  return value;
}

function parseKeyVersion(value: string | undefined): string {
  if (!value || !KEY_VERSION_PATTERN.test(value)) reject();
  return value;
}

export class EnvironmentEbayEd25519SigningKeyProvider implements EbaySigningKeyProvider {
  readonly #material: EbaySigningMaterial;

  constructor(environment: Readonly<Record<string, string | undefined>>) {
    this.#material = Object.freeze({
      privateKey: parsePrivateKey(environment[PRIVATE_KEY_ENV]),
      publicKeyJwe: parsePublicKeyJwe(environment[PUBLIC_KEY_JWE_ENV]),
      keyVersion: parseKeyVersion(environment[KEY_VERSION_ENV]),
    });
  }

  async getSigningMaterial(): Promise<EbaySigningMaterial> {
    return this.#material;
  }
}

export function createEnvironmentEbaySigningKeyProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): EbaySigningKeyProvider {
  return new EnvironmentEbayEd25519SigningKeyProvider(environment);
}

export const EBAY_SIGNING_KEY_ENVIRONMENT_VARIABLES = Object.freeze({
  privateKeyPem: PRIVATE_KEY_ENV,
  publicKeyJwe: PUBLIC_KEY_JWE_ENV,
  keyVersion: KEY_VERSION_ENV,
});
