import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { nativeEbayOAuthTransport } from "~/connectors/ebay/ebay-api-client.server";
import { resolveEbayApplicationConfig } from "~/connectors/ebay/ebay-config.server";
import { handleEbayDeletionNotificationPost,
  resolveEbayDeletionHmacConfig } from "~/connectors/ebay/ebay-deletion-notification-inbox.server";
import {
  EbayMarketplaceAccountDeletionChallengeError,
  ebayMarketplaceAccountDeletionChallengeResponse,
  resolveEbayMarketplaceAccountDeletionChallengeConfig,
} from "~/connectors/ebay/ebay-marketplace-account-deletion-challenge.server";
import { createEbayNotificationPublicKeyProvider,
  createEbayNotificationSignatureVerifier } from "~/connectors/ebay/ebay-notification-signature.server";

const jsonError = (status: number) => Response.json({ error: "Request rejected" }, { status });

export const loader = ({ request }: LoaderFunctionArgs) => {
  const challengeCodes = new URL(request.url).searchParams.getAll("challenge_code");
  if (challengeCodes.length !== 1) return jsonError(400);

  try {
    const config = resolveEbayMarketplaceAccountDeletionChallengeConfig();
    const challengeResponse = ebayMarketplaceAccountDeletionChallengeResponse(challengeCodes[0], config);
    return Response.json({ challengeResponse }, { status: 200 });
  } catch (error) {
    if (error instanceof EbayMarketplaceAccountDeletionChallengeError) {
      return jsonError(error.code === "CONFIGURATION" ? 503 : 400);
    }
    return jsonError(500);
  }
};

let productionVerifier: ReturnType<typeof createEbayNotificationSignatureVerifier> | undefined;

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const config = resolveEbayApplicationConfig();
    productionVerifier ??= createEbayNotificationSignatureVerifier({
      publicKeyProvider: createEbayNotificationPublicKeyProvider(config, nativeEbayOAuthTransport),
    });
    return await handleEbayDeletionNotificationPost({ request, db: prisma, verifier: productionVerifier,
      hmacConfig: resolveEbayDeletionHmacConfig() });
  } catch {
    return new Response(null, { status: 503 });
  }
};
