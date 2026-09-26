import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import {
  requireCredentialEncryptionProvider,
  type CredentialEncryptionProvider,
} from "~/services/credential-encryption.server";

type Db = PrismaClient | Prisma.TransactionClient;
type AuthorizationStatus = "ACTIVE" | "REAUTH_REQUIRED" | "REVOKED";

export type AmazonAuthorizationMetadata = Readonly<{
  accountId: string;
  channelConnectionId: string;
  status: AuthorizationStatus;
  authorizationVersion: string;
  grantedAt: Date;
  validatedAt: Date | null;
  renewalDueAt: Date | null;
  revokedAt: Date | null;
  replayed: boolean;
}>;

function metadata(row: {
  accountId: string; channelConnectionId: string; status: string; authorizationVersion: string;
  grantedAt: Date; validatedAt: Date | null; renewalDueAt: Date | null; revokedAt: Date | null;
}, replayed: boolean): AmazonAuthorizationMetadata {
  if (!(["ACTIVE", "REAUTH_REQUIRED", "REVOKED"] as const).includes(row.status as AuthorizationStatus))
    throw new Error("Amazon authorization state invalid");
  return { accountId: row.accountId, channelConnectionId: row.channelConnectionId,
    status: row.status as AuthorizationStatus, authorizationVersion: row.authorizationVersion,
    grantedAt: row.grantedAt, validatedAt: row.validatedAt, renewalDueAt: row.renewalDueAt,
    revokedAt: row.revokedAt, replayed };
}

async function requireAmazonOwner(db: Db, tenant: VerifiedCoreTenant) {
  const channel = await db.channelConnection.findUnique({ where: { id: tenant.channelConnectionId }, include: { account: true } });
  if (!channel || channel.accountId !== tenant.accountId || channel.channel !== "AMAZON" ||
      channel.status !== "ACTIVE" || channel.account.status !== "ACTIVE")
    throw new Error("Amazon authorization owner invalid");
  return channel;
}

export async function persistAmazonSellerAuthorization(
  db: PrismaClient,
  tenant: VerifiedCoreTenant,
  input: { refreshToken: string; grantedAt: Date; validatedAt?: Date; renewalDueAt?: Date },
  encryptionProvider?: CredentialEncryptionProvider,
): Promise<AmazonAuthorizationMetadata> {
  if (!input.refreshToken || input.refreshToken !== input.refreshToken.trim())
    throw new Error("Amazon credential invalid");
  for (const value of [input.grantedAt, input.validatedAt, input.renewalDueAt])
    if (value && (!Number.isFinite(value.getTime()))) throw new Error("Amazon authorization timestamp invalid");
  const provider = requireCredentialEncryptionProvider(encryptionProvider);
  const encrypted = await provider.encrypt(Buffer.from(input.refreshToken, "utf8"));
  if (!encrypted.ciphertext.byteLength || !encrypted.provider.trim() || !encrypted.keyVersion.trim() ||
      !encrypted.credentialFingerprint.trim()) throw new Error("Encrypted Amazon credential invalid");
  return db.$transaction(async (tx) => {
    await requireAmazonOwner(tx, tenant);
    const existing = await tx.amazonSellerAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } });
    if (existing?.credentialFingerprint === encrypted.credentialFingerprint && existing.status === "ACTIVE")
      return metadata(existing, true);
    const authorizationVersion = randomUUID();
    const data = {
      accountId: tenant.accountId, encryptedRefreshToken: Buffer.from(encrypted.ciphertext),
      encryptionProvider: encrypted.provider, encryptionKeyVersion: encrypted.keyVersion,
      credentialFingerprint: encrypted.credentialFingerprint, status: "ACTIVE",
      authorizationVersion, grantedAt: input.grantedAt, validatedAt: input.validatedAt ?? null,
      renewalDueAt: input.renewalDueAt ?? null, revokedAt: null,
    };
    const row = existing
      ? await tx.amazonSellerAuthorization.update({ where: { channelConnectionId: tenant.channelConnectionId }, data })
      : await tx.amazonSellerAuthorization.create({ data: { channelConnectionId: tenant.channelConnectionId, ...data } });
    await tx.coreChannelAuthorization.upsert({ where: { channelConnectionId: tenant.channelConnectionId },
      create: { accountId: tenant.accountId, channelConnectionId: tenant.channelConnectionId, authorizationVersion },
      update: { authorizationVersion } });
    return metadata(row, false);
  });
}

export async function getAmazonAuthorizationMetadata(
  db: Db, tenant: VerifiedCoreTenant,
): Promise<AmazonAuthorizationMetadata> {
  await requireAmazonOwner(db, tenant);
  const row = await db.amazonSellerAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } });
  if (!row || row.accountId !== tenant.accountId) throw new Error("Amazon authorization unavailable");
  return metadata(row, true);
}

export async function resolveAmazonRefreshTokenForUse(
  db: Db, tenant: VerifiedCoreTenant, encryptionProvider?: CredentialEncryptionProvider,
): Promise<string> {
  await requireAmazonOwner(db, tenant);
  const row = await db.amazonSellerAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } });
  if (!row || row.accountId !== tenant.accountId || row.status !== "ACTIVE")
    throw new Error("Amazon authorization unavailable");
  const epoch = await db.coreChannelAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } });
  if (!epoch || epoch.accountId !== tenant.accountId || epoch.authorizationVersion !== row.authorizationVersion)
    throw new Error("Amazon authorization unavailable");
  const plain = await requireCredentialEncryptionProvider(encryptionProvider).decrypt({
    ciphertext: row.encryptedRefreshToken, provider: row.encryptionProvider, keyVersion: row.encryptionKeyVersion,
  });
  const token = Buffer.from(plain).toString("utf8");
  if (!token) throw new Error("Amazon authorization unavailable");
  return token;
}

async function transitionAmazonAuthorization(
  db: PrismaClient, tenant: VerifiedCoreTenant, status: "REAUTH_REQUIRED" | "REVOKED", at: Date,
) {
  if (!Number.isFinite(at.getTime())) throw new Error("Amazon authorization timestamp invalid");
  return db.$transaction(async (tx) => {
    await requireAmazonOwner(tx, tenant);
    const existing = await tx.amazonSellerAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } });
    if (!existing || existing.accountId !== tenant.accountId) throw new Error("Amazon authorization unavailable");
    if (existing.status === status) return metadata(existing, true);
    const authorizationVersion = randomUUID();
    const row = await tx.amazonSellerAuthorization.update({ where: { channelConnectionId: tenant.channelConnectionId },
      data: { status, authorizationVersion, revokedAt: status === "REVOKED" ? at : null } });
    await tx.coreChannelAuthorization.update({ where: { channelConnectionId: tenant.channelConnectionId },
      data: { authorizationVersion } });
    return metadata(row, false);
  });
}

export const markAmazonAuthorizationReauthRequired =
  (db: PrismaClient, tenant: VerifiedCoreTenant, at = new Date()) => transitionAmazonAuthorization(db, tenant, "REAUTH_REQUIRED", at);
export const revokeAmazonSellerAuthorization =
  (db: PrismaClient, tenant: VerifiedCoreTenant, at = new Date()) => transitionAmazonAuthorization(db, tenant, "REVOKED", at);
