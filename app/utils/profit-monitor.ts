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
            estimatedMinutes: 15,
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
                affectedProducts * 2,
                5,
                30,
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
            estimatedMinutes: 15,
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
            estimatedMinutes: 15,
            recommendedModule: "Profit Intelligence",
        };
    }

    if (alert.id === "discount-exposure") {
        return {
            ...alert,
            businessAction: "optimize",
            effort: "medium",
            estimatedMinutes: 20,
            recommendedModule: "Profit Intelligence",
        };
    }

    if (alert.id === "refund-exposure") {
        return {
            ...alert,
            businessAction: "review",
            effort: "advanced",
            estimatedMinutes: 30,
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
            estimatedMinutes: 10,
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
            estimatedMinutes: 15,
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
            estimatedMinutes: 20,
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
            estimatedMinutes: 5,
            recommendedModule: "AI Advisor",
        };
    }

    if (alert.severity === "critical") {
        return {
            ...alert,
            businessAction: "action",
            effort: "medium",
            estimatedMinutes: 15,
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
            estimatedMinutes: 15,
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
            estimatedMinutes: 10,
            recommendedModule: getModuleFromRoute(
                alert.route,
            ),
        };
    }

    return {
        ...alert,
        businessAction: "monitor",
        effort: "easy",
        estimatedMinutes: 5,
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

    const locale = isItalian ? "it-IT" : "en-US";

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
                : `${losingProducts.length} ${losingProducts.length === 1 ? "product is" : "products are"} generating losses`,

            description: worstLosingProduct
                ? isItalian
                    ? `${worstLosingProduct.productTitle} rappresenta il rischio principale. Prezzo, costo e margine devono essere controllati prima di aumentare i volumi.`
                    : `${worstLosingProduct.productTitle} is the biggest current risk. Review price, cost and margin before increasing volume.`
                : isItalian
                    ? "Alcuni prodotti vengono venduti con profitto negativo e richiedono un intervento immediato."
                    : "Some products are selling at a negative profit and require immediate action.",

            monthlyImpact: monthlyLosingImpact,
            economicKind: "loss",
            priority: 100,

            actionLabel: isItalian
                ? "Controlla i prodotti"
                : "Review products",

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
                : `${missingCostProducts.length} products are missing cost data`,

            description: isItalian
                ? `I prodotti senza costo rappresentano il ${pct(missingCostRevenueShare)} dei ricavi analizzati e riducono l'affidabilità di AI Advisor, Forecasting e delle simulazioni.`
                : `Products without cost data represent ${pct(missingCostRevenueShare)} of analyzed revenue and reduce the reliability of AI Advisor, Forecasting and simulations.`,

            monthlyImpact: monthlyMissingCostExposure,
            economicKind: "exposure",
            priority: isCritical ? 98 : clamp(
                75 + Math.round(missingCostRevenueShare),
                78,
                92,
            ),

            actionLabel: isItalian
                ? "Completa i costi"
                : "Complete costs",

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
                : `Overall margin is ${pct(grossMargin)}`,

            description: isItalian
                ? isCritical
                    ? "Il margine attuale lascia pochissimo spazio per coprire advertising, spedizioni, commissioni e costi operativi."
                    : "Il margine attuale è fragile e può deteriorarsi rapidamente con sconti, rimborsi o aumenti dei costi."
                : isCritical
                    ? "The current margin leaves very little room for advertising, shipping, fees and operating costs."
                    : "The current margin is fragile and can deteriorate quickly through discounts, refunds or higher costs.",

            monthlyImpact: 0,
            economicKind: "qualitative",
            priority: isCritical ? 96 : 86,

            actionLabel: isItalian
                ? "Analizza i margini"
                : "Review margins",

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

    if (marginDelta <= -2) {
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
                : `Margin dropped by ${number(
                    Math.abs(marginDelta),
                    1,
                )} points`,

            description: isItalian
                ? `Il margine è passato da circa ${pct(
                    previousMargin,
                )} al ${pct(
                    grossMargin,
                )}. Controlla i prodotti che hanno subito il peggioramento maggiore.`
                : `Margin moved from approximately ${pct(
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
                : "Open Profit Intelligence",

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
                : `Discounts represent ${pct(discountRate)} of revenue`,

            description: isItalian
                ? "Verifica che le promozioni stiano generando vendite aggiuntive sufficienti a compensare la perdita di margine."
                : "Verify that promotions are generating enough additional sales to compensate for the lost margin.",

            monthlyImpact: monthlyDiscounts,
            economicKind: "exposure",
            priority: isHighDiscountExposure ? 84 : 62,

            actionLabel: isItalian
                ? "Analizza gli sconti"
                : "Review discounts",

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
                : `Refunds represent ${pct(refundRate)} of revenue`,

            description: isItalian
                ? "Controlla se i rimborsi sono concentrati su specifici prodotti, problemi di qualità o criticità nell'evasione degli ordini."
                : "Check whether refunds are concentrated around specific products, quality issues or fulfillment problems.",

            monthlyImpact: monthlyRefunds,
            economicKind: "exposure",
            priority: isHighRefundExposure ? 82 : 60,

            actionLabel: isItalian
                ? "Analizza i rimborsi"
                : "Review refunds",

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
                : `${money(monthlyRecoverableProfit)} theoretical monthly profit gap to target`,

            description: isItalian
                ? `${economicRows.filter((row) => row.targetDelta > 0).length} prodotti presentano un gap di prezzo rispetto al target da verificare nel simulatore. La stima presume volumi invariati e non rappresenta profitto garantito o già recuperato.`
                : `${economicRows.filter((row) => row.targetDelta > 0).length} products have a pricing gap to the target that can be tested in the simulator. The estimate assumes unchanged volume and is not guaranteed or already recovered profit.`,

            monthlyImpact: monthlyRecoverableProfit,
            economicKind: "opportunity",
            priority: clamp(
                70 + Math.round(monthlyRecoverableProfit / 500),
                70,
                89,
            ),

            actionLabel: isItalian
                ? "Apri Recovery Simulator"
                : "Open Recovery Simulator",

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
                : `${row.productTitle} has the largest pricing gap to target`,

            description: isItalian
                ? `Un adeguamento stimato del ${pct(
                    priceIncreasePct,
                )} porterebbe il prezzo verso ${money(
                    row.targetPrice,
                    2,
                )}. È uno scenario teorico al volume attuale da verificare nel simulatore.`
                : `An estimated ${pct(
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
                : "Simulate this scenario",

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
                : `A best seller is generating weak margin`,

            description: isItalian
                ? `${weakBestSeller.productTitle} genera ricavi elevati ma lavora con un margine del ${pct(
                    weakBestSeller.marginPct,
                )}. L'aumento dei volumi potrebbe amplificare il problema.`
                : `${weakBestSeller.productTitle} generates strong revenue but operates at a ${pct(
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
                : "Review product",

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
    const revenueDeltaPct = safeNumber(summary.revenueDeltaPct);

    if (revenueDeltaPct > 5 && marginDelta < 0) {
        alerts.push({
            id: "revenue-up-margin-down",
            severity: "warning",
            category: "growth",

            title: isItalian
                ? "I ricavi crescono, ma il margine sta peggiorando"
                : "Revenue is growing while margin is declining",

            description: isItalian
                ? `I ricavi sono aumentati del ${pct(
                    revenueDeltaPct,
                )}, mentre il margine è diminuito di ${number(
                    Math.abs(marginDelta),
                    1,
                )} punti. La crescita attuale potrebbe non tradursi in profitto di qualità.`
                : `Revenue increased by ${pct(
                    revenueDeltaPct,
                )}, while margin declined by ${number(
                    Math.abs(marginDelta),
                    1,
                )} points. Current growth may not be translating into quality profit.`,

            monthlyImpact: normalizeToMonthly(
                revenue * (Math.abs(marginDelta) / 100),
                periodDays,
            ),
            economicKind: "exposure",

            priority: 91,

            actionLabel: isItalian
                ? "Apri AI Advisor"
                : "Open AI Advisor",

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
                : "No critical profit risks detected",

            description: isItalian
                ? "Non emergono rischi significativi dai dati disponibili. Le eventuali opportunità restano separate e possono essere valutate senza urgenza."
                : "No significant risks emerge from the available data. Any opportunities remain separate and can be evaluated without urgency.",

            monthlyImpact: 0,
            economicKind: "qualitative",
            priority: 20,

            actionLabel: isItalian
                ? "Apri AI Advisor"
                : "Open AI Advisor",

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