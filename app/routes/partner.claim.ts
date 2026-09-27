import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import prisma from "~/db.server";
import { consumePartnerClaimBridge, PARTNER_CLAIM_COMPLETED_PARAM } from "~/services/partner-referral-flow.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const fallback = new URL("/app", process.env.SHOPIFY_APP_URL || url.origin);
  fallback.searchParams.set(PARTNER_CLAIM_COMPLETED_PARAM, "done");
  const result = await consumePartnerClaimBridge(
    prisma,
    url.searchParams.get("token") ?? "",
    request.headers.get("Cookie"),
    process.env.SHOPIFY_API_SECRET ?? "",
  );
  return redirect(result.returnUrl ?? fallback.toString(), {
    headers: result.setCookie ? { "Set-Cookie": result.setCookie } : undefined,
  });
};
