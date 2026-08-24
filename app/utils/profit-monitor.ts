import type { Language } from "~/utils/i18n";
import {
    buildEconomicSnapshot,
    type EconomicAmountKind,
} from "~/utils/economic-snapshot";
import {
    money as formatStoreMoney,
    pct as formatStorePercent,
    type Row,
    type Summary,
} from "~/utils/margin";

export type ProfitAlertSeverity =
    | "critical"
    | "warning"
    | "opportunity"
    | "info";

export type ProfitBusinessAction =
    | "action"
    | "review"
    | "optimize"
    | "monitor";

export type ProfitAlertEffort =
    | "easy"
    | "medium"
    | "advanced";

export type ProfitAlertCategory =
    | "pricing"
    | "margin"
    | "costs"
    | "discounts"
    | "refunds"
    | "data-quality"
    | "growth";

export type ProfitAlert = {
    id: string;
    severity: ProfitAlertSeverity;
    category: ProfitAlertCategory;

    title: string;
    description: string;

    monthlyImpact: number;
    economicKind: EconomicAmountKind;
    priority: number;

    actionLabel: string;
    route: string;

    businessAction: ProfitBusinessAction;
    effort: ProfitAlertEffort;
    estimatedMinutes: number;
    recommendedModule: string;

    productTitle?: string;
    productId?: string;

    metadata?: {
        currentMargin?: number;
        previousMargin?: number;
        marginChange?: number;
        revenue?: number;
        profit?: number;
        quantity?: number;
        currentPrice?: number;
        targetPrice?: number;
        missingCostCount?: number;
        affectedProducts?: number;
        periodImpact?: number;
    };
};

type ProfitAlertInput = Omit<
    ProfitAlert,
    | "businessAction"
    | "effort"
    | "estimatedMinutes"
    | "recommendedModule"
>;

type GenerateProfitAlertsInput = {
    summary: Summary;
    rows: Row[];
    language: Language;
    period?: string | number;
    currencyCode?: string;
};

const severityWeight: Record<
    ProfitAlertSeverity,
    number
> = {
    critical: 4,
    warning: 3,
    opportunity: 2,
    info: 1,
};

function safeNumber(
    value: number | null | undefined,
) {
    return Number.isFinite(value)
        ? Number(value)
        : 0;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function getPeriodDays(period?: string | number) {
    const parsed = Number(period ?? 30);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 30;
    }

    return parsed;
}

function normalizeToMonthly(value: number, periodDays: number) {
    return safeNumber(value) * (30 / periodDays);
}

function sortAlerts(alerts: ProfitAlert[]) {
    return [...alerts].sort((a, b) => {
        const priorityDifference = b.priority - a.priority;

        if (priorityDifference !== 0) {
            return priorityDifference;
        }

        const impactDifference = b.monthlyImpact - a.monthlyImpact;

        if (impactDifference !== 0) {
            return impactDifference;
        }

        return severityWeight[b.severity] - severityWeight[a.severity];
    });
}

function enrichProfitAlert(
    alert: ProfitAlertInput,
): ProfitAlert {
    if (alert.id === "losing-products") {
        return {
            ...alert,
            businessAction: "action",
            effort: "medium",
            estimatedMinutes: 5,
            recommendedModule: "Products",
        };
    }

    if (alert.id === "missing-product-costs") {
        const affectedProducts =
            alert.metadata?.affectedProducts ?? 1;

        return {
            ...alert,
            businessAction: "review",
            effort:
                affectedProducts <= 5
                    ? "easy"
                    : "medium",
            estimatedMinutes: clamp(
                affectedProducts,
                3,
                15,
            ),
            recommendedModule: "Products",
        };
    }

    if (alert.id === "weak-store-margin") {
        return {
            ...alert,
            businessAction:
                alert.severity === "critical"
                    ? "action"
                    : "review",
            effort: "medium",
            estimatedMinutes: 5,
            recommendedModule: "Profit Intelligence",
        };
    }

    if (alert.id === "margin-deterioration") {
        return {
            ...alert,
            businessAction:
                alert.severity === "critical"
                    ? "action"
                    : "review",
            effort: "medium",
            estimatedMinutes: 5,
            recommendedModule: "Profit Intelligence",
        };
    }

    if (alert.id === "discount-exposure") {
        return {
            ...alert,
            businessAction: "optimize",
            effort: "medium",
            estimatedMinutes: 10,
            recommendedModule: "Profit Intelligence",
        };
    }

    if (alert.id === "refund-exposure") {
        return {
            ...alert,
            businessAction: "review",
            effort: "advanced",
            estimatedMinutes: 15,
            recommendedModule: "Profit Intelligence",
        };
    }

    if (
        alert.id ===
        "recoverable-profit-opportunity"
    ) {
        return {
            ...alert,
            businessAction: "optimize",
            effort: "easy",
            estimatedMinutes: 5,
            recommendedModule: "Recovery Simulator",
        };
    }

    if (
        alert.id.startsWith(
            "pricing-opportunity-",
        )
    ) {
        return {
            ...alert,
            businessAction: "optimize",
            effort: "easy",
            estimatedMinutes: 5,
            recommendedModule: "Recovery Simulator",
        };
    }

    if (
        alert.id.startsWith(
            "weak-best-seller-",
        )
    ) {
        return {
            ...alert,
            businessAction:
                alert.severity === "critical"
                    ? "action"
                    : "review",
            effort: "medium",
            estimatedMinutes: 5,
            recommendedModule: "Products",
        };
    }

    if (
        alert.id ===
        "revenue-up-margin-down"
    ) {
        return {
            ...alert,
            businessAction: "review",
            effort: "medium",
            estimatedMinutes: 10,
            recommendedModule: "AI Advisor",
        };
    }

    if (
        alert.id ===
        "profit-monitor-stable"
    ) {
        return {
            ...alert,
            businessAction: "monitor",
            effort: "easy",
            estimatedMinutes: 2,
            recommendedModule: "AI Advisor",
        };
    }

    if (alert.severity === "critical") {
        return {
            ...alert,
            businessAction: "action",
            effort: "medium",
            estimatedMinutes: 5,
            recommendedModule: getModuleFromRoute(
                alert.route,
            ),
        };
    }

    if (alert.severity === "warning") {
        return {
            ...alert,
            businessAction: "review",
            effort: "medium",
            estimatedMinutes: 5,
            recommendedModule: getModuleFromRoute(
                alert.route,
            ),
        };
    }

    if (
        alert.severity === "opportunity"
    ) {
        return {
            ...alert,
            businessAction: "optimize",
            effort: "easy",
            estimatedMinutes: 5,
            recommendedModule: getModuleFromRoute(
                alert.route,
            ),
        };
    }

    return {
        ...alert,
        businessAction: "monitor",
        effort: "easy",
        estimatedMinutes: 2,
        recommendedModule: getModuleFromRoute(
            alert.route,
        ),
    };
}

