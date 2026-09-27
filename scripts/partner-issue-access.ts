import prisma from "../app/db.server";
import { issuePartnerAccessToken } from "../app/services/partner-auth.server";

try {
  const partnerId = process.argv[2]?.trim();
  if (!partnerId) throw new Error("Usage: npm run partner:issue-access -- <PARTNER_ID>");
  const baseUrlValue = process.env.PARTNER_APP_URL?.trim() || process.env.SHOPIFY_APP_URL?.trim();
  if (!baseUrlValue) throw new Error("PARTNER_APP_URL or SHOPIFY_APP_URL is required");
  const baseUrl = new URL(baseUrlValue);
  if (!/^https?:$/.test(baseUrl.protocol) || baseUrl.username || baseUrl.password) throw new Error("Partner application URL is invalid");
  const issued = await issuePartnerAccessToken(prisma, partnerId);
  console.log(`One-time Partner access URL (expires ${issued.expiresAt.toISOString()}):`);
  console.log(new URL(`/partner/access/${encodeURIComponent(issued.rawToken)}`, baseUrl).toString());
} finally {
  await prisma.$disconnect();
}
