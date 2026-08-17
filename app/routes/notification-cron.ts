import { timingSafeEqual } from "node:crypto";

import { runNotificationScheduler } from "~/services/notification-scheduler.server";

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