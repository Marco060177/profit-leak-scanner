import { randomUUID, timingSafeEqual } from "node:crypto";
import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { runEbayDeletionNotificationWorker } from
  "~/connectors/ebay/ebay-deletion-notification-processor.server";
import { resolveEbayDeletionSellerIdentity } from
  "~/connectors/ebay/ebay-seller-identity.server";

function authorized(request: Request) {
  const expected = process.env.EBAY_MARKETPLACE_ACCOUNT_DELETION_WORKER_SECRET?.trim() ?? "";
  const header = request.headers.get("authorization") ?? "";
  if (!expected || !header.startsWith("Bearer ")) return false;
  const received = header.slice(7);
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export const loader = () => new Response(null, { status: 405, headers: { Allow: "POST" } });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!authorized(request)) return new Response(null, { status: 401 });
  const result = await runEbayDeletionNotificationWorker({ db: prisma,
    leaseOwner: `render-${randomUUID()}`, limit: 100,
    process: async (receipt) => {
      const resolution = await resolveEbayDeletionSellerIdentity(prisma, receipt);
      return resolution.kind === "READY_FOR_REVIEW"
        ? { kind: "READY_FOR_REVIEW" as const, diagnosticCode: "SELLER_IDENTITY_MATCHED" }
        : { kind: "REVIEW_REQUIRED" as const, diagnosticCode: resolution.diagnosticCode };
    } });
  return Response.json({ ok: true, ...result });
};
