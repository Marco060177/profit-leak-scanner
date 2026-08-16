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
    `${language === "it" ? "Prodotto" : "Product"}: ${alert.productTitle ?? (language === "it" ? "Intero store" : "Store-wide")}`,
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
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${language === "it" ? "Prodotto" : "Product"}</div>
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

    if (delivery.notificationType !== "profit_alert") {
      skipped += 1;
      continue;
    }

    try {
      const payload = parsePayload<ProfitAlertPayload>(
        delivery.payloadJson,
      );

      if (!payload?.alert) {
        throw new Error(
          "Profit alert delivery is missing a valid payload.",
        );
      }

      const email = buildProfitAlertEmail({
        payload,
        currencyCode,
      });

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