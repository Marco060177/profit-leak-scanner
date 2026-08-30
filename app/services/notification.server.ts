import prisma from "~/db.server";
import type { ProfitAlert } from "~/utils/profit-monitor";
import { isLanguage, type Language } from "~/utils/i18n";

export type NotificationLanguage = Language;

export type NotificationPreferencesInput = {
  recipientEmail?: string | null;
  emailAlertsEnabled?: boolean;
  weeklyReportEnabled?: boolean;
  notifyCritical?: boolean;
  notifyWarnings?: boolean;
  notifyOpportunities?: boolean;
  weeklyReportDay?: number;
  weeklyReportHour?: number;
  timezone?: string;
  language?: NotificationLanguage;
};

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return email.length > 0 ? email : null;
}

function normalizeTimezone(value: string | null | undefined) {
  const timezone = value?.trim();
  return timezone && timezone.length > 0 ? timezone : "UTC";
}

export function normalizeNotificationLanguage(
  value: string | null | undefined,
): NotificationLanguage {
  return isLanguage(value) ? value : "en";
}

function safeJsonStringify(value: unknown) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function sanitizeKeyPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function getNotificationPreferences(shop: string) {
  return prisma.notificationPreferences.findUnique({
    where: { shop },
  });
}

export async function getOrCreateNotificationPreferences({
  shop,
  recipientEmail,
  timezone,
  language,
}: {
  shop: string;
  recipientEmail?: string | null;
  timezone?: string | null;
  language?: NotificationLanguage | string | null;
}) {
  return prisma.notificationPreferences.upsert({
    where: { shop },
    create: {
      shop,
      recipientEmail: normalizeEmail(recipientEmail),
      timezone: normalizeTimezone(timezone),
      language: normalizeNotificationLanguage(language),
    },
    update: {},
  });
}

export async function updateNotificationPreferences({
  shop,
  input,
}: {
  shop: string;
  input: NotificationPreferencesInput;
}) {
  const current = await getOrCreateNotificationPreferences({
    shop,
    recipientEmail: input.recipientEmail,
    timezone: input.timezone,
    language: input.language,
  });

  return prisma.notificationPreferences.update({
    where: { shop },
    data: {
      recipientEmail:
        input.recipientEmail !== undefined
          ? normalizeEmail(input.recipientEmail)
          : current.recipientEmail,
      emailAlertsEnabled:
        input.emailAlertsEnabled ?? current.emailAlertsEnabled,
      weeklyReportEnabled:
        input.weeklyReportEnabled ?? current.weeklyReportEnabled,
      notifyCritical:
        input.notifyCritical ?? current.notifyCritical,
      notifyWarnings:
        input.notifyWarnings ?? current.notifyWarnings,
      notifyOpportunities:
        input.notifyOpportunities ?? current.notifyOpportunities,
      weeklyReportDay:
        input.weeklyReportDay !== undefined
          ? clampInt(input.weeklyReportDay, 0, 6)
          : current.weeklyReportDay,
      weeklyReportHour:
        input.weeklyReportHour !== undefined
          ? clampInt(input.weeklyReportHour, 0, 23)
          : current.weeklyReportHour,
      timezone:
        input.timezone !== undefined
          ? normalizeTimezone(input.timezone)
          : current.timezone,
      language:
        input.language !== undefined
          ? normalizeNotificationLanguage(input.language)
          : current.language,
    },
  });
}

export function shouldNotifyAlert(
  alert: ProfitAlert,
  preferences: {
    emailAlertsEnabled: boolean;
    notifyCritical: boolean;
    notifyWarnings: boolean;
    notifyOpportunities: boolean;
  },
) {
  if (!preferences.emailAlertsEnabled) return false;
  if (alert.severity === "critical") return preferences.notifyCritical;
  if (alert.severity === "warning") return preferences.notifyWarnings;
  if (alert.severity === "opportunity") return preferences.notifyOpportunities;
  return false;
}

