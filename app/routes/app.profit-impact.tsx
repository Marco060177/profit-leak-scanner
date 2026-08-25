import { randomUUID } from "node:crypto";
import * as React from "react";
import { Form, redirect, useActionData, useLoaderData, useNavigate } from "react-router";
import DashboardNav from "~/components/dashboard/DashboardNav";
import { useI18n } from "~/components/i18n/I18nProvider";
import { captureProductProfitImpactBaseline } from "~/services/profit-impact-baseline.server";
import { cancelProfitImpactAction, createProfitImpactAction, getProfitImpactActionForShop, listProfitImpactActionsForShop, startProfitImpactMeasurement, transitionProfitImpactAction } from "~/services/profit-impact.server";
import { authenticate } from "~/shopify.server";
import { getBillingStatus, hasGrowthAccess } from "~/utils/billing.server";
import { getLanguageLocale } from "~/utils/i18n";
import { getRequestLanguage } from "~/utils/i18n.server";
import { uiMoney } from "~/utils/margin";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { generateProfitAlerts } from "~/utils/profit-monitor";
import { aggregateProfitImpact, classifyProfitImpactAction, resultMeasurement } from "~/utils/profit-impact-summary";
import "~/styles/dashboard.css";

const txt = (d: FormData, n: string) => String(d.get(n) ?? "").trim();
const num = (d: FormData, n: string) => { const raw = txt(d, n); if (!raw) return null; const value = Number(raw); if (!Number.isFinite(value)) throw new Response(`${n} must be a number.`, { status: 400 }); return value; };
const json = (value?: string | null) => { try { const parsed = value ? JSON.parse(value) : []; return Array.isArray(parsed) ? parsed : []; } catch { return []; } };
const context = (admin: any, session: any, billing: any, locale: string, period: string) => loadMarginDashboardData({ admin, session, billingStatus: billing, locale, period });

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request); const billing = await getBillingStatus(admin);
  if (!hasGrowthAccess(billing)) return { growthAccess: false, actions: [], selectedAction: null, prefill: null, summary: null };
  const url = new URL(request.url); const actions = await listProfitImpactActionsForShop({ shop: session.shop, take: 100 });
  let selectedAction = actions.find((a) => a.id === url.searchParams.get("actionId")) ?? null;
  const sourceModule = url.searchParams.get("sourceModule"); const productId = url.searchParams.get("productId"); const period = url.searchParams.get("period") || "30";
  let prefill: Record<string, string | number | null> | null = null;
  if (sourceModule && productId) {
    const language = getRequestLanguage(request); const data = await context(admin, session, billing, getLanguageLocale(language), period); const row = data.rows.find((r) => r.productId === productId);
    if (!row) throw new Response("Product context not found.", { status: 404 });
    if (["PROFIT_ACTION_CENTER", "ALERT_CENTER"].includes(sourceModule)) {
      const sourceAlertKey = url.searchParams.get("sourceAlertKey") || ""; const alert = generateProfitAlerts({ summary: data.summary, rows: data.rows, language, period, currencyCode: data.currencyCode }).find((a) => a.id === sourceAlertKey);
      if (!alert || alert.productId !== productId) throw new Response("Alert context is no longer available.", { status: 409 });
      const pricing = alert.id.startsWith("pricing-opportunity-"); prefill = { sourceModule, sourceAlertKey, productId, productTitle: row.productTitle, actionType: pricing ? "PRICE_CHANGE" : "PRODUCT_ACTION", title: alert.title, changeDescription: alert.description, previousValue: pricing ? alert.metadata?.currentPrice ?? null : null, appliedValue: pricing ? alert.metadata?.targetPrice ?? null : null, targetValue: pricing ? alert.metadata?.targetPrice ?? null : null, sourcePeriod: period };
    } else if (sourceModule === "RECOVERY_SIMULATOR") {
      const actionType = url.searchParams.get("actionType") === "COGS_CHANGE" ? "COGS_CHANGE" : "PRICE_CHANGE"; const sourceAlertKey = url.searchParams.get("sourceAlertKey") || `recovery:${productId}:${actionType}`; prefill = { sourceModule, sourceAlertKey, productId, productTitle: row.productTitle, actionType, title: url.searchParams.get("title") || row.productTitle, changeDescription: url.searchParams.get("description") || row.suggestion, previousValue: actionType === "COGS_CHANGE" ? row.avgCost : row.avgPrice, appliedValue: url.searchParams.get("appliedValue") || row.targetPrice, targetValue: url.searchParams.get("targetValue") || row.targetPrice, sourcePeriod: period };
    }
  }
  if (prefill?.sourceAlertKey) {
    const existing = actions.find((action) => action.sourceAlertKey === prefill?.sourceAlertKey && action.status !== "CANCELLED");
    if (existing) { selectedAction = existing; prefill = null; }
  }
  return { growthAccess: true, actions, selectedAction, prefill, summary: aggregateProfitImpact(actions), idempotencyKey: url.searchParams.get("intentKey") || randomUUID() };
}