function getModuleFromRoute(
    route: string,
) {
    if (
        route.includes(
            "recovery-simulator",
        )
    ) {
        return "Recovery Simulator";
    }

    if (
        route.includes(
            "profit-intelligence",
        )
    ) {
        return "Profit Intelligence";
    }

    if (
        route.includes("products")
    ) {
        return "Products";
    }

    if (
        route.includes("recommendations")
    ) {
        return "Recommendations";
    }

    if (
        route.includes("forecasting")
    ) {
        return "Profit Forecast";
    }

    if (
        route.includes("ai-advisor")
    ) {
        return "AI Advisor";
    }

    return "MarginLab";
}

export function generateProfitAlerts({
    summary,
    rows,
    language,
    period = 30,
    currencyCode = "USD",
}: GenerateProfitAlertsInput): ProfitAlert[] {
    const alerts: ProfitAlertInput[] = [];

    const isItalian = language === "it";
    const isFrench = language === "fr";
    const isGerman = language === "de";
    const isSpanish = language === "es";
    const periodDays = getPeriodDays(period);

    const economicSnapshot = buildEconomicSnapshot({
        summary,
        rows,
        period,
        currencyCode,
    });

    /*
     * Profit Monitor uses the same product-level economic basis as Products.
     * Raw Shopify fields remain available on the original rows for signals
     * such as discounts, refunds and missing-cost data quality.
     */
    const economicRows = rows.map((row) => {
        const economicRevenue =
            row.economicRevenue ?? row.revenue;
        const economicCogs =
            row.economicCogs ?? row.cogs;
        const economicProfit =
            row.economicProfit ?? row.profit;
        const economicMarginPct =
            row.economicMarginPct ?? row.marginPct;

        const qty = Math.max(0, safeNumber(row.qty));
        const avgPrice =
            qty > 0
                ? economicRevenue / qty
                : row.avgPrice;
        const avgCost =
            qty > 0
                ? economicCogs / qty
                : row.avgCost;

        const targetMarginPct = 20;
        const targetPrice =
            avgCost > 0
                ? avgCost / (1 - targetMarginPct / 100)
                : avgPrice;
        const targetDelta = targetPrice - avgPrice;

        return {
            ...row,
            revenue: economicRevenue,
            cogs: economicCogs,
            profit: economicProfit,
            marginPct: economicMarginPct,
            losing: economicProfit < 0,
            lowMargin:
                economicMarginPct > 0 &&
                economicMarginPct < 10,
            avgPrice,
            avgCost,
            breakEvenPrice: avgCost,
            targetPrice,
            targetDelta,
        };
    });

    const monthlyProductLoss = economicSnapshot.totals.monthlyLoss;
    const monthlyMissingCostExposure =
        economicSnapshot.amounts.find(
            (amount) => amount.id === "missing-cogs-revenue",
        )?.monthlyAmount ?? 0;
    const monthlyPricingOpportunity =
        economicSnapshot.totals.monthlyOpportunity;

    const locale = isItalian ? "it-IT" : isFrench ? "fr-FR" : isGerman ? "de-DE" : isSpanish ? "es-ES" : "en-US";

    const pct = (value: number, digits = 1) =>
        formatStorePercent(value, locale, digits);

    const number = (value: number, digits = 0) =>
        new Intl.NumberFormat(locale, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        }).format(safeNumber(value));

    const money = (value: number, digits = 0) =>
        formatStoreMoney(value, currencyCode, locale, digits);

    const revenue = safeNumber(
        summary.economicRevenue ??
            summary.netProductRevenue ??
            summary.revenue,
    );
    const grossProfit = safeNumber(
        summary.economicProfit ??
            summary.grossProfit ??
            summary.profit,
    );
    const grossMargin = safeNumber(
        summary.economicMarginPct ??
            summary.grossMarginPct ??
            summary.marginPct,
    );

    const discounts = Math.max(0, safeNumber(summary.discounts));
    const refunds = Math.max(0, safeNumber(summary.refunds));
    const losingProducts = economicRows.filter((row) => row.losing);

    // Missing-cost detection is a raw data-quality signal and intentionally
    // remains based on the original Shopify-derived rows.
    const missingCostProducts = rows.filter((row) => row.missingCost);

    const recoverableProfitForPeriod = economicRows.reduce((sum, row) => {
        const opportunity =
            Math.max(0, safeNumber(row.targetDelta)) *
            Math.max(0, safeNumber(row.qty));

        return sum + opportunity;
    }, 0);

    const monthlyRecoverableProfit = monthlyPricingOpportunity;

    const monthlyDiscounts = normalizeToMonthly(discounts, periodDays);
    const monthlyRefunds = normalizeToMonthly(refunds, periodDays);

    const discountRate = safeNumber(
        summary.discountRatePct ??
            (revenue > 0 ? (discounts / revenue) * 100 : 0),
    );

    const refundRate = safeNumber(
        summary.refundRatePct ??
            (revenue > 0 ? (refunds / revenue) * 100 : 0),
    );

    /*
     * ALERT 1
     * Prodotti venduti sotto costo
     */
    if (losingProducts.length > 0) {
        const losingImpactForPeriod = losingProducts.reduce(
            (sum, row) => sum + Math.max(0, -safeNumber(row.profit)),
            0,
        );

        const monthlyLosingImpact = monthlyProductLoss;

        const worstLosingProduct = [...losingProducts].sort(
            (a, b) => a.profit - b.profit,
        )[0];

        alerts.push({
            id: "losing-products",
            severity: "critical",
            category: "pricing",

            title: isItalian
                ? `${losingProducts.length} ${losingProducts.length === 1 ? "prodotto sta" : "prodotti stanno"} generando perdite`
                : isFrench
                    ? `${losingProducts.length} ${losingProducts.length === 1 ? "produit génère" : "produits génèrent"} des pertes`
                    : isGerman
                        ? `${losingProducts.length} ${losingProducts.length === 1 ? "Produkt verursacht" : "Produkte verursachen"} Verluste`
                        : isSpanish
                            ? `${losingProducts.length} ${losingProducts.length === 1 ? "producto está generando" : "productos están generando"} pérdidas`
                    : `${losingProducts.length} ${losingProducts.length === 1 ? "product is" : "products are"} generating losses`,

            description: worstLosingProduct
                ? isItalian
                    ? `${worstLosingProduct.productTitle} rappresenta il rischio principale. Prezzo, costo e margine devono essere controllati prima di aumentare i volumi.`
                    : isFrench
                        ? `${worstLosingProduct.productTitle} représente le principal risque actuel. Examinez le prix, le coût et la marge avant d'augmenter le volume.`
                        : isGerman
                            ? `${worstLosingProduct.productTitle} ist derzeit das größte Risiko. Prüfen Sie Preis, Kosten und Marge, bevor Sie das Absatzvolumen erhöhen.`
                            : isSpanish
                                ? `${worstLosingProduct.productTitle} es el principal riesgo actual. Revisa el precio, el coste y el margen antes de aumentar el volumen.`
                        : `${worstLosingProduct.productTitle} is the biggest current risk. Review price, cost and margin before increasing volume.`
                : isItalian
                    ? "Alcuni prodotti vengono venduti con profitto negativo e richiedono un intervento immediato."
                    : isFrench
                        ? "Certains produits sont vendus à perte et nécessitent une action immédiate."
                        : isGerman
                            ? "Einige Produkte werden mit Verlust verkauft und erfordern sofortiges Handeln."
                            : isSpanish
                                ? "Algunos productos se venden con pérdidas y requieren una intervención inmediata."
                        : "Some products are selling at a negative profit and require immediate action.",

            monthlyImpact: monthlyLosingImpact,
            economicKind: "loss",
            priority: 100,

            actionLabel: isItalian
                ? "Controlla i prodotti"
                : isFrench ? "Examiner les produits" : isGerman ? "Produkte prüfen" : isSpanish ? "Revisar productos" : "Review products",

            route: "/app/products",

            productTitle: worstLosingProduct?.productTitle,
            productId: worstLosingProduct?.productId,

            metadata: {
                affectedProducts: losingProducts.length,
                periodImpact: losingImpactForPeriod,
                currentMargin: worstLosingProduct?.marginPct,
                revenue: worstLosingProduct?.revenue,
                profit: worstLosingProduct?.profit,
            },
        });
    }

    /*
     * ALERT 2
     * Costi prodotto mancanti
     */
    if (missingCostProducts.length > 0) {
        const missingCostRevenue = Math.max(
            0,
            safeNumber(summary.missingCostRevenue) ||
                missingCostProducts.reduce(
                    (sum, row) =>
                        sum + Math.max(0, safeNumber(row.revenue)),
                    0,
                ),
        );
        const missingCostRevenueShare =
            revenue > 0 ? (missingCostRevenue / revenue) * 100 : 0;
        const isCritical =
            missingCostRevenueShare >= 25 ||
            (summary.revenueCoveragePct !== undefined &&
                safeNumber(summary.revenueCoveragePct) < 75);

        alerts.push({
            id: "missing-product-costs",
            severity: isCritical ? "critical" : "warning",
            category: "data-quality",

            title: isItalian
                ? `${missingCostProducts.length} prodotti non hanno un costo registrato`
                : isFrench ? `${missingCostProducts.length} produits n'ont pas de coût renseigné` : isGerman ? `Bei ${missingCostProducts.length} Produkten fehlen Kostendaten` : isSpanish ? `${missingCostProducts.length} productos no tienen datos de coste` : `${missingCostProducts.length} products are missing cost data`,

            description: isItalian
                ? `I prodotti senza costo rappresentano il ${pct(missingCostRevenueShare)} dei ricavi analizzati e riducono l'affidabilità di AI Advisor, Forecasting e delle simulazioni.`
                : isFrench ? `Les produits sans coût renseigné représentent ${pct(missingCostRevenueShare)} du chiffre d'affaires analysé et réduisent la fiabilité d'AI Advisor, de Forecasting et des simulations.` : isGerman ? `Produkte ohne Kostendaten machen ${pct(missingCostRevenueShare)} des analysierten Umsatzes aus und verringern die Zuverlässigkeit von AI Advisor, Forecasting und Simulationen.` : isSpanish ? `Los productos sin datos de coste representan el ${pct(missingCostRevenueShare)} de los ingresos analizados y reducen la fiabilidad de AI Advisor, Forecasting y las simulaciones.` : `Products without cost data represent ${pct(missingCostRevenueShare)} of analyzed revenue and reduce the reliability of AI Advisor, Forecasting and simulations.`,

            monthlyImpact: monthlyMissingCostExposure,
            economicKind: "exposure",
            priority: isCritical ? 98 : clamp(
                75 + Math.round(missingCostRevenueShare),
                78,
                92,
            ),

            actionLabel: isItalian
                ? "Completa i costi"
                : isFrench ? "Compléter les coûts" : isGerman ? "Kosten vervollständigen" : isSpanish ? "Completar costes" : "Complete costs",

            route: "/app/products",

            metadata: {
                missingCostCount: missingCostProducts.length,
                affectedProducts: missingCostProducts.length,
                revenue: missingCostRevenue,
            },
        });
    }

    /*
     * ALERT 3
     * Margine complessivo troppo basso
     */
    if (grossMargin < 20) {
        const isCritical = grossMargin < 10;

        alerts.push({
            id: "weak-store-margin",
            severity: isCritical ? "critical" : "warning",
            category: "margin",

            title: isItalian
                ? `Il margine complessivo è sceso al ${pct(grossMargin)}`
                : isFrench ? `La marge globale est de ${pct(grossMargin)}` : isGerman ? `Die Gesamtmarge beträgt ${pct(grossMargin)}` : isSpanish ? `El margen global es del ${pct(grossMargin)}` : `Overall margin is ${pct(grossMargin)}`,

            description: isItalian
                ? isCritical
                    ? "Il margine attuale lascia pochissimo spazio per coprire advertising, spedizioni, commissioni e costi operativi."
                    : "Il margine attuale è fragile e può deteriorarsi rapidamente con sconti, rimborsi o aumenti dei costi."
                : isFrench
                    ? isCritical
                        ? "La marge actuelle laisse très peu de latitude pour couvrir la publicité, l'expédition, les frais et les coûts d'exploitation."
                        : "La marge actuelle est fragile et peut se détériorer rapidement sous l'effet des remises, des remboursements ou de la hausse des coûts."
                    : isGerman
                        ? isCritical
                            ? "Die aktuelle Marge lässt nur sehr wenig Spielraum für Werbung, Versand, Gebühren und Betriebskosten."
                            : "Die aktuelle Marge ist anfällig und kann sich durch Rabatte, Erstattungen oder höhere Kosten schnell verschlechtern."
                        : isSpanish
                            ? isCritical
                                ? "El margen actual deja muy poco espacio para cubrir publicidad, envíos, comisiones y costes operativos."
                                : "El margen actual es frágil y puede deteriorarse rápidamente por descuentos, reembolsos o mayores costes."
                    : isCritical
                    ? "The current margin leaves very little room for advertising, shipping, fees and operating costs."
                    : "The current margin is fragile and can deteriorate quickly through discounts, refunds or higher costs.",

            monthlyImpact: 0,
            economicKind: "qualitative",
            priority: isCritical ? 96 : 86,

            actionLabel: isItalian
                ? "Analizza i margini"
                : isFrench ? "Examiner les marges" : isGerman ? "Margen prüfen" : isSpanish ? "Revisar márgenes" : "Review margins",

            route: "/app/profit-intelligence",

            metadata: {
                currentMargin: grossMargin,
                revenue,
                profit: grossProfit,
            },
        });
    }

    /*
     * ALERT 4
     * Deterioramento del margine rispetto al periodo precedente
     */
    const marginDelta = safeNumber(summary.marginDelta);
    const revenueDeltaPct = safeNumber(summary.revenueDeltaPct);
    const revenueGrowingWhileMarginFalls =
        revenueDeltaPct > 5 && marginDelta < 0;

    /*
     * When revenue is growing while margin is falling, the dedicated growth
     * alert below already includes the margin deterioration signal. Avoid
     * creating a second operational task with the same economic impact.
     */
    if (marginDelta <= -2 && !revenueGrowingWhileMarginFalls) {
        const previousMargin =
            summary.previousMarginPct !== undefined
                ? safeNumber(summary.previousMarginPct)
                : grossMargin - marginDelta;

        const estimatedPeriodImpact =
            revenue * (Math.abs(marginDelta) / 100);

        alerts.push({
            id: "margin-deterioration",
            severity: marginDelta <= -5 ? "critical" : "warning",
            category: "margin",

            title: isItalian
                ? `Il margine è diminuito di ${number(
                    Math.abs(marginDelta),
                    1,
                )} punti`
                : isFrench ? `La marge a diminué de ${number(
                    Math.abs(marginDelta),
                    1,
                )} points` : isGerman ? `Die Marge ist um ${number(
                    Math.abs(marginDelta),
                    1,
                )} Punkte gesunken` : isSpanish ? `El margen ha disminuido ${number(
                    Math.abs(marginDelta),
                    1,
                )} puntos` : `Margin dropped by ${number(
                    Math.abs(marginDelta),
                    1,
                )} points`,

            description: isItalian
                ? `Il margine è passato da circa ${pct(
                    previousMargin,
                )} al ${pct(
                    grossMargin,
                )}. Controlla i prodotti che hanno subito il peggioramento maggiore.`
                : isFrench ? `La marge est passée d'environ ${pct(
                    previousMargin,
                )} à ${pct(
                    grossMargin,
                )}. Examinez les produits dont la détérioration est la plus importante.` : isGerman ? `Die Marge ist von etwa ${pct(
                    previousMargin,
                )} auf ${pct(
                    grossMargin,
                )} gesunken. Prüfen Sie die Produkte mit der stärksten Verschlechterung.` : isSpanish ? `El margen ha pasado de aproximadamente ${pct(
                    previousMargin,
                )} a ${pct(
                    grossMargin,
                )}. Revisa los productos con el mayor deterioro.` : `Margin moved from approximately ${pct(
                    previousMargin,
                )} to ${pct(
                    grossMargin,
                )}. Review the products with the largest deterioration.`,

            monthlyImpact: normalizeToMonthly(
                estimatedPeriodImpact,
                periodDays,
            ),
            economicKind: "exposure",

            priority: marginDelta <= -5 ? 97 : 90,

            actionLabel: isItalian
                ? "Apri Profit Intelligence"
                : isFrench ? "Ouvrir Profit Intelligence" : isGerman ? "Profit Intelligence öffnen" : isSpanish ? "Abrir Profit Intelligence" : "Open Profit Intelligence",

            route: "/app/profit-intelligence",

            metadata: {
                currentMargin: grossMargin,
                previousMargin,
                marginChange: marginDelta,
                periodImpact: estimatedPeriodImpact,
            },
        });
    }

    /*
     * ALERT 5
     * Sconti eccessivi
     */
    if (discounts > 0 && discountRate >= 5) {
        const isHighDiscountExposure = discountRate >= 10;

        alerts.push({
            id: "discount-exposure",
            severity: isHighDiscountExposure ? "warning" : "info",
            category: "discounts",

            title: isItalian
                ? `Gli sconti assorbono il ${pct(discountRate)} dei ricavi`
                : isFrench ? `Les remises représentent ${pct(discountRate)} du chiffre d'affaires` : isGerman ? `Rabatte machen ${pct(discountRate)} des Umsatzes aus` : isSpanish ? `Los descuentos representan el ${pct(discountRate)} de los ingresos` : `Discounts represent ${pct(discountRate)} of revenue`,

            description: isItalian
                ? "Verifica che le promozioni stiano generando vendite aggiuntive sufficienti a compensare la perdita di margine."
                : isFrench ? "Vérifiez que les promotions génèrent suffisamment de ventes supplémentaires pour compenser la perte de marge." : isGerman ? "Prüfen Sie, ob Aktionen genügend zusätzliche Verkäufe generieren, um den Margenverlust auszugleichen." : isSpanish ? "Comprueba que las promociones generen suficientes ventas adicionales para compensar la pérdida de margen." : "Verify that promotions are generating enough additional sales to compensate for the lost margin.",

            monthlyImpact: monthlyDiscounts,
            economicKind: "exposure",
            priority: isHighDiscountExposure ? 84 : 62,

            actionLabel: isItalian
                ? "Analizza gli sconti"
                : isFrench ? "Examiner les remises" : isGerman ? "Rabatte prüfen" : isSpanish ? "Revisar descuentos" : "Review discounts",

            route: "/app/profit-intelligence",

            metadata: {
                revenue,
                periodImpact: discounts,
            },
        });
    }

    /*
     * ALERT 6
     * Esposizione ai rimborsi
     */
    if (refunds > 0 && refundRate >= 2) {
        const isHighRefundExposure = refundRate >= 5;

        alerts.push({
            id: "refund-exposure",
            severity: isHighRefundExposure ? "warning" : "info",
            category: "refunds",

            title: isItalian
                ? `I rimborsi rappresentano il ${pct(refundRate)} dei ricavi`
                : isFrench ? `Les remboursements représentent ${pct(refundRate)} du chiffre d'affaires` : isGerman ? `Erstattungen machen ${pct(refundRate)} des Umsatzes aus` : isSpanish ? `Los reembolsos representan el ${pct(refundRate)} de los ingresos` : `Refunds represent ${pct(refundRate)} of revenue`,

            description: isItalian
                ? "Controlla se i rimborsi sono concentrati su specifici prodotti, problemi di qualità o criticità nell'evasione degli ordini."
                : isFrench ? "Vérifiez si les remboursements se concentrent sur certains produits, des problèmes de qualité ou des difficultés de traitement des commandes." : isGerman ? "Prüfen Sie, ob sich Erstattungen auf bestimmte Produkte, Qualitätsprobleme oder Schwierigkeiten bei der Bestellabwicklung konzentrieren." : isSpanish ? "Comprueba si los reembolsos se concentran en productos concretos, problemas de calidad o dificultades de preparación de pedidos." : "Check whether refunds are concentrated around specific products, quality issues or fulfillment problems.",

            monthlyImpact: monthlyRefunds,
            economicKind: "exposure",
            priority: isHighRefundExposure ? 82 : 60,

            actionLabel: isItalian
                ? "Analizza i rimborsi"
                : isFrench ? "Examiner les remboursements" : isGerman ? "Erstattungen prüfen" : isSpanish ? "Revisar reembolsos" : "Review refunds",

            route: "/app/profit-intelligence",

            metadata: {
                revenue,
                periodImpact: refunds,
            },
        });
    }

    /*
     * ALERT 7
     * Gap teorico complessivo verso il target
     */
    if (monthlyRecoverableProfit > 0) {
        alerts.push({
            id: "recoverable-profit-opportunity",
            severity: "opportunity",
            category: "growth",

            title: isItalian
                ? `${money(monthlyRecoverableProfit)} di gap teorico mensile verso il target`
                : isFrench ? `${money(monthlyRecoverableProfit)} d'écart de bénéfice mensuel théorique par rapport à l'objectif` : isGerman ? `${money(monthlyRecoverableProfit)} theoretische monatliche Gewinnlücke zum Zielwert` : isSpanish ? `${money(monthlyRecoverableProfit)} de diferencia teórica mensual de beneficio respecto al objetivo` : `${money(monthlyRecoverableProfit)} theoretical monthly profit gap to target`,

            description: isItalian
                ? `${economicRows.filter((row) => row.targetDelta > 0).length} prodotti presentano un gap di prezzo rispetto al target da verificare nel simulatore. La stima presume volumi invariati e non rappresenta profitto garantito o già recuperato.`
                : isFrench ? `${economicRows.filter((row) => row.targetDelta > 0).length} produits présentent un écart de prix par rapport à l'objectif, à tester dans le simulateur. L'estimation suppose un volume inchangé et ne constitue ni un bénéfice garanti ni un bénéfice déjà récupéré.` : isGerman ? `${economicRows.filter((row) => row.targetDelta > 0).length} Produkte weisen eine Preislücke zum Zielwert auf, die im Simulator geprüft werden kann. Die Schätzung geht von unverändertem Volumen aus und stellt weder garantierten noch bereits realisierten Gewinn dar.` : isSpanish ? `${economicRows.filter((row) => row.targetDelta > 0).length} productos presentan una diferencia de precio respecto al objetivo que puede probarse en el simulador. La estimación supone un volumen sin cambios y no representa un beneficio garantizado ni ya recuperado.` : `${economicRows.filter((row) => row.targetDelta > 0).length} products have a pricing gap to the target that can be tested in the simulator. The estimate assumes unchanged volume and is not guaranteed or already recovered profit.`,

            monthlyImpact: monthlyRecoverableProfit,
            economicKind: "opportunity",
            priority: clamp(
                70 + Math.round(monthlyRecoverableProfit / 500),
                70,
                89,
            ),

            actionLabel: isItalian
                ? "Apri Recovery Simulator"
                : isFrench ? "Ouvrir Recovery Simulator" : isGerman ? "Recovery Simulator öffnen" : isSpanish ? "Abrir Recovery Simulator" : "Open Recovery Simulator",

            route: "/app/recovery-simulator",

            metadata: {
                affectedProducts: economicRows.filter(
                    (row) => row.targetDelta > 0,
                ).length,
                periodImpact: recoverableProfitForPeriod,
            },
        });
    }

    /*
     * ALERT 8
     * Maggiore gap di prezzo su singolo prodotto
     */
    const pricingOpportunities = economicRows
        .filter(
            (row) =>
                row.targetDelta > 0 &&
                row.qty > 0 &&
                !row.missingCost,
        )
        .map((row) => ({
            row,
            opportunity:
                Math.max(0, row.targetDelta) * Math.max(0, row.qty),
        }))
        .filter((item) => item.opportunity > 0)
        .sort((a, b) => b.opportunity - a.opportunity);

    const bestPricingOpportunity = pricingOpportunities[0];

    if (bestPricingOpportunity) {
        const { row, opportunity } = bestPricingOpportunity;

        const priceIncreasePct =
            row.avgPrice > 0
                ? (row.targetDelta / row.avgPrice) * 100
                : 0;

        alerts.push({
            id: `pricing-opportunity-${row.productId}`,
            severity: "opportunity",
            category: "pricing",

            title: isItalian
                ? `${row.productTitle} presenta il maggiore gap di prezzo verso il target`
                : isFrench ? `${row.productTitle} présente le plus grand écart de prix par rapport à l'objectif` : isGerman ? `${row.productTitle} weist die größte Preislücke zum Zielwert auf` : isSpanish ? `${row.productTitle} presenta la mayor diferencia de precio respecto al objetivo` : `${row.productTitle} has the largest pricing gap to target`,

            description: isItalian
                ? `Un adeguamento stimato del ${pct(
                    priceIncreasePct,
                )} porterebbe il prezzo verso ${money(
                    row.targetPrice,
                    2,
                )}. È uno scenario teorico al volume attuale da verificare nel simulatore.`
                : isFrench ? `Un ajustement estimé de ${pct(
                    priceIncreasePct,
                )} rapprocherait le prix de ${money(
                    row.targetPrice,
                    2,
                )}. Il s'agit d'un scénario théorique au volume actuel, à tester dans le simulateur.` : isGerman ? `Eine geschätzte Anpassung von ${pct(
                    priceIncreasePct,
                )} würde den Preis in Richtung ${money(
                    row.targetPrice,
                    2,
                )} bewegen. Dies ist ein theoretisches Szenario beim aktuellen Volumen, das im Simulator geprüft werden sollte.` : isSpanish ? `Un ajuste estimado del ${pct(
                    priceIncreasePct,
                )} acercaría el precio a ${money(
                    row.targetPrice,
                    2,
                )}. Es un escenario teórico con el volumen actual que debe probarse en el simulador.` : `An estimated ${pct(
                    priceIncreasePct,
                )} adjustment would move the price toward ${money(
                    row.targetPrice,
                    2,
                )}. This is a theoretical current-volume scenario to test in the simulator.`,

            monthlyImpact: normalizeToMonthly(opportunity, periodDays),
            economicKind: "opportunity",
            priority: 78,

            actionLabel: isItalian
                ? "Simula questo scenario"
                : isFrench ? "Simuler ce scénario" : isGerman ? "Dieses Szenario simulieren" : isSpanish ? "Simular este escenario" : "Simulate this scenario",

            route: "/app/recovery-simulator",

            productTitle: row.productTitle,
            productId: row.productId,

            metadata: {
                currentMargin: row.marginPct,
                revenue: row.revenue,
                profit: row.profit,
                quantity: row.qty,
                currentPrice: row.avgPrice,
                targetPrice: row.targetPrice,
                periodImpact: opportunity,
            },
        });
    }

    /*
     * ALERT 9
     * Bestseller con margine debole
     */
    const weakBestSeller = [...economicRows]
        .filter(
            (row) =>
                row.revenue > 0 &&
                row.marginPct < 20 &&
                !row.missingCost,
        )
        .sort((a, b) => b.revenue - a.revenue)[0];

    if (weakBestSeller) {
        alerts.push({
            id: `weak-best-seller-${weakBestSeller.productId}`,
            severity: weakBestSeller.losing ? "critical" : "warning",
            category: "margin",

            title: isItalian
                ? `Un bestseller sta generando un margine debole`
                : isFrench ? `Un best-seller génère une faible marge` : isGerman ? `Ein Bestseller erzielt eine schwache Marge` : isSpanish ? `Un producto superventas genera un margen débil` : `A best seller is generating weak margin`,

            description: isItalian
                ? `${weakBestSeller.productTitle} genera ricavi elevati ma lavora con un margine del ${pct(
                    weakBestSeller.marginPct,
                )}. L'aumento dei volumi potrebbe amplificare il problema.`
                : isFrench ? `${weakBestSeller.productTitle} génère un chiffre d'affaires élevé, mais avec une marge de ${pct(
                    weakBestSeller.marginPct,
                )}. Une hausse du volume pourrait amplifier le problème.` : isGerman ? `${weakBestSeller.productTitle} erzielt einen hohen Umsatz, arbeitet jedoch mit einer Marge von ${pct(
                    weakBestSeller.marginPct,
                )}. Ein höheres Volumen könnte das Problem verstärken.` : isSpanish ? `${weakBestSeller.productTitle} genera ingresos elevados, pero opera con un margen del ${pct(
                    weakBestSeller.marginPct,
                )}. Un mayor volumen podría agravar el problema.` : `${weakBestSeller.productTitle} generates strong revenue but operates at a ${pct(
                    weakBestSeller.marginPct,
                )} margin. Higher volume could amplify the problem.`,

            monthlyImpact: normalizeToMonthly(
                Math.max(0, -safeNumber(weakBestSeller.profit)),
                periodDays,
            ),
            economicKind: weakBestSeller.losing
                ? "loss"
                : "qualitative",

            priority: weakBestSeller.losing ? 95 : 85,

            actionLabel: isItalian
                ? "Controlla il prodotto"
                : isFrench ? "Examiner le produit" : isGerman ? "Produkt prüfen" : isSpanish ? "Revisar producto" : "Review product",

            route: "/app/products",

            productTitle: weakBestSeller.productTitle,
            productId: weakBestSeller.productId,

            metadata: {
                currentMargin: weakBestSeller.marginPct,
                revenue: weakBestSeller.revenue,
                profit: weakBestSeller.profit,
                quantity: weakBestSeller.qty,
                currentPrice: weakBestSeller.avgPrice,
                targetPrice: weakBestSeller.targetPrice,
            },
        });
    }

    /*
     * ALERT 10
     * Ricavi in crescita ma margine in calo
     */
    if (revenueGrowingWhileMarginFalls) {
        alerts.push({
            id: "revenue-up-margin-down",
            severity: "warning",
            category: "growth",

            title: isItalian
                ? "I ricavi crescono, ma il margine sta peggiorando"
                : isFrench ? "Le chiffre d'affaires augmente, mais la marge diminue" : isGerman ? "Der Umsatz wächst, während die Marge sinkt" : isSpanish ? "Los ingresos crecen mientras el margen disminuye" : "Revenue is growing while margin is declining",

            description: isItalian
                ? `I ricavi sono aumentati del ${pct(
                    revenueDeltaPct,
                )}, mentre il margine è diminuito di ${number(
                    Math.abs(marginDelta),
                    1,
                )} punti. Questo segnale consolida il deterioramento del margine perché descrive lo stesso movimento economico.`
                : isFrench ? `Le chiffre d'affaires a augmenté de ${pct(
                    revenueDeltaPct,
                )}, tandis que la marge a diminué de ${number(
                    Math.abs(marginDelta),
                    1,
                )} points. Ce signal consolide la détérioration actuelle de la marge, car les deux décrivent le même mouvement économique sous-jacent.` : isGerman ? `Der Umsatz ist um ${pct(
                    revenueDeltaPct,
                )} gestiegen, während die Marge um ${number(
                    Math.abs(marginDelta),
                    1,
                )} Punkte gesunken ist. Dieses Signal bündelt die aktuelle Margenverschlechterung, da beide dieselbe wirtschaftliche Entwicklung beschreiben.` : isSpanish ? `Los ingresos aumentaron un ${pct(
                    revenueDeltaPct,
                )}, mientras que el margen disminuyó ${number(
                    Math.abs(marginDelta),
                    1,
                )} puntos. Esta señal consolida el deterioro actual del margen porque ambas describen el mismo movimiento económico subyacente.` : `Revenue increased by ${pct(
                    revenueDeltaPct,
                )}, while margin declined by ${number(
                    Math.abs(marginDelta),
                    1,
                )} points. This consolidates the current margin-deterioration signal because both describe the same underlying movement.`,

            monthlyImpact: normalizeToMonthly(
                revenue * (Math.abs(marginDelta) / 100),
                periodDays,
            ),
            economicKind: "exposure",

            priority: 91,

            actionLabel: isItalian
                ? "Apri AI Advisor"
                : isFrench ? "Ouvrir AI Advisor" : isGerman ? "AI Advisor öffnen" : isSpanish ? "Abrir AI Advisor" : "Open AI Advisor",

            route: "/app/ai-advisor",

            metadata: {
                revenue,
                currentMargin: grossMargin,
                marginChange: marginDelta,
            },
        });
    }

    /*
     * Stato positivo quando non esistono problemi significativi.
     */
    const hasSignificantRisk = alerts.some(
        (alert) =>
            alert.severity === "critical" ||
            alert.severity === "warning",
    );

    if (!hasSignificantRisk) {
        alerts.push({
            id: "profit-monitor-stable",
            severity: "info",
            category: "growth",

            title: isItalian
                ? "Nessun rischio critico rilevato"
                : isFrench ? "Aucun risque critique pour le bénéfice détecté" : isGerman ? "Keine kritischen Gewinnrisiken erkannt" : isSpanish ? "No se han detectado riesgos críticos para el beneficio" : "No critical profit risks detected",

            description: isItalian
                ? "Non emergono rischi significativi dai dati disponibili. Le eventuali opportunità restano separate e possono essere valutate senza urgenza."
                : isFrench ? "Aucun risque significatif ne ressort des données disponibles. Les opportunités éventuelles restent distinctes et peuvent être évaluées sans urgence." : isGerman ? "Aus den verfügbaren Daten ergeben sich keine wesentlichen Risiken. Mögliche Chancen bleiben getrennt und können ohne Dringlichkeit bewertet werden." : isSpanish ? "Los datos disponibles no muestran riesgos significativos. Las posibles oportunidades permanecen separadas y pueden evaluarse sin urgencia." : "No significant risks emerge from the available data. Any opportunities remain separate and can be evaluated without urgency.",

            monthlyImpact: 0,
            economicKind: "qualitative",
            priority: 20,

            actionLabel: isItalian
                ? "Apri AI Advisor"
                : isFrench ? "Ouvrir AI Advisor" : isGerman ? "AI Advisor öffnen" : isSpanish ? "Abrir AI Advisor" : "Open AI Advisor",

            route: "/app/ai-advisor",
        });
    }

    const enrichedAlerts =
        alerts.map(enrichProfitAlert);

    return sortAlerts(enrichedAlerts);
}

export function getProfitAlertCounts(alerts: ProfitAlert[]) {
    return alerts.reduce(
        (counts, alert) => {
            counts.total += 1;
            counts[alert.severity] += 1;

            return counts;
        },
        {
            total: 0,
            critical: 0,
            warning: 0,
            opportunity: 0,
            info: 0,
        },
    );
}
