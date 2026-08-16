import prisma from "~/db.server";
import type { ProfitAlert } from "~/utils/profit-monitor";

export type NotificationLanguage = "it" | "en";

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

function normalizeLanguage(
  value: string | null | undefined,
): NotificationLanguage {
  return value === "it" ? "it" : "en";
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
  const existing = await prisma.notificationPreferences.findUnique({
    where: { shop },
  });

  if (existing) return existing;

  return prisma.notificationPreferences.create({
    data: {
      shop,
      recipientEmail: normalizeEmail(recipientEmail),
      timezone: normalizeTimezone(timezone),
      language: normalizeLanguage(language),
    },
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
          ? normalizeLanguage(input.language)
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
}: {
  shop: string;
  weekKey: string;
}) {
  return [
    sanitizeKeyPart(shop),
    "weekly",
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

  const delivery = await prisma.notificationDelivery.create({
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

  return { created: true as const, delivery };
}

export async function createWeeklyReportDelivery({
  shop,
  recipient,
  weekKey,
  subject,
  payload,
  scheduledFor,
}: {
  shop: string;
  recipient: string;
  weekKey: string;
  subject?: string;
  payload?: unknown;
  scheduledFor?: Date;
}) {
  const deduplicationKey = buildWeeklyReportDeduplicationKey({
    shop,
    weekKey,
  });

  const existing =
    await getNotificationDeliveryByDeduplicationKey(deduplicationKey);

  if (existing) {
    return { created: false as const, delivery: existing };
  }

  const delivery = await prisma.notificationDelivery.create({
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
}: {
  limit?: number;
  now?: Date;
} = {}) {
  return prisma.notificationDelivery.findMany({
    where: {
      status: "pending",
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
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