import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import prisma from "~/db.server";
import { consumePartnerAccessToken } from "~/services/partner-auth.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const result = await consumePartnerAccessToken(prisma, params.token ?? "");
  if (!result) return new Response("This access link is invalid or unavailable.", { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  throw redirect("/partner", { headers: { "Set-Cookie": result.setCookie, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
