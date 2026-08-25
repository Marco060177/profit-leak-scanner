import { listProfitImpactActionsForShop } from "~/services/profit-impact.server";

type Action = Awaited<ReturnType<typeof listProfitImpactActionsForShop>>[number];
const finalResult = (action: Action) => action.measurements.find((item) => item.measurementType === "FINAL_14D") ?? null;
const reasons = (value: string | null) => { try { const parsed = value ? JSON.parse(value) : []; return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } };
const severeInterference = (action: Action) => {
  const result = finalResult(action); if (!result) return false;
  return reasons(result.confidenceReasonsJson).some((reason) => /interference|overlap|concurrent|truncat|missing cogs/i.test(reason));
};

export function buildWeeklyProfitImpactSummary(actions: Action[], now = new Date()) {
  const weekStart = new Date(now.getTime() - 7 * 86400000);
  const completed = actions.filter((action) => action.status === "COMPLETED" && action.completedAt && action.completedAt >= weekStart && action.completedAt <= now);
  const results = completed.map(finalResult).filter((item): item is NonNullable<ReturnType<typeof finalResult>> => Boolean(item));
  const attributable = results.map((item) => item.estimatedAttributableImpact).filter((value): value is number => value !== null);
  const confidence = results.map((item) => item.attributionConfidenceScore).filter((value): value is number => value !== null);
  return {
    relevant: actions.some((action) => action.status === "MEASURING") || completed.length > 0,
    measuringCount: actions.filter((action) => action.status === "MEASURING").length,
    completedThisWeek: completed.length,
    measuredProfitChange: results.reduce((sum, item) => sum + (item.measuredProfitChange ?? 0), 0),
    estimatedAttributableImpact: attributable.length ? attributable.reduce((sum, value) => sum + value, 0) : null,
    averageAttributionConfidence: confidence.length ? confidence.reduce((sum, value) => sum + value, 0) / confidence.length : null,
    hasLowConfidence: results.some((item) => item.confidenceLevel === "LOW"),
  };
}

export function historicalInsightEligibility(actions: Action[], actionType: string) {
  const comparable = actions.filter((action) => action.status === "COMPLETED" && action.actionType === actionType && finalResult(action));
  const scores = comparable.map((action) => finalResult(action)!.attributionConfidenceScore).filter((value): value is number => value !== null);
  const averageConfidence = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
  return { eligible: comparable.length >= 3 && scores.length === comparable.length && averageConfidence >= 40 && !comparable.some(severeInterference), sampleSize: comparable.length, averageConfidence };
}

export function buildProfitImpactAiContext(actions: Action[], now = new Date()) {
  const visible = actions.filter((action) => action.status !== "CANCELLED");
  const types = [...new Set(visible.filter((action) => action.status === "COMPLETED").map((action) => action.actionType))];
  const history = types.map((type) => ({ actionType: type, ...historicalInsightEligibility(visible, type) }));
  const rows = visible.map((action) => { const result = finalResult(action); return {
    id: action.id, status: action.status, actionType: action.actionType, product: action.productTitle, appliedAt: action.appliedAt?.toISOString() ?? null,
    completedAt: action.completedAt?.toISOString() ?? null, measuredProfitChange: result?.measuredProfitChange ?? null,
    measuredMarginChange: result?.measuredMarginChange ?? null, estimatedAttributableImpact: result?.estimatedAttributableImpact ?? null,
    dataConfidence: result?.dataConfidenceScore ?? null, attributionConfidence: result?.attributionConfidenceScore ?? null,
    confidenceLevel: result?.confidenceLevel ?? null, interferenceReasons: result ? reasons(result.confidenceReasonsJson) : [],
  }; });
  return `PROFIT IMPACT TRACKER — SERVER-DETERMINED VALUES\nGenerated: ${now.toISOString()}\nActive actions: ${visible.filter((a) => ["ACCEPTED","AWAITING_APPLICATION","MEASURING"].includes(a.status)).length}\nCompleted actions: ${visible.filter((a) => a.status === "COMPLETED").length}\nActions: ${JSON.stringify(rows)}\nHistorical comparison eligibility: ${JSON.stringify(history)}\nGuardrails: Do not recalculate attribution. Distinguish measured change from estimated attributable impact. Do not claim causality. Do not generalize from one action. Comparative historical claims require eligibility=true; otherwise describe individual results only.`;
}

export function getProfitImpactReminders(actions: Action[], now = new Date()) {
  const day = 86400000;
  const reminders: Array<{ actionId: string; kind: "awaiting_application" | "measurement_due" | "completed" }> = [];
  for (const action of actions) {
    if (action.status === "AWAITING_APPLICATION" && now.getTime() - action.updatedAt.getTime() >= 7 * day) reminders.push({ actionId: action.id, kind: "awaiting_application" });
    else if (action.status === "MEASURING" && action.measurementEnd && action.measurementEnd < now) reminders.push({ actionId: action.id, kind: "measurement_due" });
    else if (action.status === "COMPLETED" && action.completedAt && now.getTime() - action.completedAt.getTime() <= 7 * day) reminders.push({ actionId: action.id, kind: "completed" });
  }
  return reminders;
}

export function completedNotificationEligible(action: Action, now = new Date()) {
  return action.status === "COMPLETED" && Boolean(finalResult(action)) && Boolean(action.completedAt && now.getTime() - action.completedAt.getTime() <= 7 * 86400000);
}

export async function loadProfitImpactContext(shop: string) {
  const actions = await listProfitImpactActionsForShop({ shop, take: 100 });
  return { actions, aiContext: buildProfitImpactAiContext(actions), weekly: buildWeeklyProfitImpactSummary(actions), reminders: getProfitImpactReminders(actions) };
}
