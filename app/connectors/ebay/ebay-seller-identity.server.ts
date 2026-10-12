import type { EbayDeletionNotificationInbox, PrismaClient } from "@prisma/client";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import { getAuthenticatedEbaySellerIdentity } from "./ebay-api-client.server";
import { ebayDeletionIdentityLookupToken,
  type EbayDeletionHmacConfig } from "./ebay-deletion-notification-inbox.server";
import { EBAY_IDENTITY_SCOPE, EbayConnectorError, type EbayApplicationConfig,
  type EbayHttpTransport } from "./ebay-types";

export const EBAY_SELLER_IDENTITY_SOURCE = "EBAY_COMMERCE_IDENTITY_GET_USER_V1";

export type EbaySellerIdentityResolution =
  | Readonly<{ kind: "READY_FOR_REVIEW"; accountId: string; channelConnectionId: string }>
  | Readonly<{ kind: "REVIEW_REQUIRED"; diagnosticCode:
      "IDENTITY_UNKNOWN" | "IDENTITY_AMBIGUOUS" | "IDENTITY_BINDING_INVALID" }>;

type IdentityCandidate = Readonly<{ accountId: string; channelConnectionId: string;
  verifiedSource: string; accountStatus: string; channelStatus: string; channel: string;
  authorizationStatus: string; channelAccountId: string; authorizationAccountId: string }>;

export function classifyEbaySellerIdentityCandidates(candidates: readonly IdentityCandidate[]):
EbaySellerIdentityResolution {
  if (!candidates.length) return { kind: "REVIEW_REQUIRED", diagnosticCode: "IDENTITY_UNKNOWN" };
  if (candidates.length !== 1)
    return { kind: "REVIEW_REQUIRED", diagnosticCode: "IDENTITY_AMBIGUOUS" };
  const candidate = candidates[0];
  if (candidate.verifiedSource !== EBAY_SELLER_IDENTITY_SOURCE ||
      candidate.accountStatus !== "ACTIVE" || candidate.channelStatus !== "ACTIVE" ||
      candidate.channel !== "EBAY" || candidate.authorizationStatus !== "ACTIVE" ||
      candidate.accountId !== candidate.channelAccountId ||
      candidate.accountId !== candidate.authorizationAccountId)
    return { kind: "REVIEW_REQUIRED", diagnosticCode: "IDENTITY_BINDING_INVALID" };
  return { kind: "READY_FOR_REVIEW", accountId: candidate.accountId,
    channelConnectionId: candidate.channelConnectionId };
}

function assertDate(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new EbayConnectorError("AUTHORIZATION");
}

async function requireIdentityAuthorizedTenant(db: PrismaClient, tenant: VerifiedCoreTenant) {
  const authorization = await db.ebaySellerAuthorization.findUnique({
    where: { channelConnectionId: tenant.channelConnectionId },
    include: { channelConnection: { include: { account: true } } },
  });
  if (!authorization || authorization.accountId !== tenant.accountId || authorization.status !== "ACTIVE" ||
      authorization.channelConnection.accountId !== tenant.accountId ||
      authorization.channelConnection.channel !== "EBAY" ||
      authorization.channelConnection.status !== "ACTIVE" ||
      authorization.channelConnection.account.status !== "ACTIVE")
    throw new EbayConnectorError("AUTHORIZATION");
  let scopes: unknown;
  try { scopes = JSON.parse(authorization.grantedScopesJson); } catch { scopes = null; }
  if (!Array.isArray(scopes) || !scopes.includes(EBAY_IDENTITY_SCOPE))
    throw new EbayConnectorError("REAUTH_REQUIRED");
}

export async function acquireAndPersistEbaySellerIdentity(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  accessToken: string;
  config: EbayApplicationConfig;
  transport: EbayHttpTransport;
  hmacConfig: EbayDeletionHmacConfig;
  verifiedAt: Date;
}) {
  assertDate(input.verifiedAt);
  await requireIdentityAuthorizedTenant(input.db, input.tenant);
  const identity = await getAuthenticatedEbaySellerIdentity({ config: input.config,
    accessToken: input.accessToken, transport: input.transport });
  const bindings = [...input.hmacConfig.keys.entries()].map(([hmacKeyVersion, key]) => ({
    accountId: input.tenant.accountId,
    channelConnectionId: input.tenant.channelConnectionId,
    hmacKeyVersion,
    userLookupToken: ebayDeletionIdentityLookupToken(key, identity.userId),
    verifiedSource: EBAY_SELLER_IDENTITY_SOURCE,
    verifiedAt: input.verifiedAt,
  }));
  if (!bindings.length) throw new EbayConnectorError("CONFIGURATION");
  await input.db.$transaction(async (tx) => {
    const channel = await tx.channelConnection.findUnique({ where: { id: input.tenant.channelConnectionId },
      include: { account: true, ebaySellerAuthorization: true } });
    if (!channel || channel.accountId !== input.tenant.accountId || channel.channel !== "EBAY" ||
        channel.status !== "ACTIVE" || channel.account.status !== "ACTIVE" ||
        channel.ebaySellerAuthorization?.status !== "ACTIVE")
      throw new EbayConnectorError("AUTHORIZATION");
    for (const binding of bindings) {
      const existing = await tx.ebaySellerIdentityBinding.findUnique({ where: {
        channelConnectionId_hmacKeyVersion: { channelConnectionId: binding.channelConnectionId,
          hmacKeyVersion: binding.hmacKeyVersion },
      } });
      if (existing && existing.userLookupToken !== binding.userLookupToken)
        throw new EbayConnectorError("AUTHORIZATION");
      await tx.ebaySellerIdentityBinding.upsert({ where: {
        channelConnectionId_hmacKeyVersion: { channelConnectionId: binding.channelConnectionId,
          hmacKeyVersion: binding.hmacKeyVersion },
      }, create: binding, update: { verifiedAt: binding.verifiedAt,
        verifiedSource: binding.verifiedSource } });
    }
  });
  return { username: identity.username, keyVersions: bindings.map((binding) => binding.hmacKeyVersion) };
}

export async function resolveEbayDeletionSellerIdentity(db: PrismaClient,
receipt: Pick<EbayDeletionNotificationInbox, "hmacKeyVersion" | "userLookupToken">):
Promise<EbaySellerIdentityResolution> {
  const candidates = await db.ebaySellerIdentityBinding.findMany({ where: {
    hmacKeyVersion: receipt.hmacKeyVersion, userLookupToken: receipt.userLookupToken,
  }, include: { account: true, channelConnection: true, authorization: true }, take: 2 });
  return classifyEbaySellerIdentityCandidates(candidates.map((candidate) => ({
    accountId: candidate.accountId, channelConnectionId: candidate.channelConnectionId,
    verifiedSource: candidate.verifiedSource, accountStatus: candidate.account.status,
    channelStatus: candidate.channelConnection.status, channel: candidate.channelConnection.channel,
    authorizationStatus: candidate.authorization.status,
    channelAccountId: candidate.channelConnection.accountId,
    authorizationAccountId: candidate.authorization.accountId,
  })));
}