export async function action({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request); const billing = await getBillingStatus(admin);
  if (!hasGrowthAccess(billing)) return Response.json({ ok: false, error: "growth_required" }, { status: 403 });
  const form = await request.formData(); const intent = txt(form, "intent"); const language = getRequestLanguage(request); const locale = getLanguageLocale(language);
  try {
    if (intent === "create") {
      const sourceModule = txt(form, "sourceModule"); const productId = txt(form, "productId"); const period = txt(form, "period") || "30"; const data = await context(admin, session, billing, locale, period); const row = data.rows.find((r) => r.productId === productId);
      if (!row) throw new Response("Product context not found.", { status: 404 });
      let sourceAlertKey = txt(form, "sourceAlertKey") || null; let actionType = txt(form, "actionType"); let title = txt(form, "title"); let description = txt(form, "changeDescription"); let previousValue = num(form, "previousValue");
      if (["PROFIT_ACTION_CENTER", "ALERT_CENTER"].includes(sourceModule)) { const alert = generateProfitAlerts({ summary: data.summary, rows: data.rows, language, period, currencyCode: data.currencyCode }).find((a) => a.id === sourceAlertKey); if (!alert || alert.productId !== productId) throw new Response("Alert context is no longer available.", { status: 409 }); title = alert.title; description = alert.description; actionType = alert.id.startsWith("pricing-opportunity-") ? "PRICE_CHANGE" : "PRODUCT_ACTION"; previousValue = actionType === "PRICE_CHANGE" ? alert.metadata?.currentPrice ?? null : null; }
      else if (sourceModule !== "RECOVERY_SIMULATOR") throw new Response("Unsupported source module.", { status: 400 });
      const created = await createProfitImpactAction({ shop: session.shop, idempotencyKey: txt(form, "idempotencyKey"), actionType, sourceModule, sourceAlertKey, productId: row.productId, productTitle: row.productTitle, title, changeDescription: description, currencyCode: data.currencyCode, previousValue, appliedValue: num(form, "appliedValue"), targetValue: num(form, "targetValue"), notes: txt(form, "notes") || null, metadata: { sourcePeriod: period }, eventSource: "merchant" });
      if (created.status === "ACCEPTED") await transitionProfitImpactAction({ shop: session.shop, actionId: created.id, toStatus: "AWAITING_APPLICATION", source: "merchant" });
      return redirect(`/app/profit-impact?actionId=${encodeURIComponent(created.id)}&lang=${language}`);
    }
    if (intent === "apply") { const actionId = txt(form, "actionId"); const tracked = await getProfitImpactActionForShop({ shop: session.shop, actionId }); if (!tracked?.productId) throw new Response("This action requires a product baseline.", { status: 409 }); const captured = await captureProductProfitImpactBaseline({ admin, session, productId: tracked.productId, locale, billingStatus: billing }); await startProfitImpactMeasurement({ shop: session.shop, actionId, appliedAt: captured.window.appliedAt, measurementEnd: captured.window.measurementEnd, baseline: captured.baseline, source: "merchant" }); return redirect(`/app/profit-impact?actionId=${encodeURIComponent(actionId)}&lang=${language}`); }
    if (intent === "cancel") { await cancelProfitImpactAction({ shop: session.shop, actionId: txt(form, "actionId"), source: "merchant" }); return redirect(`/app/profit-impact?lang=${language}`); }
    throw new Response("Unsupported action.", { status: 400 });
  } catch (error) { if (error instanceof Response) return Response.json({ ok: false, error: await error.text() }, { status: error.status }); throw error; }
}

