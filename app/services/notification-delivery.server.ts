import {
  listPendingNotificationDeliveries,
  markNotificationDeliveryFailed,
  markNotificationDeliverySent,
} from "~/services/notification.server";
import { sendEmail } from "~/services/email.server";
import { money as formatStoreMoney } from "~/utils/margin";

type ProfitAlertPayload = {
  source?: string;
  monitorEventId?: string;
  reopening?: boolean;
  materialChange?: boolean;
  language?: "it" | "en";
  alert?: {
    id: string;
    severity: "critical" | "warning" | "opportunity" | "info";
    category: string;
    title: string;
    description: string;
    monthlyImpact: number;
    economicKind: "loss" | "exposure" | "opportunity" | "qualitative";
    priority: number;
    actionLabel: string;
    route: string;
    businessAction: string;
    effort: string;
    estimatedMinutes: number;
    recommendedModule: string;
    productTitle?: string;
  };
};

type WeeklyProfitReportPayload = {
  source?: "weekly-profit-report";
  language?: "it" | "en";
  currencyCode?: string;
  periodLabel?: string;
  generatedAt?: string;

  summary: {
    economicRevenue: number;
    economicProfit: number;
    economicMarginPct: number;
    revenueDeltaPct?: number | null;
    marginDelta?: number | null;
  };

  economics: {
    monthlyLoss: number;
    monthlyExposure: number;
    monthlyProfitGapToTarget: number;
  };

  alertCounts: {
    critical: number;
    warning: number;
    opportunity: number;
  };

  topAlerts?: Array<{
    title: string;
    severity: "critical" | "warning" | "opportunity" | "info";
    description?: string;
    route?: string;
  }>;

  nextActions?: Array<{
    title: string;
    description?: string;
    route?: string;
    module?: string;
  }>;
};

function parsePayload<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function severityLabel(
  severity: ProfitAlertPayload["alert"] extends infer T
    ? T extends { severity: infer S }
      ? S
      : never
    : never,
  language: "it" | "en",
) {
  if (severity === "critical") {
    return language === "it" ? "Critico" : "Critical";
  }

  if (severity === "warning") {
    return language === "it" ? "Attenzione" : "Warning";
  }

  if (severity === "opportunity") {
    return language === "it" ? "Opportunità" : "Opportunity";
  }

  return language === "it" ? "Informazione" : "Information";
}

function economicLabel(
  economicKind: ProfitAlertPayload["alert"] extends infer T
    ? T extends { economicKind: infer K }
      ? K
      : never
    : never,
  language: "it" | "en",
) {
  if (economicKind === "loss") {
    return language === "it"
      ? "Perdita mensile stimata"
      : "Estimated monthly loss";
  }

  if (economicKind === "exposure") {
    return language === "it"
      ? "Esposizione mensile stimata"
      : "Estimated monthly exposure";
  }

  if (economicKind === "opportunity") {
    return language === "it"
      ? "Gap mensile stimato verso il target"
      : "Estimated monthly profit gap to target";
  }

  return language === "it"
    ? "Segnale qualitativo"
    : "Qualitative signal";
}

function buildAppUrl(route: string) {
  const baseUrl =
    process.env.SHOPIFY_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "";

  if (!baseUrl) return null;

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;

  return `${normalizedBase}${normalizedRoute}`;
}

function formatImpact({
  amount,
  economicKind,
  currencyCode,
  locale,
}: {
  amount: number;
  economicKind: string;
  currencyCode: string;
  locale: string;
}) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return {
    value: formatStoreMoney(amount, currencyCode, locale),
    label:
      economicKind === "loss"
        ? locale === "it-IT"
          ? "Perdita mensile stimata"
          : "Estimated monthly loss"
        : economicKind === "exposure"
          ? locale === "it-IT"
            ? "Esposizione mensile stimata"
            : "Estimated monthly exposure"
          : economicKind === "opportunity"
            ? locale === "it-IT"
              ? "Gap mensile stimato verso il target"
              : "Estimated monthly profit gap to target"
            : locale === "it-IT"
              ? "Valore mensile indicativo"
              : "Indicative monthly value",
  };
}

