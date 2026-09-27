import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { PartnerDashboard } from "~/components/partner-dashboard/PartnerDashboard";
import prisma from "~/db.server";
import { authenticatePartner } from "~/services/partner-auth.server";
import { getPartnerDashboard } from "~/services/partner-dashboard.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const identity = await authenticatePartner(prisma, request);
  if (!identity) throw redirect("/");
  return getPartnerDashboard(prisma, identity);
}

export default function PartnerDashboardRoute() {
  return <PartnerDashboard dashboard={useLoaderData<typeof loader>()} />;
}