export function buildAlertDeduplicationKey({
  shop,
  periodDays,
  alertKey,
  monitorEventId,
}: {
  shop: string;
  periodDays: number;
  alertKey: string;
  monitorEventId: string;
}) {
  return [
    sanitizeKeyPart(shop),
    "alert",
    String(clampInt(periodDays, 1, 3650)),
    sanitizeKeyPart(alertKey),
    "event",
    sanitizeKeyPart(monitorEventId),
  ].join(":");
}

export function buildWeeklyReportDeduplicationKey({
  shop,
  weekKey,
  namespace = "weekly",
}: {
  shop: string;
  weekKey: string;
  namespace?: "weekly" | "weekly-test";
}) {
  return [
    sanitizeKeyPart(shop),
    namespace,
    sanitizeKeyPart(weekKey),
  ].join(":");
}

export async function getNotificationDeliveryByDeduplicationKey(
  deduplicationKey: string,
) {
  return prisma.notificationDelivery.findUnique({
    where: { deduplicationKey },
  });
}

export async function createAlertNotificationDelivery({
  shop,
  alert,
  recipient,
  periodDays,
  monitorEventId,
  subject,
  payload,
}: {
  shop: string;
  alert: ProfitAlert;
  recipient: string;
  periodDays: number;
  monitorEventId: string;
  subject?: string;
  payload?: unknown;
}) {
  const deduplicationKey = buildAlertDeduplicationKey({
    shop,
    periodDays,
    alertKey: alert.id,
    monitorEventId,
  });

  const existing =
    await getNotificationDeliveryByDeduplicationKey(deduplicationKey);

  if (existing) {
    return { created: false as const, delivery: existing };
  }

  let delivery;

  try {
    delivery = await prisma.notificationDelivery.create({
      data: {
        shop,
        channel: "email",
        notificationType: "profit_alert",
        recipient: normalizeEmail(recipient) ?? recipient.trim(),
        alertKey: alert.id,
        periodDays,
        deduplicationKey,
        subject: subject ?? null,
        payloadJson: safeJsonStringify(
          payload ?? { monitorEventId, alert },
        ),
        status: "pending",
      },
    });
  } catch (error) {
    const concurrentDelivery =
      await getNotificationDeliveryByDeduplicationKey(deduplicationKey);

    if (concurrentDelivery) {
      return { created: false as const, delivery: concurrentDelivery };
    }

    throw error;
  }

  return { created: true as const, delivery };
}

export async function createWeeklyReportDelivery({
  shop,
  recipient,
  weekKey,
  subject,
  payload,
  scheduledFor,
  deduplicationNamespace = "weekly",
}: {
  shop: string;
  recipient: string;
  weekKey: string;
  subject?: string;
  payload?: unknown;
  scheduledFor?: Date;
  deduplicationNamespace?: "weekly" | "weekly-test";
}) {
  const deduplicationKey = buildWeeklyReportDeduplicationKey({
    shop,
    weekKey,
    namespace: deduplicationNamespace,
  });

  const existing =
    await getNotificationDeliveryByDeduplicationKey(deduplicationKey);

  if (
    existing?.status === "failed" &&
    existing.notificationType === "weekly_profit_report" &&
    existing.scheduledFor === null
  ) {
    const retryAt = new Date();
    const retryResult = await prisma.notificationDelivery.updateMany({
      where: {
        id: existing.id,
        status: "failed",
        scheduledFor: null,
        sentAt: null,
      },
      data: {
        status: "pending",
        scheduledFor: retryAt,
        failedAt: null,
        errorMessage: null,
      },
    });

    if (retryResult.count === 1) {
      const delivery = await prisma.notificationDelivery.findUniqueOrThrow({
        where: { id: existing.id },
      });
      return { created: false as const, retried: true as const, delivery };
    }
  }

  if (existing) {
    return { created: false as const, delivery: existing };
  }

  let delivery;

  try {
    delivery = await prisma.notificationDelivery.create({
      data: {
        shop,
        channel: "email",
        notificationType: "weekly_profit_report",
        recipient: normalizeEmail(recipient) ?? recipient.trim(),
        deduplicationKey,
        subject: subject ?? null,
        payloadJson: safeJsonStringify(payload),
        status: "pending",
        scheduledFor: scheduledFor ?? null,
      },
    });
  } catch (error) {
    const concurrentDelivery =
      await getNotificationDeliveryByDeduplicationKey(deduplicationKey);

    if (concurrentDelivery) {
      return { created: false as const, delivery: concurrentDelivery };
    }

    throw error;
  }

  return { created: true as const, delivery };
}

