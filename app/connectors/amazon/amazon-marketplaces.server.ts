import type { PrismaClient } from "@prisma/client";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { resolveAmazonRefreshTokenForUse } from "./amazon-authorization.server";
import { exchangeLwaAccessToken, getMarketplaceParticipations } from "./amazon-sp-api-client.server";
import { AmazonConnectorError, type AmazonApplicationConfig, type AmazonHttpTransport, type AmazonRegion } from "./amazon-types";

export async function discoverAmazonMarketplaces(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  region: AmazonRegion;
  config: AmazonApplicationConfig;
  transport: AmazonHttpTransport;
  encryptionProvider: CredentialEncryptionProvider;
  retry?: Readonly<{ now?: () => number; sleep?: (ms: number) => Promise<void>; random?: () => number }>;
}) {
  let refreshToken: string;
  try { refreshToken = await resolveAmazonRefreshTokenForUse(input.db, input.tenant, input.encryptionProvider); }
  catch { throw new AmazonConnectorError("AUTHORIZATION"); }
  const token = await exchangeLwaAccessToken(refreshToken, input.config, input.transport, input.retry);
  const discovered = await getMarketplaceParticipations(input.region, token.accessToken, input.config, input.transport, input.retry);
  const rows = await input.db.$transaction(async (tx) => {
    const owner = await tx.channelConnection.findUnique({ where: { id: input.tenant.channelConnectionId }, include: { account: true } });
    const authorization = await tx.amazonSellerAuthorization.findUnique({ where: { channelConnectionId: input.tenant.channelConnectionId } });
    const epoch = await tx.coreChannelAuthorization.findUnique({ where: { channelConnectionId: input.tenant.channelConnectionId } });
    if (!owner || owner.accountId !== input.tenant.accountId || owner.channel !== "AMAZON" || owner.status !== "ACTIVE" ||
        owner.account.status !== "ACTIVE" || authorization?.accountId !== input.tenant.accountId || authorization.status !== "ACTIVE" ||
        epoch?.authorizationVersion !== authorization.authorizationVersion)
      throw new AmazonConnectorError("AUTHORIZATION");
    return Promise.all(discovered.map((marketplace) => tx.marketplace.upsert({
      where: { channelConnectionId_externalMarketplaceId: { channelConnectionId: input.tenant.channelConnectionId,
        externalMarketplaceId: marketplace.marketplaceId } },
      create: { accountId: input.tenant.accountId, channelConnectionId: input.tenant.channelConnectionId,
        externalMarketplaceId: marketplace.marketplaceId, countryCode: marketplace.countryCode,
        currencyCode: marketplace.defaultCurrencyCode,
        status: marketplace.isParticipating && !marketplace.hasSuspendedListings ? "ACTIVE" : "INACTIVE" },
      update: { countryCode: marketplace.countryCode, currencyCode: marketplace.defaultCurrencyCode,
        status: marketplace.isParticipating && !marketplace.hasSuspendedListings ? "ACTIVE" : "INACTIVE" },
    })));
  });
  return rows.map((row) => ({ id: row.id, externalMarketplaceId: row.externalMarketplaceId,
    countryCode: row.countryCode, currencyCode: row.currencyCode, status: row.status }));
}
