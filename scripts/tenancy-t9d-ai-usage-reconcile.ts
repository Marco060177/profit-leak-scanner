import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { profileLegacyAiUsage, type Classification } from "./tenancy-t9b-ai-usage-profile";

export const reasons = [
  "MATCH", "LEGACY_ONLY", "ACCOUNT_ONLY", "COUNT_MISMATCH",
  "INVALID_LEGACY_PERIOD", "INVALID_ACCOUNT_PERIOD",
  "INVALID_LEGACY_COUNT", "INVALID_ACCOUNT_COUNT",
  "INVALID_SHOP", "MISSING_MAPPING", "INCONSISTENT_MAPPING",
  "WRONG_CHANNEL", "EXTERNAL_ID_MISMATCH", "UNSAFE_CONNECTION_STATUS",
  "AMBIGUOUS_SHOPIFY_OWNERSHIP", "ACCOUNT_PERIOD_COLLISION",
  "DUPLICATE_NORMALIZED_SHOP_PERIOD",
] as const;
export type ReconciliationReason = typeof reasons[number];
type Counts = Record<ReconciliationReason, number>;
type PeriodSummary = { legacyRows: number; accountRows: number; matchedPairs: number; anomalies: number };
export type ReconciliationReport = {
  mode: "read-only";
  observedAt: string;
  currentPeriod: string;
  verdict: "READY_FOR_T9E" | "BLOCKED";
  totalLegacyRows: number;
  totalAccountRows: number;
  comparablePairs: number;
  matchedPairs: number;
  counts: Counts;
  current: PeriodSummary;
  historical: PeriodSummary;
};

const validPeriod = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0;
const key = (accountId: string, period: string) => JSON.stringify([accountId, period]);
const emptyPeriod = (): PeriodSummary => ({ legacyRows: 0, accountRows: 0, matchedPairs: 0, anomalies: 0 });

/** A single SQLite read transaction observes both sides of T9C2's atomic shadow write. */
export async function reconcileAiUsage(db: PrismaClient, observedAt = new Date()): Promise<ReconciliationReport> {
  const timestamp = observedAt.toISOString();
  const currentPeriod = timestamp.slice(0, 7);
  return db.$transaction(async (tx) => {
    const profile = await profileLegacyAiUsage(tx);
    const accounts = await tx.accountAiUsage.findMany({
      select: { accountId: true, periodKey: true, requests: true },
    });
    const shopifyMappings = await tx.legacyShopMapping.findMany({
      where: { channelConnection: { channel: "SHOPIFY" } },
      select: { accountId: true },
    });
    const mappingsPerAccount = new Map<string, number>();
    for (const mapping of shopifyMappings) {
      mappingsPerAccount.set(mapping.accountId, (mappingsPerAccount.get(mapping.accountId) ?? 0) + 1);
    }

    const counts = Object.fromEntries(reasons.map((reason) => [reason, 0])) as Counts;
    const current = emptyPeriod();
    const historical = emptyPeriod();
    const bucket = (period: string) => period === currentPeriod ? current : historical;
    const eligible = new Map<string, number>();
    let comparablePairs = 0;
    let matchedPairs = 0;

    const legacyReason: Record<Exclude<Classification, "READY">, ReconciliationReason> = {
      ACCOUNT_PERIOD_COLLISION: "ACCOUNT_PERIOD_COLLISION",
      DUPLICATE_NORMALIZED_SHOP_PERIOD: "DUPLICATE_NORMALIZED_SHOP_PERIOD",
      INVALID_SHOP: "INVALID_SHOP",
      INVALID_PERIOD: "INVALID_LEGACY_PERIOD",
      INVALID_REQUEST_COUNT: "INVALID_LEGACY_COUNT",
      MISSING_MAPPING: "MISSING_MAPPING",
      INCONSISTENT_MAPPING: "INCONSISTENT_MAPPING",
      WRONG_CHANNEL: "WRONG_CHANNEL",
      EXTERNAL_ID_MISMATCH: "EXTERNAL_ID_MISMATCH",
      UNSAFE_CONNECTION_STATUS: "UNSAFE_CONNECTION_STATUS",
    };
    const anomaly = (reason: ReconciliationReason, period: string) => {
      counts[reason] += 1;
      bucket(period).anomalies += 1;
    };
    for (const row of profile.rows) {
      bucket(row.month).legacyRows += 1;
      if (row.category !== "READY") {
        anomaly(legacyReason[row.category], row.month);
      } else if (!row.accountId) {
        anomaly("INCONSISTENT_MAPPING", row.month);
      } else if (mappingsPerAccount.get(row.accountId) !== 1) {
        anomaly("AMBIGUOUS_SHOPIFY_OWNERSHIP", row.month);
      } else {
        eligible.set(key(row.accountId, row.month), row.requests);
      }
    }
    for (const row of accounts) {
      bucket(row.periodKey).accountRows += 1;
      if (!validPeriod(row.periodKey)) {
        anomaly("INVALID_ACCOUNT_PERIOD", row.periodKey);
        continue;
      }
      if (!validCount(row.requests)) {
        anomaly("INVALID_ACCOUNT_COUNT", row.periodKey);
        continue;
      }
      if ((mappingsPerAccount.get(row.accountId) ?? 0) > 1) {
        anomaly("AMBIGUOUS_SHOPIFY_OWNERSHIP", row.periodKey);
      }
      const pairKey = key(row.accountId, row.periodKey);
      const legacyCount = eligible.get(pairKey);
      if (legacyCount === undefined) {
        anomaly("ACCOUNT_ONLY", row.periodKey);
        continue;
      }
      eligible.delete(pairKey);
      comparablePairs += 1;
      if (legacyCount !== row.requests) {
        anomaly("COUNT_MISMATCH", row.periodKey);
      } else {
        counts.MATCH += 1;
        matchedPairs += 1;
        bucket(row.periodKey).matchedPairs += 1;
      }
    }
    for (const pairKey of eligible.keys()) {
      const period = (JSON.parse(pairKey) as [string, string])[1];
      anomaly("LEGACY_ONLY", period);
    }
    return {
      mode: "read-only", observedAt: timestamp, currentPeriod,
      verdict: reasons.some((reason) => reason !== "MATCH" && counts[reason] > 0) ? "BLOCKED" : "READY_FOR_T9E",
      totalLegacyRows: profile.rows.length, totalAccountRows: accounts.length,
      comparablePairs, matchedPairs, counts, current, historical,
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    console.error("Usage: npm run tenancy:t9d:ai-usage-reconcile (no arguments; read-only)");
    process.exitCode = 2;
  } else {
    const { default: prisma } = await import("../app/db.server");
    try {
      const report = await reconcileAiUsage(prisma);
      console.log(JSON.stringify(report, null, 2));
      if (report.verdict === "BLOCKED") process.exitCode = 1;
    } catch {
      console.error("AI usage reconciliation failed; no database changes were made by T9D.");
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  }
}
