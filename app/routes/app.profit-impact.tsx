import { randomUUID } from "node:crypto";
import * as React from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigate,
} from "react-router";
import DashboardNav from "~/components/dashboard/DashboardNav";
import { useI18n } from "~/components/i18n/I18nProvider";
import {
  ControlField,
  FeedbackState,
  FlowPath,
  GrowthHeroEyebrow,
  MetricCard,
  PremiumEmptyState,
  PremiumHero,
  PremiumPanel,
  ResponsiveGrid,
  SegmentedTabs,
  StatusChip,
  TaxAwareBadge,
  VisualButton,
  VisualInput,
  VisualTextarea,
  type VisualTone,
} from "~/components/ui/VisualSystem";
import { captureProductProfitImpactBaseline } from "~/services/profit-impact-baseline.server";
import {
  cancelProfitImpactAction,
  createProfitImpactAction,
  getProfitImpactActionForShop,
  listProfitImpactActionsForShop,
  startProfitImpactMeasurement,
  transitionProfitImpactAction,
} from "~/services/profit-impact.server";
import { authenticate } from "~/shopify.server";
import { getBillingStatus, hasGrowthAccess } from "~/utils/billing.server";
import { getLanguageLocale } from "~/utils/i18n";
import { getRequestLanguage } from "~/utils/i18n.server";
import { uiMoney } from "~/utils/margin";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { generateProfitAlerts } from "~/utils/profit-monitor";
import {
  aggregateProfitImpact,
  classifyProfitImpactAction,
  resultMeasurement,
} from "~/utils/profit-impact-summary";
import { getProfitImpactReminders } from "~/services/profit-impact-context.server";
import "~/styles/dashboard.css";

const txt = (d: FormData, n: string) => String(d.get(n) ?? "").trim();
const num = (d: FormData, n: string) => {
  const raw = txt(d, n);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Response(`${n} must be a number.`, { status: 400 });
  return value;
};
const json = (value?: string | null) => {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const context = (
  admin: any,
  session: any,
  billing: any,
  locale: string,
  period: string,
) =>
  loadMarginDashboardData({
    admin,
    session,
    billingStatus: billing,
    locale,
    period,
  });

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);
  const billing = await getBillingStatus(admin);
  if (!hasGrowthAccess(billing))
    return {
      growthAccess: false,
      actions: [],
      selectedAction: null,
      prefill: null,
      summary: null,
      reminders: [],
    };
  const url = new URL(request.url);
  const actions = await listProfitImpactActionsForShop({
    shop: session.shop,
    take: 100,
  });
  let selectedAction =
    actions.find((a) => a.id === url.searchParams.get("actionId")) ?? null;
  const sourceModule = url.searchParams.get("sourceModule");
  const productId = url.searchParams.get("productId");
  const period = url.searchParams.get("period") || "30";
  let prefill: Record<string, string | number | null> | null = null;
  if (sourceModule && productId) {
    const language = getRequestLanguage(request);
    const data = await context(
      admin,
      session,
      billing,
      getLanguageLocale(language),
      period,
    );
    const row = data.rows.find((r) => r.productId === productId);
    if (!row) throw new Response("Product context not found.", { status: 404 });
    if (["PROFIT_ACTION_CENTER", "ALERT_CENTER"].includes(sourceModule)) {
      const sourceAlertKey = url.searchParams.get("sourceAlertKey") || "";
      const alert = generateProfitAlerts({
        summary: data.summary,
        rows: data.rows,
        language,
        period,
        currencyCode: data.currencyCode,
      }).find((a) => a.id === sourceAlertKey);
      if (!alert || alert.productId !== productId)
        throw new Response("Alert context is no longer available.", {
          status: 409,
        });
      const pricing = alert.id.startsWith("pricing-opportunity-");
      prefill = {
        sourceModule,
        sourceAlertKey,
        productId,
        productTitle: row.productTitle,
        actionType: pricing ? "PRICE_CHANGE" : "PRODUCT_ACTION",
        title: alert.title,
        changeDescription: alert.description,
        previousValue: pricing ? (alert.metadata?.currentPrice ?? null) : null,
        appliedValue: pricing ? (alert.metadata?.targetPrice ?? null) : null,
        targetValue: pricing ? (alert.metadata?.targetPrice ?? null) : null,
        sourcePeriod: period,
      };
    } else if (sourceModule === "RECOVERY_SIMULATOR") {
      const actionType =
        url.searchParams.get("actionType") === "COGS_CHANGE"
          ? "COGS_CHANGE"
          : "PRICE_CHANGE";
      const sourceAlertKey =
        url.searchParams.get("sourceAlertKey") ||
        `recovery:${productId}:${actionType}`;
      prefill = {
        sourceModule,
        sourceAlertKey,
        productId,
        productTitle: row.productTitle,
        actionType,
        title: url.searchParams.get("title") || row.productTitle,
        changeDescription:
          url.searchParams.get("description") || row.suggestion,
        previousValue:
          actionType === "COGS_CHANGE" ? row.avgCost : row.avgPrice,
        appliedValue: url.searchParams.get("appliedValue") || row.targetPrice,
        targetValue: url.searchParams.get("targetValue") || row.targetPrice,
        sourcePeriod: period,
      };
    }
  }
  if (prefill?.sourceAlertKey) {
    const existing = actions.find(
      (action) =>
        action.sourceAlertKey === prefill?.sourceAlertKey &&
        action.status !== "CANCELLED",
    );
    if (existing) {
      selectedAction = existing;
      prefill = null;
    }
  }
  return {
    growthAccess: true,
    actions,
    selectedAction,
    prefill,
    summary: aggregateProfitImpact(actions),
    reminders: getProfitImpactReminders(actions),
    idempotencyKey: url.searchParams.get("intentKey") || randomUUID(),
  };
}