function Results({ action, copy, locale, detail = false }: any) {
  const baseline = action.measurements.find((m: any) => m.measurementType === "BASELINE"); const result = resultMeasurement(action); const money = (v: number | null) => v == null ? "—" : uiMoney(v, action.currencyCode, locale);
  if (!baseline && !result) return null;
  return <div className="impact-measurement">{baseline ? <div className="impact-compare"><div><small>{copy.baseline}</small><strong>{money(baseline.economicProfit)}</strong><span>{money(baseline.revenue)} · {baseline.economicMarginPct.toFixed(1)}% · {baseline.units.toFixed(0)} {copy.units}</span></div>{result ? <div><small>{copy.postAction}</small><strong>{money(result.economicProfit)}</strong><span>{money(result.revenue)} · {result.economicMarginPct.toFixed(1)}% · {result.units.toFixed(0)} {copy.units}</span></div> : null}</div> : null}
    {result ? <div className="impact-result-grid"><span>{copy.measuredProfitChange}<strong>{money(result.measuredProfitChange)}</strong></span><span>{copy.measuredMarginChange}<strong>{result.measuredMarginChange?.toFixed(1) ?? "—"} pp</strong></span><span>{copy.estimatedAttributableImpact}<strong>{money(result.estimatedAttributableImpact)}</strong></span><span>{copy.dataConfidence}<strong>{result.dataConfidenceScore}/100</strong></span><span>{copy.attributionConfidence}<strong>{result.attributionConfidenceScore == null ? "—" : `${result.attributionConfidenceScore}/100`}</strong></span></div> : null}
    {detail && result ? <><p className="impact-method">{copy.methodologyStatement}</p><p>{copy.attributionMethod}: {result.attributionMethod || copy.notEstimated}</p>{json(result.confidenceReasonsJson).length ? <p>{copy.confidenceReasons}: {json(result.confidenceReasonsJson).join(", ")}</p> : null}</> : null}</div>;
}

function Card({ action, copy, locale, open }: any) {
  const result = resultMeasurement(action); const progress = Math.min(100, ((result?.observedDays ?? 0) / action.measurementWindowDays) * 100);
  return <article className="panel impact-card"><div className="impact-card-head"><div><div className="panel-eyebrow">{action.productTitle || copy.storeAction}</div><h3>{action.title}</h3><p>{copy[action.actionType]} · {copy[action.sourceModule]}</p></div><span className={`impact-status status-${action.status.toLowerCase()}`}>{copy[action.status]}</span></div>{action.appliedAt ? <p>{copy.appliedDate}: {new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(action.appliedAt))}</p> : null}{action.status === "MEASURING" ? <><div className="impact-progress"><i style={{width:`${progress}%`}}/></div><small>{result?.observedDays ?? 0}/{action.measurementWindowDays} {copy.daysObserved}</small></> : null}<Results action={action} copy={copy} locale={locale}/>{result?.confidenceLevel === "LOW" ? <p className="impact-warning">{copy.lowConfidenceWarning}</p> : null}<div className="impact-actions"><button className="apply-button" onClick={()=>open(action.id)}>{action.status === "MEASURING" ? copy.viewMeasurement : action.status === "COMPLETED" ? copy.viewMeasuredImpact : copy.openTrackedAction}</button>{action.status === "AWAITING_APPLICATION" ? <Form method="post"><input type="hidden" name="intent" value="apply"/><input type="hidden" name="actionId" value={action.id}/><button className="primary-button">{copy.markApplied}</button></Form> : null}{["ACCEPTED","AWAITING_APPLICATION"].includes(action.status) ? <Form method="post"><input type="hidden" name="intent" value="cancel"/><input type="hidden" name="actionId" value={action.id}/><button className="apply-button">{copy.cancel}</button></Form> : null}</div></article>;
}

