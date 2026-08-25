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
  createProfitImpactAction,
  getProfitImpactActionForShop,
  listProfitImpactActionsForShop,
  startProfitImpactMeasurement,
  transitionProfitImpactAction,
} from "~/services/profit-impact.server";
import { captureProductProfitImpactBaseline } from "~/services/profit-impact-baseline.server";
import { authenticate } from "~/shopify.server";
import { getBillingStatus, hasGrowthAccess } from "~/utils/billing.server";
import { getLanguageLocale } from "~/utils/i18n";
import { getRequestLanguage } from "~/utils/i18n.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { generateProfitAlerts } from "~/utils/profit-monitor";

import "~/styles/dashboard.css";

function text(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function optionalNumber(formData: FormData, field: string) {
  const raw = text(formData, field);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Response(`${field} must be a number.`, { status: 400 });
  }
  return value;
}

async function loadProductContext({
  admin,
  session,
  billing,
  locale,
  period,
}: {
  admin: any;
  session: any;
  billing: any;
  locale: string;
  period: string;
}) {
  return loadMarginDashboardData({
    admin,
    session,
    billingStatus: billing,
    locale,
    period,
  });
}

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);
  const billing = await getBillingStatus(admin);
  const growthAccess = hasGrowthAccess(billing);
  if (!growthAccess) {
    return { growthAccess: false, actions: [], prefill: null };
  }

  const url = new URL(request.url);
  const actionId = url.searchParams.get("actionId");
  const selectedAction = actionId
    ? await getProfitImpactActionForShop({ shop: session.shop, actionId })
    : null;
  const actions = await listProfitImpactActionsForShop({ shop: session.shop });
  const sourceModule = url.searchParams.get("sourceModule");
  const productId = url.searchParams.get("productId");
  const period = url.searchParams.get("period") || "30";
  let prefill: Record<string, string | number | null> | null = null;

  if (sourceModule && productId) {
    const language = getRequestLanguage(request);
    const locale = getLanguageLocale(language);
    const data = await loadProductContext({ admin, session, billing, locale, period });
    const row = data.rows.find((candidate) => candidate.productId === productId);
    if (!row) throw new Response("Product context not found.", { status: 404 });

    if (sourceModule === "PROFIT_ACTION_CENTER") {
      const sourceAlertKey = url.searchParams.get("sourceAlertKey") || "";
      const alert = generateProfitAlerts({
        summary: data.summary,
        rows: data.rows,
        language,
        period,
        currencyCode: data.currencyCode,
      }).find((candidate) => candidate.id === sourceAlertKey);
      if (!alert || alert.productId !== productId) {
        throw new Response("Recommendation context is no longer available.", {
          status: 409,
        });
      }
      const isPricing = alert.id.startsWith("pricing-opportunity-");
      prefill = {
        sourceModule,
        sourceAlertKey: alert.id,
        productId,
        productTitle: row.productTitle,
        actionType: isPricing ? "PRICE_CHANGE" : "PRODUCT_ACTION",
        title: alert.title,
        changeDescription: alert.description,
        previousValue: isPricing ? alert.metadata?.currentPrice ?? null : null,
        appliedValue: isPricing ? alert.metadata?.targetPrice ?? null : null,
        targetValue: isPricing ? alert.metadata?.targetPrice ?? null : null,
        currencyCode: data.currencyCode,
        sourcePeriod: period,
      };
    } else if (sourceModule === "RECOVERY_SIMULATOR") {
      const actionType = url.searchParams.get("actionType") === "COGS_CHANGE"
        ? "COGS_CHANGE"
        : "PRICE_CHANGE";
      prefill = {
        sourceModule,
        sourceAlertKey: null,
        productId,
        productTitle: row.productTitle,
        actionType,
        title: url.searchParams.get("title") || row.productTitle,
        changeDescription: url.searchParams.get("description") || row.suggestion,
        previousValue: actionType === "COGS_CHANGE" ? row.avgCost : row.avgPrice,
        appliedValue: url.searchParams.get("appliedValue") || row.targetPrice,
        targetValue: url.searchParams.get("targetValue") || row.targetPrice,
        currentPrice: row.avgPrice,
        currentCost: row.avgCost,
        simulatedPrice: url.searchParams.get("simulatedPrice"),
        simulatedCost: url.searchParams.get("simulatedCost"),
        currencyCode: data.currencyCode,
        sourcePeriod: period,
      };
    }
  }

  return {
    growthAccess: true,
    actions,
    selectedAction,
    prefill,
    idempotencyKey: url.searchParams.get("intentKey") || randomUUID(),
  };
}