export async function action({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);
  const billing = await getBillingStatus(admin);
  if (!hasGrowthAccess(billing))
    return Response.json(
      { ok: false, error: "growth_required" },
      { status: 403 },
    );
  const form = await request.formData();
  const intent = txt(form, "intent");
  const language = getRequestLanguage(request);
  const locale = getLanguageLocale(language);
  try {
    if (intent === "create") {
      const sourceModule = txt(form, "sourceModule");
      const productId = txt(form, "productId");
      const period = txt(form, "period") || "30";
      const data = await context(admin, session, billing, locale, period);
      const row = data.rows.find((r) => r.productId === productId);
      if (!row)
        throw new Response("Product context not found.", { status: 404 });
      let sourceAlertKey = txt(form, "sourceAlertKey") || null;
      let actionType = txt(form, "actionType");
      let title = txt(form, "title");
      let description = txt(form, "changeDescription");
      let previousValue = num(form, "previousValue");
      if (["PROFIT_ACTION_CENTER", "ALERT_CENTER"].includes(sourceModule)) {
        const alert = generateProfitAlerts({
          summary: data.summary,
          rows: data.rows,
          language,
          period,
          currencyCode: data.currencyCode,
        }).find((a) => a.id === sourceAlertKey);
        if (!alert || alert.productId !== productId)
          throw new Response("Alert context is no longer available.", {
            status: 409,
          });
        title = alert.title;
        description = alert.description;
        actionType = alert.id.startsWith("pricing-opportunity-")
          ? "PRICE_CHANGE"
          : "PRODUCT_ACTION";
        previousValue =
          actionType === "PRICE_CHANGE"
            ? (alert.metadata?.currentPrice ?? null)
            : null;
      } else if (sourceModule !== "RECOVERY_SIMULATOR")
        throw new Response("Unsupported source module.", { status: 400 });
      const created = await createProfitImpactAction({
        shop: session.shop,
        idempotencyKey: txt(form, "idempotencyKey"),
        actionType,
        sourceModule,
        sourceAlertKey,
        productId: row.productId,
        productTitle: row.productTitle,
        title,
        changeDescription: description,
        currencyCode: data.currencyCode,
        previousValue,
        appliedValue: num(form, "appliedValue"),
        targetValue: num(form, "targetValue"),
        notes: txt(form, "notes") || null,
        metadata: { sourcePeriod: period },
        eventSource: "merchant",
      });
      if (created.status === "ACCEPTED")
        await transitionProfitImpactAction({
          shop: session.shop,
          actionId: created.id,
          toStatus: "AWAITING_APPLICATION",
          source: "merchant",
        });
      return redirect(
        `/app/profit-impact?actionId=${encodeURIComponent(created.id)}&lang=${language}`,
      );
    }
    if (intent === "apply") {
      const actionId = txt(form, "actionId");
      const tracked = await getProfitImpactActionForShop({
        shop: session.shop,
        actionId,
      });
      if (!tracked?.productId)
        throw new Response("This action requires a product baseline.", {
          status: 409,
        });
      const captured = await captureProductProfitImpactBaseline({
        admin,
        session,
        productId: tracked.productId,
        locale,
        billingStatus: billing,
      });
      await startProfitImpactMeasurement({
        shop: session.shop,
        actionId,
        appliedAt: captured.window.appliedAt,
        measurementEnd: captured.window.measurementEnd,
        baseline: captured.baseline,
        source: "merchant",
      });
      return redirect(
        `/app/profit-impact?actionId=${encodeURIComponent(actionId)}&lang=${language}`,
      );
    }
    if (intent === "cancel") {
      await cancelProfitImpactAction({
        shop: session.shop,
        actionId: txt(form, "actionId"),
        source: "merchant",
      });
      return redirect(`/app/profit-impact?lang=${language}`);
    }
    throw new Response("Unsupported action.", { status: 400 });
  } catch (error) {
    if (error instanceof Response)
      return Response.json(
        { ok: false, error: await error.text() },
        { status: error.status },
      );
    throw error;
  }
}

