import type { Language } from "~/utils/i18n";
import type { Row, Summary } from "~/utils/margin";

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
        const severityDifference =
            severityWeight[b.severity] - severityWeight[a.severity];

        if (severityDifference !== 0) {
            return severityDifference;
        }

        const priorityDifference = b.priority - a.priority;

        if (priorityDifference !== 0) {
            return priorityDifference;
        }

        return b.monthlyImpact - a.monthlyImpact;
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
            recommendedModule: "Profit Copilot",
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
            recommendedModule: "Profit Copilot",
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
        return "Profit Action Center";
    }

    if (
        route.includes("forecasting")
    ) {
        return "Profit Forecast";
    }

    if (
        route.includes("ai-advisor")
    ) {
        return "Profit Copilot";
    }

    return "MarginLab";
}

export function generateProfitAlerts({
    summary,
    rows,
    language,
    period = 30,
}: GenerateProfitAlertsInput): ProfitAlert[] {
    const alerts: ProfitAlertInput[] = [];

    const isItalian = language === "it";
    const periodDays = getPeriodDays(period);

    const revenue = safeNumber(summary.revenue);
    const grossProfit = safeNumber(summary.profit);
    const grossMargin = safeNumber(summary.marginPct);

    const discounts = Math.max(0, safeNumber(summary.discounts));
    const refunds = Math.max(0, safeNumber(summary.refunds));
    const totalLeak = Math.max(0, safeNumber(summary.totalLeak));

    const losingProducts = rows.filter((row) => row.losing);
    const missingCostProducts = rows.filter((row) => row.missingCost);
    const lowMarginProducts = rows.filter(
        (row) => row.lowMargin && !row.losing,
    );

    const recoverableProfitForPeriod = rows.reduce((sum, row) => {
        const opportunity =
            Math.max(0, safeNumber(row.targetDelta)) *
            Math.max(0, safeNumber(row.qty));

        return sum + opportunity;
    }, 0);

    const monthlyRecoverableProfit = normalizeToMonthly(
        recoverableProfitForPeriod,
        periodDays,
    );

    const monthlyLeak = normalizeToMonthly(totalLeak, periodDays);
    const monthlyDiscounts = normalizeToMonthly(discounts, periodDays);
    const monthlyRefunds = normalizeToMonthly(refunds, periodDays);

    const discountRate =
        revenue > 0 ? (discounts / revenue) * 100 : 0;

    const refundRate =
        revenue > 0 ? (refunds / revenue) * 100 : 0;

    /*
     * ALERT 1
     * Prodotti venduti sotto costo
     */
    if (losingProducts.length > 0) {
        const losingImpactForPeriod = losingProducts.reduce(
            (sum, row) => sum + Math.max(0, -safeNumber(row.profit)),
            0,
        );

        const monthlyLosingImpact = Math.max(
            normalizeToMonthly(losingImpactForPeriod, periodDays),
            monthlyLeak,
        );

        const worstLosingProduct = [...losingProducts].sort(
            (a, b) => a.profit - b.profit,
        )[0];

        alerts.push({
            id: "losing-products",
            severity: "critical",
            category: "pricing",

            title: isItalian
                ? `${losingProducts.length} prodotti stanno generando perdite`
                : `${losingProducts.length} products are losing money`,

            description: worstLosingProduct
                ? isItalian
                    ? `${worstLosingProduct.productTitle} rappresenta il rischio principale. Prezzo, costo e margine devono essere controllati prima di aumentare i volumi.`
                    : `${worstLosingProduct.productTitle} is the biggest current risk. Review price, cost and margin before increasing volume.`
                : isItalian
                    ? "Alcuni prodotti vengono venduti con profitto negativo e richiedono un intervento immediato."
                    : "Some products are selling at a negative profit and require immediate action.",

            monthlyImpact: monthlyLosingImpact,
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
        alerts.push({
            id: "missing-product-costs",
            severity:
                missingCostProducts.length >= 5 ? "critical" : "warning",
            category: "data-quality",

            title: isItalian
                ? `${missingCostProducts.length} prodotti non hanno un costo registrato`
                : `${missingCostProducts.length} products are missing cost data`,

            description: isItalian
                ? "I costi mancanti possono nascondere prodotti non profittevoli e riducono l'affidabilità di Copilot, Forecasting e delle simulazioni."
                : "Missing costs can hide unprofitable products and reduce the reliability of Copilot, Forecasting and simulations.",

            monthlyImpact: 0,
            priority: missingCostProducts.length >= 5 ? 98 : 88,

            actionLabel: isItalian
                ? "Completa i costi"
                : "Complete costs",

            route: "/app/products",

            metadata: {
                missingCostCount: missingCostProducts.length,
                affectedProducts: missingCostProducts.length,
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
                ? `Il margine complessivo è sceso al ${grossMargin.toFixed(1)}%`
                : `Overall margin is ${grossMargin.toFixed(1)}%`,

            description: isItalian
                ? isCritical
                    ? "Il margine attuale lascia pochissimo spazio per coprire advertising, spedizioni, commissioni e costi operativi."
                    : "Il margine attuale è fragile e può deteriorarsi rapidamente con sconti, rimborsi o aumenti dei costi."
                : isCritical
                    ? "The current margin leaves very little room for advertising, shipping, fees and operating costs."
                    : "The current margin is fragile and can deteriorate quickly through discounts, refunds or higher costs.",

            monthlyImpact: monthlyLeak,
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
                ? `Il margine è diminuito di ${Math.abs(marginDelta).toFixed(
                    1,
                )} punti`
                : `Margin dropped by ${Math.abs(marginDelta).toFixed(
                    1,
                )} points`,

            description: isItalian
                ? `Il margine è passato da circa ${previousMargin.toFixed(
                    1,
                )}% al ${grossMargin.toFixed(
                    1,
                )}%. Controlla i prodotti che hanno subito il peggioramento maggiore.`
                : `Margin moved from approximately ${previousMargin.toFixed(
                    1,
                )}% to ${grossMargin.toFixed(
                    1,
                )}%. Review the products with the largest deterioration.`,

            monthlyImpact: normalizeToMonthly(
                estimatedPeriodImpact,
                periodDays,
            ),

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
                ? `Gli sconti assorbono il ${discountRate.toFixed(
                    1,
                )}% dei ricavi`
                : `Discounts represent ${discountRate.toFixed(
                    1,
                )}% of revenue`,

            description: isItalian
                ? "Verifica che le promozioni stiano generando vendite aggiuntive sufficienti a compensare la perdita di margine."
                : "Verify that promotions are generating enough additional sales to compensate for the lost margin.",

            monthlyImpact: monthlyDiscounts,
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
                ? `I rimborsi rappresentano il ${refundRate.toFixed(
                    1,
                )}% dei ricavi`
                : `Refunds represent ${refundRate.toFixed(
                    1,
                )}% of revenue`,

            description: isItalian
                ? "Controlla se i rimborsi sono concentrati su specifici prodotti, problemi di qualità o criticità nell'evasione degli ordini."
                : "Check whether refunds are concentrated around specific products, quality issues or fulfillment problems.",

            monthlyImpact: monthlyRefunds,
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
     * Opportunità complessiva di recupero
     */
    if (monthlyRecoverableProfit > 0) {
        alerts.push({
            id: "recoverable-profit-opportunity",
            severity: "opportunity",
            category: "growth",

            title: isItalian
                ? `${monthlyRecoverableProfit.toFixed(
                    0,
                )} di profitto mensile potenzialmente recuperabile`
                : `${monthlyRecoverableProfit.toFixed(
                    0,
                )} in potential monthly profit recovery`,

            description: isItalian
                ? `${rows.filter((row) => row.targetDelta > 0).length} prodotti presentano un'opportunità di prezzo o margine che può essere simulata prima di applicare modifiche.`
                : `${rows.filter((row) => row.targetDelta > 0).length} products have a pricing or margin opportunity that can be simulated before making changes.`,

            monthlyImpact: monthlyRecoverableProfit,
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
                affectedProducts: rows.filter(
                    (row) => row.targetDelta > 0,
                ).length,
                periodImpact: recoverableProfitForPeriod,
            },
        });
    }

    /*
     * ALERT 8
     * Migliore opportunità di prezzo su singolo prodotto
     */
    const pricingOpportunities = rows
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
                ? `${row.productTitle} offre la migliore opportunità di prezzo`
                : `${row.productTitle} has the strongest pricing opportunity`,

            description: isItalian
                ? `Un adeguamento stimato del ${priceIncreasePct.toFixed(
                    1,
                )}% porterebbe il prezzo verso ${row.targetPrice.toFixed(
                    2,
                )}, con un recupero potenziale da verificare nel simulatore.`
                : `An estimated ${priceIncreasePct.toFixed(
                    1,
                )}% adjustment would move the price toward ${row.targetPrice.toFixed(
                    2,
                )}, with a potential recovery that should be tested in the simulator.`,

            monthlyImpact: normalizeToMonthly(opportunity, periodDays),
            priority: 78,

            actionLabel: isItalian
                ? "Simula questa opportunità"
                : "Simulate this opportunity",

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
    const weakBestSeller = [...rows]
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
                ? `${weakBestSeller.productTitle} genera ricavi elevati ma lavora con un margine del ${weakBestSeller.marginPct.toFixed(
                    1,
                )}%. L'aumento dei volumi potrebbe amplificare il problema.`
                : `${weakBestSeller.productTitle} generates strong revenue but operates at a ${weakBestSeller.marginPct.toFixed(
                    1,
                )}% margin. Higher volume could amplify the problem.`,

            monthlyImpact: normalizeToMonthly(
                Math.max(
                    0,
                    weakBestSeller.targetDelta * weakBestSeller.qty,
                ),
                periodDays,
            ),

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
                ? `I ricavi sono aumentati del ${revenueDeltaPct.toFixed(
                    1,
                )}%, mentre il margine è diminuito di ${Math.abs(
                    marginDelta,
                ).toFixed(
                    1,
                )} punti. La crescita attuale potrebbe non tradursi in profitto di qualità.`
                : `Revenue increased by ${revenueDeltaPct.toFixed(
                    1,
                )}%, while margin declined by ${Math.abs(
                    marginDelta,
                ).toFixed(
                    1,
                )} points. Current growth may not be translating into quality profit.`,

            monthlyImpact: normalizeToMonthly(
                revenue * (Math.abs(marginDelta) / 100),
                periodDays,
            ),

            priority: 91,

            actionLabel: isItalian
                ? "Apri Profit Copilot"
                : "Open Profit Copilot",

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
    if (alerts.length === 0) {
        alerts.push({
            id: "profit-monitor-stable",
            severity: "info",
            category: "growth",

            title: isItalian
                ? "Nessun rischio critico rilevato"
                : "No critical profit risks detected",

            description: isItalian
                ? "Margini, costi e opportunità risultano stabili sulla base dei dati disponibili. Continua a monitorare l'andamento dello store."
                : "Margins, costs and opportunities appear stable based on available data. Continue monitoring store performance.",

            monthlyImpact: 0,
            priority: 20,

            actionLabel: isItalian
                ? "Apri Profit Copilot"
                : "Open Profit Copilot",

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

export function getTotalMonthlyAlertImpact(alerts: ProfitAlert[]) {
    return alerts.reduce(
        (sum, alert) =>
            sum + Math.max(0, safeNumber(alert.monthlyImpact)),
        0,
    );
}