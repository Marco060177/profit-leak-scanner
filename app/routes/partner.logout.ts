import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import prisma from "~/db.server";
import { logoutPartner } from "~/services/partner-auth.server";

export async function loader() {
  throw new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

export async function action({ request }: ActionFunctionArgs) {
  const result = await logoutPartner(prisma, request);
  throw redirect("/", { headers: { "Set-Cookie": result.setCookie } });
}
