import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import prisma from "~/db.server";
import { buildShopifyAppStoreUrl, capturePartnerReferralCode } from "~/services/partner-referral-flow.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const destination = buildShopifyAppStoreUrl(process.env.SHOPIFY_APP_HANDLE ?? "");
  const capture = await capturePartnerReferralCode(
    prisma,
    params.code ?? "",
    request.headers.get("Cookie"),
    process.env.SHOPIFY_API_SECRET ?? "",
  );
  return redirect(destination, { headers: capture.setCookie ? { "Set-Cookie": capture.setCookie } : undefined });
};
