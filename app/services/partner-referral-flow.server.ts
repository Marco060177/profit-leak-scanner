import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { AuthenticatedTenantContext } from "~/core/authenticated-tenant-context";
import {
  appendMilestoneEvent,
  attributeAccountToPartner,
  getAttributionByAccount,
  normalizeReferralCode,
  PartnerAttributionConflictError,
  resolvePartnerByReferralCode,
} from "~/services/partner-program.server";

export const PARTNER_REFERRAL_COOKIE_NAME = "ml_partner_ref";
export const PARTNER_REFERRAL_TTL_SECONDS = 7 * 24 * 60 * 60;
export const PARTNER_CLAIM_TOKEN_TTL_SECONDS = 5 * 60;
export const PARTNER_CLAIM_COMPLETED_PARAM = "partner_claim";

type PendingReferral = Readonly<{
  version: 1;
  partnerId: string;
  referralCode: string;
  capturedAt: number;
  expiresAt: number;
}>;

type PartnerClaimToken = Readonly<{
  version: 1;
  purpose: "PARTNER_REFERRAL_CLAIM";
  accountId: string;
  channelConnectionId: string;
  channel: AuthenticatedTenantContext["channel"];
  returnUrl: string;
  issuedAt: number;
  expiresAt: number;
}>;

const sign = (encoded: string, secret: string) =>
  createHmac("sha256", secret).update(encoded).digest("base64url");

const serializeCookie = (value: string, maxAge: number, expires: Date) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${PARTNER_REFERRAL_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires.toUTCString()}${secure}`;
};

const cookieValue = (header: string | null) => {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === PARTNER_REFERRAL_COOKIE_NAME) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
};

function readPendingReferral(cookieHeader: string | null, secret: string, now: Date): PendingReferral | null {
  const value = cookieValue(cookieHeader);
  if (!value || !secret) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const encoded = value.slice(0, separator);
  const actual = value.slice(separator + 1);
  const expected = sign(encoded, secret);
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<PendingReferral>;
    if (parsed.version !== 1 || typeof parsed.partnerId !== "string" || typeof parsed.referralCode !== "string" ||
      typeof parsed.capturedAt !== "number" || typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now.getTime() || parsed.capturedAt > now.getTime() || parsed.expiresAt <= parsed.capturedAt) return null;
    return parsed as PendingReferral;
  } catch {
    return null;
  }
}

function createPendingReferralCookie(pending: PendingReferral, secret: string) {
  const encoded = Buffer.from(JSON.stringify(pending), "utf8").toString("base64url");
  return serializeCookie(`${encoded}.${sign(encoded, secret)}`, PARTNER_REFERRAL_TTL_SECONDS, new Date(pending.expiresAt));
}

export const clearPendingReferralCookie = () => serializeCookie("", 0, new Date(0));

export async function capturePartnerReferral(
  db: PrismaClient,
  request: Request,
  secret: string,
  now = new Date(),
) {
  const suppliedCode = new URL(request.url).searchParams.get("ref");
  if (suppliedCode === null) return { captured: false as const, setCookie: null };
  return capturePartnerReferralCode(db, suppliedCode, request.headers.get("Cookie"), secret, now);
}

export async function capturePartnerReferralCode(
  db: PrismaClient,
  suppliedCode: string,
  cookieHeader: string | null,
  secret: string,
  now = new Date(),
) {
  if (!secret) return { captured: false as const, setCookie: null, reason: "INVALID_CONFIGURATION" as const };
  const existing = readPendingReferral(cookieHeader, secret, now);
  if (existing) return { captured: false as const, setCookie: null, reason: "FIRST_TOUCH_PRESERVED" as const };

  let referralCode: string;
  try {
    referralCode = normalizeReferralCode(suppliedCode);
  } catch {
    return { captured: false as const, setCookie: null, reason: "INVALID_CODE" as const };
  }
  const partner = await resolvePartnerByReferralCode(db, referralCode);
  if (!partner || partner.status !== "ACTIVE") {
    return { captured: false as const, setCookie: null, reason: "INELIGIBLE_PARTNER" as const };
  }
  const pending: PendingReferral = {
    version: 1,
    partnerId: partner.id,
    referralCode: partner.referralCode,
    capturedAt: now.getTime(),
    expiresAt: now.getTime() + PARTNER_REFERRAL_TTL_SECONDS * 1_000,
  };
  return { captured: true as const, setCookie: createPendingReferralCookie(pending, secret) };
}

const claimKey = (secret: string) =>
  createHash("sha256").update("marginlab:partner-referral-claim:v1\0").update(secret).digest();

export function createPartnerClaimToken(
  tenant: AuthenticatedTenantContext,
  returnUrl: string,
  secret: string,
  now = new Date(),
) {
  if (!secret) throw new Error("Partner claim token secret is required");
  const parsedReturnUrl = new URL(returnUrl);
  if (parsedReturnUrl.protocol !== "https:" || parsedReturnUrl.hostname !== "admin.shopify.com") {
    throw new Error("Partner claim return URL must be Shopify Admin");
  }
  const payload: PartnerClaimToken = {
    version: 1,
    purpose: "PARTNER_REFERRAL_CLAIM",
    accountId: tenant.accountId,
    channelConnectionId: tenant.channelConnectionId,
    channel: tenant.channel,
    returnUrl: parsedReturnUrl.toString(),
    issuedAt: now.getTime(),
    expiresAt: now.getTime() + PARTNER_CLAIM_TOKEN_TTL_SECONDS * 1_000,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", claimKey(secret), iv);
  cipher.setAAD(Buffer.from(payload.purpose));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [iv, encrypted, cipher.getAuthTag()].map((value) => value.toString("base64url")).join(".");
}

function readPartnerClaimToken(token: string, secret: string, now: Date): PartnerClaimToken | null {
  if (!token || !secret) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [iv, encrypted, tag] = parts.map((value) => Buffer.from(value, "base64url"));
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) return null;
    const decipher = createDecipheriv("aes-256-gcm", claimKey(secret), iv);
    decipher.setAAD(Buffer.from("PARTNER_REFERRAL_CLAIM"));
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")) as
      Partial<PartnerClaimToken>;
    if (parsed.version !== 1 || parsed.purpose !== "PARTNER_REFERRAL_CLAIM" ||
      typeof parsed.accountId !== "string" || typeof parsed.channelConnectionId !== "string" ||
      (parsed.channel !== "SHOPIFY" && parsed.channel !== "AMAZON") || typeof parsed.returnUrl !== "string" ||
      typeof parsed.issuedAt !== "number" || typeof parsed.expiresAt !== "number" ||
      parsed.issuedAt > now.getTime() || parsed.expiresAt <= now.getTime() ||
      parsed.expiresAt - parsed.issuedAt !== PARTNER_CLAIM_TOKEN_TTL_SECONDS * 1_000) return null;
    const returnUrl = new URL(parsed.returnUrl);
    if (returnUrl.protocol !== "https:" || returnUrl.hostname !== "admin.shopify.com") return null;
    return parsed as PartnerClaimToken;
  } catch {
    return null;
  }
}

export async function consumePartnerClaimBridge(
  db: PrismaClient,
  token: string,
  cookieHeader: string | null,
  secret: string,
  now = new Date(),
) {
  const claimToken = readPartnerClaimToken(token, secret, now);
  if (!claimToken) return { status: "INVALID_TOKEN" as const, setCookie: null, returnUrl: null };
  const claim = await claimPartnerReferral(db, {
    accountId: claimToken.accountId,
    channelConnectionId: claimToken.channelConnectionId,
    channel: claimToken.channel,
  }, cookieHeader, secret, now);
  return { ...claim, returnUrl: claimToken.returnUrl };
}

export function buildEmbeddedPartnerReturnUrl(shopDomain: string, appHandle: string) {
  const shopHandle = shopDomain.toLowerCase().replace(/\.myshopify\.com$/, "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(shopHandle) || !/^[a-z0-9][a-z0-9-]*$/.test(appHandle)) {
    throw new Error("Invalid Shopify embedded return identity");
  }
  const url = new URL(`https://admin.shopify.com/store/${shopHandle}/apps/${appHandle}`);
  url.searchParams.set(PARTNER_CLAIM_COMPLETED_PARAM, "done");
  return url.toString();
}

