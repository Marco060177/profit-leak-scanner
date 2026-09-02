import {
  claimPendingNotificationDelivery,
  listPendingNotificationDeliveries,
  markNotificationDeliveryFailed,
  markNotificationDeliverySent,
  normalizeNotificationLanguage,
  recoverStaleProcessingNotificationDeliveries,
  type NotificationLanguage,
} from "~/services/notification.server";
import { sendEmail } from "~/services/email.server";
import { unauthenticated } from "~/shopify.server";
import { getBillingStatus, hasStarterAccess } from "~/utils/billing.server";
import { formatUiMoney } from "~/utils/formatting";
import { getLanguageLocale } from "~/utils/i18n";

type ProfitAlertPayload = {
  source?: string;
  monitorEventId?: string;
  reopening?: boolean;
  materialChange?: boolean;
  language?: NotificationLanguage;
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
  sale?: {
    orderId: string;
    orderName: string;
    productId: string;
    productTitle: string;
    quantity: number;
    revenue: number;
    cogs: number | null;
    profit: number | null;
    marginPct: number | null;
    missingCost: boolean;
    currencyCode: string;
  };
};

type WeeklyProfitReportPayload = {
  source?: "weekly-profit-report";
  language?: NotificationLanguage;
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
    periodLoss: number;
    periodExposure: number;
    periodProfitGapToTarget: number;
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
    estimatedMinutes?: number;
  }>;
  profitImpact?: null | { measuringCount: number; completedThisWeek: number; measuredProfitChange: number; estimatedAttributableImpact: number | null; averageAttributionConfidence: number | null; hasLowConfidence: boolean };
};

function formatStoreMoney(value: number, currencyCode: string, locale: string) {
  return formatUiMoney(value, { currencyCode, locale });
}

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
  language: NotificationLanguage,
) {
  const labels = {
    en: { critical: "Critical", warning: "Warning", opportunity: "Opportunity", info: "Information" },
    it: { critical: "Critico", warning: "Attenzione", opportunity: "Opportunità", info: "Informazione" },
    fr: { critical: "Critique", warning: "Avertissement", opportunity: "Opportunité", info: "Information" },
    de: { critical: "Kritisch", warning: "Warnung", opportunity: "Chance", info: "Information" },
    es: { critical: "Crítico", warning: "Advertencia", opportunity: "Oportunidad", info: "Información" },
    "pt-BR": { critical: "Crítico", warning: "Aviso", opportunity: "Oportunidade", info: "Informação" },
  }[language];
  return labels[severity ?? "info"];
}

