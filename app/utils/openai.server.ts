import OpenAI from "openai";

const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  console.warn("OPENAI_API_KEY is not configured.");
}

export const openai = new OpenAI({
  apiKey: openaiApiKey,
});

export async function generateAiMarginAnalysis(input: {
  storeSummary: string;
}) {
  if (!openaiApiKey) {
    return {
      text: "AI analysis is not available because OPENAI_API_KEY is not configured.",
    };
  }

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content:
          "You are MarginLab AI Advisor. You analyze Shopify profitability data and explain margin risks clearly, briefly and practically. Do not invent numbers. Use only the data provided.",
      },
      {
        role: "user",
        content: input.storeSummary,
      },
    ],
  });

  return {
    text: response.output_text,
  };
}