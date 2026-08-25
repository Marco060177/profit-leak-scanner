export const PROFIT_IMPACT_ACTION_TYPES = [
  "PRICE_CHANGE",
  "COGS_CHANGE",
  "DISCOUNT_CHANGE",
  "PRODUCT_ACTION",
  "OTHER",
] as const;

export type ProfitImpactActionType =
  (typeof PROFIT_IMPACT_ACTION_TYPES)[number];

export const FUTURE_PROFIT_IMPACT_ACTION_TYPES = [
  "SHIPPING_COST_CHANGE",
  "OPERATING_COST_CHANGE",
] as const;

export const PROFIT_IMPACT_STATUSES = [
  "ACCEPTED",
  "AWAITING_APPLICATION",
  "MEASURING",
  "COMPLETED",
  "CANCELLED",
  "INVALIDATED",
  "INSUFFICIENT_DATA",
] as const;

export type ProfitImpactStatus =
  (typeof PROFIT_IMPACT_STATUSES)[number];

export const PROFIT_IMPACT_MEASUREMENT_TYPES = [
  "BASELINE",
  "PROVISIONAL_7D",
  "FINAL_14D",
] as const;

export type ProfitImpactMeasurementType =
  (typeof PROFIT_IMPACT_MEASUREMENT_TYPES)[number];

export const PROFIT_IMPACT_CONFIDENCE_LEVELS = [
  "LOW",
  "MEDIUM",
  "HIGH",
] as const;

export type ProfitImpactConfidenceLevel =
  (typeof PROFIT_IMPACT_CONFIDENCE_LEVELS)[number];

export const PROFIT_IMPACT_SOURCE_MODULES = [
  "PROFIT_MONITOR",
  "PROFIT_ACTION_CENTER",
  "ALERT_CENTER",
  "RECOVERY_SIMULATOR",
  "PRODUCTS",
  "MANUAL",
] as const;

export type ProfitImpactSourceModule =
  (typeof PROFIT_IMPACT_SOURCE_MODULES)[number];

export const PROFIT_IMPACT_TERMINAL_STATUSES = [
  "COMPLETED",
  "CANCELLED",
  "INVALIDATED",
  "INSUFFICIENT_DATA",
] as const satisfies readonly ProfitImpactStatus[];

export const PROFIT_IMPACT_ALLOWED_TRANSITIONS = {
  ACCEPTED: ["AWAITING_APPLICATION", "CANCELLED", "INVALIDATED"],
  AWAITING_APPLICATION: ["MEASURING", "CANCELLED", "INVALIDATED"],
  MEASURING: ["COMPLETED", "INVALIDATED", "INSUFFICIENT_DATA"],
  COMPLETED: [],
  CANCELLED: [],
  INVALIDATED: [],
  INSUFFICIENT_DATA: [],
} as const satisfies Record<
  ProfitImpactStatus,
  readonly ProfitImpactStatus[]
>;

function includes<const T extends readonly string[]>(
  values: T,
  value: string,
): value is T[number] {
  return values.includes(value as T[number]);
}

export function isProfitImpactActionType(
  value: string,
): value is ProfitImpactActionType {
  return includes(PROFIT_IMPACT_ACTION_TYPES, value);
}

export function isProfitImpactStatus(
  value: string,
): value is ProfitImpactStatus {
  return includes(PROFIT_IMPACT_STATUSES, value);
}

export function isProfitImpactMeasurementType(
  value: string,
): value is ProfitImpactMeasurementType {
  return includes(PROFIT_IMPACT_MEASUREMENT_TYPES, value);
}

export function isProfitImpactConfidenceLevel(
  value: string,
): value is ProfitImpactConfidenceLevel {
  return includes(PROFIT_IMPACT_CONFIDENCE_LEVELS, value);
}

export function isProfitImpactSourceModule(
  value: string,
): value is ProfitImpactSourceModule {
  return includes(PROFIT_IMPACT_SOURCE_MODULES, value);
}

export function isProfitImpactTerminalStatus(
  status: ProfitImpactStatus,
) {
  return includes(PROFIT_IMPACT_TERMINAL_STATUSES, status);
}

export function canTransitionProfitImpactStatus(
  fromStatus: ProfitImpactStatus,
  toStatus: ProfitImpactStatus,
) {
  return PROFIT_IMPACT_ALLOWED_TRANSITIONS[fromStatus].some(
    (allowedStatus) => allowedStatus === toStatus,
  );
}

export function assertProfitImpactTransition(
  fromStatus: ProfitImpactStatus,
  toStatus: ProfitImpactStatus,
) {
  if (!canTransitionProfitImpactStatus(fromStatus, toStatus)) {
    throw new Error(
      `Invalid Profit Impact transition: ${fromStatus} -> ${toStatus}`,
    );
  }
}

export function actionTypeRequiresProduct(
  actionType: ProfitImpactActionType,
) {
  return (
    actionType === "PRICE_CHANGE" ||
    actionType === "COGS_CHANGE" ||
    actionType === "PRODUCT_ACTION"
  );
}
