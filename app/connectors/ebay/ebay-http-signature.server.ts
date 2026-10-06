import { createHash, sign, type KeyLike } from "node:crypto";
import { EbayConnectorError, type EbayHttpRequest } from "./ebay-types";

export type EbaySigningMaterial = Readonly<{
  privateKey: KeyLike;
  publicKeyJwe: string;
  keyVersion: string;
}>;

export interface EbaySigningKeyProvider {
  getSigningMaterial(): Promise<EbaySigningMaterial>;
}

export type EbaySignedHeaders = Readonly<{
  "x-ebay-signature-key": string;
  "content-digest"?: string;
  "signature-input": string;
  signature: string;
}>;

function safeMaterial(material: EbaySigningMaterial) {
  if (!material.privateKey || !material.publicKeyJwe || material.publicKeyJwe !== material.publicKeyJwe.trim() ||
      material.publicKeyJwe.length > 16_384 || !material.keyVersion.trim() || material.keyVersion.length > 255)
    throw new EbayConnectorError("SIGNING_REQUIRED");
  return material;
}

export function ebayContentDigest(body: Uint8Array) {
  return `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;
}

export function ebaySignatureBase(input: {
  method: EbayHttpRequest["method"];
  url: URL;
  publicKeyJwe: string;
  created: number;
  contentDigest?: string;
}) {
  const components = ["x-ebay-signature-key", "@method", "@path", "@authority"];
  if (input.contentDigest !== undefined) components.push("content-digest");
  const signatureInput = `sig1=(${components.map((value) => `"${value}"`).join(" ")});created=${input.created}`;
  const lines = [
    `"x-ebay-signature-key": ${input.publicKeyJwe}`,
    `"@method": ${input.method}`,
    `"@path": ${input.url.pathname}`,
    `"@authority": ${input.url.host}`,
  ];
  if (input.contentDigest !== undefined) lines.push(`"content-digest": ${input.contentDigest}`);
  lines.push(`"@signature-params": ${signatureInput.slice("sig1=".length)}`);
  return { signatureInput, signatureBase: lines.join("\n") };
}

export async function signEbayHttpRequest(input: {
  request: Pick<EbayHttpRequest, "method" | "url" | "body">;
  hasBody: boolean;
  created: number;
  keyProvider?: EbaySigningKeyProvider;
}): Promise<EbaySignedHeaders> {
  if (!input.keyProvider || !Number.isSafeInteger(input.created) || input.created < 0)
    throw new EbayConnectorError("SIGNING_REQUIRED");
  let material: EbaySigningMaterial;
  try { material = safeMaterial(await input.keyProvider.getSigningMaterial()); }
  catch (error) {
    if (error instanceof EbayConnectorError) throw error;
    throw new EbayConnectorError("SIGNING_REQUIRED");
  }
  const contentDigest = input.hasBody ? ebayContentDigest(input.request.body) : undefined;
  const built = ebaySignatureBase({ method: input.request.method, url: new URL(input.request.url),
    publicKeyJwe: material.publicKeyJwe, created: input.created, contentDigest });
  let signatureBytes: Buffer;
  try { signatureBytes = sign(null, Buffer.from(built.signatureBase, "utf8"), material.privateKey); }
  catch { throw new EbayConnectorError("SIGNING_REQUIRED"); }
  return { "x-ebay-signature-key": material.publicKeyJwe,
    ...(contentDigest === undefined ? {} : { "content-digest": contentDigest }),
    "signature-input": built.signatureInput, signature: `sig1=:${signatureBytes.toString("base64")}:` };
}
