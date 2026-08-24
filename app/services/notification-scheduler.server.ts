import prisma from "~/db.server";
import { unauthenticated } from "~/shopify.server";
import { prepareWeeklyProfitReport } from "~/services/weekly-profit-report.server";
import { processPendingNotificationDeliveries } from "~/services/notification-delivery.server";

type NotificationPreferenceForScheduler = {
  shop: string;
  recipientEmail: string | null;
  weeklyReportEnabled: boolean;
  weeklyReportDay: number;
  weeklyReportHour: number;
  timezone: string;
};

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function getLocalScheduleParts(date: Date, timeZone: string) {
  const safeTimeZone = timeZone?.trim() || "UTC";

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: safeTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });

    const parts = formatter.formatToParts(date);

    const year = Number(
      parts.find((part) => part.type === "year")?.value ?? 0,
    );
    const month = Number(
      parts.find((part) => part.type === "month")?.value ?? 0,
    );
    const day = Number(
      parts.find((part) => part.type === "day")?.value ?? 0,
    );
    const hour = Number(
      parts.find((part) => part.type === "hour")?.value ?? -1,
    );

    if (!year || !month || !day || hour < 0) {
      throw new Error("Unable to resolve local schedule time.");
    }

    return {
      weekday: new Date(
        Date.UTC(year, month - 1, day),
      ).getUTCDay(),
      hour,
      timeZone: safeTimeZone,
    };
  } catch {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });

    const parts = formatter.formatToParts(date);

    const year = Number(
      parts.find((part) => part.type === "year")?.value ?? 0,
    );
    const month = Number(
      parts.find((part) => part.type === "month")?.value ?? 0,
    );
    const day = Number(
      parts.find((part) => part.type === "day")?.value ?? 0,
    );
    const hour = Number(
      parts.find((part) => part.type === "hour")?.value ?? 0,
    );

    return {
      weekday: new Date(
        Date.UTC(year, month - 1, day),
      ).getUTCDay(),
      hour,
      timeZone: "UTC",
    };
  }
}

export function isWeeklyReportDue({
  preference,
  now = new Date(),
}: {
  preference: NotificationPreferenceForScheduler;
  now?: Date;
}) {
  if (!preference.weeklyReportEnabled) return false;
  if (!preference.recipientEmail?.trim()) return false;

  const local = getLocalScheduleParts(
    now,
    preference.timezone,
  );

  return (
    local.weekday ===
      clampInt(preference.weeklyReportDay, 0, 6) &&
    local.hour >=
      clampInt(preference.weeklyReportHour, 0, 23)
  );
}

export async function runNotificationScheduler({
  now = new Date(),
  deliveryLimit = 200,
}: {
  now?: Date;
  deliveryLimit?: number;
} = {}) {
  const preferences =
    await prisma.notificationPreferences.findMany({
      where: {
        weeklyReportEnabled: true,
        recipientEmail: {
          not: null,
        },
      },
      select: {
        shop: true,
        recipientEmail: true,
        weeklyReportEnabled: true,
        weeklyReportDay: true,
        weeklyReportHour: true,
        timezone: true,
      },
    });

  let dueShops = 0;
  let preparedReports = 0;
  let alreadyPreparedReports = 0;
  let skippedReports = 0;
  let failedReports = 0;

  const errors: Array<{
    shop: string;
    stage: "prepare";
    message: string;
  }> = [];

  for (const preference of preferences) {
    if (
      !isWeeklyReportDue({
        preference,
        now,
      })
    ) {
      continue;
    }

    dueShops += 1;

    try {
      const { admin, session } =
        await unauthenticated.admin(preference.shop);

      const result = await prepareWeeklyProfitReport({
        admin,
        session,
        now,
      });

      if (result.prepared) {
        preparedReports += 1;
      } else if (result.reason === "already_prepared") {
        alreadyPreparedReports += 1;
      } else {
        skippedReports += 1;
      }
    } catch (error) {
      failedReports += 1;

      errors.push({
        shop: preference.shop,
        stage: "prepare",
        message:
          error instanceof Error
            ? error.message
            : "Unknown weekly report preparation error.",
      });
    }
  }

  const deliveryResult =
    await processPendingNotificationDeliveries({
      limit: clampInt(deliveryLimit, 1, 200),
    });

  return {
    runAt: now.toISOString(),
    eligibleShops: preferences.length,
    dueShops,
    preparedReports,
    alreadyPreparedReports,
    skippedReports,
    failedReports,
    deliveries: deliveryResult,
    errors,
  };
}
