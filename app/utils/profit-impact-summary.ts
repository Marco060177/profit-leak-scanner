import type { ProfitImpactStatus } from "~/utils/profit-impact";

export type TrackerMeasurement = {
  measurementType: string;
  observedDays: number;
  revenue: number;
  economicProfit: number;
  economicMarginPct: number;
  units: number;
  measuredProfitChange: number | null;
  measuredMarginChange: number | null;
  estimatedAttributableImpact: number | null;
  confidenceLevel: string;
  dataConfidenceScore: number;
  attributionConfidenceScore: number | null;
  attributionMethod: string | null;
  confidenceReasonsJson: string | null;
};

export type TrackerAction = {
  status: string;
  measurements: TrackerMeasurement[];
};

export const PROFIT_IMPACT_TABS = {
  active: ["ACCEPTED", "AWAITING_APPLICATION", "MEASURING"],
  completed: ["COMPLETED"],
  attention: ["INSUFFICIENT_DATA", "INVALIDATED"],
} as const satisfies Record<string, readonly ProfitImpactStatus[]>;

export function classifyProfitImpactAction(status: string) {
  if ((PROFIT_IMPACT_TABS.active as readonly string[]).includes(status)) return "active";
  if ((PROFIT_IMPACT_TABS.completed as readonly string[]).includes(status)) return "completed";
  if ((PROFIT_IMPACT_TABS.attention as readonly string[]).includes(status)) return "attention";
  return "history";
}

export function resultMeasurement(action: TrackerAction) {
  return action.measurements.find((item) => item.measurementType === "FINAL_14D")
    ?? action.measurements.find((item) => item.measurementType === "PROVISIONAL_7D")
    ?? null;
}

export function aggregateProfitImpact(actions: TrackerAction[]) {
  const completed = actions.filter((action) => action.status === "COMPLETED");
  const finalResults = completed
    .map((action) => action.measurements.find((item) => item.measurementType === "FINAL_14D"))
    .filter((item): item is TrackerMeasurement => Boolean(item));
  const attributable = finalResults
    .map((item) => item.estimatedAttributableImpact)
    .filter((value): value is number => value !== null);
  const marginChanges = finalResults
    .map((item) => item.measuredMarginChange)
    .filter((value): value is number => value !== null);
  return {
    actionsMeasuring: actions.filter((action) => action.status === "MEASURING").length,
    actionsCompleted: completed.length,
    measuredProfitChange: finalResults.reduce((sum, item) => sum + (item.measuredProfitChange ?? 0), 0),
    estimatedAttributableProfit: attributable.length
      ? attributable.reduce((sum, value) => sum + value, 0)
      : null,
    averageMarginLift: marginChanges.length
      ? marginChanges.reduce((sum, value) => sum + value, 0) / marginChanges.length
      : null,
    lowConfidenceCompleted: finalResults.filter((item) => item.confidenceLevel === "LOW").length,
  };
}
