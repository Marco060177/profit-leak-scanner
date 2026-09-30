import type { FeatureData, FeatureMoney, FeatureOptionalMoney } from "./feature-data-contract";
import { FEATURE_MONEY_MAX_SCALE, addFeatureMoney, assertFeatureExactRate, compareFeatureMoney,
  deriveFeaturePercentage, multiplyFeatureMoneyByInteger, multiplyFeatureMoneyByRate, subtractFeatureMoney,
  type FeatureExactRate } from "./feature-money";

export type ForecastingOptionalRate = Readonly<{ status: "AVAILABLE"; value: FeatureExactRate }> |
  Readonly<{ status: "UNAVAILABLE"; reasonCodes: readonly string[] }>;
export type ForecastingAssumptions = Readonly<{
  monthlyAdvertising: FeatureOptionalMoney;
  monthlyShipping: FeatureOptionalMoney;
  monthlyOperating: FeatureOptionalMoney;
  additionalPaymentFeeRate: ForecastingOptionalRate;
  additionalTransactionFeeRate: ForecastingOptionalRate;
  /** A managerial scenario reserve; never canonical tax evidence. */
  managerialTaxReserveRate: ForecastingOptionalRate;
  recoveryOpportunity: FeatureOptionalMoney;
}>;
export type ForecastingScenario = Readonly<{
  monthlyRevenueGrowthRate: FeatureExactRate;
  marginImprovementRate: FeatureExactRate;
  monthlyFixedCostGrowthRate: FeatureExactRate;
  recoveryCaptureRate: FeatureExactRate;
  outputScale: number;
  monthlyProfitGoal?: FeatureOptionalMoney;
}>;
export type ForecastPoint = Readonly<{ month: number; revenue: FeatureMoney; grossProfit: FeatureMoney;
  fixedCosts: FeatureMoney; additionalVariableFees: FeatureMoney; managerialTaxReserve: FeatureMoney;
  netProfit: FeatureMoney; netMarginPercentage: number; cumulativeRevenue: FeatureMoney;
  cumulativeNetProfit: FeatureMoney; cumulativeLift: FeatureMoney }>;
type Unavailable = Readonly<{ status: "UNAVAILABLE"; accountId: string; channelConnectionId: string;
  reasonCodes: readonly string[] }>;
export type ForecastingModelResult = Unavailable | Readonly<{ status: "BLOCKED"; accountId: string;
  channelConnectionId: string; reasonCodes: readonly string[] }> | Readonly<{ status: "READY";
  accountId: string; channelConnectionId: string; currencyCode: string; outputScale: number;
  baseline: Readonly<{ sourceRevenue: FeatureMoney; sourceCogs: FeatureMoney; sourceFees: FeatureOptionalMoney;
    sourceCanonicalProfit: FeatureMoney; monthlyRevenue: FeatureMoney; monthlyCogs: FeatureMoney;
    monthlyCanonicalProfit: FeatureMoney; monthlyFixedCosts: FeatureMoney;
    monthlyAdditionalVariableFees: FeatureMoney; monthlyManagerialTaxReserve: FeatureMoney;
    monthlyNetProfit: FeatureMoney; netMarginPercentage: number }>;
  points: readonly ForecastPoint[]; trajectory: "RISING" | "STEADY" | "FALLING";
  bestMonth: number; firstGoalMonth: number | null; goalStatus: "AVAILABLE" | "UNAVAILABLE";
}>;

const unavailable = (data: FeatureData, ...reasonCodes: string[]): Unavailable => ({ status: "UNAVAILABLE",
  accountId: data.accountId, channelConnectionId: data.channelConnectionId, reasonCodes });
const exactMoney = (value: FeatureOptionalMoney) => value.status === "AVAILABLE" ? value.value : null;
const exactRate = (value: ForecastingOptionalRate) => value.status === "AVAILABLE" ? value.value : null;
const zero = (currencyCode: string, amountScale: number): FeatureMoney => ({ amountAtoms: 0n, amountScale, currencyCode });
const rateZero = (rate: FeatureExactRate) => rate.numerator === 0n;
const rateWithin = (rate: FeatureExactRate, minimum: FeatureExactRate, maximum: FeatureExactRate) =>
  rate.numerator * minimum.denominator >= minimum.numerator * rate.denominator &&
  rate.numerator * maximum.denominator <= maximum.numerator * rate.denominator;
