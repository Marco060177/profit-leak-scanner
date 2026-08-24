import { timingSafeEqual } from "node:crypto";

import { runNotificationScheduler } from "~/services/notification-scheduler.server";

function sanitizeLogMessage(value: string) {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

function authorized(request: Request) {
  const expected =
    process.env.NOTIFICATION_CRON_SECRET?.trim() ?? "";

  if (!expected) {
    throw new Response(
      "NOTIFICATION_CRON_SECRET is not configured.",
      { status: 500 },
    );
  }

  const authorization =
    request.headers.get("authorization") ?? "";

  const prefix = "Bearer ";

  if (!authorization.startsWith(prefix)) {
    return false;
  }

  const received = authorization.slice(prefix.length);

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(
    expectedBuffer,
    receivedBuffer,
  );
}

export async function loader() {
  throw new Response("Method Not Allowed", {
    status: 405,
    headers: {
      Allow: "POST",
    },
  });
}

export async function action({
  request,
}: {
  request: Request;
}) {
  if (!authorized(request)) {
    throw new Response("Unauthorized", {
      status: 401,
    });
  }

  try {
    const result = await runNotificationScheduler();

    console.info("MarginLab notification scheduler completed", {
      runAt: result.runAt,
      eligibleShops: result.eligibleShops,
      dueShops: result.dueShops,
      preparedReports: result.preparedReports,
      alreadyPreparedReports: result.alreadyPreparedReports,
      failedReports: result.failedReports,
      deliveriesSent: result.deliveries.sent,
      deliveriesFailed: result.deliveries.failed,
    });

    for (const failure of [
      ...result.errors,
      ...result.deliveries.errors,
    ]) {
      console.error("MarginLab notification scheduler item failed", {
        shop: failure.shop,
        stage: failure.stage,
        message: sanitizeLogMessage(failure.message),
      });
    }

    return Response.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error(
      "MarginLab notification scheduler failed",
      error,
    );

    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown notification scheduler error.",
      },
      {
        status: 500,
      },
    );
  }
}