function Results({ action, copy, locale, detail = false }: any) {
  const baseline = action.measurements.find(
    (m: any) => m.measurementType === "BASELINE",
  );
  const result = resultMeasurement(action);
  const money = (v: number | null) =>
    v == null ? "—" : uiMoney(v, action.currencyCode, locale);
  if (!baseline && !result) return null;
  return (
    <div className="impact-measurement">
      {baseline ? (
        <div className="impact-compare">
          <div>
            <small>{copy.baseline}</small>
            <strong>{money(baseline.economicProfit)}</strong>
            <span>
              {money(baseline.revenue)} ·{" "}
              {baseline.economicMarginPct.toFixed(1)}% ·{" "}
              {baseline.units.toFixed(0)} {copy.units}
            </span>
          </div>
          {result ? (
            <div>
              <small>{copy.postAction}</small>
              <strong>{money(result.economicProfit)}</strong>
              <span>
                {money(result.revenue)} · {result.economicMarginPct.toFixed(1)}%
                · {result.units.toFixed(0)} {copy.units}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      {result ? (
        <div className="impact-result-grid">
          <span>
            {copy.measuredProfitChange}
            <strong>{money(result.measuredProfitChange)}</strong>
          </span>
          <span>
            {copy.measuredMarginChange}
            <strong>{result.measuredMarginChange?.toFixed(1) ?? "—"} pp</strong>
          </span>
          <span>
            {copy.estimatedAttributableImpact}
            <strong>{money(result.estimatedAttributableImpact)}</strong>
          </span>
          <span>
            {copy.dataConfidence}
            <strong>{result.dataConfidenceScore}/100</strong>
          </span>
          <span>
            {copy.attributionConfidence}
            <strong>
              {result.attributionConfidenceScore == null
                ? "—"
                : `${result.attributionConfidenceScore}/100`}
            </strong>
          </span>
        </div>
      ) : null}
      {detail && result ? (
        <>
          <p className="impact-method">{copy.methodologyStatement}</p>
          <p>
            {copy.attributionMethod}:{" "}
            {result.attributionMethod || copy.notEstimated}
          </p>
          {json(result.confidenceReasonsJson).length ? (
            <p>
              {copy.confidenceReasons}:{" "}
              {json(result.confidenceReasonsJson).join(", ")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function statusTone(status: string): VisualTone {
  if (status === "COMPLETED") return "green";
  if (status === "MEASURING") return "cyan";
  if (status === "INSUFFICIENT_DATA" || status === "INVALIDATED")
    return "amber";
  if (status === "CANCELLED") return "red";
  return "orange";
}

function Card({ action, copy, locale, open }: any) {
  const result = resultMeasurement(action);
  const progress = Math.min(
    100,
    ((result?.observedDays ?? 0) / action.measurementWindowDays) * 100,
  );
  return (
    <PremiumPanel
      as="article"
      className="impact-card"
      tone={statusTone(action.status)}
      interactive
    >
      <div className="impact-card-head">
        <div>
          <div className="panel-eyebrow">
            {action.productTitle || copy.storeAction}
          </div>
          <h3>{action.title}</h3>
          <div className="impact-card-meta">
            <span>{copy[action.actionType]}</span>
            <small>{copy[action.sourceModule]}</small>
          </div>
        </div>
        <StatusChip
          tone={statusTone(action.status)}
          pulse={action.status === "MEASURING"}
          className={`impact-status status-${action.status.toLowerCase()}`}
        >
          {copy[action.status]}
        </StatusChip>
      </div>
      {action.appliedAt ? (
        <p>
          {copy.appliedDate}:{" "}
          {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
            new Date(action.appliedAt),
          )}
        </p>
      ) : null}
      {action.status === "MEASURING" ? (
        <>
          <div className="impact-progress">
            <i style={{ width: `${progress}%` }} />
          </div>
          <small>
            {result?.observedDays ?? 0}/{action.measurementWindowDays}{" "}
            {copy.daysObserved}
          </small>
        </>
      ) : null}
      <Results action={action} copy={copy} locale={locale} />
      {result ? (
        <div className="impact-confidence-row">
          <span className="impact-confidence-data">
            <i /> {copy.dataConfidence}{" "}
            <strong>{result.dataConfidenceScore}/100</strong>
          </span>
          <span
            className={`impact-confidence-attribution confidence-${String(result.confidenceLevel).toLowerCase()}`}
          >
            <i /> {copy.attributionConfidence}{" "}
            <strong>
              {result.attributionConfidenceScore == null
                ? "—"
                : `${result.attributionConfidenceScore}/100`}
            </strong>
          </span>
        </div>
      ) : null}
      {result?.confidenceLevel === "LOW" ? (
        <p className="impact-warning">{copy.lowConfidenceWarning}</p>
      ) : null}
      <div className="impact-actions">
        <VisualButton variant="secondary" onClick={() => open(action.id)}>
          {action.status === "MEASURING"
            ? copy.viewMeasurement
            : action.status === "COMPLETED"
              ? copy.viewMeasuredImpact
              : copy.openTrackedAction}
        </VisualButton>
        {action.status === "AWAITING_APPLICATION" ? (
          <Form method="post">
            <input type="hidden" name="intent" value="apply" />
            <input type="hidden" name="actionId" value={action.id} />
            <VisualButton type="submit">{copy.markApplied}</VisualButton>
          </Form>
        ) : null}
        {["ACCEPTED", "AWAITING_APPLICATION"].includes(action.status) ? (
          <Form method="post">
            <input type="hidden" name="intent" value="cancel" />
            <input type="hidden" name="actionId" value={action.id} />
            <VisualButton type="submit" variant="ghost">
              {copy.cancel}
            </VisualButton>
          </Form>
        ) : null}
      </div>
    </PremiumPanel>
  );
}

export default function ProfitImpactPage() {
  const data = useLoaderData() as any;
  const actionData = useActionData() as any;
  const navigate = useNavigate();
  const { messages, locale, language } = useI18n() as any;
  const copy = messages.profitImpactPage;
  const [tab, setTab] = React.useState("active");
  const visible = data.actions.filter(
    (a: any) => classifyProfitImpactAction(a.status) === tab,
  );
  const open = (id: string) =>
    navigate(
      `/app/profit-impact?actionId=${encodeURIComponent(id)}&lang=${language}`,
    );
  const currency = data.actions[0]?.currencyCode || "USD";
  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="profit-impact" navigate={navigate} />
        <PremiumHero
          className="impact-hero"
          eyebrow={
            <GrowthHeroEyebrow
              active={data.growthAccess}
              status={
                data.growthAccess
                  ? messages.alertCenterPage.growth_plan_active
                  : messages.alertCenterPage.growth_feature
              }
            >
              {copy.eyebrow}
            </GrowthHeroEyebrow>
          }
          title="Profit Impact Tracker"
          description={copy.description}
          actions={
            <>
              <VisualButton
                size="large"
                className="impact-hero-cta"
                leading="＋"
                onClick={() => navigate("/app/recommendations")}
              >
                {copy.trackAction}
              </VisualButton>
              <TaxAwareBadge>
                {messages.productsPage.taxAwareBasis}
              </TaxAwareBadge>
            </>
          }
          visual={
            <aside className="impact-hero-guide" aria-label={copy.trustTitle}>
              <div className="impact-guide-orbit" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <ol>
                <li>
                  <span>01</span>
                  <strong>{copy.trackAction}</strong>
                </li>
                <li>
                  <span>02</span>
                  <strong>{copy.MEASURING}</strong>
                </li>
                <li>
                  <span>03</span>
                  <strong>{copy.trustTitle}</strong>
                </li>
              </ol>
            </aside>
          }
        />
        {!data.growthAccess ? (
          <PremiumPanel tone="orange">
            <h2>{copy.growthRequired}</h2>
            <p>{copy.previewExplanation}</p>
            <VisualButton onClick={() => navigate("/app/billing")}>
              {copy.upgrade}
            </VisualButton>
          </PremiumPanel>
        ) : (
          <>
            {actionData?.error ? (
              <FeedbackState tone="red">{actionData.error}</FeedbackState>
            ) : null}
            <section
              className="impact-methodology-strip"
              aria-label={copy.methodologyStatement}
            >
              <div>
                <span className="impact-method-icon">◫</span>
                <small>14d</small>
                <strong>{copy.baseline}</strong>
              </div>
              <i>→</i>
              <div>
                <span className="impact-method-icon">✓</span>
                <small>0d</small>
                <strong>{copy.markApplied}</strong>
              </div>
              <i>→</i>
              <div>
                <span className="impact-method-icon">◔</span>
                <small>7d</small>
                <strong>{copy.MEASURING}</strong>
              </div>
              <i>→</i>
              <div>
                <span className="impact-method-icon">◆</span>
                <small>14d</small>
                <strong>{copy.COMPLETED}</strong>
              </div>
            </section>
            {data.reminders?.length ? (
              <section className="impact-list" style={{ marginBottom: 16 }}>
                {data.reminders.map((reminder: any) => {
                  const tracked = data.actions.find(
                    (item: any) => item.id === reminder.actionId,
                  );
                  return (
                    <button
                      key={`${reminder.actionId}:${reminder.kind}`}
                      className="impact-warning"
                      onClick={() => open(reminder.actionId)}
                    >
                      {reminder.kind === "completed"
                        ? copy.reminderCompleted
                        : reminder.kind === "measurement_due"
                          ? copy.reminderMeasurementDue
                          : copy.reminderAwaiting}{" "}
                      {tracked?.title}
                    </button>
                  );
                })}
              </section>
            ) : null}
            <ResponsiveGrid columns={5} className="impact-kpis">
              {[
                [copy.actionsMeasuring, data.summary.actionsMeasuring],
                [copy.actionsCompleted, data.summary.actionsCompleted],
                [
                  copy.measuredProfitChange,
                  uiMoney(data.summary.measuredProfitChange, currency, locale),
                ],
                [
                  copy.estimatedAttributableProfit,
                  data.summary.estimatedAttributableProfit == null
                    ? "—"
                    : uiMoney(
                        data.summary.estimatedAttributableProfit,
                        currency,
                        locale,
                      ),
                ],
                [
                  copy.averageMarginLift,
                  data.summary.averageMarginLift == null
                    ? "—"
                    : `${data.summary.averageMarginLift.toFixed(1)} pp`,
                ],
              ].map(([l, v], index) => (
                <MetricCard
                  className={`impact-kpi impact-kpi-${index + 1}`}
                  key={l}
                  density="compact"
                  tone={
                    (index === 0
                      ? "cyan"
                      : index === 1
                        ? "green"
                        : index === 2
                          ? "blue"
                          : index === 3
                            ? "violet"
                            : "green") as VisualTone
                  }
                  icon={["◔", "✓", "↗", "◇", "⌁"][index]}
                  label={l}
                  value={
                    <span className={v === "—" || v === 0 ? "is-zero" : ""}>
                      {v}
                    </span>
                  }
                />
              ))}
            </ResponsiveGrid>
            {data.summary.lowConfidenceCompleted ? (
              <p className="impact-warning">
                {data.summary.lowConfidenceCompleted}{" "}
                {copy.lowConfidenceIncluded}
              </p>
            ) : null}
            {data.prefill ? (
              <Form
                method="post"
                className="ml-v2-panel ml-v2-tone-orange impact-create"
              >
                <input type="hidden" name="intent" value="create" />
                <input
                  type="hidden"
                  name="idempotencyKey"
                  value={data.idempotencyKey}
                />
                {[
                  "sourceModule",
                  "sourceAlertKey",
                  "productId",
                  "sourcePeriod",
                  "actionType",
                ].map((n) => (
                  <input
                    key={n}
                    type="hidden"
                    name={n === "sourcePeriod" ? "period" : n}
                    value={data.prefill[n] ?? ""}
                  />
                ))}
                <h2>{copy.confirmAction}</h2>
                <ControlField label={copy.product}>
                  <VisualInput value={data.prefill.productTitle} readOnly />
                </ControlField>
                <ControlField label={copy.title} htmlFor="impact-title">
                  <VisualInput
                    id="impact-title"
                    name="title"
                    defaultValue={data.prefill.title}
                  />
                </ControlField>
                <ControlField
                  label={copy.descriptionLabel}
                  htmlFor="impact-description"
                >
                  <VisualTextarea
                    id="impact-description"
                    name="changeDescription"
                    defaultValue={data.prefill.changeDescription}
                  />
                </ControlField>
                <ControlField
                  label={copy.previousValue}
                  htmlFor="impact-previous-value"
                >
                  <VisualInput
                    id="impact-previous-value"
                    name="previousValue"
                    type="number"
                    step="any"
                    defaultValue={data.prefill.previousValue ?? ""}
                  />
                </ControlField>
                <ControlField
                  label={copy.appliedValue}
                  htmlFor="impact-applied-value"
                >
                  <VisualInput
                    id="impact-applied-value"
                    name="appliedValue"
                    type="number"
                    step="any"
                    defaultValue={data.prefill.appliedValue ?? ""}
                  />
                </ControlField>
                <input
                  name="targetValue"
                  type="hidden"
                  value={data.prefill.targetValue ?? ""}
                />
                <VisualButton type="submit">{copy.confirmAction}</VisualButton>
              </Form>
            ) : null}
            {data.selectedAction ? (
              <PremiumPanel className="impact-detail" tone="blue">
                <VisualButton
                  variant="ghost"
                  onClick={() =>
                    navigate(`/app/profit-impact?lang=${language}`)
                  }
                >
                  {copy.close}
                </VisualButton>
                <div className="panel-eyebrow">{copy.actionDetail}</div>
                <h2>{data.selectedAction.title}</h2>
                <p>{data.selectedAction.changeDescription}</p>
                <div className="impact-detail-grid">
                  <span>
                    {copy.source}
                    <strong>{copy[data.selectedAction.sourceModule]}</strong>
                  </span>
                  <span>
                    {copy.actionType}
                    <strong>{copy[data.selectedAction.actionType]}</strong>
                  </span>
                  <span>
                    {copy.previousValue}
                    <strong>{data.selectedAction.previousValue ?? "—"}</strong>
                  </span>
                  <span>
                    {copy.appliedValue}
                    <strong>{data.selectedAction.appliedValue ?? "—"}</strong>
                  </span>
                </div>
                <Results
                  action={data.selectedAction}
                  copy={copy}
                  locale={locale}
                  detail
                />
                <h3>{copy.timeline}</h3>
                <ol className="impact-timeline">
                  {data.selectedAction.events.map((e: any) => (
                    <li key={e.id}>
                      <strong>{copy[e.toStatus]}</strong>
                      <span>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(e.createdAt))}{" "}
                        · {e.source}
                      </span>
                      {e.note ? <p>{e.note}</p> : null}
                    </li>
                  ))}
                </ol>
              </PremiumPanel>
            ) : null}
            <SegmentedTabs
              className="impact-tabs"
              ariaLabel={copy.eyebrow}
              activeId={tab}
              onChange={setTab}
              tabs={[
                { id: "active", label: copy.active },
                { id: "completed", label: copy.completed },
                { id: "attention", label: copy.needsAttention },
              ].map((item) => ({
                ...item,
                count: data.actions.filter(
                  (a: any) => classifyProfitImpactAction(a.status) === item.id,
                ).length,
              }))}
            />
            <section className="impact-list">
              {visible.map((a: any) => (
                <Card
                  key={a.id}
                  action={a}
                  copy={copy}
                  locale={locale}
                  open={open}
                />
              ))}
            </section>
            {!visible.length ? (
              <PremiumEmptyState
                className="impact-empty"
                tone="orange"
                eyebrow={copy.eyebrow}
                visual={
                  <div className="impact-empty-visual" aria-hidden="true">
                    <div className="impact-radar-ring ring-1" />
                    <div className="impact-radar-ring ring-2" />
                    <div className="impact-radar-ring ring-3" />
                    <i className="impact-radar-sweep" />
                    <span className="impact-radar-dot dot-1" />
                    <span className="impact-radar-dot dot-2" />
                    <span className="impact-radar-center" />
                  </div>
                }
                title={
                  data.actions.length === 0
                    ? copy.trackAction
                    : tab === "completed"
                      ? copy.completed
                      : tab === "attention"
                        ? copy.needsAttention
                        : copy.active
                }
                description={
                  data.actions.length === 0
                    ? copy.noActions
                    : tab === "completed"
                      ? copy.noCompleted
                      : tab === "attention"
                        ? copy.noAttention
                        : copy.noActive
                }
                steps={[
                  copy.trackAction,
                  copy.MEASURING,
                  copy.viewMeasuredImpact,
                ]}
                action={
                  data.actions.length === 0 ? (
                    <VisualButton
                      onClick={() => navigate("/app/recommendations")}
                      trailing="→"
                    >
                      {copy.trackAction}
                    </VisualButton>
                  ) : undefined
                }
              />
            ) : null}
            <PremiumPanel className="impact-trust" tone="neutral">
              <div className="impact-trust-heading">
                <div className="panel-eyebrow">{copy.methodologyStatement}</div>
                <h2>{copy.trustTitle}</h2>
              </div>
              <div>
                <p className="impact-trust-measured">
                  <span>↗</span>
                  <strong>{copy.measuredChange}</strong>
                  {copy.measuredChangeDefinition}
                </p>
                <p className="impact-trust-attribution">
                  <span>◇</span>
                  <strong>{copy.estimatedAttributableImpact}</strong>
                  {copy.attributableDefinition}
                </p>
                <p className="impact-trust-data">
                  <span>▦</span>
                  <strong>{copy.dataConfidence}</strong>
                  {copy.dataConfidenceDefinition}
                </p>
                <p className="impact-trust-confidence">
                  <span>◎</span>
                  <strong>{copy.attributionConfidence}</strong>
                  {copy.attributionConfidenceDefinition}
                </p>
              </div>
            </PremiumPanel>

            <PremiumPanel className="impact-explainer impact-how" tone="orange">
              <div className="impact-explainer-heading">
                <div className="panel-eyebrow">{copy.howItWorksTitle}</div>
                <h2>{copy.howItWorksTitle}</h2>
                <p>{copy.howItWorksIntro}</p>
              </div>
              <div className="impact-workflow">
                {[
                  {
                    step: "01",
                    title: copy.baseline,
                    description: copy.baselineStageDescription,
                    duration: copy.dayFourteen,
                    tone: "orange",
                  },
                  {
                    step: "02",
                    title: copy.markApplied,
                    description: copy.appliedStageDescription,
                    duration: copy.dayZero,
                    tone: "blue",
                  },
                  {
                    step: "03",
                    title: copy.MEASURING,
                    description: copy.measuringStageDescription,
                    duration: copy.daySeven,
                    tone: "cyan",
                  },
                  {
                    step: "04",
                    title: copy.COMPLETED,
                    description: copy.completedStageDescription,
                    duration: copy.dayFourteen,
                    tone: "green",
                  },
                ].map((stage) => (
                  <article
                    key={stage.step}
                    className={`impact-workflow-stage is-${stage.tone}`}
                  >
                    <div>
                      <span>{stage.step}</span>
                      <small>{stage.duration}</small>
                    </div>
                    <strong>{stage.title}</strong>
                    <p>{stage.description}</p>
                  </article>
                ))}
              </div>
            </PremiumPanel>

            <PremiumPanel
              className="impact-explainer impact-measures"
              tone="cyan"
            >
              <div className="impact-explainer-heading">
                <div className="panel-eyebrow">{copy.whatMeasuresTitle}</div>
                <h2>{copy.whatMeasuresTitle}</h2>
                <p>{copy.whatMeasuresIntro}</p>
              </div>
              <div className="impact-measure-chain">
                <article className="is-margin">
                  <span>⌁</span>
                  <small>{copy.measuredMarginChange}</small>
                  <strong>
                    {data.summary.averageMarginLift == null
                      ? "—"
                      : `${data.summary.averageMarginLift.toFixed(1)} pp`}
                  </strong>
                  <p>{copy.marginMeasureDescription}</p>
                </article>
                <article className="is-profit">
                  <span>↗</span>
                  <small>{copy.measuredProfitChange}</small>
                  <strong>
                    {uiMoney(
                      data.summary.measuredProfitChange,
                      currency,
                      locale,
                    )}
                  </strong>
                  <p>{copy.measuredChangeDefinition}</p>
                </article>
                <article className="is-attribution">
                  <span>◇</span>
                  <small>{copy.estimatedAttributableImpact}</small>
                  <strong>
                    {data.summary.estimatedAttributableProfit == null
                      ? copy.notEstimated
                      : uiMoney(
                          data.summary.estimatedAttributableProfit,
                          currency,
                          locale,
                        )}
                  </strong>
                  <p>{copy.attributableDefinition}</p>
                </article>
              </div>
            </PremiumPanel>

            <PremiumPanel
              className="impact-explainer impact-journey"
              tone="blue"
            >
              <div className="impact-explainer-heading">
                <div className="panel-eyebrow">{copy.journeyTitle}</div>
                <h2>{copy.journeyTitle}</h2>
                <p>{copy.journeyIntro}</p>
              </div>
              <div className="impact-journey-visual">
                <FlowPath
                  tone="orange"
                  trajectory="rising"
                  label={copy.journeyTitle}
                  nodes={[
                    {
                      id: "signal",
                      progress: 0.04,
                      tone: "orange",
                      label: copy.signalDetected,
                    },
                    {
                      id: "action",
                      progress: 0.34,
                      tone: "blue",
                      label: copy.journeyAction,
                    },
                    {
                      id: "measurement",
                      progress: 0.66,
                      tone: "violet",
                      label: copy.journeyMeasurement,
                    },
                    {
                      id: "evidence",
                      progress: 0.96,
                      tone: "green",
                      emphasis: "strong",
                      label: copy.journeyEvidence,
                    },
                  ]}
                />
                <div className="impact-journey-stages">
                  {[
                    [copy.signalDetected, copy.signalDetectedDescription],
                    [copy.journeyAction, copy.actionSelectedDescription],
                    [
                      copy.journeyMeasurement,
                      copy.measurementJourneyDescription,
                    ],
                    [copy.journeyEvidence, copy.resultDescription],
                  ].map(([title, description]) => (
                    <span key={title}>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                  ))}
                </div>
              </div>
            </PremiumPanel>
          </>
        )}
      </div>
    </div>
  );
}