function buildProfitAlertEmail({
  payload,
  currencyCode = "USD",
}: {
  payload: ProfitAlertPayload;
  currencyCode?: string;
}) {
  const alert = payload.alert;

  if (!alert) {
    throw new Error("Notification payload is missing alert data.");
  }

  const language = payload.language === "it" ? "it" : "en";
  const locale = language === "it" ? "it-IT" : "en-US";
  const impact = formatImpact({
    amount: Number(alert.monthlyImpact ?? 0),
    economicKind: alert.economicKind,
    currencyCode,
    locale,
  });

  const appUrl = buildAppUrl(alert.route);
  const severity = severityLabel(alert.severity, language);
  const economic = economicLabel(alert.economicKind, language);

  const subject =
    language === "it"
      ? payload.reopening
        ? `MarginLab: un segnale è tornato attivo — ${alert.title}`
        : alert.severity === "critical"
          ? `MarginLab: problema critico rilevato — ${alert.title}`
          : alert.severity === "warning"
            ? `MarginLab: nuovo avviso — ${alert.title}`
            : `MarginLab: nuova opportunità — ${alert.title}`
      : payload.reopening
        ? `MarginLab: a signal is active again — ${alert.title}`
        : alert.severity === "critical"
          ? `MarginLab: critical issue detected — ${alert.title}`
          : alert.severity === "warning"
            ? `MarginLab: new warning — ${alert.title}`
            : `MarginLab: new opportunity — ${alert.title}`;

  const safeTitle = escapeHtml(alert.title);
  const safeDescription = escapeHtml(alert.description);
  const safeSeverity = escapeHtml(severity);
  const safeEconomic = escapeHtml(economic);
  const safeModule = escapeHtml(alert.recommendedModule);
  const safeProduct = alert.productTitle
    ? escapeHtml(alert.productTitle)
    : language === "it"
      ? "Intero store"
      : "Store-wide";

  const textLines = [
    "MarginLab",
    "",
    alert.title,
    "",
    alert.description,
    "",
    `${language === "it" ? "Severità" : "Severity"}: ${severity}`,
    `${language === "it" ? "Priorità" : "Priority"}: ${alert.priority}/100`,
    `${language === "it" ? "Prodotto a maggiore impatto" : "Highest-impact product"}: ${alert.productTitle ?? (language === "it" ? "Intero store" : "Store-wide")}`,
    `${language === "it" ? "Modulo consigliato" : "Recommended module"}: ${alert.recommendedModule}`,
  ];

  if (impact) {
    textLines.push(`${impact.label}: ${impact.value}`);
  } else {
    textLines.push(economic);
  }

  if (appUrl) {
    textLines.push(
      "",
      `${language === "it" ? "Apri in MarginLab" : "Open in MarginLab"}: ${appUrl}`,
    );
  }

  textLines.push(
    "",
    language === "it"
      ? "Gli impatti economici sono stime basate sui dati disponibili e non rappresentano profitto perso o recuperato già verificato."
      : "Economic impacts are estimates based on available data and do not represent verified lost or recovered profit.",
  );

  const impactBlock = impact
    ? `
      <div style="margin-top:18px;padding:16px 18px;border-radius:14px;background:#0b1220;border:1px solid rgba(255,255,255,.08);">
        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">
          ${escapeHtml(impact.label)}
        </div>
        <div style="margin-top:7px;font-size:28px;font-weight:900;color:#ffffff;">
          ${escapeHtml(impact.value)}
        </div>
      </div>
    `
    : "";

  const cta = appUrl
    ? `
      <div style="margin-top:22px;">
        <a
          href="${escapeHtml(appUrl)}"
          style="display:inline-block;padding:13px 18px;border-radius:12px;background:#ff6b4a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;"
        >
          ${language === "it" ? "Apri in MarginLab →" : "Open in MarginLab →"}
        </a>
      </div>
    `
    : "";

  const html = `
    <div style="margin:0;padding:32px;background:#050910;font-family:Arial,Helvetica,sans-serif;color:#f8fafc;">
      <div style="max-width:680px;margin:0 auto;">
        <div style="font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#ff875f;">
          MARGINLAB PROFIT MONITOR
        </div>

        <div style="margin-top:10px;font-size:30px;line-height:1.2;font-weight:900;color:#ffffff;">
          ${safeTitle}
        </div>

        <div style="margin-top:14px;font-size:15px;line-height:1.7;color:#cbd5e1;">
          ${safeDescription}
        </div>

        ${impactBlock}

        <div style="margin-top:18px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
          <div style="padding:14px;border-radius:12px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${language === "it" ? "Severità" : "Severity"}</div>
            <div style="margin-top:5px;font-size:15px;font-weight:800;color:#ffffff;">${safeSeverity}</div>
          </div>

          <div style="padding:14px;border-radius:12px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${language === "it" ? "Priorità" : "Priority"}</div>
            <div style="margin-top:5px;font-size:15px;font-weight:800;color:#ffffff;">${alert.priority}/100</div>
          </div>

          <div style="padding:14px;border-radius:12px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${language === "it" ? "Prodotto a maggiore impatto" : "Highest-impact product"}</div>
            <div style="margin-top:5px;font-size:15px;font-weight:800;color:#ffffff;">${safeProduct}</div>
          </div>

          <div style="padding:14px;border-radius:12px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${language === "it" ? "Modulo consigliato" : "Recommended module"}</div>
            <div style="margin-top:5px;font-size:15px;font-weight:800;color:#ffffff;">${safeModule}</div>
          </div>
        </div>

        ${cta}

        <div style="margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;line-height:1.6;color:#64748b;">
          ${
            language === "it"
              ? "Gli impatti economici sono stime basate sui dati disponibili e non rappresentano profitto perso o recuperato già verificato."
              : "Economic impacts are estimates based on available data and do not represent verified lost or recovered profit."
          }
        </div>
      </div>
    </div>
  `;

  return {
    subject,
    text: textLines.join("\n"),
    html,
  };
}