export async function markNotificationDeliverySent({
  id,
  providerMessageId,
  sentAt = new Date(),
}: {
  id: string;
  providerMessageId?: string | null;
  sentAt?: Date;
}) {
  return prisma.notificationDelivery.update({
    where: { id },
    data: {
      status: "sent",
      providerMessageId: providerMessageId ?? null,
      sentAt,
      failedAt: null,
      errorMessage: null,
    },
  });
}

export async function claimPendingNotificationDelivery(id: string) {
  const result = await prisma.notificationDelivery.updateMany({
    where: {
      id,
      status: "pending",
    },
    data: {
      status: "processing",
    },
  });

  return result.count === 1;
}

export const STALE_NOTIFICATION_PROCESSING_MS = 15 * 60 * 1000;

export async function recoverStaleProcessingNotificationDeliveries({
  now = new Date(),
  staleAfterMs = STALE_NOTIFICATION_PROCESSING_MS,
  shop,
}: {
  now?: Date;
  staleAfterMs?: number;
  shop?: string;
} = {}) {
  const safeStaleAfterMs = Math.max(60_000, staleAfterMs);
  const staleBefore = new Date(now.getTime() - safeStaleAfterMs);

  return prisma.notificationDelivery.updateMany({
    where: {
      status: "processing",
      updatedAt: { lte: staleBefore },
      ...(shop ? { shop } : {}),
    },
    data: {
      status: "pending",
    },
  });
}

export async function markNotificationDeliveryFailed({
  id,
  errorMessage,
  failedAt = new Date(),
}: {
  id: string;
  errorMessage: string;
  failedAt?: Date;
}) {
  return prisma.notificationDelivery.update({
    where: { id },
    data: {
      status: "failed",
      errorMessage: errorMessage.slice(0, 4000),
      failedAt,
    },
  });
}

export async function listPendingNotificationDeliveries({
  limit = 50,
  now = new Date(),
  shop,
}: {
  limit?: number;
  now?: Date;
  shop?: string;
} = {}) {
  return prisma.notificationDelivery.findMany({
    where: {
      status: "pending",
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
      ...(shop ? { shop } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: clampInt(limit, 1, 200),
  });
}

export async function listNotificationDeliveriesForShop({
  shop,
  limit = 50,
}: {
  shop: string;
  limit?: number;
}) {
  return prisma.notificationDelivery.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: clampInt(limit, 1, 200),
  });
}

export async function hasWeeklyReportBeenPrepared({
  shop,
  weekKey,
}: {
  shop: string;
  weekKey: string;
}) {
  const deduplicationKey = buildWeeklyReportDeduplicationKey({
    shop,
    weekKey,
  });

  return Boolean(
    await getNotificationDeliveryByDeduplicationKey(deduplicationKey),
  );
}

export async function hasAlertNotificationBeenPrepared({
  shop,
  periodDays,
  alertKey,
  monitorEventId,
}: {
  shop: string;
  periodDays: number;
  alertKey: string;
  monitorEventId: string;
}) {
  const deduplicationKey = buildAlertDeduplicationKey({
    shop,
    periodDays,
    alertKey,
    monitorEventId,
  });

  return Boolean(
    await getNotificationDeliveryByDeduplicationKey(deduplicationKey),
  );
}
