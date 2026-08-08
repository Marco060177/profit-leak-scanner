import prisma from "~/db.server";
import { createHash } from "node:crypto";
import type { ProfitAlert } from "~/utils/profit-monitor";
import type {
  ProfitAlertStateMap,
  ProfitAlertStatus,
  StoredProfitAlertState,
} from "~/utils/profit-alert-state";

const VALID_STATUSES = new Set<ProfitAlertStatus>([
  "new",
  "active",
  "acknowledged",
  "resolved",
]);

export type PersistedProfitAlert = ProfitAlert & StoredProfitAlertState;

function periodNumber(period: string | number) {
  const value = Number(period);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 30;
}

function alertType(alert: ProfitAlert) {
  return alert.productId
    ? alert.id.slice(
        0,
        Math.max(0, alert.id.length - alert.productId.length - 1),
      )
    : alert.id;
}

function toStoredState(row: {
  alertKey: string;
  status: string;
  isRead: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
}): StoredProfitAlertState {
  return {
    alertId: row.alertKey,
    status: VALID_STATUSES.has(row.status as ProfitAlertStatus)
      ? (row.status as ProfitAlertStatus)
      : "active",
    isRead: row.isRead,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString(),
  };
}

export async function syncProfitMonitor({
  shop,
  period,
  alerts,
  snapshot,
}: {
  shop: string;
  period: string | number;
  alerts: ProfitAlert[];
  snapshot: unknown;
}) {
  const periodDays = periodNumber(period);
  const payloadJson = JSON.stringify(snapshot);
  const fingerprint = createHash("sha256").update(payloadJson).digest("hex");
  const now = new Date();
  const activeKeys = new Set(alerts.map((alert) => alert.id));

  await prisma.$transaction(async (tx) => {
    await tx.profitMonitorSnapshot.upsert({
      where: { shop_periodDays_fingerprint: { shop, periodDays, fingerprint } },
      create: { shop, periodDays, fingerprint, payloadJson },
      update: { capturedAt: now, payloadJson },
    });

    const existing = await tx.profitMonitorAlert.findMany({
      where: { shop, periodDays },
    });
    const byKey = new Map(existing.map((row) => [row.alertKey, row]));

    for (const alert of alerts) {
      const previous = byKey.get(alert.id);
      const reopening = previous?.status === "resolved";
      const data = {
        alertType: alertType(alert),
        productId: alert.productId ?? null,
        severity: alert.severity,
        category: alert.category,
        title: alert.title,
        description: alert.description,
        monthlyImpact: alert.monthlyImpact,
        economicKind: alert.economicKind,
        priority: alert.priority,
        actionLabel: alert.actionLabel,
        route: alert.route,
        businessAction: alert.businessAction,
        effort: alert.effort,
        estimatedMinutes: alert.estimatedMinutes,
        recommendedModule: alert.recommendedModule,
        productTitle: alert.productTitle ?? null,
        metadataJson: alert.metadata ? JSON.stringify(alert.metadata) : null,
        lastSeenAt: now,
      };
      const row = await tx.profitMonitorAlert.upsert({
        where: {
          shop_periodDays_alertKey: { shop, periodDays, alertKey: alert.id },
        },
        create: { shop, periodDays, alertKey: alert.id, ...data },
        update: reopening
          ? { ...data, status: "active", resolvedAt: null }
          : data,
      });
      if (!previous || reopening) {
        await tx.profitMonitorAlertEvent.create({
          data: {
            alertId: row.id,
            fromStatus: previous?.status ?? null,
            toStatus: reopening ? "active" : "new",
            source: "monitor-sync",
          },
        });
      }
    }

    for (const row of existing) {
      if (!activeKeys.has(row.alertKey) && row.status !== "resolved") {
        await tx.profitMonitorAlert.update({
          where: { id: row.id },
          data: { status: "resolved", isRead: true, resolvedAt: now },
        });
        await tx.profitMonitorAlertEvent.create({
          data: {
            alertId: row.id,
            fromStatus: row.status,
            toStatus: "resolved",
            source: "monitor-sync",
          },
        });
      }
    }
  });

  return getProfitAlertStates({ shop, period: periodDays });
}

export async function getProfitAlertStates({
  shop,
  period,
}: {
  shop: string;
  period: string | number;
}) {
  const rows = await prisma.profitMonitorAlert.findMany({
    where: { shop, periodDays: periodNumber(period) },
  });
  return Object.fromEntries(
    rows.map((row) => [row.alertKey, toStoredState(row)]),
  ) as ProfitAlertStateMap;
}

