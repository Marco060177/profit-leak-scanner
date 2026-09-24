/** Manual migration/reconciliation only. Dry-run by default; never run at app startup. */
import { pathToFileURL } from "node:url";
import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeVerifiedShopDomain } from "../app/connectors/shopify/shop-domain";

type Db = PrismaClient | Prisma.TransactionClient;
export type Classification =
  | "READY" | "ALREADY_MATCHED" | "MISSING_MAPPING"
  | "INCONSISTENT_MAPPING" | "WRONG_CHANNEL"
  | "EXTERNAL_ID_MISMATCH" | "UNSAFE_CONNECTION_STATUS"
  | "SHADOW_CONFLICT" | "INVALID_SHOP";
export type Summary = {
  total: number;
  wouldUpdate: number;
  updated: number;
  counts: Record<Classification, number>;
};

const categories: Classification[] = [
  "READY", "ALREADY_MATCHED", "MISSING_MAPPING", "INCONSISTENT_MAPPING",
  "WRONG_CHANNEL", "EXTERNAL_ID_MISMATCH", "UNSAFE_CONNECTION_STATUS",
  "SHADOW_CONFLICT", "INVALID_SHOP",
];

async function classify(db: Db) {
  const actions = await db.profitImpactAction.findMany({
    select: { id: true, shop: true, channelConnectionId: true },
    orderBy: { id: "asc" },
  });
  const rows: { id: string; shop: string; expectedId: string | null; category: Classification }[] = [];
  for (const action of actions) {
    let shop: string;
    try {
      shop = normalizeVerifiedShopDomain(action.shop);
    } catch {
      rows.push({ id: action.id, shop: action.shop, expectedId: null, category: "INVALID_SHOP" });
      continue;
    }
    const mapping = await db.legacyShopMapping.findUnique({ where: { shopDomain: shop } });
    if (!mapping) {
      rows.push({ id: action.id, shop: action.shop, expectedId: null, category: "MISSING_MAPPING" });
      continue;
    }
    // A separate lookup lets corrupt legacy relations be reported rather than masked.
    const connection = await db.channelConnection.findUnique({ where: { id: mapping.channelConnectionId } });
    let category: Classification;
    if (!connection || mapping.accountId !== connection.accountId) category = "INCONSISTENT_MAPPING";
    else if (connection.channel !== "SHOPIFY") category = "WRONG_CHANNEL";
    else if (connection.externalAccountId !== shop) category = "EXTERNAL_ID_MISMATCH";
    else if (connection.status !== "ACTIVE") category = "UNSAFE_CONNECTION_STATUS";
    else if (action.channelConnectionId && action.channelConnectionId !== connection.id) category = "SHADOW_CONFLICT";
    else category = action.channelConnectionId === connection.id ? "ALREADY_MATCHED" : "READY";
    rows.push({ id: action.id, shop: action.shop, expectedId: connection?.id ?? null, category });
  }
  return rows;
}

function summarize(rows: Awaited<ReturnType<typeof classify>>, updated: number): Summary {
  const counts = Object.fromEntries(categories.map((name) => [name, 0])) as Record<Classification, number>;
  for (const row of rows) counts[row.category] += 1;
  return { total: rows.length, wouldUpdate: counts.READY, updated, counts };
}

/** Dry-run is read-only. Apply is atomic and refuses all writes if any action is unsafe. */
export async function runProfitImpactShadowBackfill(db: PrismaClient, apply = false): Promise<Summary> {
  if (!apply) return summarize(await classify(db), 0);
  return db.$transaction(async (tx) => {
    const rows = await classify(tx);
    if (rows.some((row) => row.category !== "READY" && row.category !== "ALREADY_MATCHED")) {
      return summarize(rows, 0);
    }
    let updated = 0;
    for (const row of rows) {
      if (row.category !== "READY" || !row.expectedId) continue;
      const result = await tx.profitImpactAction.updateMany({
        where: { id: row.id, shop: row.shop, channelConnectionId: null },
        data: { channelConnectionId: row.expectedId },
      });
      if (result.count !== 1) throw new Error("Concurrent Profit Impact shadow change; transaction rolled back");
      updated += 1;
    }
    return summarize(rows, updated);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => flag !== "--apply") || flags.length > 1) {
    console.error("Usage: npm run tenancy:t8b:profit-impact-backfill -- [--apply]");
    process.exitCode = 2;
  } else {
    const { default: prisma } = await import("../app/db.server");
    try {
      const summary = await runProfitImpactShadowBackfill(prisma, flags.includes("--apply"));
      console.log(JSON.stringify({ mode: flags.includes("--apply") ? "apply" : "dry-run", ...summary }, null, 2));
      if (categories.some((name) => name !== "READY" && name !== "ALREADY_MATCHED" && summary.counts[name] > 0)) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Backfill failed");
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  }
}
