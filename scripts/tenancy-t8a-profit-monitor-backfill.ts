/** Manual migration/reconciliation only. Dry-run by default; never run at app startup. */
import { pathToFileURL } from "node:url";
import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeVerifiedShopDomain } from "../app/connectors/shopify/shop-domain";

type Db = PrismaClient | Prisma.TransactionClient;
type Model = "snapshot" | "alert";
export type Classification =
  | "READY" | "ALREADY_MATCHED" | "MISSING_MAPPING"
  | "INCONSISTENT_MAPPING" | "WRONG_CHANNEL"
  | "EXTERNAL_ID_MISMATCH" | "UNSAFE_CONNECTION_STATUS"
  | "SHADOW_CONFLICT" | "INVALID_SHOP";
type Row = { model: Model; id: string; shop: string; expectedId: string | null; category: Classification };
export type ModelSummary = { total: number; wouldUpdate: number; updated: number; counts: Record<Classification, number> };
export type Summary = { total: number; wouldUpdate: number; updated: number; models: Record<Model, ModelSummary> };

const categories: Classification[] = [
  "READY", "ALREADY_MATCHED", "MISSING_MAPPING", "INCONSISTENT_MAPPING",
  "WRONG_CHANNEL", "EXTERNAL_ID_MISMATCH", "UNSAFE_CONNECTION_STATUS",
  "SHADOW_CONFLICT", "INVALID_SHOP",
];
const safe = (category: Classification) => category === "READY" || category === "ALREADY_MATCHED";

async function classify(db: Db): Promise<Row[]> {
  const [snapshots, alerts] = await Promise.all([
    db.profitMonitorSnapshot.findMany({ select: { id: true, shop: true, channelConnectionId: true }, orderBy: { id: "asc" } }),
    db.profitMonitorAlert.findMany({ select: { id: true, shop: true, channelConnectionId: true }, orderBy: { id: "asc" } }),
  ]);
  const rows: Row[] = [];
  for (const [model, collection] of [["snapshot", snapshots], ["alert", alerts]] as const) {
    for (const source of collection) {
      let shop: string;
      try {
        shop = normalizeVerifiedShopDomain(source.shop);
      } catch {
        rows.push({ model, id: source.id, shop: source.shop, expectedId: null, category: "INVALID_SHOP" });
        continue;
      }
      const mapping = await db.legacyShopMapping.findUnique({ where: { shopDomain: shop } });
      if (!mapping) {
        rows.push({ model, id: source.id, shop: source.shop, expectedId: null, category: "MISSING_MAPPING" });
        continue;
      }
      // Separate lookup reports broken legacy composite relations instead of masking them.
      const connection = await db.channelConnection.findUnique({ where: { id: mapping.channelConnectionId } });
      let category: Classification;
      if (!connection || mapping.accountId !== connection.accountId) category = "INCONSISTENT_MAPPING";
      else if (connection.channel !== "SHOPIFY") category = "WRONG_CHANNEL";
      else if (connection.externalAccountId !== shop) category = "EXTERNAL_ID_MISMATCH";
      else if (connection.status !== "ACTIVE") category = "UNSAFE_CONNECTION_STATUS";
      else if (source.channelConnectionId && source.channelConnectionId !== connection.id) category = "SHADOW_CONFLICT";
      else category = source.channelConnectionId === connection.id ? "ALREADY_MATCHED" : "READY";
      rows.push({ model, id: source.id, shop: source.shop, expectedId: connection?.id ?? null, category });
    }
  }
  return rows;
}

function modelSummary(rows: Row[], updated: number): ModelSummary {
  const counts = Object.fromEntries(categories.map((name) => [name, 0])) as Record<Classification, number>;
  for (const row of rows) counts[row.category] += 1;
  return { total: rows.length, wouldUpdate: counts.READY, updated, counts };
}

function summarize(rows: Row[], updated: Record<Model, number>): Summary {
  const models = {
    snapshot: modelSummary(rows.filter((row) => row.model === "snapshot"), updated.snapshot),
    alert: modelSummary(rows.filter((row) => row.model === "alert"), updated.alert),
  };
  return {
    total: models.snapshot.total + models.alert.total,
    wouldUpdate: models.snapshot.wouldUpdate + models.alert.wouldUpdate,
    updated: models.snapshot.updated + models.alert.updated,
    models,
  };
}

/** Dry-run is read-only. Apply is one transaction across both root tables. */
export async function runProfitMonitorShadowBackfill(db: PrismaClient, apply = false): Promise<Summary> {
  if (!apply) return summarize(await classify(db), { snapshot: 0, alert: 0 });
  return db.$transaction(async (tx) => {
    const rows = await classify(tx);
    if (rows.some((row) => !safe(row.category))) return summarize(rows, { snapshot: 0, alert: 0 });
    const updated = { snapshot: 0, alert: 0 };
    for (const row of rows) {
      if (row.category !== "READY" || !row.expectedId) continue;
      const where = { id: row.id, shop: row.shop, channelConnectionId: null };
      const data = { channelConnectionId: row.expectedId };
      const result = row.model === "snapshot"
        ? await tx.profitMonitorSnapshot.updateMany({ where, data })
        : await tx.profitMonitorAlert.updateMany({ where, data });
      if (result.count !== 1) throw new Error("Concurrent Profit Monitor shadow change; entire transaction rolled back");
      updated[row.model] += 1;
    }
    return summarize(rows, updated);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => flag !== "--apply") || flags.length > 1) {
    console.error("Usage: npm run tenancy:t8a:profit-monitor-backfill -- [--apply]");
    process.exitCode = 2;
  } else {
    const { default: prisma } = await import("../app/db.server");
    try {
      const summary = await runProfitMonitorShadowBackfill(prisma, flags.includes("--apply"));
      console.log(JSON.stringify({ mode: flags.includes("--apply") ? "apply" : "dry-run", ...summary }, null, 2));
      if (Object.values(summary.models).some((model) => categories.some((category) => !safe(category) && model.counts[category] > 0))) {
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
