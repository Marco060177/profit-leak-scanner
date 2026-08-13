export type VatEngineInput = {
  grossRevenue: number;
  grossCost: number;

  vatRatePct: number;

  revenueIncludesVat: boolean;
  costIncludesVat: boolean;

  recoverInputVat: boolean;
};

export type VatEngineResult = {
  grossRevenue: number;
  revenueVat: number;
  netRevenue: number;

  grossCost: number;
  inputVat: number;
  recoverableInputVat: number;
  nonRecoverableInputVat: number;
  netCost: number;
  economicCost: number;

  grossMarginBeforeVat: number;
  realProfit: number;
  realMarginPct: number;

  vatImpactOnProfit: number;
};

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function safeRate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function extractVatFromGross(
  grossAmount: number,
  vatRatePct: number,
) {
  const amount = finite(grossAmount);
  const rate = safeRate(vatRatePct);

  if (amount <= 0 || rate <= 0) {
    return 0;
  }

  return amount - amount / (1 + rate / 100);
}

export function calculateVatEconomics({
  grossRevenue,
  grossCost,
  vatRatePct,
  revenueIncludesVat,
  costIncludesVat,
  recoverInputVat,
}: VatEngineInput): VatEngineResult {
  const revenue = finite(grossRevenue);
  const cost = finite(grossCost);
  const rate = safeRate(vatRatePct);

  const revenueVat =
    revenueIncludesVat
      ? extractVatFromGross(revenue, rate)
      : 0;

  const netRevenue =
    revenueIncludesVat
      ? revenue - revenueVat
      : revenue;

  const inputVat =
    costIncludesVat
      ? extractVatFromGross(cost, rate)
      : 0;

  const recoverableInputVat =
    recoverInputVat ? inputVat : 0;

  const nonRecoverableInputVat =
    inputVat - recoverableInputVat;

  const netCost =
    costIncludesVat
      ? cost - inputVat
      : cost;

  const economicCost =
    netCost + nonRecoverableInputVat;

  const grossMarginBeforeVat =
    revenue - cost;

  const realProfit =
    netRevenue - economicCost;

  const realMarginPct =
    netRevenue > 0
      ? (realProfit / netRevenue) * 100
      : 0;

  const vatImpactOnProfit =
    realProfit - grossMarginBeforeVat;

  return {
    grossRevenue: revenue,
    revenueVat,
    netRevenue,

    grossCost: cost,
    inputVat,
    recoverableInputVat,
    nonRecoverableInputVat,
    netCost,
    economicCost,

    grossMarginBeforeVat,
    realProfit,
    realMarginPct,

    vatImpactOnProfit,
  };
}

const test = calculateVatEconomics({
  grossRevenue: 122,
  grossCost: 61,
  vatRatePct: 22,
  revenueIncludesVat: true,
  costIncludesVat: true,
  recoverInputVat: true,
});

console.log("[VAT ENGINE TEST]", test);