export default function ProfitImpactPage() {
  const data = useLoaderData() as any; const actionData = useActionData() as any; const navigate = useNavigate(); const { messages, locale, language } = useI18n() as any; const copy = messages.profitImpactPage; const [tab,setTab] = React.useState("active"); const visible = data.actions.filter((a:any)=>classifyProfitImpactAction(a.status)===tab); const open=(id:string)=>navigate(`/app/profit-impact?actionId=${encodeURIComponent(id)}&lang=${language}`); const currency=data.actions[0]?.currencyCode||"USD";
  return <div className="dashboard-shell"><div className="dashboard-container"><DashboardNav active="profit-impact" navigate={navigate}/><header className="hero-header"><div><div className="eyebrow">{copy.eyebrow}</div><h1 className="hero-title">Profit Impact Tracker</h1><p className="hero-description">{copy.description}</p></div><button className="primary-button" onClick={()=>navigate("/app/recommendations")}>{copy.trackAction}</button></header>{!data.growthAccess ? <section className="panel"><h2>{copy.growthRequired}</h2><p>{copy.previewExplanation}</p><button className="primary-button" onClick={()=>navigate("/app/billing")}>{copy.upgrade}</button></section> : <>{actionData?.error ? <div className="error-banner">{actionData.error}</div>:null}
    <section className="impact-kpis">{[[copy.actionsMeasuring,data.summary.actionsMeasuring],[copy.actionsCompleted,data.summary.actionsCompleted],[copy.measuredProfitChange,uiMoney(data.summary.measuredProfitChange,currency,locale)],[copy.estimatedAttributableProfit,data.summary.estimatedAttributableProfit==null?"—":uiMoney(data.summary.estimatedAttributableProfit,currency,locale)],[copy.averageMarginLift,data.summary.averageMarginLift==null?"—":`${data.summary.averageMarginLift.toFixed(1)} pp`]].map(([l,v])=><div className="panel" key={l}><small>{l}</small><strong>{v}</strong></div>)}</section>{data.summary.lowConfidenceCompleted ? <p className="impact-warning">{data.summary.lowConfidenceCompleted} {copy.lowConfidenceIncluded}</p>:null}
    {data.prefill ? <Form method="post" className="panel impact-create"><input type="hidden" name="intent" value="create"/><input type="hidden" name="idempotencyKey" value={data.idempotencyKey}/>{["sourceModule","sourceAlertKey","productId","sourcePeriod","actionType"].map(n=><input key={n} type="hidden" name={n==="sourcePeriod"?"period":n} value={data.prefill[n]??""}/>)}<h2>{copy.confirmAction}</h2><label>{copy.product}<input value={data.prefill.productTitle} readOnly/></label><label>{copy.title}<input name="title" defaultValue={data.prefill.title}/></label><label>{copy.descriptionLabel}<textarea name="changeDescription" defaultValue={data.prefill.changeDescription}/></label><label>{copy.previousValue}<input name="previousValue" type="number" step="any" defaultValue={data.prefill.previousValue??""}/></label><label>{copy.appliedValue}<input name="appliedValue" type="number" step="any" defaultValue={data.prefill.appliedValue??""}/></label><input name="targetValue" type="hidden" value={data.prefill.targetValue??""}/><button className="primary-button">{copy.confirmAction}</button></Form>:null}
    {data.selectedAction ? <section className="panel impact-detail"><button className="apply-button" onClick={()=>navigate(`/app/profit-impact?lang=${language}`)}>{copy.close}</button><div className="panel-eyebrow">{copy.actionDetail}</div><h2>{data.selectedAction.title}</h2><p>{data.selectedAction.changeDescription}</p><div className="impact-detail-grid"><span>{copy.source}<strong>{copy[data.selectedAction.sourceModule]}</strong></span><span>{copy.actionType}<strong>{copy[data.selectedAction.actionType]}</strong></span><span>{copy.previousValue}<strong>{data.selectedAction.previousValue??"—"}</strong></span><span>{copy.appliedValue}<strong>{data.selectedAction.appliedValue??"—"}</strong></span></div><Results action={data.selectedAction} copy={copy} locale={locale} detail/><h3>{copy.timeline}</h3><ol className="impact-timeline">{data.selectedAction.events.map((e:any)=><li key={e.id}><strong>{copy[e.toStatus]}</strong><span>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(e.createdAt))} · {e.source}</span>{e.note?<p>{e.note}</p>:null}</li>)}</ol></section>:null}
    <nav className="impact-tabs">{[["active",copy.active],["completed",copy.completed],["attention",copy.needsAttention]].map(([k,l])=><button className={tab===k?"active":""} key={k} onClick={()=>setTab(k)}>{l}<span>{data.actions.filter((a:any)=>classifyProfitImpactAction(a.status)===k).length}</span></button>)}</nav><section className="impact-list">{visible.map((a:any)=><Card key={a.id} action={a} copy={copy} locale={locale} open={open}/>)}</section>{!visible.length?<section className="panel impact-empty"><p>{data.actions.length===0?copy.noActions:tab==="completed"?copy.noCompleted:tab==="attention"?copy.noAttention:copy.noActive}</p></section>:null}<section className="panel impact-trust"><h2>{copy.trustTitle}</h2><div><p><strong>{copy.measuredChange}</strong>{copy.measuredChangeDefinition}</p><p><strong>{copy.estimatedAttributableImpact}</strong>{copy.attributableDefinition}</p><p><strong>{copy.dataConfidence}</strong>{copy.dataConfidenceDefinition}</p><p><strong>{copy.attributionConfidence}</strong>{copy.attributionConfidenceDefinition}</p></div></section></>}</div></div>;
}
