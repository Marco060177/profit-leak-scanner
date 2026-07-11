import OpenAI from "openai";

const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  console.warn("OPENAI_API_KEY is not configured.");
}

export const openai = new OpenAI({
  apiKey: openaiApiKey,
});

type SupportedLanguage = "en" | "it";

function getLanguageName(language: SupportedLanguage) {
  return language === "it" ? "Italian" : "English";
}

function getReportSectionNames(language: SupportedLanguage) {
  if (language === "it") {
    return {
      storeHealth: "STATO DELLO STORE",
      mainRisks: "RISCHI PRINCIPALI",
      whatToCheckFirst: "COSA CONTROLLARE PRIMA",
      profitOpportunity: "OPPORTUNITÀ DI PROFITTO",
    };
  }

  return {
    storeHealth: "STORE HEALTH",
    mainRisks: "MAIN RISKS",
    whatToCheckFirst: "WHAT TO CHECK FIRST",
    profitOpportunity: "PROFIT OPPORTUNITY",
  };
}

export async function generateAiMarginAnalysis(input: {
  storeSummary: string;
  language: SupportedLanguage;
}) {
  const languageName = getLanguageName(input.language);
  const sections = getReportSectionNames(input.language);

  if (!openaiApiKey) {
    return {
      text:
        input.language === "it"
          ? "L'analisi AI non è disponibile perché OPENAI_API_KEY non è configurata."
          : "AI analysis is not available because OPENAI_API_KEY is not configured.",
    };
  }

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: `
You are MarginLab AI Advisor.

LANGUAGE

Write the entire analysis in ${languageName}.

Always follow this instruction, regardless of the language used in the store data.

Never translate product names.

REPORT STRUCTURE

Write the analysis using exactly these section headings:

${sections.storeHealth}

${sections.mainRisks}

${sections.whatToCheckFirst}

${sections.profitOpportunity}

RULES

- Use short paragraphs.
- Use concise bullet points.
- Do not write long walls of text.
- Keep the tone professional, executive and easy to scan.
- Do not invent numbers, events, costs or product details.
- Use only the supplied store data.
- Always mention recoverable profit when it is present in the supplied data.
- Focus on practical actions a Shopify merchant can take.
- Prioritize the most important risks and opportunities.
- Never translate product names.
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

export async function generateAiAnswer(input: {
  context: string;
  question: string;
  language: SupportedLanguage;
}) {
  const languageName = getLanguageName(input.language);

  if (!openaiApiKey) {
    return {
      text:
        input.language === "it"
          ? "L'AI non è disponibile."
          : "AI is not available.",
    };
  }

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: `
You are MarginLab AI Assistant.

LANGUAGE

Answer in ${languageName}.

Always follow this instruction, regardless of the language used in the store data.

Never translate product names.

RESPONSE RULES

- Answer only the user's specific question.
- Use only the supplied store data.
- Do not invent numbers, events, costs or product details.
- Do not generate a complete business report.
- Do not summarize the whole store.
- Do not repeat all available metrics.
- Do not create section headings.
- Answer using 2 to 5 short bullet points.
- Be concise, direct, practical and business-oriented.
- If the question concerns refunds, discuss refunds only.
- If the question concerns margins, discuss margins only.
- If the question concerns products, discuss products only.
- If the available data is insufficient, say so clearly.
- Never translate product names.

NEVER WRITE THESE REPORT SECTIONS:

EXECUTIVE SUMMARY

STORE HEALTH

MAIN RISKS

WHAT TO CHECK FIRST

PROFIT OPPORTUNITY
`,
      },
      {
        role: "user",
        content: `
QUESTION

${input.question}

STORE DATA

${input.context}
`,
      },
    ],
  });

  return {
    text: response.output_text,
  };
}