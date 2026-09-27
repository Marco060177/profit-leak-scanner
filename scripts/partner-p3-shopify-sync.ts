import prisma from "../app/db.server";
import { createShopifyPartnerApiClient, executeBillingSyncCli, synchronizeShopifyPartnerBilling } from "../app/services/shopify-billing-sync.server";

const organizationId = process.env.SHOPIFY_PARTNER_ORG_ID?.trim();
const token = process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN?.trim();
const apiKey = process.env.SHOPIFY_API_KEY?.trim();
await executeBillingSyncCli({
  run: async () => {
    if (!organizationId || !token || !apiKey) throw new Error("PARTNER_API_NOT_CONFIGURED");
    const fetchPage = createShopifyPartnerApiClient({ organizationId, accessToken: token });
    return synchronizeShopifyPartnerBilling({ db: prisma, expectedApiKey: apiKey, fetchPage });
  },
  disconnect: () => prisma.$disconnect(),
  report: (result) => console.log(JSON.stringify(result)),
  reportFatal: (code) => console.error(JSON.stringify({ ok: false, code })),
  setExitCode: (code) => { process.exitCode = code; },
});
