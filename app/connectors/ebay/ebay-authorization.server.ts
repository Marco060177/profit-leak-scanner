import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import { requireCredentialEncryptionProvider,
  type CredentialEncryptionContext, type CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { canonicalizeEbayScopes, EbayConnectorError } from "./ebay-types";

type Db = PrismaClient | Prisma.TransactionClient;
type AuthorizationStatus = "ACTIVE" | "REAUTH_REQUIRED" | "REVOKED";

export type EbayAuthorizationMetadata = Readonly<{
  accountId: string;
  channelConnectionId: string;
  status: AuthorizationStatus;
  authorizationVersion: string;
  grantedScopes: readonly string[];
  grantedAt: Date;
  validatedAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  reauthRequiredAt: Date | null;
  revokedAt: Date | null;
  replayed: boolean;
}>;

function parseScopes(value: string, requireRequired = true) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((scope) => typeof scope !== "string"))
      throw new Error("invalid");
    return canonicalizeEbayScopes(parsed, requireRequired);
  } catch (error) {
    if (error instanceof EbayConnectorError) throw error;
    throw new EbayConnectorError("AUTHORIZATION");
  }
}

function metadata(row: {
  accountId: string; channelConnectionId: string; status: string; authorizationVersion: string;
  grantedScopesJson: string; grantedAt: Date; validatedAt: Date | null;
  refreshTokenExpiresAt: Date | null; reauthRequiredAt: Date | null; revokedAt: Date | null;
}, replayed: boolean): EbayAuthorizationMetadata {
  if (!( ["ACTIVE", "REAUTH_REQUIRED", "REVOKED"] as const).includes(row.status as AuthorizationStatus))
    throw new EbayConnectorError("AUTHORIZATION");
  return { accountId: row.accountId, channelConnectionId: row.channelConnectionId,
    status: row.status as AuthorizationStatus, authorizationVersion: row.authorizationVersion,
    grantedScopes: parseScopes(row.grantedScopesJson, row.status === "ACTIVE"), grantedAt: row.grantedAt,
    validatedAt: row.validatedAt, refreshTokenExpiresAt: row.refreshTokenExpiresAt,
    reauthRequiredAt: row.reauthRequiredAt, revokedAt: row.revokedAt, replayed };
}

async function requireEbayOwner(db: Db, tenant: VerifiedCoreTenant) {
  const channel = await db.channelConnection.findUnique({ where: { id: tenant.channelConnectionId }, include: { account: true } });
  if (!channel || channel.accountId !== tenant.accountId || channel.channel !== "EBAY" ||
      channel.status !== "ACTIVE" || channel.account.status !== "ACTIVE")
    throw new EbayConnectorError("AUTHORIZATION");
  return channel;
}

function validDate(value: Date | null | undefined) {
  return value == null || (value instanceof Date && Number.isFinite(value.getTime()));
}

function sameDate(left: Date | null, right: Date | null) {
  return left === right || (left !== null && right !== null && left.getTime() === right.getTime());
}

function credentialContext(tenant: VerifiedCoreTenant): CredentialEncryptionContext {
  return { dataClass: "CREDENTIAL", accountId: tenant.accountId,
    channelConnectionId: tenant.channelConnectionId, recordIdentity: "EbaySellerAuthorization" };
}

