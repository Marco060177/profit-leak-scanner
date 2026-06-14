import { useLoaderData } from "react-router";
import { generateAiMarginAnalysis } from "~/utils/openai.server";

export async function loader() {
  const result = await generateAiMarginAnalysis({
    storeSummary:
      "Test store data: revenue is $10,000, COGS is $6,000, refunds are $300, discounts are $250, and 3 products are selling below cost. Explain the main profitability risk in 3 short sentences.",
  });

  return result;
}

export default function AiTestPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        padding: 40,
        background: "#020617",
        minHeight: "100vh",
        color: "#f8fafc",
      }}
    >
      <h1>AI Test Page</h1>

      <div
        style={{
          marginTop: 24,
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.04)",
          whiteSpace: "pre-wrap",
          lineHeight: 1.7,
        }}
      >
        {data.text}
      </div>
    </div>
  );
}