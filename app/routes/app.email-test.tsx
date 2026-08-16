import { Form, useActionData } from "react-router";

import { authenticate } from "~/shopify.server";
import { sendTestEmail } from "~/services/email.server";

export async function action({ request }: { request: Request }) {
  await authenticate.admin(request);

  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    return {
      ok: false,
      message: "Email address is required.",
    };
  }

  try {
    const result = await sendTestEmail(email);

    return {
      ok: true,
      message: `Email sent successfully. Message ID: ${result.id ?? "unknown"}`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected email delivery error.",
    };
  }
}

export default function EmailTestPage() {
  const result = useActionData<typeof action>();

  return (
    <div
      style={{
        padding: 32,
        maxWidth: 620,
        margin: "0 auto",
        color: "#f8fafc",
      }}
    >
      <h1>MarginLab Email Test</h1>

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
          Send test email
        </button>
      </Form>

      {result?.message ? (
        <div
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 10,
            background: result.ok
              ? "rgba(34,197,94,0.10)"
              : "rgba(239,68,68,0.10)",
          }}
        >
          {result.message}
        </div>
      ) : null}
    </div>
  );
}