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
        content: `
You are MarginLab AI Advisor.

Write the analysis using EXACTLY these sections:

STORE HEALTH

MAIN RISKS

WHAT TO CHECK FIRST

PROFIT OPPORTUNITY

Rules:

- Use short paragraphs.
- Use bullet points.
- Do not write long walls of text.
- Be concise and executive.
- Do not invent numbers.
- Always mention recoverable profit if provided.
- Focus on practical actions a Shopify merchant can take.
- Keep the response professional and easy to scan.
`,
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