export async function action({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);
  const billing = await getBillingStatus(admin);
  if (!hasGrowthAccess(billing)) {
    return Response.json({ ok: false, error: "growth_required" }, { status: 403 });
  }
  const formData = await request.formData();
  const intent = text(formData, "intent");
  const language = getRequestLanguage(request);
  const locale = getLanguageLocale(language);

  try {
    if (intent === "create") {
      const sourceModule = text(formData, "sourceModule");
      const productId = text(formData, "productId");
      const period = text(formData, "period") || "30";
      const data = await loadProductContext({ admin, session, billing, locale, period });
      const row = data.rows.find((candidate) => candidate.productId === productId);
      if (!row && text(formData, "actionType") !== "OTHER") {
        throw new Response("Product context not found.", { status: 404 });
      }

      let sourceAlertKey: string | null = null;
      let authoritativeTitle = text(formData, "title");
      let authoritativeDescription = text(formData, "changeDescription");
      let actionType = text(formData, "actionType");
      let previousValue = optionalNumber(formData, "previousValue");
      let appliedValue = optionalNumber(formData, "appliedValue");
      const targetValue = optionalNumber(formData, "targetValue");

      if (sourceModule === "PROFIT_ACTION_CENTER") {
        sourceAlertKey = text(formData, "sourceAlertKey");
        const alert = generateProfitAlerts({
          summary: data.summary,
          rows: data.rows,
          language,
          period,
          currencyCode: data.currencyCode,
        }).find((candidate) => candidate.id === sourceAlertKey);
        if (!alert || alert.productId !== productId) {
          throw new Response("Recommendation context is no longer available.", { status: 409 });
        }
        authoritativeTitle = alert.title;
        authoritativeDescription = alert.description;
        if (alert.id.startsWith("pricing-opportunity-")) {
          actionType = "PRICE_CHANGE";
          previousValue = alert.metadata?.currentPrice ?? null;
          appliedValue = optionalNumber(formData, "appliedValue");
        } else {
          actionType = "PRODUCT_ACTION";
          previousValue = null;
          appliedValue = null;
        }
      } else if (sourceModule === "RECOVERY_SIMULATOR") {
        if (!row) throw new Response("Product context not found.", { status: 404 });
        if (actionType === "PRICE_CHANGE") {
          previousValue = row.avgPrice;
        } else if (actionType === "COGS_CHANGE") {
          previousValue = row.avgCost;
        } else {
          throw new Response("Recovery Simulator supports price or COGS tracking.", { status: 400 });
        }
      } else {
        throw new Response("Unsupported source module.", { status: 400 });
      }

      const created = await createProfitImpactAction({
        shop: session.shop,
        idempotencyKey: text(formData, "idempotencyKey"),
        actionType,
        sourceModule,
        sourceAlertKey,
        productId: row?.productId ?? null,
        productTitle: row?.productTitle ?? null,
        title: authoritativeTitle,
        changeDescription: authoritativeDescription,
        currencyCode: data.currencyCode,
        previousValue,
        appliedValue,
        targetValue,
        notes: text(formData, "notes") || null,
        metadata: { sourcePeriod: period },
        eventSource: "merchant",
      });
      if (created.status === "ACCEPTED") {
        try {
          await transitionProfitImpactAction({
            shop: session.shop,
            actionId: created.id,
            toStatus: "AWAITING_APPLICATION",
            source: "merchant",
          });
        } catch (error) {
          const current = await getProfitImpactActionForShop({
            shop: session.shop,
            actionId: created.id,
          });
          if (current?.status !== "AWAITING_APPLICATION") throw error;
        }
      }
      return redirect(`/app/profit-impact?actionId=${encodeURIComponent(created.id)}&lang=${language}`);
    }

    if (intent === "apply") {
      const actionId = text(formData, "actionId");
      const trackedAction = await getProfitImpactActionForShop({
        shop: session.shop,
        actionId,
      });
      if (!trackedAction?.productId) {
        throw new Response("This action requires a product baseline.", { status: 409 });
      }
      const captured = await captureProductProfitImpactBaseline({
        admin,
        session,
        productId: trackedAction.productId,
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
      return redirect(`/app/profit-impact?actionId=${encodeURIComponent(actionId)}&lang=${language}`);
    }
    throw new Response("Unsupported action.", { status: 400 });
  } catch (error) {
    if (error instanceof Response) {
      return Response.json(
        { ok: false, error: await error.text() },
        { status: error.status },
      );
    }
    throw error;
  }
}

export default function ProfitImpactPage() {
  const data = useLoaderData() as any;
  const actionData = useActionData() as { error?: string } | undefined;
  const navigate = useNavigate();
  const { messages } = useI18n();
  const copy = messages.profitImpactPage;
  const prefill = data.prefill;
  const selected = data.selectedAction;

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="profit-impact" navigate={navigate} />
        <div className="hero-header">
          <div>
            <div className="eyebrow">{copy.eyebrow}</div>
            <h1 className="hero-title">Profit Impact Tracker</h1>
            <p className="hero-description">{copy.description}</p>
          </div>
        </div>

        {!data.growthAccess ? (
          <section className="panel">
            <h2 className="panel-title">{copy.growthRequired}</h2>
            <button className="primary-button" onClick={() => navigate("/app/billing")}>{copy.upgrade}</button>
          </section>
        ) : (
          <>
            {actionData?.error ? <div className="error-banner">{actionData.error}</div> : null}
            {prefill ? (
              <Form method="post" className="panel" style={{ display: "grid", gap: 14 }}>
                <input type="hidden" name="intent" value="create" />
                <input type="hidden" name="idempotencyKey" value={data.idempotencyKey} />
                <input type="hidden" name="sourceModule" value={prefill.sourceModule} />
                <input type="hidden" name="sourceAlertKey" value={prefill.sourceAlertKey ?? ""} />
                <input type="hidden" name="productId" value={prefill.productId} />
                <input type="hidden" name="period" value={prefill.sourcePeriod} />
                <input type="hidden" name="actionType" value={prefill.actionType} />
                <label>{copy.actionType}<input value={
                  prefill.actionType === "PRICE_CHANGE"
                    ? copy.priceChange
                    : prefill.actionType === "COGS_CHANGE"
                      ? copy.cogsChange
                      : copy.productAction
                } readOnly /></label>
                <label>{copy.product}<input value={prefill.productTitle} readOnly /></label>
                <label>{copy.title}<input name="title" defaultValue={prefill.title} required /></label>
                <label>{copy.descriptionLabel}<textarea name="changeDescription" defaultValue={prefill.changeDescription} required /></label>
                <label>{copy.previousValue}<input name="previousValue" type="number" step="any" defaultValue={prefill.previousValue ?? ""} /></label>
                <label>{copy.appliedValue}<input name="appliedValue" type="number" step="any" defaultValue={prefill.appliedValue ?? ""} /></label>
                <label>{copy.targetValue}<input name="targetValue" type="number" step="any" defaultValue={prefill.targetValue ?? ""} /></label>
                <label>{copy.notes}<textarea name="notes" /></label>
                <button className="primary-button" type="submit">{copy.trackAction}</button>
              </Form>
            ) : null}

            {selected ? (
              <section className="panel" style={{ marginTop: 20 }}>
                <div className="panel-eyebrow">{copy.status}</div>
                <h2 className="panel-title">{selected.title}</h2>
                <p>{selected.changeDescription}</p>
                <strong>{copy[selected.status as keyof typeof copy] ?? selected.status}</strong>
                {selected.status === "AWAITING_APPLICATION" ? (
                  <Form method="post" style={{ marginTop: 18 }}>
                    <input type="hidden" name="intent" value="apply" />
                    <input type="hidden" name="actionId" value={selected.id} />
                    <button className="primary-button" type="submit">{copy.markApplied}</button>
                  </Form>
                ) : null}
              </section>
            ) : null}

            {!prefill && !selected ? (
              <section className="panel"><p>{copy.empty}</p></section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
