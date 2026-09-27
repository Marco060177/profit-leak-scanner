import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { AuthorizedPartnerIdentity } from "~/services/partner-dashboard.server";

export const PARTNER_ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const PARTNER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PARTNER_SESSION_COOKIE = "ml_partner_session";
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const opaqueToken = () => randomBytes(32).toString("base64url");

function cookieValue(request: Request) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === PARTNER_SESSION_COOKIE) return value.join("=");
  }
  return null;
}

const sessionCookie = (raw: string, expires: Date, now: Date) =>
  `${PARTNER_SESSION_COOKIE}=${raw}; Path=/partner; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 1000))}; Expires=${expires.toUTCString()}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
export const clearPartnerSessionCookie = () => `${PARTNER_SESSION_COOKIE}=; Path=/partner; HttpOnly; SameSite=Lax; Max-Age=0; Expires=${new Date(0).toUTCString()}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;

export async function issuePartnerAccessToken(db: PrismaClient, partnerId: string, now = new Date()) {
  const partner = await db.partner.findUnique({ where: { id: partnerId.trim() }, select: { id: true, status: true } });
  if (!partner || partner.status !== "ACTIVE") throw new Error("Active Partner not found");
  const rawToken = opaqueToken();
  const expiresAt = new Date(now.getTime() + PARTNER_ACCESS_TOKEN_TTL_MS);
  await db.$transaction(async (tx) => {
    await tx.partnerAccessToken.updateMany({ where: { partnerId: partner.id, consumedAt: null, revokedAt: null }, data: { revokedAt: now } });
    await tx.partnerAccessToken.create({ data: { partnerId: partner.id, tokenHash: digest(rawToken), expiresAt } });
  });
  return { rawToken, expiresAt };
}

export async function consumePartnerAccessToken(db: PrismaClient, rawToken: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return null;
  return db.$transaction(async (tx) => {
    const invitation = await tx.partnerAccessToken.findUnique({ where: { tokenHash: digest(rawToken) }, include: { partner: true } });
    if (!invitation || invitation.partner.status !== "ACTIVE" || invitation.revokedAt || invitation.consumedAt || invitation.expiresAt <= now) return null;
    const claimed = await tx.partnerAccessToken.updateMany({ where: { id: invitation.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (claimed.count !== 1) return null;
    const rawSession = opaqueToken();
    const expiresAt = new Date(now.getTime() + PARTNER_SESSION_TTL_MS);
    await tx.partnerSession.create({ data: { partnerId: invitation.partnerId, sessionHash: digest(rawSession), expiresAt } });
    return { partnerId: invitation.partnerId, setCookie: sessionCookie(rawSession, expiresAt, now), expiresAt };
  });
}

export async function authenticatePartner(db: PrismaClient, request: Request, now = new Date()): Promise<AuthorizedPartnerIdentity | null> {
  const rawSession = cookieValue(request);
  if (!rawSession || !/^[A-Za-z0-9_-]{43}$/.test(rawSession)) return null;
  const session = await db.partnerSession.findUnique({ where: { sessionHash: digest(rawSession) }, include: { partner: { select: { status: true } } } });
  if (!session || session.revokedAt || session.expiresAt <= now || session.partner.status !== "ACTIVE") return null;
  return { partnerId: session.partnerId };
}

export async function logoutPartner(db: PrismaClient, request: Request, now = new Date()) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw new Response("Forbidden", { status: 403 });
  const rawSession = cookieValue(request);
  if (rawSession && /^[A-Za-z0-9_-]{43}$/.test(rawSession)) {
    await db.partnerSession.updateMany({ where: { sessionHash: digest(rawSession), revokedAt: null }, data: { revokedAt: now } });
  }
  return { setCookie: clearPartnerSessionCookie() };
}