function trendText({
  value,
  positiveLabel,
  negativeLabel,
  neutralLabel,
}: {
  value: number | null | undefined;
  positiveLabel: string;
  negativeLabel: string;
  neutralLabel: string;
}) {
  const safeValue = Number(value ?? 0);

  if (!Number.isFinite(safeValue) || Math.abs(safeValue) < 0.05) {
    return neutralLabel;
  }

  return safeValue > 0
    ? `${positiveLabel} ${Math.abs(safeValue).toFixed(1)}%`
    : `${negativeLabel} ${Math.abs(safeValue).toFixed(1)}%`;
}

function buildWeeklyProfitReportEmail({
  payload,
  fallbackCurrencyCode = "USD",
}: {
  payload: WeeklyProfitReportPayload;
  fallbackCurrencyCode?: string;
}) {
  const language = payload.language === "it" ? "it" : "en";
  const locale = language === "it" ? "it-IT" : "en-US";
  const currencyCode = payload.currencyCode || fallbackCurrencyCode;

  const money = (value: number) =>
    formatStoreMoney(
      Number.isFinite(value) ? value : 0,
      currencyCode,
      locale,
    );

  const pct = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format((Number.isFinite(value) ? value : 0) / 100);

  const periodLabel =
    payload.periodLabel ||
    (language === "it" ? "Ultimi 7 giorni" : "Last 7 days");

  const revenueTrend = trendText({
    value: payload.summary.revenueDeltaPct,
    positiveLabel: language === "it" ? "in aumento del" : "up",
    negativeLabel: language === "it" ? "in calo del" : "down",
    neutralLabel: language === "it" ? "stabile" : "stable",
  });

  const marginDelta = Number(payload.summary.marginDelta ?? 0);
  const marginTrend =
    Math.abs(marginDelta) < 0.05
      ? language === "it"
        ? "stabile"
        : "stable"
      : marginDelta > 0
        ? language === "it"
          ? `+${marginDelta.toFixed(1)} punti`
          : `+${marginDelta.toFixed(1)} pts`
        : language === "it"
          ? `${marginDelta.toFixed(1)} punti`
          : `${marginDelta.toFixed(1)} pts`;

  const subject =
    language === "it"
      ? `MarginLab Weekly Profit Report — ${money(payload.summary.economicProfit)} di profitto economico`
      : `MarginLab Weekly Profit Report — ${money(payload.summary.economicProfit)} economic profit`;

  const topAlerts = (payload.topAlerts ?? []).slice(0, 3);
  const nextActions = (payload.nextActions ?? []).slice(0, 3);

  const alertItemsHtml =
    topAlerts.length > 0
      ? topAlerts
          .map((alert) => {
            const routeUrl = alert.route ? buildAppUrl(alert.route) : null;
            const severity = severityLabel(alert.severity, language);

            return `
              <div style="padding:14px 16px;border-radius:14px;background:#0f1724;border:1px solid rgba(255,255,255,.07);margin-top:10px;">
                <div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">
                  ${escapeHtml(severity)}
                </div>
                <div style="margin-top:6px;font-size:15px;font-weight:850;color:#ffffff;">
                  ${escapeHtml(alert.title)}
                </div>
                ${
                  alert.description
                    ? `<div style="margin-top:6px;font-size:12px;line-height:1.55;color:#94a3b8;">${escapeHtml(alert.description)}</div>`
                    : ""
                }
                ${
                  routeUrl
                    ? `<div style="margin-top:9px;"><a href="${escapeHtml(routeUrl)}" style="color:#ff875f;text-decoration:none;font-size:12px;font-weight:800;">${language === "it" ? "Apri segnale →" : "Open signal →"}</a></div>`
                    : ""
                }
              </div>
            `;
          })
          .join("")
      : `
        <div style="margin-top:10px;padding:14px 16px;border-radius:14px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.16);font-size:13px;color:#86efac;">
          ${
            language === "it"
              ? "Nessun nuovo rischio prioritario da segnalare questa settimana."
              : "No new priority risks to report this week."
          }
        </div>
      `;

  const actionsHtml =
    nextActions.length > 0
      ? nextActions
          .map((action, index) => {
            const routeUrl = action.route ? buildAppUrl(action.route) : null;
            return `
              <div style="padding:14px 16px;border-radius:14px;background:#0f1724;border:1px solid rgba(255,255,255,.07);margin-top:10px;">
                <div style="font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:#ff875f;">
                  ${language === "it" ? `Azione ${index + 1}` : `Action ${index + 1}`}
                </div>
                <div style="margin-top:6px;font-size:15px;font-weight:850;color:#ffffff;">
                  ${escapeHtml(action.title)}
                </div>
                ${
                  action.description
                    ? `<div style="margin-top:6px;font-size:12px;line-height:1.55;color:#94a3b8;">${escapeHtml(action.description)}</div>`
                    : ""
                }
                ${
                  action.module
                    ? `<div style="margin-top:7px;font-size:11px;color:#64748b;">${language === "it" ? "Modulo" : "Module"}: ${escapeHtml(action.module)}</div>`
                    : ""
                }
                ${
                  routeUrl
                    ? `<div style="margin-top:9px;"><a href="${escapeHtml(routeUrl)}" style="color:#ff875f;text-decoration:none;font-size:12px;font-weight:800;">${language === "it" ? "Apri in MarginLab →" : "Open in MarginLab →"}</a></div>`
                    : ""
                }
              </div>
            `;
          })
          .join("")
      : `
        <div style="margin-top:10px;padding:14px 16px;border-radius:14px;background:#0f1724;border:1px solid rgba(255,255,255,.07);font-size:13px;color:#94a3b8;">
          ${
            language === "it"
              ? "Continua a monitorare margini, costi e qualità dei dati."
              : "Continue monitoring margins, costs and data quality."
          }
        </div>
      `;

  const appUrl = buildAppUrl("/app");

  const html = `
    <div style="margin:0;padding:32px;background:#050910;font-family:Arial,Helvetica,sans-serif;color:#f8fafc;">
      <div style="max-width:700px;margin:0 auto;">
        <div style="font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#ff875f;">
          MARGINLAB WEEKLY PROFIT REPORT
        </div>

        <div style="margin-top:10px;font-size:31px;line-height:1.2;font-weight:900;color:#ffffff;">
          ${language === "it" ? "La settimana in numeri, rischi e prossime azioni." : "Your week in numbers, risks and next actions."}
        </div>

        <div style="margin-top:9px;font-size:13px;color:#94a3b8;">
          ${escapeHtml(periodLabel)}
        </div>

        <div style="margin-top:20px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
          <div style="padding:17px;border-radius:15px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${language === "it" ? "Ricavi economici" : "Economic revenue"}</div>
            <div style="margin-top:6px;font-size:24px;font-weight:900;color:#ffffff;">${escapeHtml(money(payload.summary.economicRevenue))}</div>
            <div style="margin-top:4px;font-size:11px;color:#94a3b8;">${escapeHtml(revenueTrend)}</div>
          </div>

          <div style="padding:17px;border-radius:15px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.16);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${language === "it" ? "Profitto economico" : "Economic profit"}</div>
            <div style="margin-top:6px;font-size:24px;font-weight:900;color:#4ade80;">${escapeHtml(money(payload.summary.economicProfit))}</div>
            <div style="margin-top:4px;font-size:11px;color:#94a3b8;">${escapeHtml(pct(payload.summary.economicMarginPct))} ${language === "it" ? "margine" : "margin"}</div>
          </div>

          <div style="padding:17px;border-radius:15px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${language === "it" ? "Margine economico" : "Economic margin"}</div>
            <div style="margin-top:6px;font-size:24px;font-weight:900;color:#ffffff;">${escapeHtml(pct(payload.summary.economicMarginPct))}</div>
            <div style="margin-top:4px;font-size:11px;color:#94a3b8;">${escapeHtml(marginTrend)}</div>
          </div>

          <div style="padding:17px;border-radius:15px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${language === "it" ? "Segnali aperti" : "Open signals"}</div>
            <div style="margin-top:6px;font-size:24px;font-weight:900;color:#ffffff;">${payload.alertCounts.critical + payload.alertCounts.warning + payload.alertCounts.opportunity}</div>
            <div style="margin-top:4px;font-size:11px;color:#94a3b8;">
              ${payload.alertCounts.critical} ${language === "it" ? "critici" : "critical"} ·
              ${payload.alertCounts.warning} ${language === "it" ? "avvisi" : "warnings"} ·
              ${payload.alertCounts.opportunity} ${language === "it" ? "opportunità" : "opportunities"}
            </div>
          </div>
        </div>

        <div style="margin-top:22px;padding:18px;border-radius:16px;background:#0b1220;border:1px solid rgba(255,255,255,.08);">
          <div style="font-size:11px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:#94a3b8;">
            ${language === "it" ? "Impatto economico" : "Economic impact"}
          </div>
          <div style="margin-top:12px;font-size:13px;line-height:1.8;color:#cbd5e1;">
            <strong style="color:#ff8066;">${escapeHtml(money(payload.economics.monthlyLoss))}</strong>
            ${language === "it" ? " perdita mensile stimata" : " estimated monthly loss"}
            &nbsp;·&nbsp;
            <strong style="color:#f59e0b;">${escapeHtml(money(payload.economics.monthlyExposure))}</strong>
            ${language === "it" ? " esposizione mensile stimata" : " estimated monthly exposure"}
            &nbsp;·&nbsp;
            <strong style="color:#4ade80;">${escapeHtml(money(payload.economics.monthlyProfitGapToTarget))}</strong>
            ${language === "it" ? " gap mensile stimato verso il target" : " estimated monthly profit gap to target"}
          </div>
        </div>

        <div style="margin-top:24px;">
          <div style="font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#ff875f;">
            ${language === "it" ? "Cosa merita attenzione" : "What deserves attention"}
          </div>
          ${alertItemsHtml}
        </div>

        <div style="margin-top:24px;">
          <div style="font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#ff875f;">
            ${language === "it" ? "Le prossime azioni" : "Your next actions"}
          </div>
          ${actionsHtml}
        </div>

        ${
          appUrl
            ? `
              <div style="margin-top:24px;">
                <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:13px 18px;border-radius:12px;background:#ff6b4a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:850;">
                  ${language === "it" ? "Apri MarginLab →" : "Open MarginLab →"}
                </a>
              </div>
            `
            : ""
        }

        <div style="margin-top:26px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;line-height:1.6;color:#64748b;">
          ${
            language === "it"
              ? "Perdita, esposizione e gap verso il target sono stime distinte e non devono essere sommate. Il report utilizza la base economica tax-aware disponibile al momento della generazione."
              : "Loss, exposure and profit gap to target are separate estimates and should not be added together. This report uses the tax-aware economic basis available when it is generated."
          }
        </div>
      </div>
    </div>
  `;

  const textLines = [
    "MarginLab Weekly Profit Report",
    periodLabel,
    "",
    `${language === "it" ? "Ricavi economici" : "Economic revenue"}: ${money(payload.summary.economicRevenue)}`,
    `${language === "it" ? "Profitto economico" : "Economic profit"}: ${money(payload.summary.economicProfit)}`,
    `${language === "it" ? "Margine economico" : "Economic margin"}: ${pct(payload.summary.economicMarginPct)}`,
    `${language === "it" ? "Perdita mensile stimata" : "Estimated monthly loss"}: ${money(payload.economics.monthlyLoss)}`,
    `${language === "it" ? "Esposizione mensile stimata" : "Estimated monthly exposure"}: ${money(payload.economics.monthlyExposure)}`,
    `${language === "it" ? "Gap mensile stimato verso il target" : "Estimated monthly profit gap to target"}: ${money(payload.economics.monthlyProfitGapToTarget)}`,
    "",
    language === "it" ? "Le prossime azioni:" : "Your next actions:",
    ...nextActions.map((action, index) => `${index + 1}. ${action.title}`),
  ];

  return {
    subject,
    html,
    text: textLines.join("\\n"),
  };
}

