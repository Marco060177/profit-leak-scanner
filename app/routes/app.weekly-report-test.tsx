import { Form, useActionData } from "react-router";

import { authenticate } from "~/shopify.server";
import { prepareWeeklyProfitReport } from "~/services/weekly-profit-report.server";

export async function action({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  if (session.shop !== "profit-leak-dev.myshopify.com") {
    throw new Response("Test route available only on the dev store.", {
      status: 403,
    });
  }

  const result = await prepareWeeklyProfitReport({
    admin,
    session,
  });

  return result;
}

export default function WeeklyReportTestPage() {
  const data = useActionData<typeof action>();

  return (
    <div
      style={{
        padding: 32,
        maxWidth: 760,
        margin: "0 auto",
        color: "#f8fafc",
      }}
    >
      <h1>MarginLab Weekly Profit Report Test</h1>

      <p style={{ opacity: 0.7 }}>
        Generates the current store&apos;s real 7-day Weekly Profit Report and
        adds it to the notification delivery queue.
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
          Prepare Weekly Profit Report
        </button>
      </Form>

      {data ? (
        <pre
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 12,
            background: "#0f1724",
            overflow: "auto",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}