export async function persistEbaySellerAuthorization(db: PrismaClient, tenant: VerifiedCoreTenant, input: {
  refreshToken: string; grantedScopes: readonly string[]; grantedAt: Date;
  validatedAt?: Date | null; refreshTokenExpiresAt?: Date | null;
}, encryptionProvider?: CredentialEncryptionProvider): Promise<EbayAuthorizationMetadata> {
  if (!input.refreshToken || input.refreshToken !== input.refreshToken.trim() || input.refreshToken.length > 16_384 ||
      !validDate(input.grantedAt) || !validDate(input.validatedAt) || !validDate(input.refreshTokenExpiresAt))
    throw new EbayConnectorError("AUTHORIZATION");
  const grantedScopes = canonicalizeEbayScopes(input.grantedScopes);
  const grantedScopesJson = JSON.stringify(grantedScopes);
  await requireEbayOwner(db, tenant);
  const encrypted = await requireCredentialEncryptionProvider(encryptionProvider)
    .encrypt(Buffer.from(input.refreshToken, "utf8"), credentialContext(tenant));
  if (!encrypted.ciphertext.byteLength || !encrypted.provider.trim() || !encrypted.keyVersion.trim() ||
      !encrypted.credentialFingerprint.trim() || encrypted.provider.length > 255 ||
      encrypted.keyVersion.length > 255 || encrypted.credentialFingerprint.length > 512)
    throw new EbayConnectorError("AUTHORIZATION");
  return db.$transaction(async (tx) => {
    await requireEbayOwner(tx, tenant);
    const existing = await tx.ebaySellerAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } });
    if (existing?.credentialFingerprint === encrypted.credentialFingerprint &&
        existing.grantedScopesJson === grantedScopesJson && existing.status === "ACTIVE" &&
        sameDate(existing.grantedAt, input.grantedAt) &&
        sameDate(existing.validatedAt, input.validatedAt ?? null) &&
        sameDate(existing.refreshTokenExpiresAt, input.refreshTokenExpiresAt ?? null))
      return metadata(existing, true);
    const authorizationVersion = randomUUID();
    const data = { accountId: tenant.accountId, encryptedRefreshToken: Buffer.from(encrypted.ciphertext),
      encryptionProvider: encrypted.provider, encryptionKeyVersion: encrypted.keyVersion,
      credentialFingerprint: encrypted.credentialFingerprint, grantedScopesJson, status: "ACTIVE",
      authorizationVersion, grantedAt: input.grantedAt, validatedAt: input.validatedAt ?? null,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null, reauthRequiredAt: null, revokedAt: null };
    const row = existing
      ? await tx.ebaySellerAuthorization.update({ where: { channelConnectionId: tenant.channelConnectionId }, data })
      : await tx.ebaySellerAuthorization.create({ data: { channelConnectionId: tenant.channelConnectionId, ...data } });
    await tx.coreChannelAuthorization.upsert({ where: { channelConnectionId: tenant.channelConnectionId },
      create: { ...tenant, authorizationVersion }, update: { authorizationVersion } });
    return metadata(row, false);
  });
}

export async function getEbayAuthorizationMetadata(db: Db, tenant: VerifiedCoreTenant) {
  await requireEbayOwner(db, tenant);
  const row = await db.ebaySellerAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } });
  if (!row || row.accountId !== tenant.accountId) throw new EbayConnectorError("AUTHORIZATION");
  return metadata(row, true);
}

export async function resolveEbayRefreshTokenForUse(db: Db, tenant: VerifiedCoreTenant,
encryptionProvider?: CredentialEncryptionProvider) {
  await requireEbayOwner(db, tenant);
  const row = await db.ebaySellerAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } });
  const epoch = await db.coreChannelAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } });
  if (!row || row.accountId !== tenant.accountId || row.status !== "ACTIVE" ||
      (row.refreshTokenExpiresAt !== null && row.refreshTokenExpiresAt <= new Date()) ||
      !epoch || epoch.accountId !== tenant.accountId || epoch.authorizationVersion !== row.authorizationVersion)
    throw new EbayConnectorError("AUTHORIZATION");
  parseScopes(row.grantedScopesJson);
  const plain = await requireCredentialEncryptionProvider(encryptionProvider).decrypt({
    ciphertext: row.encryptedRefreshToken, provider: row.encryptionProvider, keyVersion: row.encryptionKeyVersion },
  credentialContext(tenant));
  const token = Buffer.from(plain).toString("utf8");
  if (!token || token.length > 16_384) throw new EbayConnectorError("AUTHORIZATION");
  return token;
}

async function transitionEbayAuthorization(db: PrismaClient, tenant: VerifiedCoreTenant,
status: "REAUTH_REQUIRED" | "REVOKED", at: Date) {
  if (!validDate(at)) throw new EbayConnectorError("AUTHORIZATION");
  return db.$transaction(async (tx) => {
    await requireEbayOwner(tx, tenant);
    const existing = await tx.ebaySellerAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } });
    if (!existing || existing.accountId !== tenant.accountId) throw new EbayConnectorError("AUTHORIZATION");
    if (existing.status === status) return metadata(existing, true);
    const authorizationVersion = randomUUID();
    const row = await tx.ebaySellerAuthorization.update({ where: { channelConnectionId: tenant.channelConnectionId },
      data: { status, authorizationVersion, reauthRequiredAt: status === "REAUTH_REQUIRED" ? at : existing.reauthRequiredAt,
        revokedAt: status === "REVOKED" ? at : null } });
    await tx.coreChannelAuthorization.update({ where: { channelConnectionId: tenant.channelConnectionId },
      data: { authorizationVersion } });
    return metadata(row, false);
  });
}

export const markEbayAuthorizationReauthRequired = (db: PrismaClient, tenant: VerifiedCoreTenant,
at = new Date()) => transitionEbayAuthorization(db, tenant, "REAUTH_REQUIRED", at);
export const revokeEbaySellerAuthorization = (db: PrismaClient, tenant: VerifiedCoreTenant,
at = new Date()) => transitionEbayAuthorization(db, tenant, "REVOKED", at);
