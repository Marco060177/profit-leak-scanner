import { pathToFileURL } from "node:url";
import type { Prisma, PrismaClient } from "@prisma/client";
import { profileLegacyAiUsage, type Classification, type Profile } from "./tenancy-t9b-ai-usage-profile";

type Db = PrismaClient | Prisma.TransactionClient;
type Candidate = { accountId: string; periodKey: string; requests: number };
export type BackfillSummary = {
  mode: "dry-run" | "apply";
  outcome: "READY" | "BLOCKED" | "APPLIED";
  totalLegacyRows: number;
  sourceCounts: Record<Classification, number>;
  eligibleGroups: number;
  unsafeRows: number;
  wouldCreate: number;
  alreadyMatching: number;
  conflicts: number;
  created: number;
};

async function inspect(db: Db, mode: BackfillSummary["mode"]) {
  const profile: Profile = await profileLegacyAiUsage(db);
  // T9B marks every member of an ambiguous Account+month group unsafe.
  const candidates: Candidate[] = profile.rows
    .filter((row) => row.category === "READY" && row.accountId !== null)
    .map((row) => ({ accountId: row.accountId!, periodKey: row.month, requests: row.requests }));
  const keys = new Set(candidates.map((row) => JSON.stringify([row.accountId, row.periodKey])));
  if (keys.size !== candidates.length) throw new Error("T9B READY classification is not unique");

  let wouldCreate = 0;
  let alreadyMatching = 0;
  let conflicts = 0;
  for (const row of candidates) {
    const existing = await db.accountAiUsage.findUnique({
      where: { accountId_periodKey: { accountId: row.accountId, periodKey: row.periodKey } },
      select: { requests: true },
    });
    if (!existing) wouldCreate += 1;
    else if (existing.requests === row.requests) alreadyMatching += 1;
    else conflicts += 1;
  }
  const unsafeRows = profile.rows.length - candidates.length;
  const summary: BackfillSummary = {
    mode,
    outcome: unsafeRows || conflicts ? "BLOCKED" : "READY",
    totalLegacyRows: profile.rows.length,
    sourceCounts: profile.summary.counts,
    eligibleGroups: candidates.length,
    unsafeRows,
    wouldCreate,
    alreadyMatching,
    conflicts,
    created: 0,
  };
  return { summary, candidates };
}

/** Dry-run performs reads only. Apply is all-or-nothing and never changes legacy usage. */
export async function runAccountAiUsageBackfill(db: PrismaClient, apply = false): Promise<BackfillSummary> {
  if (!apply) return (await inspect(db, "dry-run")).summary;

  return db.$transaction(async (tx) => {
    const { summary, candidates } = await inspect(tx, "apply");
    if (summary.outcome === "BLOCKED") return summary;
    for (const row of candidates) {
      const existing = await tx.accountAiUsage.findUnique({
        where: { accountId_periodKey: { accountId: row.accountId, periodKey: row.periodKey } },
        select: { requests: true },
      });
      if (existing) {
        if (existing.requests !== row.requests) throw new Error("Account AI usage changed during backfill");
        continue;
      }
      await tx.accountAiUsage.create({ data: row });
      summary.created += 1;
    }
    summary.outcome = "APPLIED";
    return summary;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = process.argv.slice(2);
  if (flags.length > 1 || flags.some((flag) => flag !== "--apply")) {
    console.error("Usage: npm run tenancy:t9c1:ai-usage-backfill -- [--apply]");
    process.exitCode = 2;
  } else {
    const { default: prisma } = await import("../app/db.server");
    try {
      const summary = await runAccountAiUsageBackfill(prisma, flags.length === 1);
      console.log(JSON.stringify(summary, null, 2));
      if (summary.outcome === "BLOCKED") process.exitCode = 1;
    } catch {
      // Avoid leaking tenant identifiers or database connection details.
      console.error("Account AI usage backfill failed; no partial transaction committed.");
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  }
}