export async function processPendingNotificationDeliveries({
  limit = 25,
  currencyCode = "USD",
}: {
  limit?: number;
  currencyCode?: string;
} = {}) {
  const deliveries = await listPendingNotificationDeliveries({
    limit,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const delivery of deliveries) {
    if (delivery.channel !== "email") {
      skipped += 1;
      continue;
    }

    if (
      delivery.notificationType !== "profit_alert" &&
      delivery.notificationType !== "weekly_profit_report"
    ) {
      skipped += 1;
      continue;
    }

    try {
      const email =
        delivery.notificationType === "profit_alert"
          ? (() => {
              const payload = parsePayload<ProfitAlertPayload>(
                delivery.payloadJson,
              );

              if (!payload?.alert) {
                throw new Error(
                  "Profit alert delivery is missing a valid payload.",
                );
              }

              return buildProfitAlertEmail({
                payload,
                currencyCode,
              });
            })()
          : (() => {
              const payload = parsePayload<WeeklyProfitReportPayload>(
                delivery.payloadJson,
              );

              if (!payload?.summary || !payload?.economics || !payload?.alertCounts) {
                throw new Error(
                  "Weekly profit report delivery is missing a valid payload.",
                );
              }

              return buildWeeklyProfitReportEmail({
                payload,
                fallbackCurrencyCode: currencyCode,
              });
            })();

      const result = await sendEmail({
        to: delivery.recipient,
        subject: delivery.subject || email.subject,
        html: email.html,
        text: email.text,
      });

      await markNotificationDeliverySent({
        id: delivery.id,
        providerMessageId: result.id,
      });

      sent += 1;
    } catch (error) {
      failed += 1;

      await markNotificationDeliveryFailed({
        id: delivery.id,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Unknown notification delivery error.",
      });
    }
  }

  return {
    processed: deliveries.length,
    sent,
    failed,
    skipped,
  };
}