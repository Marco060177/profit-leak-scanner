export type ExactMoneyValue = Readonly<{
  amountAtoms: bigint;
  amountScale: number;
  currencyCode: string;
}>;

const currencySymbols: Readonly<Record<string, string>> = {
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  USD: "$",
};

export function formatExactMoney(value: ExactMoneyValue): string {
  if (!Number.isInteger(value.amountScale) || value.amountScale < 0 || value.amountScale > 12)
    throw new Error("Unsupported exact-money scale");
  const negative = value.amountAtoms < 0n;
  const absolute = negative ? -value.amountAtoms : value.amountAtoms;
  const divisor = 10n ** BigInt(value.amountScale);
  const whole = absolute / divisor;
  const fraction = value.amountScale === 0 ? "" : `.${(absolute % divisor).toString().padStart(value.amountScale, "0")}`;
  const currency = currencySymbols[value.currencyCode] ?? `${value.currencyCode} `;
  return `${negative ? "-" : ""}${currency}${whole}${fraction}`;
}

export const amazonProfitReasonKey = (reasonCodes: readonly string[]) => {
  if (reasonCodes.some((code) => code === "MISSING_APPROVED_SKU_MAPPING")) return "mappingRequired" as const;
  if (reasonCodes.some((code) => code === "UNKNOWN_COST" || code.includes("COST"))) return "costRequired" as const;
  if (reasonCodes.some((code) => code === "MIXED_CURRENCY_WITHOUT_FX")) return "fxRequired" as const;
  if (reasonCodes.some((code) => code.includes("AUTHORITY") || code.includes("FINANCIAL_DATASET")))
    return "financialIncomplete" as const;
  if (reasonCodes.some((code) => code.includes("UNKNOWN") || code.includes("UNREPRESENTABLE")))
    return "financialReview" as const;
  return "additionalData" as const;
};

export function presentAmazonProfit(result: {
  status: "READY" | "BLOCKED";
  orderId: string | null;
  sourceOrderId: string | null;
  marketplaceId: string | null;
  reasonCodes: string[];
  revenue?: ExactMoneyValue;
  amazonFees?: ExactMoneyValue;
  cogs?: ExactMoneyValue;
  tax?: ExactMoneyValue;
  profit?: ExactMoneyValue;
}) {
  const identity = { orderId: result.orderId, sourceOrderId: result.sourceOrderId,
    marketplaceId: result.marketplaceId, reasonCodes: result.reasonCodes };
  if (result.status === "BLOCKED") return { status: "BLOCKED" as const, ...identity,
    reasonKey: amazonProfitReasonKey(result.reasonCodes) };
  if (!result.revenue || !result.amazonFees || !result.cogs || !result.tax || !result.profit)
    throw new Error("Incomplete READY Amazon profit result");
  return { status: "READY" as const, ...identity,
    revenue: formatExactMoney(result.revenue), amazonFees: formatExactMoney(result.amazonFees),
    cogs: formatExactMoney({ ...result.cogs, amountAtoms: -result.cogs.amountAtoms }),
    tax: formatExactMoney(result.tax), profit: formatExactMoney(result.profit) };
}
