import type { PrismaClient } from "@prisma/client";
import prisma from "../app/db.server";
import { sameNotificationPreferences } from "../app/services/notification-ownership.server";
import { normalizeVerifiedShopDomain } from "../app/connectors/shopify/shop-domain";

type Classification = "READY" | "ALREADY_OWNED" | "CONFLICT" | "MISSING_MAPPING" | "UNSAFE_MAPPING";

/** Manual, no-bootstrap audit/backfill. No row is written when any unsafe record exists. */
export async function runNotificationOwnershipBackfill(db: PrismaClient, apply = false) {
  const [preferences, deliveries, mappings] = await Promise.all([
    db.notificationPreferences.findMany({ orderBy: { id: "asc" } }),
    db.notificationDelivery.findMany({ orderBy: { id: "asc" } }),
    db.legacyShopMapping.findMany({ include: { channelConnection: true } }),
  ]);
  const byShop = new Map(mappings.map((mapping) => [mapping.shopDomain, mapping]));
  const safe = (shop: string) => {
    try {
      if (normalizeVerifiedShopDomain(shop) !== shop) {
        return { classification: "UNSAFE_MAPPING" as Classification, mapping: null };
      }
    } catch {
      return { classification: "UNSAFE_MAPPING" as Classification, mapping: null };
    }
    const mapping = byShop.get(shop);
    if (!mapping) return { classification: "MISSING_MAPPING" as Classification, mapping: null };
    const connection = mapping.channelConnection;
    if (connection.accountId !== mapping.accountId || connection.channel !== "SHOPIFY" ||
      connection.externalAccountId !== shop || !["ACTIVE", "DISCONNECTED"].includes(connection.status)) {
      return { classification: "UNSAFE_MAPPING" as Classification, mapping: null };
    }
    return { classification: "READY" as Classification, mapping };
  };
  const byAccount = new Map<string, typeof preferences>();
  const counts: Record<Classification, number> = {
    READY: 0, ALREADY_OWNED: 0, CONFLICT: 0, MISSING_MAPPING: 0, UNSAFE_MAPPING: 0,
  };
  for (const row of preferences) {
    if (!row.shop && row.accountId) {
      const rows = byAccount.get(row.accountId) ?? [];
      rows.push(row);
      byAccount.set(row.accountId, rows);
      continue;
    }
    if (!row.shop) { counts.UNSAFE_MAPPING += 1; continue; }
    const result = safe(row.shop);
    if (!result.mapping) { counts[result.classification] += 1; continue; }
    if (row.accountId && row.accountId !== result.mapping.accountId) { counts.UNSAFE_MAPPING += 1; continue; }
    const rows = byAccount.get(result.mapping.accountId) ?? [];
    rows.push(row);
    byAccount.set(result.mapping.accountId, rows);
  }
  const preferenceUpdates: Array<{ id: string; accountId: string }> = [];
  for (const [accountId, rows] of byAccount) {
    if (!rows.every((row) => sameNotificationPreferences(row, rows[0]))) {
      counts.CONFLICT += rows.length;
      continue;
    }
    const already = rows.filter((row) => row.accountId === accountId);
    if (already.length > 1) { counts.CONFLICT += rows.length; continue; }
    const canonical = already[0] ?? rows[0]; // Only after every value has been proven equivalent.
    for (const row of rows) {
      if (row.id === canonical.id && !row.accountId) {
        counts.READY += 1;
        preferenceUpdates.push({ id: row.id, accountId });
      } else counts.ALREADY_OWNED += 1;
    }
  }
  const deliveryUpdates: Array<{ id: string; accountId: string; channelConnectionId: string }> = [];
  for (const row of deliveries) {
    if (!row.shop && row.accountId && !row.channelConnectionId) {
      counts.ALREADY_OWNED += 1; // Account-wide delivery, not a Shopify backfill candidate.
      continue;
    }
    if (!row.shop) { counts.UNSAFE_MAPPING += 1; continue; }
    const result = safe(row.shop);
    if (!result.mapping) { counts[result.classification] += 1; continue; }
    if (row.accountId && row.accountId !== result.mapping.accountId ||
      row.channelConnectionId && row.channelConnectionId !== result.mapping.channelConnectionId) {
      counts.UNSAFE_MAPPING += 1;
      continue;
    }
    if (row.accountId && row.channelConnectionId) counts.ALREADY_OWNED += 1;
    else {
      counts.READY += 1;
      deliveryUpdates.push({ id: row.id, accountId: result.mapping.accountId,
        channelConnectionId: result.mapping.channelConnectionId });
    }
  }
  const blocked = counts.CONFLICT + counts.MISSING_MAPPING + counts.UNSAFE_MAPPING > 0;
  let updated = 0;
  if (apply && !blocked) {
    for (const row of preferenceUpdates) {
      const result = await db.notificationPreferences.updateMany({
        where: { id: row.id, accountId: null }, data: { accountId: row.accountId },
      });
      if (result.count !== 1) throw new Error("Notification preference backfill changed concurrently.");
      updated += 1;
    }
    for (const row of deliveryUpdates) {
      const result = await db.notificationDelivery.updateMany({
        where: { id: row.id, accountId: null, channelConnectionId: null },
        data: { accountId: row.accountId, channelConnectionId: row.channelConnectionId },
      });
      if (result.count !== 1) throw new Error("Notification delivery backfill changed concurrently.");
      updated += 1;
    }
  }
  return { verdict: blocked ? "BLOCKED" as const : "READY" as const, counts, updated,
    preferenceRows: preferences.length, deliveryRows: deliveries.length };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/tenancy-t10-notification-backfill.ts")) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Unsupported T10 backfill argument.");
  runNotificationOwnershipBackfill(prisma, args.includes("--apply"))
    .then((report) => { console.log(JSON.stringify(report)); process.exitCode = report.verdict === "READY" ? 0 : 1; })
    .catch((error) => { console.error(error instanceof Error ? error.message : "T10 backfill failed"); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
