import { Form, useActionData } from "react-router";

import { authenticate } from "~/shopify.server";
import { processPendingNotificationDeliveries } from "~/services/notification-delivery.server";

export async function action({ request }: { request: Request }) {
  await authenticate.admin(request);

  try {
    const result = await processPendingNotificationDeliveries({
      limit: 25,
    });

    return {
      ok: true,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected notification delivery error.",
    };
  }
}

export default function NotificationDeliveryTestPage() {
  const data = useActionData<typeof action>();

  return (
    <div
      style={{
        padding: 32,
        maxWidth: 720,
        margin: "0 auto",
        color: "#f8fafc",
      }}
    >
      <h1>MarginLab Notification Delivery Test</h1>

      <p style={{ opacity: 0.7 }}>
        Processes pending MarginLab notification deliveries.
      </p>

      <Form method="post">
        <button
          type="submit"
          style={{
            marginTop: 16,
            padding: "12px 18px",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          Process pending notifications
        </button>
      </Form>

      {data?.ok ? (
        <pre
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 12,
            background: "rgba(34,197,94,0.08)",
            whiteSpace: "pre-wrap",
          }}
        >
          {JSON.stringify(data.result, null, 2)}
        </pre>
      ) : data?.message ? (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 12,
            background: "rgba(239,68,68,0.08)",
          }}
        >
          {data.message}
        </div>
      ) : null}
    </div>
  );
}