export async function getResolvedProfitAlerts({
  shop,
  period,
}: {
  shop: string;
  period: string | number;
}): Promise<PersistedProfitAlert[]> {
  const rows = await prisma.profitMonitorAlert.findMany({
    where: {
      shop,
      periodDays: periodNumber(period),
      status: "resolved",
    },
    orderBy: [{ resolvedAt: "desc" }, { lastSeenAt: "desc" }],
  });

  return rows.map((row) => ({
    id: row.alertKey,
    
    severity: row.severity as ProfitAlert["severity"],
    category: row.category as ProfitAlert["category"],
    title: row.title,
    description: row.description,
    monthlyImpact: row.monthlyImpact,
    economicKind: row.economicKind as ProfitAlert["economicKind"],
    priority: row.priority,
    actionLabel: row.actionLabel,
    route: row.route,
    businessAction: row.businessAction as ProfitAlert["businessAction"],
    effort: row.effort as ProfitAlert["effort"],
    estimatedMinutes: row.estimatedMinutes,
    recommendedModule: row.recommendedModule,
    productTitle: row.productTitle ?? undefined,
    productId: row.productId ?? undefined,
    metadata: row.metadataJson
      ? (JSON.parse(row.metadataJson) as ProfitAlert["metadata"])
      : undefined,
    ...toStoredState(row),
  }));
}

export async function updateProfitAlertState({
  shop,
  period,
  alertKey,
  intent,
}: {
  shop: string;
  period: string | number;
  alertKey?: string;
  intent: "read" | "acknowledge" | "restore" | "read-all";
}) {
  const periodDays = periodNumber(period);
  if (intent === "read-all") {
    await prisma.profitMonitorAlert.updateMany({
      where: { shop, periodDays, status: { not: "resolved" } },
      data: { isRead: true },
    });
    return getProfitAlertStates({ shop, period: periodDays });
  }
  if (!alertKey) throw new Response("Missing alert id", { status: 400 });
  const row = await prisma.profitMonitorAlert.findUnique({
    where: { shop_periodDays_alertKey: { shop, periodDays, alertKey } },
  });
  if (!row) throw new Response("Alert not found", { status: 404 });
  const nextStatus =
    intent === "acknowledge"
      ? "acknowledged"
      : intent === "restore"
        ? "active"
        : row.status === "new"
          ? "active"
          : row.status;
  await prisma.$transaction(async (tx) => {
    await tx.profitMonitorAlert.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        isRead: true,
        acknowledgedAt:
          intent === "acknowledge"
            ? new Date()
            : intent === "restore"
              ? null
              : row.acknowledgedAt,
        resolvedAt: intent === "restore" ? null : row.resolvedAt,
      },
    });
    if (nextStatus !== row.status) {
      await tx.profitMonitorAlertEvent.create({
        data: {
          alertId: row.id,
          fromStatus: row.status,
          toStatus: nextStatus,
          source: "merchant",
        },
      });
    }
  });
  return getProfitAlertStates({ shop, period: periodDays });
}

export async function importLegacyProfitAlertStates({
  shop,
  period,
  states,
}: {
  shop: string;
  period: string | number;
  states: ProfitAlertStateMap;
}) {
  const periodDays = periodNumber(period);
  await prisma.$transaction(async (tx) => {
    for (const state of Object.values(states)) {
      const row = await tx.profitMonitorAlert.findUnique({
        where: {
          shop_periodDays_alertKey: {
            shop,
            periodDays,
            alertKey: state.alertId,
          },
        },
      });
      if (!row) continue;
      const canImportAcknowledgement =
        state.status === "acknowledged" && row.status !== "resolved";
      const nextStatus = canImportAcknowledgement ? "acknowledged" : row.status;
      await tx.profitMonitorAlert.update({
        where: { id: row.id },
        data: {
          isRead: row.isRead || state.isRead,
          status: nextStatus,
          acknowledgedAt: canImportAcknowledgement
            ? new Date(state.acknowledgedAt ?? state.lastSeenAt)
            : row.acknowledgedAt,
        },
      });
      if (nextStatus !== row.status) {
        await tx.profitMonitorAlertEvent.create({
          data: {
            alertId: row.id,
            fromStatus: row.status,
            toStatus: nextStatus,
            source: "legacy-local-storage",
          },
        });
      }
    }
  });
  return getProfitAlertStates({ shop, period: periodDays });
}