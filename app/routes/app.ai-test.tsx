import { generateAiMarginAnalysis } from "~/utils/openai.server";

export async function loader() {
  const result = await generateAiMarginAnalysis({
    storeSummary:
      "Test store data: revenue is $10,000, COGS is $6,000, refunds are $300, discounts are $250, and 3 products are selling below cost. Explain the main profitability risk in 3 short sentences.",
  });

  return result;
}

export default function AiTestPage() {
  return (
    <div style={{ padding: 40, color: "white", background: "#020617" }}>
      <h1>AI Test Page</h1>

      <p>
        If OpenAI is configured correctly, this page should load without errors.
      </p>
    </div>
  );
}