function economicLabel(
  economicKind: ProfitAlertPayload["alert"] extends infer T
    ? T extends { economicKind: infer K }
      ? K
      : never
    : never,
  language: NotificationLanguage,
) {
  const labels = {
    en: { loss: "Estimated monthly loss", exposure: "Estimated monthly exposure", opportunity: "Estimated monthly profit gap to target", qualitative: "Qualitative signal" },
    it: { loss: "Perdita mensile stimata", exposure: "Esposizione mensile stimata", opportunity: "Gap mensile stimato verso il target", qualitative: "Segnale qualitativo" },
    fr: { loss: "Perte mensuelle estimée", exposure: "Exposition mensuelle estimée", opportunity: "Écart mensuel de bénéfice estimé par rapport à l'objectif", qualitative: "Signal qualitatif" },
    de: { loss: "Geschätzter monatlicher Verlust", exposure: "Geschätzte monatliche Belastung", opportunity: "Geschätzte monatliche Gewinnlücke zum Zielwert", qualitative: "Qualitatives Signal" },
    es: { loss: "Pérdida mensual estimada", exposure: "Exposición mensual estimada", opportunity: "Diferencia mensual de beneficio estimada respecto al objetivo", qualitative: "Señal cualitativa" },
    "pt-BR": { loss: "Prejuízo mensal estimado", exposure: "Exposição mensal estimada", opportunity: "Diferença mensal de lucro estimada em relação à meta", qualitative: "Sinal qualitativo" },
  }[language];
  return labels[economicKind ?? "qualitative"];
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

function productSaleEmailCopy(language: NotificationLanguage, sale: NonNullable<ProfitAlertPayload["sale"]>) {
  const issue = sale.missingCost ? "missing" : sale.profit !== null && sale.profit < 0 ? "loss" : "weak";
  const copy = {
    en: {
      issues: { missing: "You just sold a product with no cost configured", loss: "You just sold a product at a loss", weak: "You just sold a product with weak margin" },
      explanation: sale.missingCost ? `MarginLab detected a sale of ${sale.productTitle} in order ${sale.orderName}, but the product's Shopify cost is not available.` : `MarginLab detected a sale of ${sale.productTitle} in order ${sale.orderName}. The values below refer to this sale and the current Shopify cost, not to a monthly forecast.`,
      subject: `MarginLab: review ${sale.productTitle}`, revenue: "Net product revenue", cost: "Current Shopify cost", profit: "Sale profit", margin: "Sale margin", missing: "Missing", cta: "Review product →", review: "Review in MarginLab", footer: "This alert refers to the sale just detected. It contains no monthly projection. The cost used is the current Shopify cost available when the alert was evaluated.", eyebrow: "MARGINLAB PRODUCT ALERT",
    },
    it: {
      issues: { missing: "Hai appena venduto un prodotto senza costo configurato", loss: "Hai appena venduto un prodotto in perdita", weak: "Hai appena venduto un prodotto con margine debole" },
      explanation: sale.missingCost ? `MarginLab ha rilevato la vendita di ${sale.productTitle} nell'ordine ${sale.orderName}, ma il costo Shopify del prodotto non è disponibile.` : `MarginLab ha rilevato la vendita di ${sale.productTitle} nell'ordine ${sale.orderName}. I valori sotto si riferiscono a questa vendita e al costo Shopify corrente, non a una previsione mensile.`,
      subject: `MarginLab: controlla ${sale.productTitle}`, revenue: "Ricavo netto prodotto", cost: "Costo Shopify corrente", profit: "Profitto della vendita", margin: "Margine della vendita", missing: "Mancante", cta: "Controlla il prodotto →", review: "Controlla in MarginLab", footer: "Questo alert riguarda la vendita appena rilevata. Non contiene proiezioni mensili. Il costo utilizzato è il costo Shopify corrente disponibile al momento del controllo.", eyebrow: "ALERT PRODOTTO MARGINLAB",
    },
    fr: {
      issues: { missing: "Vous venez de vendre un produit sans coût configuré", loss: "Vous venez de vendre un produit à perte", weak: "Vous venez de vendre un produit avec une marge faible" },
      explanation: sale.missingCost ? `MarginLab a détecté la vente de ${sale.productTitle} dans la commande ${sale.orderName}, mais le coût Shopify du produit n'est pas disponible.` : `MarginLab a détecté la vente de ${sale.productTitle} dans la commande ${sale.orderName}. Les valeurs ci-dessous concernent cette vente et le coût Shopify actuel, et non une prévision mensuelle.`,
      subject: `MarginLab : examinez ${sale.productTitle}`, revenue: "Chiffre d'affaires net du produit", cost: "Coût Shopify actuel", profit: "Bénéfice de la vente", margin: "Marge de la vente", missing: "Manquant", cta: "Examiner le produit →", review: "Examiner dans MarginLab", footer: "Cette alerte concerne la vente qui vient d'être détectée. Elle ne contient aucune projection mensuelle. Le coût utilisé est le coût Shopify disponible au moment de l'analyse.", eyebrow: "ALERTE PRODUIT MARGINLAB",
    },
    de: {
      issues: { missing: "Sie haben soeben ein Produkt ohne hinterlegte Kosten verkauft", loss: "Sie haben soeben ein Produkt mit Verlust verkauft", weak: "Sie haben soeben ein Produkt mit schwacher Marge verkauft" },
      explanation: sale.missingCost ? `MarginLab hat einen Verkauf von ${sale.productTitle} in Bestellung ${sale.orderName} erkannt, aber die Shopify-Kosten des Produkts sind nicht verfügbar.` : `MarginLab hat einen Verkauf von ${sale.productTitle} in Bestellung ${sale.orderName} erkannt. Die folgenden Werte beziehen sich auf diesen Verkauf und die aktuellen Shopify-Kosten, nicht auf eine monatliche Prognose.`,
      subject: `MarginLab: ${sale.productTitle} prüfen`, revenue: "Nettoproduktumsatz", cost: "Aktuelle Shopify-Kosten", profit: "Verkaufsgewinn", margin: "Verkaufsmarge", missing: "Fehlt", cta: "Produkt prüfen →", review: "In MarginLab prüfen", footer: "Diese Warnung bezieht sich auf den soeben erkannten Verkauf. Sie enthält keine monatliche Prognose. Verwendet wurden die zum Prüfzeitpunkt verfügbaren aktuellen Shopify-Kosten.", eyebrow: "MARGINLAB PRODUKTWARNUNG",
    },
    es: {
      issues: { missing: "Acabas de vender un producto sin coste configurado", loss: "Acabas de vender un producto con pérdidas", weak: "Acabas de vender un producto con margen débil" },
      explanation: sale.missingCost ? `MarginLab ha detectado una venta de ${sale.productTitle} en el pedido ${sale.orderName}, pero el coste del producto en Shopify no está disponible.` : `MarginLab ha detectado una venta de ${sale.productTitle} en el pedido ${sale.orderName}. Los valores siguientes corresponden a esta venta y al coste actual de Shopify, no a una previsión mensual.`,
      subject: `MarginLab: revisa ${sale.productTitle}`, revenue: "Ingresos netos del producto", cost: "Coste actual de Shopify", profit: "Beneficio de la venta", margin: "Margen de la venta", missing: "Faltante", cta: "Revisar producto →", review: "Revisar en MarginLab", footer: "Esta alerta corresponde a la venta recién detectada. No contiene proyecciones mensuales. El coste utilizado es el coste actual de Shopify disponible en el momento de la evaluación.", eyebrow: "ALERTA DE PRODUCTO MARGINLAB",
    },
    "pt-BR": {
      issues: { missing: "Você acabou de vender um produto sem custo configurado", loss: "Você acabou de vender um produto com prejuízo", weak: "Você acabou de vender um produto com margem baixa" },
      explanation: sale.missingCost ? `A MarginLab detectou uma venda de ${sale.productTitle} no pedido ${sale.orderName}, mas o custo do produto na Shopify não está disponível.` : `A MarginLab detectou uma venda de ${sale.productTitle} no pedido ${sale.orderName}. Os valores abaixo correspondem a esta venda e ao custo atual da Shopify, não a uma previsão mensal.`,
      subject: `MarginLab: revise ${sale.productTitle}`, revenue: "Receita líquida do produto", cost: "Custo atual da Shopify", profit: "Lucro da venda", margin: "Margem da venda", missing: "Não informado", cta: "Revisar produto →", review: "Revisar na MarginLab", footer: "Este alerta corresponde à venda recém-detectada. Ele não contém projeções mensais. O custo utilizado é o custo atual da Shopify disponível no momento da avaliação.", eyebrow: "ALERTA DE PRODUTO MARGINLAB",
    },
  }[language];
  return { ...copy, issueTitle: copy.issues[issue] };
}

function buildProductSaleAlertEmail({
  payload,
  fallbackCurrencyCode = "USD",
}: {
  payload: ProfitAlertPayload;
  fallbackCurrencyCode?: string;
}) {
  const alert = payload.alert;
  const sale = payload.sale;

  if (!alert || !sale) {
    throw new Error("Product sale alert payload is incomplete.");
  }

  const language = normalizeNotificationLanguage(payload.language);
  const locale = getLanguageLocale(language);
  const currencyCode = sale.currencyCode || fallbackCurrencyCode;
  const copy = productSaleEmailCopy(language, sale);

  const money = (value: number) =>
    formatStoreMoney(
      Number.isFinite(value) ? value : 0,
      currencyCode,
      locale,
    );

  const margin =
    sale.marginPct === null
      ? null
      : `${new Intl.NumberFormat(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(sale.marginPct)}%`;

  const appUrl = buildAppUrl(alert.route);

  const issueTitle = copy.issueTitle;
  const explanation = copy.explanation;
  const subject = copy.subject;

  const metrics = [
    {
      label: copy.revenue,
      value: money(sale.revenue),
    },
    {
      label: copy.cost,
      value:
        sale.cogs === null
          ? copy.missing
          : money(sale.cogs),
    },
    {
      label: copy.profit,
      value: sale.profit === null ? "—" : money(sale.profit),
    },
    {
      label: copy.margin,
      value: margin ?? "—",
    },
  ];

  const metricsHtml = metrics
    .map(
      (item) => `
        <div style="padding:14px;border-radius:12px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${escapeHtml(item.label)}</div>
          <div style="margin-top:5px;font-size:16px;font-weight:850;color:#ffffff;">${escapeHtml(item.value)}</div>
        </div>
      `,
    )
    .join("");

  const cta = appUrl
    ? `
      <div style="margin-top:22px;">
        <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:13px 18px;border-radius:12px;background:#ff6b4a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">
          ${copy.cta}
        </a>
      </div>
    `
    : "";

  const html = `
    <div style="margin:0;padding:32px;background:#050910;font-family:Arial,Helvetica,sans-serif;color:#f8fafc;">
      <div style="max-width:680px;margin:0 auto;">
        <div style="font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#ff875f;">${copy.eyebrow}</div>
        <div style="margin-top:10px;font-size:30px;line-height:1.2;font-weight:900;color:#ffffff;">${escapeHtml(issueTitle)}</div>
        <div style="margin-top:10px;font-size:21px;line-height:1.3;font-weight:900;color:#ffffff;">${escapeHtml(sale.productTitle)}</div>
        <div style="margin-top:14px;font-size:15px;line-height:1.7;color:#cbd5e1;">${escapeHtml(explanation)}</div>
        <div style="margin-top:18px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">${metricsHtml}</div>
        ${cta}
        <div style="margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;line-height:1.6;color:#64748b;">
          ${
            copy.footer
          }
        </div>
      </div>
    </div>
  `;

  const text = [
    "MarginLab Product Alert",
    "",
    issueTitle,
    sale.productTitle,
    "",
    explanation,
    "",
    `${copy.revenue}: ${money(sale.revenue)}`,
    `${copy.cost}: ${sale.cogs === null ? copy.missing : money(sale.cogs)}`,
    `${copy.profit}: ${sale.profit === null ? "—" : money(sale.profit)}`,
    `${copy.margin}: ${margin ?? "—"}`,
    ...(appUrl ? ["", `${copy.review}: ${appUrl}`] : []),
  ].join("\\n");

  return { subject, html, text };
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

  const language = normalizeNotificationLanguage(payload.language);
  const locale = getLanguageLocale(language);
  const copy = {
    en: { reopened: "a signal is active again", critical: "critical issue detected", warning: "new warning", opportunity: "new opportunity", store: "Store-wide", severity: "Severity", priority: "Priority", product: "Highest-impact product", module: "Recommended module", open: "Open in MarginLab", disclaimer: "Economic impacts are estimates based on available data and do not represent verified lost or recovered profit." },
    it: { reopened: "un segnale è tornato attivo", critical: "problema critico rilevato", warning: "nuovo avviso", opportunity: "nuova opportunità", store: "Intero store", severity: "Severità", priority: "Priorità", product: "Prodotto a maggiore impatto", module: "Modulo consigliato", open: "Apri in MarginLab", disclaimer: "Gli impatti economici sono stime basate sui dati disponibili e non rappresentano profitto perso o recuperato già verificato." },
    fr: { reopened: "un signal est de nouveau actif", critical: "problème critique détecté", warning: "nouvelle alerte", opportunity: "nouvelle opportunité", store: "Ensemble de la boutique", severity: "Gravité", priority: "Priorité", product: "Produit au plus fort impact", module: "Module recommandé", open: "Ouvrir dans MarginLab", disclaimer: "Les impacts économiques sont des estimations fondées sur les données disponibles et ne représentent pas un bénéfice perdu ou récupéré déjà vérifié." },
    de: { reopened: "ein Signal ist wieder aktiv", critical: "kritisches Problem erkannt", warning: "neue Warnung", opportunity: "neue Chance", store: "Gesamter Shop", severity: "Schweregrad", priority: "Priorität", product: "Produkt mit der größten Auswirkung", module: "Empfohlenes Modul", open: "In MarginLab öffnen", disclaimer: "Wirtschaftliche Auswirkungen sind Schätzungen auf Basis der verfügbaren Daten und stellen keinen bereits bestätigten entgangenen oder wiedergewonnenen Gewinn dar." },
    es: { reopened: "una señal vuelve a estar activa", critical: "problema crítico detectado", warning: "nueva advertencia", opportunity: "nueva oportunidad", store: "Toda la tienda", severity: "Gravedad", priority: "Prioridad", product: "Producto con mayor impacto", module: "Módulo recomendado", open: "Abrir en MarginLab", disclaimer: "Los impactos económicos son estimaciones basadas en los datos disponibles y no representan beneficios perdidos o recuperados ya verificados." },
    "pt-BR": { reopened: "um sinal está ativo novamente", critical: "problema crítico detectado", warning: "novo alerta", opportunity: "nova oportunidade", store: "Toda a loja", severity: "Gravidade", priority: "Prioridade", product: "Produto de maior impacto", module: "Módulo recomendado", open: "Abrir no MarginLab", disclaimer: "Os impactos econômicos são estimativas baseadas nos dados disponíveis e não representam lucro perdido ou recuperado já verificado." },
  }[language];
  const impact = formatImpact({
    amount: Number(alert.monthlyImpact ?? 0),
    economicKind: alert.economicKind,
    currencyCode,
    locale,
  });

  const appUrl = buildAppUrl(alert.route);
  const severity = severityLabel(alert.severity, language);
  const economic = economicLabel(alert.economicKind, language);

  const subjectKind = payload.reopening
    ? copy.reopened
    : alert.severity === "critical"
      ? copy.critical
      : alert.severity === "warning"
        ? copy.warning
        : copy.opportunity;
  const subject = `MarginLab: ${subjectKind} — ${alert.title}`;

  const safeTitle = escapeHtml(alert.title);
  const safeDescription = escapeHtml(alert.description);
  const safeSeverity = escapeHtml(severity);
  const safeEconomic = escapeHtml(economic);
  const safeModule = escapeHtml(alert.recommendedModule);
  const safeProduct = alert.productTitle
    ? escapeHtml(alert.productTitle)
    : copy.store;

  const textLines = [
    "MarginLab",
    "",
    alert.title,
    "",
    alert.description,
    "",
    `${copy.severity}: ${severity}`,
    `${copy.priority}: ${alert.priority}/100`,
    `${copy.product}: ${alert.productTitle ?? copy.store}`,
    `${copy.module}: ${alert.recommendedModule}`,
  ];

  if (impact) {
    textLines.push(`${impact.label}: ${impact.value}`);
  } else {
    textLines.push(economic);
  }

  if (appUrl) {
    textLines.push(
      "",
      `${copy.open}: ${appUrl}`,
    );
  }

  textLines.push(
    "",
    copy.disclaimer,
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
    : safeEconomic
      ? `
      <div style="margin-top:18px;padding:16px 18px;border-radius:14px;background:#0b1220;border:1px solid rgba(255,255,255,.08);">
        <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">
          ${safeEconomic}
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
          ${copy.open} →
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
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${copy.severity}</div>
            <div style="margin-top:5px;font-size:15px;font-weight:800;color:#ffffff;">${safeSeverity}</div>
          </div>

          <div style="padding:14px;border-radius:12px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${copy.priority}</div>
            <div style="margin-top:5px;font-size:15px;font-weight:800;color:#ffffff;">${alert.priority}/100</div>
          </div>

          <div style="padding:14px;border-radius:12px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${copy.product}</div>
            <div style="margin-top:5px;font-size:15px;font-weight:800;color:#ffffff;">${safeProduct}</div>
          </div>

          <div style="padding:14px;border-radius:12px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${copy.module}</div>
            <div style="margin-top:5px;font-size:15px;font-weight:800;color:#ffffff;">${safeModule}</div>
          </div>
        </div>

        ${cta}

        <div style="margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;line-height:1.6;color:#64748b;">
          ${copy.disclaimer}
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
  const language = normalizeNotificationLanguage(payload.language);
  const locale = getLanguageLocale(language);
  const copy = {
    en: { period: "Last 7 days", up: "up", down: "down", stable: "stable", points: "pts", profit: "economic profit", openSignal: "Open signal", noRisks: "No new priority risks to report this week.", action: "Action", module: "Module", time: "Estimated time", open: "Open in MarginLab", empty: "Continue monitoring margins, costs and data quality.", hero: "Your week in numbers, risks and next actions.", revenue: "Economic revenue", margin: "Economic margin", marginWord: "margin", signals: "Open signals", critical: "critical", warnings: "warnings", opportunities: "opportunities", impact: "Weekly economic impact", losses: " observed product losses", exposure: " revenue with missing cost data", gap: " estimated gap to target for the period", attention: "What deserves attention", actions: "Your next actions", openApp: "Open MarginLab", disclaimer: "This report describes the last 7 days only. Loss, exposure and gap to target are separate metrics and should not be added together. The gap to target is a modeled estimate for the period, not guaranteed or already recovered profit.", observedLosses: "Observed product losses", missingRevenue: "Revenue with missing cost data", estimatedGap: "Estimated gap to target for the period" },
    it: { period: "Ultimi 7 giorni", up: "in aumento del", down: "in calo del", stable: "stabile", points: "punti", profit: "di profitto economico", openSignal: "Apri segnale", noRisks: "Nessun nuovo rischio prioritario da segnalare questa settimana.", action: "Azione", module: "Modulo", time: "Tempo stimato", open: "Apri in MarginLab", empty: "Continua a monitorare margini, costi e qualità dei dati.", hero: "La settimana in numeri, rischi e prossime azioni.", revenue: "Ricavi economici", margin: "Margine economico", marginWord: "margine", signals: "Segnali aperti", critical: "critici", warnings: "avvisi", opportunities: "opportunità", impact: "Impatto economico della settimana", losses: " perdite prodotto osservate", exposure: " ricavi con costo mancante", gap: " gap stimato verso il target nel periodo", attention: "Cosa merita attenzione", actions: "Le prossime azioni", openApp: "Apri MarginLab", disclaimer: "Il report descrive esclusivamente gli ultimi 7 giorni. Perdite, esposizione e gap verso il target sono metriche distinte e non devono essere sommate. Il gap verso il target è una stima modellata sul periodo, non profitto garantito o già recuperato.", observedLosses: "Perdite prodotto osservate", missingRevenue: "Ricavi con costo mancante", estimatedGap: "Gap stimato verso il target nel periodo" },
    fr: { period: "7 derniers jours", up: "en hausse de", down: "en baisse de", stable: "stable", points: "pts", profit: "de bénéfice économique", openSignal: "Ouvrir le signal", noRisks: "Aucun nouveau risque prioritaire à signaler cette semaine.", action: "Action", module: "Module", time: "Temps estimé", open: "Ouvrir dans MarginLab", empty: "Continuez à surveiller les marges, les coûts et la qualité des données.", hero: "Votre semaine en chiffres, risques et prochaines actions.", revenue: "Chiffre d’affaires économique", margin: "Marge économique", marginWord: "de marge", signals: "Signaux ouverts", critical: "critiques", warnings: "alertes", opportunities: "opportunités", impact: "Impact économique de la semaine", losses: " de pertes produit observées", exposure: " de chiffre d’affaires avec coût manquant", gap: " d’écart estimé par rapport à l’objectif sur la période", attention: "Points à surveiller", actions: "Vos prochaines actions", openApp: "Ouvrir MarginLab", disclaimer: "Ce rapport décrit uniquement les 7 derniers jours. Les pertes, l’exposition et l’écart par rapport à l’objectif sont des métriques distinctes qui ne doivent pas être additionnées. L’écart par rapport à l’objectif est une estimation modélisée sur la période, et non un bénéfice garanti ou déjà récupéré.", observedLosses: "Pertes produit observées", missingRevenue: "Chiffre d’affaires avec coût manquant", estimatedGap: "Écart estimé par rapport à l’objectif sur la période" },
    de: { period: "Letzte 7 Tage", up: "gestiegen um", down: "gesunken um", stable: "stabil", points: "Pkt.", profit: "wirtschaftlicher Gewinn", openSignal: "Signal öffnen", noRisks: "Diese Woche gibt es keine neuen prioritären Risiken.", action: "Aktion", module: "Modul", time: "Geschätzte Zeit", open: "In MarginLab öffnen", empty: "Überwachen Sie weiterhin Margen, Kosten und Datenqualität.", hero: "Ihre Woche in Zahlen, Risiken und nächsten Schritten.", revenue: "Wirtschaftlicher Umsatz", margin: "Wirtschaftliche Marge", marginWord: "Marge", signals: "Offene Signale", critical: "kritisch", warnings: "Warnungen", opportunities: "Chancen", impact: "Wirtschaftliche Auswirkung der Woche", losses: " beobachtete Produktverluste", exposure: " Umsatz mit fehlenden Kostendaten", gap: " geschätzte Lücke zum Ziel im Zeitraum", attention: "Was Aufmerksamkeit verdient", actions: "Ihre nächsten Schritte", openApp: "MarginLab öffnen", disclaimer: "Dieser Bericht beschreibt ausschließlich die letzten 7 Tage. Verlust, Exposition und Ziellücke sind separate Kennzahlen und dürfen nicht addiert werden. Die Ziellücke ist eine modellierte Schätzung für den Zeitraum, kein garantierter oder bereits wiedergewonnener Gewinn.", observedLosses: "Beobachtete Produktverluste", missingRevenue: "Umsatz mit fehlenden Kostendaten", estimatedGap: "Geschätzte Lücke zum Ziel im Zeitraum" },
    es: { period: "Últimos 7 días", up: "ha aumentado un", down: "ha disminuido un", stable: "estable", points: "pts", profit: "de beneficio económico", openSignal: "Abrir señal", noRisks: "No hay nuevos riesgos prioritarios que señalar esta semana.", action: "Acción", module: "Módulo", time: "Tiempo estimado", open: "Abrir en MarginLab", empty: "Siga supervisando los márgenes, los costes y la calidad de los datos.", hero: "Su semana en cifras, riesgos y próximas acciones.", revenue: "Ingresos económicos", margin: "Margen económico", marginWord: "de margen", signals: "Señales abiertas", critical: "críticas", warnings: "advertencias", opportunities: "oportunidades", impact: "Impacto económico de la semana", losses: " de pérdidas de producto observadas", exposure: " de ingresos con costes faltantes", gap: " de brecha estimada respecto al objetivo en el periodo", attention: "Qué merece atención", actions: "Sus próximas acciones", openApp: "Abrir MarginLab", disclaimer: "Este informe describe únicamente los últimos 7 días. Las pérdidas, la exposición y la brecha respecto al objetivo son métricas distintas y no deben sumarse. La brecha respecto al objetivo es una estimación modelada para el periodo, no un beneficio garantizado ni ya recuperado.", observedLosses: "Pérdidas de producto observadas", missingRevenue: "Ingresos con costes faltantes", estimatedGap: "Brecha estimada respecto al objetivo en el periodo" },
    "pt-BR": { period: "Últimos 7 dias", up: "aumentou", down: "caiu", stable: "estável", points: "pts", profit: "de lucro econômico", openSignal: "Abrir sinal", noRisks: "Nenhum novo risco prioritário para relatar esta semana.", action: "Ação", module: "Módulo", time: "Tempo estimado", open: "Abrir no MarginLab", empty: "Continue monitorando margens, custos e qualidade dos dados.", hero: "Sua semana em números, riscos e próximas ações.", revenue: "Receita econômica", margin: "Margem econômica", marginWord: "de margem", signals: "Sinais abertos", critical: "críticos", warnings: "alertas", opportunities: "oportunidades", impact: "Impacto econômico da semana", losses: " de perdas de produto observadas", exposure: " de receita com custo ausente", gap: " de diferença estimada para a meta no período", attention: "O que merece atenção", actions: "Suas próximas ações", openApp: "Abrir MarginLab", disclaimer: "Este relatório descreve apenas os últimos 7 dias. Perda, exposição e diferença para a meta são métricas distintas e não devem ser somadas. A diferença para a meta é uma estimativa modelada para o período, não lucro garantido ou já recuperado.", observedLosses: "Perdas de produto observadas", missingRevenue: "Receita com custo ausente", estimatedGap: "Diferença estimada para a meta no período" },
  }[language];
  const profitLabel = {
    en: "Economic profit",
    it: "Profitto economico",
    fr: "Bénéfice économique",
    de: "Wirtschaftlicher Gewinn",
    es: "Beneficio económico",
    "pt-BR": "Lucro econômico",
  }[language];
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
    copy.period;

  const revenueTrend = trendText({
    value: payload.summary.revenueDeltaPct,
    positiveLabel: copy.up,
    negativeLabel: copy.down,
    neutralLabel: copy.stable,
  });

  const marginDelta = Number(payload.summary.marginDelta ?? 0);
  const marginTrend =
    Math.abs(marginDelta) < 0.05
      ? copy.stable
      : marginDelta > 0
        ? `+${marginDelta.toFixed(1)} ${copy.points}`
        : `${marginDelta.toFixed(1)} ${copy.points}`;

  const subject = `MarginLab Weekly Profit Report — ${money(payload.summary.economicProfit)} ${copy.profit}`;

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
                    ? `<div style="margin-top:9px;"><a href="${escapeHtml(routeUrl)}" style="color:#ff875f;text-decoration:none;font-size:12px;font-weight:800;">${copy.openSignal} →</a></div>`
                    : ""
                }
              </div>
            `;
          })
          .join("")
      : `
        <div style="margin-top:10px;padding:14px 16px;border-radius:14px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.16);font-size:13px;color:#86efac;">
          ${copy.noRisks}
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
                  ${copy.action} ${index + 1}
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
                    ? `<div style="margin-top:7px;font-size:11px;color:#64748b;">${copy.module}: ${escapeHtml(action.module)}</div>`
                    : ""
                }
                ${
                  action.estimatedMinutes
                    ? `<div style="margin-top:5px;font-size:11px;color:#64748b;">${copy.time}: ${action.estimatedMinutes} min</div>`
                    : ""
                }
                ${
                  routeUrl
                    ? `<div style="margin-top:9px;"><a href="${escapeHtml(routeUrl)}" style="color:#ff875f;text-decoration:none;font-size:12px;font-weight:800;">${copy.open} →</a></div>`
                    : ""
                }
              </div>
            `;
          })
          .join("")
      : `
        <div style="margin-top:10px;padding:14px 16px;border-radius:14px;background:#0f1724;border:1px solid rgba(255,255,255,.07);font-size:13px;color:#94a3b8;">
          ${copy.empty}
        </div>
      `;

  const impactCopy = {
    en: { title: "Profit Impact Tracker", measuring: "actions currently measuring", completed: "tracked actions completed measurement this week", observed: "Observed economic profit changed by", estimated: "MarginLab estimates that up to this amount was consistent with the recorded actions", confidence: "Average attribution confidence", low: "Some completed measurements have low confidence and should be interpreted cautiously." },
    it: { title: "Profit Impact Tracker", measuring: "azioni attualmente in misurazione", completed: "azioni tracciate hanno completato la misurazione questa settimana", observed: "Il profitto economico osservato è variato di", estimated: "MarginLab stima che fino a questo importo sia coerente con le azioni registrate", confidence: "Affidabilità media dell'attribuzione", low: "Alcune misurazioni completate hanno affidabilità bassa e vanno interpretate con cautela." },
    fr: { title: "Profit Impact Tracker", measuring: "actions actuellement mesurées", completed: "actions suivies ont terminé leur mesure cette semaine", observed: "Le bénéfice économique observé a varié de", estimated: "MarginLab estime que ce montant au maximum est cohérent avec les actions enregistrées", confidence: "Fiabilité moyenne de l'attribution", low: "Certaines mesures terminées ont une faible fiabilité et doivent être interprétées avec prudence." },
    de: { title: "Profit Impact Tracker", measuring: "Aktionen werden derzeit gemessen", completed: "verfolgte Aktionen haben diese Woche die Messung abgeschlossen", observed: "Der beobachtete wirtschaftliche Gewinn änderte sich um", estimated: "MarginLab schätzt, dass höchstens dieser Betrag mit den erfassten Aktionen übereinstimmt", confidence: "Durchschnittliche Attributionszuverlässigkeit", low: "Einige abgeschlossene Messungen haben geringe Zuverlässigkeit und sind vorsichtig zu interpretieren." },
    es: { title: "Profit Impact Tracker", measuring: "acciones actualmente en medición", completed: "acciones seguidas completaron la medición esta semana", observed: "El beneficio económico observado cambió en", estimated: "MarginLab estima que hasta este importe fue coherente con las acciones registradas", confidence: "Confianza media de atribución", low: "Algunas mediciones completadas tienen baja confianza y deben interpretarse con cautela." },
    "pt-BR": { title: "Profit Impact Tracker", measuring: "ações atualmente em medição", completed: "ações acompanhadas concluíram a medição nesta semana", observed: "O lucro econômico observado variou em", estimated: "A MarginLab estima que até este valor foi consistente com as ações registradas", confidence: "Confiança média de atribuição", low: "Algumas medições concluídas têm baixa confiança e devem ser interpretadas com cautela." },
  }[language];
  const trackerUrl = buildAppUrl("/app/profit-impact");
  const impact = payload.profitImpact;
  const impactText = impact ? [ `${impact.measuringCount} ${impactCopy.measuring}.`, `${impact.completedThisWeek} ${impactCopy.completed}.`, ...(impact.completedThisWeek ? [`${impactCopy.observed} ${money(impact.measuredProfitChange)}.`, ...(impact.estimatedAttributableImpact === null ? [] : [`${impactCopy.estimated}: ${money(impact.estimatedAttributableImpact)}.`]), ...(impact.averageAttributionConfidence === null ? [] : [`${impactCopy.confidence}: ${impact.averageAttributionConfidence.toFixed(0)}/100.`]), ...(impact.hasLowConfidence ? [impactCopy.low] : [])] : []) ] : [];
  const impactHtml = impact ? `<div style="margin-top:24px;padding:18px;border-radius:16px;background:#0b1220;border:1px solid rgba(255,115,60,.2);"><div style="font-size:12px;font-weight:900;color:#ff875f;">${impactCopy.title}</div>${impactText.map((line) => `<div style="margin-top:8px;font-size:13px;color:#cbd5e1;">${escapeHtml(line)}</div>`).join("")}${trackerUrl ? `<div style="margin-top:12px"><a href="${escapeHtml(trackerUrl)}" style="color:#ff875f;text-decoration:none;font-weight:800">${copy.open} →</a></div>` : ""}</div>` : "";

  const appUrl = buildAppUrl("/app");

  const html = `
    <div style="margin:0;padding:32px;background:#050910;font-family:Arial,Helvetica,sans-serif;color:#f8fafc;">
      <div style="max-width:700px;margin:0 auto;">
        <div style="font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#ff875f;">
          MARGINLAB WEEKLY PROFIT REPORT
        </div>

        <div style="margin-top:10px;font-size:31px;line-height:1.2;font-weight:900;color:#ffffff;">
          ${copy.hero}
        </div>

        <div style="margin-top:9px;font-size:13px;color:#94a3b8;">
          ${escapeHtml(periodLabel)}
        </div>

        <div style="margin-top:20px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
          <div style="padding:17px;border-radius:15px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${copy.revenue}</div>
            <div style="margin-top:6px;font-size:24px;font-weight:900;color:#ffffff;">${escapeHtml(money(payload.summary.economicRevenue))}</div>
            <div style="margin-top:4px;font-size:11px;color:#94a3b8;">${escapeHtml(revenueTrend)}</div>
          </div>

          <div style="padding:17px;border-radius:15px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.16);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${profitLabel}</div>
            <div style="margin-top:6px;font-size:24px;font-weight:900;color:#4ade80;">${escapeHtml(money(payload.summary.economicProfit))}</div>
            <div style="margin-top:4px;font-size:11px;color:#94a3b8;">${escapeHtml(pct(payload.summary.economicMarginPct))} ${copy.marginWord}</div>
          </div>

          <div style="padding:17px;border-radius:15px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${copy.margin}</div>
            <div style="margin-top:6px;font-size:24px;font-weight:900;color:#ffffff;">${escapeHtml(pct(payload.summary.economicMarginPct))}</div>
            <div style="margin-top:4px;font-size:11px;color:#94a3b8;">${escapeHtml(marginTrend)}</div>
          </div>

          <div style="padding:17px;border-radius:15px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">${copy.signals}</div>
            <div style="margin-top:6px;font-size:24px;font-weight:900;color:#ffffff;">${payload.alertCounts.critical + payload.alertCounts.warning + payload.alertCounts.opportunity}</div>
            <div style="margin-top:4px;font-size:11px;color:#94a3b8;">
              ${payload.alertCounts.critical} ${copy.critical} ·
              ${payload.alertCounts.warning} ${copy.warnings} ·
              ${payload.alertCounts.opportunity} ${copy.opportunities}
            </div>
          </div>
        </div>

        <div style="margin-top:22px;padding:18px;border-radius:16px;background:#0b1220;border:1px solid rgba(255,255,255,.08);">
          <div style="font-size:11px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:#94a3b8;">
            ${copy.impact}
          </div>
          <div style="margin-top:12px;font-size:13px;line-height:1.8;color:#cbd5e1;">
            <strong style="color:#ff8066;">${escapeHtml(money(payload.economics.periodLoss))}</strong>
            ${copy.losses}
            &nbsp;·&nbsp;
            <strong style="color:#f59e0b;">${escapeHtml(money(payload.economics.periodExposure))}</strong>
            ${copy.exposure}
            &nbsp;·&nbsp;
            <strong style="color:#4ade80;">${escapeHtml(money(payload.economics.periodProfitGapToTarget))}</strong>
            ${copy.gap}
          </div>
        </div>

        <div style="margin-top:24px;">
          <div style="font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#ff875f;">
            ${copy.attention}
          </div>
          ${alertItemsHtml}
        </div>

        <div style="margin-top:24px;">
          <div style="font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#ff875f;">
            ${copy.actions}
          </div>
          ${actionsHtml}
        </div>
        ${impactHtml}

        ${
          appUrl
            ? `
              <div style="margin-top:24px;">
                <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:13px 18px;border-radius:12px;background:#ff6b4a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:850;">
                  ${copy.openApp} →
                </a>
              </div>
            `
            : ""
        }

        <div style="margin-top:26px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;line-height:1.6;color:#64748b;">
          ${copy.disclaimer}
        </div>
      </div>
    </div>
  `;

  const textLines = [
    "MarginLab Weekly Profit Report",
    periodLabel,
    "",
    `${copy.revenue}: ${money(payload.summary.economicRevenue)}`,
    `${profitLabel}: ${money(payload.summary.economicProfit)}`,
    `${copy.margin}: ${pct(payload.summary.economicMarginPct)}`,
    `${copy.observedLosses}: ${money(payload.economics.periodLoss)}`,
    `${copy.missingRevenue}: ${money(payload.economics.periodExposure)}`,
    `${copy.estimatedGap}: ${money(payload.economics.periodProfitGapToTarget)}`,
    "",
    `${copy.actions}:`,
    ...nextActions.map(
      (action, index) =>
        `${index + 1}. ${action.title}${action.estimatedMinutes ? ` (${action.estimatedMinutes} min)` : ""}`,
    ),
    ...(impactText.length ? ["", impactCopy.title, ...impactText] : []),
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
  notificationType,
  shop,
}: {
  limit?: number;
  currencyCode?: string;
  notificationType?: "profit_alert" | "weekly_profit_report";
  shop?: string;
} = {}) {
  const staleRecovery =
    await recoverStaleProcessingNotificationDeliveries({ shop });

  if (staleRecovery.count > 0) {
    console.info("[NOTIFICATION DELIVERY] Recovered stale processing deliveries.", {
      count: staleRecovery.count,
    });
  }

  /*
   * When a specific notification type is requested (for example by the
   * Weekly Report test route), scan a larger slice of the pending queue first
   * and then process only the requested type.
   *
   * Normal production behavior is unchanged when notificationType is omitted.
   */
  const pendingDeliveries = await listPendingNotificationDeliveries({
    limit: notificationType ? 200 : limit,
    shop,
  });

  const deliveries = notificationType
    ? pendingDeliveries
        .filter(
          (delivery) =>
            delivery.notificationType === notificationType,
        )
        .slice(0, limit)
    : pendingDeliveries;

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{
    shop: string;
    stage: "delivery";
    message: string;
  }> = [];
  const accessByShop = new Map<string, Promise<boolean>>();

  const hasCurrentAccess = (deliveryShop: string) => {
    const cached = accessByShop.get(deliveryShop);
    if (cached) return cached;

    const lookup = (async () => {
      const { admin } = await unauthenticated.admin(deliveryShop);
      const billing = await getBillingStatus(admin);
      return hasStarterAccess(billing);
    })();

    accessByShop.set(deliveryShop, lookup);
    return lookup;
  };

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

    const claimed = await claimPendingNotificationDelivery(delivery.id);

    if (!claimed) {
      skipped += 1;
      continue;
    }

    try {
      if (!(await hasCurrentAccess(delivery.shop))) {
        throw new Error(
          "Notification delivery blocked: active Starter or Growth plan required.",
        );
      }

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

              if (
                payload.source === "product-sale-alert" &&
                payload.sale
              ) {
                return buildProductSaleAlertEmail({
                  payload,
                  fallbackCurrencyCode: currencyCode,
                });
              }

              return buildProfitAlertEmail({
                payload,
                currencyCode,
              });
            })()
          : (() => {
              const payload =
                parsePayload<WeeklyProfitReportPayload>(
                  delivery.payloadJson,
                );

              if (
                !payload?.summary ||
                !payload?.economics ||
                !payload?.alertCounts
              ) {
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
        idempotencyKey: delivery.deduplicationKey,
      });

      await markNotificationDeliverySent({
        id: delivery.id,
        providerMessageId: result.id,
      });

      sent += 1;
    } catch (error) {
      failed += 1;

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown notification delivery error.";

      errors.push({
        shop: delivery.shop,
        stage: "delivery",
        message: errorMessage,
      });

      try {
        await markNotificationDeliveryFailed({
          id: delivery.id,
          errorMessage,
        });
      } catch (persistenceError) {
        errors.push({
          shop: delivery.shop,
          stage: "delivery",
          message:
            persistenceError instanceof Error
              ? `Unable to persist delivery failure: ${persistenceError.message}`
              : "Unable to persist delivery failure.",
        });
      }
    }
  }

  return {
    processed: deliveries.length,
    recoveredStale: staleRecovery.count,
    sent,
    failed,
    skipped,
    errors,
  };
}