export function buildPartnerClaimBridgeUrl(appUrl: string, token: string) {
  const url = new URL("/partner/claim", appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildShopifyAppStoreUrl(appHandle: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(appHandle)) throw new Error("Invalid Shopify App Store handle");
  return `https://apps.shopify.com/${appHandle}`;
}

export function shouldInitiatePartnerClaimBridge(hasAttribution: boolean, requestUrl: string) {
  return !hasAttribution && new URL(requestUrl).searchParams.get(PARTNER_CLAIM_COMPLETED_PARAM) !== "done";
}

export async function claimPartnerReferral(
  db: PrismaClient,
  tenant: AuthenticatedTenantContext,
  cookieHeader: string | null,
  secret: string,
  now = new Date(),
) {
  const hasCookie = cookieValue(cookieHeader) !== null;
  if (!hasCookie) return { status: "NO_REFERRAL" as const, setCookie: null };
  const pending = readPendingReferral(cookieHeader, secret, now);
  if (!pending) return { status: "INVALID_OR_EXPIRED" as const, setCookie: clearPendingReferralCookie() };

  const status = await db.$transaction(async (tx) => {
    const partner = await resolvePartnerByReferralCode(tx, pending.referralCode);
    if (!partner || partner.id !== pending.partnerId || partner.status !== "ACTIVE") return "INVALID_OR_EXPIRED" as const;
    const before = await getAttributionByAccount(tx, tenant.accountId);
    try {
      const referral = await attributeAccountToPartner(tx, {
        accountId: tenant.accountId,
        partnerId: partner.id,
        attributionSource: "PARTNER_REFERRAL_COOKIE",
        sourceMetadata: {
          referralCode: partner.referralCode,
          capturedAt: new Date(pending.capturedAt).toISOString(),
          claimChannel: tenant.channel,
        },
        attributedAt: now,
      });
      await appendMilestoneEvent(tx, {
        accountId: tenant.accountId,
        referralId: referral.id,
        eventType: "ATTRIBUTED",
        idempotencyKey: `attributed:${referral.id}`,
        occurredAt: referral.attributedAt,
        metadata: { source: "PARTNER_REFERRAL_COOKIE", referralCode: partner.referralCode },
      });
      return before ? "ALREADY_ATTRIBUTED" as const : "ATTRIBUTED" as const;
    } catch (error) {
      if (error instanceof PartnerAttributionConflictError) return "CONFLICT_PRESERVED" as const;
      throw error;
    }
  });
  return { status, setCookie: clearPendingReferralCookie() };
}
