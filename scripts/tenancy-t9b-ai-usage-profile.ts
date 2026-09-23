import { pathToFileURL } from "node:url";
import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeVerifiedShopDomain } from "../app/connectors/shopify/shop-domain";

export type Classification =
  | "READY"
  | "ACCOUNT_PERIOD_COLLISION"
  | "DUPLICATE_NORMALIZED_SHOP_PERIOD"
  | "INVALID_SHOP"
  | "INVALID_PERIOD"
  | "INVALID_REQUEST_COUNT"
  | "MISSING_MAPPING"
  | "INCONSISTENT_MAPPING"
  | "WRONG_CHANNEL"
  | "EXTERNAL_ID_MISMATCH"
  | "UNSAFE_CONNECTION_STATUS";

const categories: Classification[] = [
  "READY", "ACCOUNT_PERIOD_COLLISION", "DUPLICATE_NORMALIZED_SHOP_PERIOD",
  "INVALID_SHOP", "INVALID_PERIOD", "INVALID_REQUEST_COUNT", "MISSING_MAPPING",
  "INCONSISTENT_MAPPING", "WRONG_CHANNEL", "EXTERNAL_ID_MISMATCH",
  "UNSAFE_CONNECTION_STATUS",
];

export type ProfileRow = {
  id: string;
  shop: string;
  normalizedShop: string | null;
  month: string;
  requests: number;
  accountId: string | null;
  category: Classification;
};

type GroupSummary = {
  rowCount: number;
  distinctShopCount: number;
  diagnosticRequestSum: number;
  minRequests: number;
  maxRequests: number;
};

export type Profile = {
  rows: ProfileRow[];
  summary: {
    totalLegacyRows: number;
    counts: Record<Classification, number>;
    safeSingleShopGroups: number;
    collisionGroups: number;
    collisionRows: number;
    duplicateNormalizedShopGroups: number;
    collisionSummaries: GroupSummary[];
  };
};

function validMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Read-only profiling. Internal rows contain identifiers for tests/review; log only summary. */
export async function profileLegacyAiUsage(db: PrismaClient | Prisma.TransactionClient): Promise<Profile> {
  const usage = await db.aiUsage.findMany({
    select: { id: true, shop: true, month: true, requests: true },
    orderBy: { id: "asc" },
  });
  const rows: ProfileRow[] = [];

  for (const item of usage) {
    const row: ProfileRow = {
      ...item, normalizedShop: null, accountId: null, category: "READY",
    };
    try {
      row.normalizedShop = normalizeVerifiedShopDomain(item.shop);
    } catch {
      row.category = "INVALID_SHOP";
      rows.push(row);
      continue;
    }
    if (!validMonth(item.month)) {
      row.category = "INVALID_PERIOD";
      rows.push(row);
      continue;
    }
    if (!Number.isSafeInteger(item.requests) || item.requests < 0) {
      row.category = "INVALID_REQUEST_COUNT";
      rows.push(row);
      continue;
    }
    const mapping = await db.legacyShopMapping.findUnique({
      where: { shopDomain: row.normalizedShop },
    });
    if (!mapping) {
      row.category = "MISSING_MAPPING";
      rows.push(row);
      continue;
    }
    const [connection, account] = await Promise.all([
      db.channelConnection.findUnique({ where: { id: mapping.channelConnectionId } }),
      db.account.findUnique({ where: { id: mapping.accountId }, select: { id: true } }),
    ]);
    if (!connection || !account || connection.accountId !== mapping.accountId) {
      row.category = "INCONSISTENT_MAPPING";
    } else if (connection.channel !== "SHOPIFY") {
      row.category = "WRONG_CHANNEL";
    } else if (connection.externalAccountId !== row.normalizedShop) {
      row.category = "EXTERNAL_ID_MISMATCH";
    } else if (connection.status !== "ACTIVE") {
      row.category = "UNSAFE_CONNECTION_STATUS";
    } else {
      row.accountId = mapping.accountId;
    }
    rows.push(row);
  }

  const groups = new Map<string, ProfileRow[]>();
  for (const row of rows) {
    if (row.category !== "READY" || !row.accountId) continue;
    const key = JSON.stringify([row.accountId, row.month]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  let safeSingleShopGroups = 0;
  let collisionGroups = 0;
  let collisionRows = 0;
  let duplicateNormalizedShopGroups = 0;
  const collisionSummaries: GroupSummary[] = [];
  for (const group of groups.values()) {
    const shops = new Set(group.map((row) => row.normalizedShop));
    if (shops.size > 1) {
      collisionGroups += 1;
      collisionRows += group.length;
      for (const row of group) row.category = "ACCOUNT_PERIOD_COLLISION";
      const counts = group.map((row) => row.requests);
      collisionSummaries.push({
        rowCount: group.length,
        distinctShopCount: shops.size,
        diagnosticRequestSum: counts.reduce((sum, count) => sum + count, 0),
        minRequests: Math.min(...counts),
        maxRequests: Math.max(...counts),
      });
    } else if (group.length > 1) {
      duplicateNormalizedShopGroups += 1;
      for (const row of group) row.category = "DUPLICATE_NORMALIZED_SHOP_PERIOD";
    } else {
      safeSingleShopGroups += 1;
    }
  }
  collisionSummaries.sort((a, b) =>
    a.rowCount - b.rowCount || a.distinctShopCount - b.distinctShopCount ||
    a.diagnosticRequestSum - b.diagnosticRequestSum || a.minRequests - b.minRequests ||
    a.maxRequests - b.maxRequests,
  );

  const counts = Object.fromEntries(categories.map((category) => [category, 0])) as Record<Classification, number>;
  for (const row of rows) counts[row.category] += 1;
  return {
    rows,
    summary: {
      totalLegacyRows: rows.length, counts, safeSingleShopGroups,
      collisionGroups, collisionRows, duplicateNormalizedShopGroups, collisionSummaries,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    console.error("Usage: npm run tenancy:t9b:ai-usage-profile (no flags; read-only)");
    process.exitCode = 2;
  } else {
    const { default: prisma } = await import("../app/db.server");
    try {
      const profile = await profileLegacyAiUsage(prisma);
      console.log(JSON.stringify({ mode: "read-only", ...profile.summary }, null, 2));
    } catch {
      console.error("AI usage profiling failed");
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  }
}
