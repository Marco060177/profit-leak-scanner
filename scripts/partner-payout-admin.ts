import prisma from "../app/db.server";
import { approvePartnerPayout, cancelPartnerPayout, listPartnerPayouts, markPartnerPayoutPaid, reconcilePartnerPayout } from "../app/services/partner-payouts.server";

const command = process.argv[2];
const identifier = process.argv[3]?.trim();
const option = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1]?.trim() : undefined; };

try {
  let result: unknown;
  if (command === "list") result = await listPartnerPayouts(prisma, identifier);
  else if (command === "history") { if (!identifier) throw new Error("partnerId is required"); result = await listPartnerPayouts(prisma, identifier); }
  else if (command === "reconcile") { if (!identifier) throw new Error("partnerId is required"); result = await reconcilePartnerPayout(prisma, identifier); }
  else if (command === "approve") { if (!identifier) throw new Error("payoutId is required"); result = await approvePartnerPayout(prisma, identifier); }
  else if (command === "paid") { if (!identifier) throw new Error("payoutId is required"); result = await markPartnerPayoutPaid(prisma, identifier, option("--reference") ?? ""); }
  else if (command === "cancel") { if (!identifier) throw new Error("payoutId is required"); result = await cancelPartnerPayout(prisma, identifier, option("--note") ?? ""); }
  else throw new Error("Unknown payout command");
  console.log(JSON.stringify(result, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2));
} finally { await prisma.$disconnect(); }