const addRates = (left: FeatureExactRate, right: FeatureExactRate): FeatureExactRate => ({
  numerator: left.numerator * right.denominator + right.numerator * left.denominator,
  denominator: left.denominator * right.denominator,
});
const multiplyRates = (left: FeatureExactRate, right: FeatureExactRate): FeatureExactRate => ({
  numerator: left.numerator * right.numerator, denominator: left.denominator * right.denominator,
});
const onePlus = (rate: FeatureExactRate) => addRates({ numerator: 1n, denominator: 1n }, rate);

function marginPercentage(profit: FeatureMoney, revenue: FeatureMoney) {
  const result = deriveFeaturePercentage(profit, revenue);
  return result.status === "DEFINED" ? result.value : null;
}

function positivePart(value: FeatureMoney) {
  return compareFeatureMoney(value, zero(value.currencyCode, value.amountScale)) > 0 ? value :
    zero(value.currencyCode, value.amountScale);
}

function requiredMoney(data: FeatureData, values: readonly [string, FeatureOptionalMoney][]) {
  for (const [name, value] of values) if (value.status !== "AVAILABLE") return `${name}_UNAVAILABLE`;
  return null;
}

export function buildForecastingModel(input: { data: FeatureData; assumptions: ForecastingAssumptions;
scenario: ForecastingScenario; horizonMonths: number }): ForecastingModelResult {
  const { data, assumptions, scenario } = input;
  if (data.status === "BLOCKED") return { status: "BLOCKED", accountId: data.accountId,
    channelConnectionId: data.channelConnectionId, reasonCodes: data.reasonCodes };
  try {
    if (!Number.isInteger(input.horizonMonths) || input.horizonMonths <= 0 || input.horizonMonths > 120)
      return unavailable(data, "INVALID_FORECAST_HORIZON");
    if (!Number.isInteger(scenario.outputScale) || scenario.outputScale < 0 ||
        scenario.outputScale > FEATURE_MONEY_MAX_SCALE) return unavailable(data, "INVALID_FORECAST_OUTPUT_SCALE");
    const durationMs = data.current.period.endExclusive.getTime() - data.current.period.startInclusive.getTime();
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs % 86_400_000 !== 0)
      return unavailable(data, "INVALID_FORECAST_PERIOD_LENGTH");
    const periodDays = BigInt(durationMs / 86_400_000);
    for (const rate of [scenario.monthlyRevenueGrowthRate, scenario.marginImprovementRate,
      scenario.monthlyFixedCostGrowthRate, scenario.recoveryCaptureRate]) assertFeatureExactRate(rate);
    if (!rateWithin(scenario.monthlyRevenueGrowthRate, { numerator: -1n, denominator: 1n },
      { numerator: 10n, denominator: 1n }) ||
      !rateWithin(scenario.monthlyFixedCostGrowthRate, { numerator: -1n, denominator: 1n },
        { numerator: 10n, denominator: 1n }) ||
      !rateWithin(scenario.marginImprovementRate, { numerator: -1n, denominator: 1n },
        { numerator: 1n, denominator: 1n }) ||
      !rateWithin(scenario.recoveryCaptureRate, { numerator: 0n, denominator: 1n },
        { numerator: 1n, denominator: 1n })) return unavailable(data, "INVALID_FORECAST_RATE");

    const economicsMissing = requiredMoney(data, [["REVENUE", data.current.summary.revenue],
      ["COGS", data.current.summary.cogs], ["PROFIT", data.current.summary.profit]]);
    if (economicsMissing) return unavailable(data, economicsMissing);
    const assumptionsMissing = requiredMoney(data, [["MONTHLY_ADVERTISING", assumptions.monthlyAdvertising],
      ["MONTHLY_SHIPPING", assumptions.monthlyShipping], ["MONTHLY_OPERATING", assumptions.monthlyOperating]]);
    if (assumptionsMissing) return unavailable(data, assumptionsMissing);
    const rateInputs = [["ADDITIONAL_PAYMENT_FEE_RATE", assumptions.additionalPaymentFeeRate],
      ["ADDITIONAL_TRANSACTION_FEE_RATE", assumptions.additionalTransactionFeeRate],
      ["MANAGERIAL_TAX_RESERVE_RATE", assumptions.managerialTaxReserveRate]] as const;
    for (const [name, value] of rateInputs) if (value.status !== "AVAILABLE") return unavailable(data, `${name}_UNAVAILABLE`);
    const paymentRate = exactRate(assumptions.additionalPaymentFeeRate)!;
    const transactionRate = exactRate(assumptions.additionalTransactionFeeRate)!;
    const reserveRate = exactRate(assumptions.managerialTaxReserveRate)!;
    for (const rate of [paymentRate, transactionRate, reserveRate]) {
      assertFeatureExactRate(rate);
      if (!rateWithin(rate, { numerator: 0n, denominator: 1n }, { numerator: 1n, denominator: 1n }))
        return unavailable(data, "INVALID_ASSUMPTION_RATE");
    }
    const recovery = exactMoney(assumptions.recoveryOpportunity);
    if (!rateZero(scenario.recoveryCaptureRate) && !recovery)
      return unavailable(data, "RECOVERY_OPPORTUNITY_UNAVAILABLE");

    const sourceRevenue = exactMoney(data.current.summary.revenue)!;
    const sourceCogs = exactMoney(data.current.summary.cogs)!;
    const sourceProfit = exactMoney(data.current.summary.profit)!;
    const currencyInputs = [sourceRevenue, sourceCogs, sourceProfit,
      ...(data.current.summary.fees.status === "AVAILABLE" ? [data.current.summary.fees.value] : []),
      exactMoney(assumptions.monthlyAdvertising)!, exactMoney(assumptions.monthlyShipping)!,
      exactMoney(assumptions.monthlyOperating)!, ...(recovery ? [recovery] : [])];
    if (currencyInputs.some((value) => value.currencyCode !== data.currencyCode))
      return unavailable(data, "FORECAST_CURRENCY_MISMATCH");
    const normalize = { numerator: 30n, denominator: periodDays };
    const scale = scenario.outputScale;
    const monthlyRevenue = multiplyFeatureMoneyByRate(sourceRevenue, normalize, scale);
    const monthlyCogs = multiplyFeatureMoneyByRate(sourceCogs, normalize, scale);
    const monthlyCanonicalProfit = multiplyFeatureMoneyByRate(sourceProfit, normalize, scale);
    const fixedCosts = [assumptions.monthlyAdvertising, assumptions.monthlyShipping,
      assumptions.monthlyOperating].map((value) => multiplyFeatureMoneyByRate(exactMoney(value)!,
        { numerator: 1n, denominator: 1n }, scale)).reduce(addFeatureMoney);
    const additionalFeeRate = addRates(paymentRate, transactionRate);
    const currentFees = multiplyFeatureMoneyByRate(monthlyRevenue, additionalFeeRate, scale);
    const beforeReserve = subtractFeatureMoney(subtractFeatureMoney(monthlyCanonicalProfit, fixedCosts), currentFees);
    const currentReserve = multiplyFeatureMoneyByRate(positivePart(beforeReserve), reserveRate, scale);
    const currentNet = subtractFeatureMoney(beforeReserve, currentReserve);
    const currentMargin = marginPercentage(currentNet, monthlyRevenue);
    if (currentMargin === null) return unavailable(data, "ZERO_MONTHLY_REVENUE");

    const canonicalMarginRate: FeatureExactRate = {
      numerator: monthlyCanonicalProfit.amountAtoms * 10n ** BigInt(monthlyRevenue.amountScale),
      denominator: monthlyRevenue.amountAtoms * 10n ** BigInt(monthlyCanonicalProfit.amountScale),
    };
    assertFeatureExactRate(canonicalMarginRate);
    let revenue = monthlyRevenue, growingFixedCosts = fixedCosts;
    let cumulativeRevenue = zero(data.currencyCode, scale), cumulativeProfit = zero(data.currencyCode, scale);
    const points: ForecastPoint[] = [];
    for (let month = 1; month <= input.horizonMonths; month += 1) {
      revenue = multiplyFeatureMoneyByRate(revenue, onePlus(scenario.monthlyRevenueGrowthRate), scale);
      growingFixedCosts = multiplyFeatureMoneyByRate(growingFixedCosts,
        onePlus(scenario.monthlyFixedCostGrowthRate), scale);
      const baselineGrossProfit = multiplyFeatureMoneyByRate(revenue, canonicalMarginRate, scale);
      const improvementRate = multiplyRates(scenario.marginImprovementRate,
        { numerator: BigInt(month), denominator: BigInt(input.horizonMonths) });
      const improvement = multiplyFeatureMoneyByRate(revenue, improvementRate, scale);
      const recoveryRamp = multiplyRates(scenario.recoveryCaptureRate,
        { numerator: BigInt(Math.min(month, Math.max(1, Math.ceil(input.horizonMonths / 2)))),
          denominator: BigInt(Math.max(1, Math.ceil(input.horizonMonths / 2))) });
      const capturedRecovery = recovery ? multiplyFeatureMoneyByRate(recovery, recoveryRamp, scale) :
        zero(data.currencyCode, scale);
      const lift = compareFeatureMoney(improvement, capturedRecovery) >= 0 ? improvement : capturedRecovery;
      const grossProfit = addFeatureMoney(baselineGrossProfit, lift);
      const additionalVariableFees = multiplyFeatureMoneyByRate(revenue, additionalFeeRate, scale);
      const profitBeforeReserve = subtractFeatureMoney(subtractFeatureMoney(grossProfit, growingFixedCosts),
        additionalVariableFees);
      const managerialTaxReserve = multiplyFeatureMoneyByRate(positivePart(profitBeforeReserve), reserveRate, scale);
      const netProfit = subtractFeatureMoney(profitBeforeReserve, managerialTaxReserve);
      const netMarginPercentage = marginPercentage(netProfit, revenue);
      if (netMarginPercentage === null) return unavailable(data, "ZERO_FORECAST_REVENUE");
      cumulativeRevenue = addFeatureMoney(cumulativeRevenue, revenue);
      cumulativeProfit = addFeatureMoney(cumulativeProfit, netProfit);
      points.push({ month, revenue, grossProfit, fixedCosts: growingFixedCosts, additionalVariableFees,
        managerialTaxReserve, netProfit, netMarginPercentage, cumulativeRevenue,
        cumulativeNetProfit: cumulativeProfit, cumulativeLift: subtractFeatureMoney(cumulativeProfit,
          multiplyFeatureMoneyByInteger(currentNet, BigInt(month))) });
    }
    const finalProfit = points.at(-1)!.netProfit;
    const best = points.reduce((candidate, point) =>
      compareFeatureMoney(point.netProfit, candidate.netProfit) > 0 ? point : candidate, points[0]);
    const goal = scenario.monthlyProfitGoal && exactMoney(scenario.monthlyProfitGoal);
    if (goal && goal.currencyCode !== data.currencyCode) return unavailable(data, "FORECAST_GOAL_CURRENCY_MISMATCH");
    const firstGoalMonth = goal ? points.find((point) => compareFeatureMoney(point.netProfit, goal) >= 0)?.month ?? null : null;
    return { status: "READY", accountId: data.accountId, channelConnectionId: data.channelConnectionId,
      currencyCode: data.currencyCode, outputScale: scale, baseline: { sourceRevenue, sourceCogs,
        sourceFees: data.current.summary.fees, sourceCanonicalProfit: sourceProfit, monthlyRevenue, monthlyCogs,
        monthlyCanonicalProfit, monthlyFixedCosts: fixedCosts, monthlyAdditionalVariableFees: currentFees,
        monthlyManagerialTaxReserve: currentReserve, monthlyNetProfit: currentNet,
        netMarginPercentage: currentMargin }, points, trajectory:
        compareFeatureMoney(finalProfit, currentNet) > 0 ? "RISING" :
          compareFeatureMoney(finalProfit, currentNet) < 0 ? "FALLING" : "STEADY",
      bestMonth: best.month, firstGoalMonth, goalStatus: goal ? "AVAILABLE" : "UNAVAILABLE" };
  } catch (error) {
    return unavailable(data, error instanceof Error ? error.message : "FORECAST_MODEL_FAILURE");
  }
}
