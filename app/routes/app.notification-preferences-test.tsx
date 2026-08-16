import { Form, useActionData } from "react-router";

import { authenticate } from "~/shopify.server";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "~/services/notification.server";

export async function loader({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);

  const preferences = await getNotificationPreferences(session.shop);

  return {
    shop: session.shop,
    preferences,
  };
}

export async function action({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    return {
      ok: false,
      message: "Email address is required.",
    };
  }

  const preferences = await updateNotificationPreferences({
    shop: session.shop,
    input: {
      recipientEmail: email,
      emailAlertsEnabled: true,
      weeklyReportEnabled: false,
      notifyCritical: true,
      notifyWarnings: false,
      notifyOpportunities: false,
      language: "en",
      timezone: "Europe/Rome",
    },
  });

  return {
    ok: true,
    message: "Notification preferences enabled for the dev store.",
    preferences,
  };
}

export default function NotificationPreferencesTestPage() {
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
      <h1>MarginLab Notification Preferences Test</h1>

      <p style={{ opacity: 0.7 }}>
        Enables critical email alerts for the current Shopify store.
      </p>

      <Form method="post">
        <input
          type="email"
          name="email"
          placeholder="Your email address"
          required
          style={{
            width: "100%",
            padding: 14,
            marginTop: 16,
            borderRadius: 10,
          }}
        />

        <button
          type="submit"
          style={{
            marginTop: 12,
            padding: "12px 18px",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          Enable critical email alerts
        </button>
      </Form>

      {data?.message ? (
        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 10,
            background: data.ok
              ? "rgba(34,197,94,0.10)"
              : "rgba(239,68,68,0.10)",
          }}
        >
          {data.message}
        </div>
      ) : null}
    </div>
  );
}