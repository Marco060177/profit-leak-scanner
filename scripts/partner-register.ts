import prisma from "../app/db.server";
import { registerPartner } from "../app/services/partner-program.server";

try {
  const displayName = process.argv[2]?.trim();
  const referralCode = process.argv[3]?.trim();
  if (!displayName || !referralCode) throw new Error("Usage: npm run partner:register -- <DISPLAY_NAME> <REFERRAL_CODE>");
  const partner = await registerPartner(prisma, { displayName, referralCode });
  console.log(JSON.stringify({ id: partner.id, displayName: partner.displayName, referralCode: partner.referralCode, status: partner.status }, null, 2));
} finally { await prisma.$disconnect(); }
