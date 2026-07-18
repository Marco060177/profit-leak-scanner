import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";

import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import DashboardNav from "~/components/dashboard/DashboardNav";

import dashboardStylesUrl from "~/styles/dashboard.css?url";

import { type LoaderData, money } from "~/utils/margin";
import { getStoredLanguage } from "~/utils/i18n";

import {
    generateProfitAlerts,
    getProfitAlertCounts,
    type ProfitAlert,
    type ProfitAlertSeverity,
} from "~/utils/profit-monitor";

import {
    acknowledgeProfitAlert,
    getProfitAlertStatusCounts,
    markAllProfitAlertsAsRead,
    markProfitAlertAsRead,
    syncProfitAlertStates,
    type ProfitAlertStateMap,
    type ProfitAlertStatus,
} from "~/utils/profit-alert-state";

export const links = () => [
    {
        rel: "stylesheet",
        href: dashboardStylesUrl,
    },
];

export const loader = async ({
    request,
}: {
    request: Request;
}): Promise<LoaderData> => {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "30";

    const { admin, session } = await authenticate.admin(request);

    try {
        await admin.graphql(`query { shop { id } }`);
    } catch {
        throw new Response("Auth/scopes not ready. Reinstall the app.", {
            status: 401,
        });
    }

    return loadMarginDashboardData({
        admin,
        session,
        period,
    });
};

type SeverityFilter = "all" | ProfitAlertSeverity;

type StatusStyle = {
    label: string;
    color: string;
    background: string;
    border: string;
};

function getSeverityStyle(
    severity: ProfitAlertSeverity,
    language: "it" | "en",
): StatusStyle {
    const styles: Record<ProfitAlertSeverity, StatusStyle> = {
        critical: {
            label: language === "it" ? "Critico" : "Critical",
            color: "#ff6b4a",
            background: "rgba(255,107,74,0.11)",
            border: "rgba(255,107,74,0.30)",
        },

        warning: {
            label: language === "it" ? "Attenzione" : "Warning",
            color: "#f59e0b",
            background: "rgba(245,158,11,0.11)",
            border: "rgba(245,158,11,0.28)",
        },

        opportunity: {
            label: language === "it" ? "Opportunità" : "Opportunity",
            color: "#22c55e",
            background: "rgba(34,197,94,0.11)",
            border: "rgba(34,197,94,0.28)",
        },

        info: {
            label: language === "it" ? "Informazione" : "Information",
            color: "#38bdf8",
            background: "rgba(56,189,248,0.11)",
            border: "rgba(56,189,248,0.28)",
        },
    };

    return styles[severity];
}

function getAlertStatusStyle(
    status: ProfitAlertStatus,
    language: "it" | "en",
): StatusStyle {
    const styles: Record<ProfitAlertStatus, StatusStyle> = {
        new: {
            label: language === "it" ? "Nuovo" : "New",
            color: "#ff875f",
            background: "rgba(255,115,80,0.12)",
            border: "rgba(255,115,80,0.30)",
        },

        active: {
            label: language === "it" ? "Attivo" : "Active",
            color: "#38bdf8",
            background: "rgba(56,189,248,0.11)",
            border: "rgba(56,189,248,0.28)",
        },

        acknowledged: {
            label: language === "it" ? "Preso in carico" : "Acknowledged",
            color: "#c084fc",
            background: "rgba(192,132,252,0.11)",
            border: "rgba(192,132,252,0.28)",
        },

        resolved: {
            label: language === "it" ? "Risolto" : "Resolved",
            color: "#4ade80",
            background: "rgba(34,197,94,0.11)",
            border: "rgba(34,197,94,0.28)",
        },
    };

    return styles[status];
}

function formatTimestamp(
    timestamp: string | undefined,
    language: "it" | "en",
) {
    if (!timestamp) {
        return language === "it" ? "Adesso" : "Now";
    }

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return language === "it" ? "Adesso" : "Now";
    }

    const differenceMs = Date.now() - date.getTime();
    const differenceMinutes = Math.max(
        0,
        Math.floor(differenceMs / 60000),
    );

    if (differenceMinutes < 1) {
        return language === "it" ? "Adesso" : "Now";
    }

    if (differenceMinutes < 60) {
        return language === "it"
            ? `${differenceMinutes} min fa`
            : `${differenceMinutes} min ago`;
    }

    const differenceHours = Math.floor(differenceMinutes / 60);

    if (differenceHours < 24) {
        return language === "it"
            ? `${differenceHours} ore fa`
            : `${differenceHours}h ago`;
    }

    const differenceDays = Math.floor(differenceHours / 24);

    if (differenceDays === 1) {
        return language === "it" ? "Ieri" : "Yesterday";
    }

    if (differenceDays < 7) {
        return language === "it"
            ? `${differenceDays} giorni fa`
            : `${differenceDays} days ago`;
    }

    return new Intl.DateTimeFormat(
        language === "it" ? "it-IT" : "en-US",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
        },
    ).format(date);
}

function TinyBadge({
    children,
    color,
}: {
    children: React.ReactNode;
    color: string;
}) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 27,
                padding: "6px 9px",
                borderRadius: 999,
                background: `${color}16`,
                border: `1px solid ${color}36`,
                color,
                fontSize: 9,
                fontWeight: 950,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </span>
    );
}

function SummaryCard({
    label,
    value,
    note,
    color,
}: {
    label: string;
    value: string;
    note: string;
    color: string;
}) {
    return (
        <div
            style={{
                minWidth: 0,
                borderRadius: 21,
                padding: 20,
                background:
                    "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
                border: `1px solid ${color}35`,
                boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.025)",
            }}
        >
            <div
                style={{
                    color,
                    fontSize: 9,
                    fontWeight: 950,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                }}
            >
                {label}
            </div>

            <div
                style={{
                    marginTop: 11,
                    color: "#f8fafc",
                    fontSize: 32,
                    lineHeight: 1,
                    fontWeight: 950,
                    letterSpacing: "-0.04em",
                }}
            >
                {value}
            </div>

            <div
                style={{
                    marginTop: 8,
                    color: "rgba(255,255,255,0.48)",
                    fontSize: 11,
                    lineHeight: 1.45,
                    fontWeight: 750,
                }}
            >
                {note}
            </div>
        </div>
    );
}

function AlertCard({
    alert,
    alertStates,
    language,
    onOpen,
    onAcknowledge,
}: {
    alert: ProfitAlert;
    alertStates: ProfitAlertStateMap;
    language: "it" | "en";
    onOpen: (alert: ProfitAlert) => void;
    onAcknowledge: (alertId: string) => void;
}) {
    const state = alertStates[alert.id];

    const lifecycleStatus: ProfitAlertStatus =
        state?.status ?? "new";

    const severityStyle = getSeverityStyle(
        alert.severity,
        language,
    );

    const lifecycleStyle = getAlertStatusStyle(
        lifecycleStatus,
        language,
    );

    const isUnread = state ? !state.isRead : true;
    const isAcknowledged =
        lifecycleStatus === "acknowledged";

    return (
        <article
            style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 24,
                padding: 22,
                background: isUnread
                    ? `radial-gradient(circle at top right, ${severityStyle.background}, transparent 38%), linear-gradient(145deg, rgba(17,24,39,0.99), rgba(7,12,21,0.99))`
                    : "linear-gradient(145deg, rgba(15,22,35,0.97), rgba(7,12,21,0.98))",
                border: isUnread
                    ? `1px solid ${severityStyle.border}`
                    : "1px solid rgba(255,255,255,0.075)",
                boxShadow: isUnread
                    ? "0 20px 55px rgba(0,0,0,0.25)"
                    : "none",
            }}
        >
            {isUnread && (
                <div
                    style={{
                        position: "absolute",
                        top: 18,
                        right: 18,
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: severityStyle.color,
                        boxShadow: `0 0 18px ${severityStyle.color}`,
                    }}
                />
            )}

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "54px minmax(0,1fr) auto",
                    gap: 17,
                    alignItems: "start",
                }}
            >
                <div
                    style={{
                        width: 52,
                        height: 52,
                        borderRadius: 17,
                        display: "grid",
                        placeItems: "center",
                        color: severityStyle.color,
                        background: severityStyle.background,
                        border: `1px solid ${severityStyle.border}`,
                        fontSize: 20,
                        fontWeight: 950,
                    }}
                >
                    {alert.severity === "critical"
                        ? "!"
                        : alert.severity === "warning"
                            ? "↗"
                            : alert.severity === "opportunity"
                                ? "+"
                                : "i"}
                </div>

                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                        }}
                    >
                        <TinyBadge color={severityStyle.color}>
                            {severityStyle.label}
                        </TinyBadge>

                        <TinyBadge color={lifecycleStyle.color}>
                            {lifecycleStyle.label}
                        </TinyBadge>

                        <TinyBadge color="#94a3b8">
                            {alert.category}
                        </TinyBadge>
                    </div>

                    <h2
                        style={{
                            margin: "12px 0 0",
                            color: "#f8fafc",
                            fontSize: 20,
                            lineHeight: 1.28,
                            fontWeight: 950,
                            letterSpacing: "-0.025em",
                        }}
                    >
                        {alert.title}
                    </h2>

                    <p
                        style={{
                            margin: "8px 0 0",
                            maxWidth: 850,
                            color: "rgba(255,255,255,0.59)",
                            fontSize: 13,
                            lineHeight: 1.65,
                            fontWeight: 720,
                        }}
                    >
                        {alert.description}
                    </p>

                    <div
                        style={{
                            marginTop: 13,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <TinyBadge color="#38bdf8">
                            {alert.estimatedMinutes} min
                        </TinyBadge>

                        <TinyBadge color="#c084fc">
                            {alert.recommendedModule}
                        </TinyBadge>

                        <TinyBadge color="#64748b">
                            {formatTimestamp(
                                state?.firstSeenAt,
                                language,
                            )}
                        </TinyBadge>
                    </div>
                </div>

                <div
                    style={{
                        minWidth: 175,
                        textAlign: "right",
                    }}
                >
                    <div
                        style={{
                            color:
                                alert.severity === "opportunity"
                                    ? "#22c55e"
                                    : severityStyle.color,
                            fontSize: 23,
                            lineHeight: 1,
                            fontWeight: 950,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {alert.monthlyImpact > 0
                            ? `${alert.severity === "opportunity"
                                ? "+"
                                : ""
                            }${money(alert.monthlyImpact)}`
                            : language === "it"
                                ? "Segnale qualitativo"
                                : "Qualitative signal"}
                    </div>

                    <div
                        style={{
                            marginTop: 7,
                            color: "rgba(255,255,255,0.42)",
                            fontSize: 9,
                            fontWeight: 850,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                        }}
                    >
                        {alert.monthlyImpact > 0
                            ? language === "it"
                                ? "Impatto mensile stimato"
                                : "Estimated monthly impact"
                            : language === "it"
                                ? "Impatto da verificare"
                                : "Impact to review"}
                    </div>

                    <div
                        style={{
                            marginTop: 15,
                            display: "grid",
                            gap: 8,
                        }}
                    >
                        <button
                            type="button"
                            className="primary-button"
                            onClick={() => onOpen(alert)}
                        >
                            {language === "it"
                                ? "Apri modulo →"
                                : "Open module →"}
                        </button>

                        {!isAcknowledged && (
                            <button
                                type="button"
                                className="apply-button"
                                onClick={() =>
                                    onAcknowledge(alert.id)
                                }
                            >
                                {language === "it"
                                    ? "Prendi in carico"
                                    : "Acknowledge"}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div
                style={{
                    marginTop: 19,
                    paddingTop: 16,
                    borderTop:
                        "1px solid rgba(255,255,255,0.065)",
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(3,minmax(0,1fr))",
                    gap: 12,
                }}
            >
                <div>
                    <div
                        style={{
                            color: "rgba(255,255,255,0.35)",
                            fontSize: 8,
                            fontWeight: 950,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                        }}
                    >
                        {language === "it"
                            ? "Priorità"
                            : "Priority"}
                    </div>

                    <div
                        style={{
                            marginTop: 5,
                            color: "#f8fafc",
                            fontSize: 14,
                            fontWeight: 900,
                        }}
                    >
                        {alert.priority}/100
                    </div>
                </div>

                <div>
                    <div
                        style={{
                            color: "rgba(255,255,255,0.35)",
                            fontSize: 8,
                            fontWeight: 950,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                        }}
                    >
                        {language === "it"
                            ? "Azione"
                            : "Business action"}
                    </div>

                    <div
                        style={{
                            marginTop: 5,
                            color: severityStyle.color,
                            fontSize: 14,
                            fontWeight: 900,
                            textTransform: "capitalize",
                        }}
                    >
                        {alert.businessAction}
                    </div>
                </div>

                <div>
                    <div
                        style={{
                            color: "rgba(255,255,255,0.35)",
                            fontSize: 8,
                            fontWeight: 950,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                        }}
                    >
                        {language === "it"
                            ? "Prodotto"
                            : "Product"}
                    </div>

                    <div
                        style={{
                            marginTop: 5,
                            color: "#f8fafc",
                            fontSize: 14,
                            fontWeight: 900,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {alert.productTitle ??
                            (language === "it"
                                ? "Intero store"
                                : "Store-wide")}
                    </div>
                </div>
            </div>
        </article>
    );
}

export default function AlertCenterPage() {
    const { summary, rows, period } =
        useLoaderData() as LoaderData;

    const navigate = useNavigate();

    const language =
        getStoredLanguage() === "it" ? "it" : "en";

    const alerts = React.useMemo(
        () =>
            generateProfitAlerts({
                summary,
                rows,
                language,
                period,
            }),
        [summary, rows, language, period],
    );

    const [alertStates, setAlertStates] =
        React.useState<ProfitAlertStateMap>({});

    const [severityFilter, setSeverityFilter] =
        React.useState<SeverityFilter>("all");

    const [showAcknowledged, setShowAcknowledged] =
        React.useState(true);

    React.useEffect(() => {
        const syncedStates = syncProfitAlertStates(
            alerts.map((alert) => alert.id),
        );

        setAlertStates(syncedStates);
    }, [alerts]);

    const severityCounts = React.useMemo(
        () => getProfitAlertCounts(alerts),
        [alerts],
    );

    const lifecycleCounts = React.useMemo(
        () => getProfitAlertStatusCounts(alertStates),
        [alertStates],
    );

    const filteredAlerts = React.useMemo(() => {
        return alerts.filter((alert) => {
            if (
                severityFilter !== "all" &&
                alert.severity !== severityFilter
            ) {
                return false;
            }

            const state = alertStates[alert.id];

            if (
                !showAcknowledged &&
                state?.status === "acknowledged"
            ) {
                return false;
            }

            return true;
        });
    }, [
        alerts,
        alertStates,
        severityFilter,
        showAcknowledged,
    ]);

    const totalMonthlyImpact = alerts.reduce(
        (sum, alert) =>
            sum + Math.max(0, alert.monthlyImpact),
        0,
    );

    const criticalCount = severityCounts.critical;
    const warningCount = severityCounts.warning;

    const businessStatus =
        criticalCount > 0
            ? {
                label:
                    language === "it"
                        ? "Intervento richiesto"
                        : "Action required",
                description:
                    language === "it"
                        ? "È presente almeno un rischio critico che richiede una verifica prioritaria."
                        : "At least one critical profitability risk requires priority review.",
                color: "#ff6b4a",
            }
            : warningCount > 0
                ? {
                    label:
                        language === "it"
                            ? "Verifica consigliata"
                            : "Review recommended",
                    description:
                        language === "it"
                            ? "Non emerge un'emergenza generale, ma alcuni segnali meritano attenzione."
                            : "There is no broad emergency, but some signals deserve attention.",
                    color: "#f59e0b",
                }
                : severityCounts.opportunity > 0
                    ? {
                        label:
                            language === "it"
                                ? "Opportunità disponibili"
                                : "Opportunities available",
                        description:
                            language === "it"
                                ? "La situazione è relativamente stabile e sono disponibili opportunità di ottimizzazione."
                                : "The business is relatively stable and optimization opportunities are available.",
                        color: "#22c55e",
                    }
                    : {
                        label:
                            language === "it"
                                ? "Situazione stabile"
                                : "Stable status",
                        description:
                            language === "it"
                                ? "Nessun rischio significativo richiede un intervento immediato."
                                : "No significant profitability risk requires immediate action.",
                        color: "#38bdf8",
                    };

    const handleOpenAlert = (alert: ProfitAlert) => {
        const nextStates = markProfitAlertAsRead(
            alert.id,
        );

        setAlertStates(nextStates);
        navigate(alert.route);
    };

    const handleAcknowledge = (alertId: string) => {
        const nextStates =
            acknowledgeProfitAlert(alertId);

        setAlertStates(nextStates);
    };

    const handleMarkAllRead = () => {
        const nextStates =
            markAllProfitAlertsAsRead();

        setAlertStates(nextStates);
    };

    const filters: Array<{
        id: SeverityFilter;
        label: string;
        count: number;
        color: string;
    }> = [
            {
                id: "all",
                label: language === "it" ? "Tutti" : "All",
                count: severityCounts.total,
                color: "#f8fafc",
            },
            {
                id: "critical",
                label:
                    language === "it" ? "Critici" : "Critical",
                count: severityCounts.critical,
                color: "#ff6b4a",
            },
            {
                id: "warning",
                label:
                    language === "it"
                        ? "Attenzione"
                        : "Warnings",
                count: severityCounts.warning,
                color: "#f59e0b",
            },
            {
                id: "opportunity",
                label:
                    language === "it"
                        ? "Opportunità"
                        : "Opportunities",
                count: severityCounts.opportunity,
                color: "#22c55e",
            },
            {
                id: "info",
                label:
                    language === "it"
                        ? "Informazioni"
                        : "Information",
                count: severityCounts.info,
                color: "#38bdf8",
            },
        ];

    return (
        <div className="dashboard-shell">
            <div className="dashboard-container">
                <DashboardNav
                    active="alert-center"
                    navigate={navigate}
                />

                <div className="hero-header">
                    <div>
                        <div className="alert-pill">
                            <span className="alert-dot" />

                            {language === "it"
                                ? "Monitoraggio redditività"
                                : "Profitability monitoring"}
                        </div>

                        <div className="eyebrow">
                            ALERT CENTER
                        </div>

                        <div className="hero-title">
                            {language === "it"
                                ? "I segnali che meritano la tua attenzione"
                                : "The signals that deserve your attention"}
                        </div>

                        <div className="hero-description">
                            {language === "it"
                                ? "MarginLab controlla margini, costi, rimborsi e opportunità. Qui trovi soltanto i segnali che possono influenzare realmente la redditività dello store."
                                : "MarginLab monitors margins, costs, refunds and opportunities. Here you only see signals that can materially affect store profitability."}
                        </div>
                    </div>

                    <button
                        type="button"
                        className="apply-button"
                        onClick={handleMarkAllRead}
                        disabled={lifecycleCounts.unread === 0}
                        style={{
                            opacity:
                                lifecycleCounts.unread === 0
                                    ? 0.55
                                    : 1,
                        }}
                    >
                        {language === "it"
                            ? "Segna tutti come letti"
                            : "Mark all as read"}
                    </button>
                </div>

                <section
                    style={{
                        marginBottom: 25,
                        borderRadius: 30,
                        padding: 28,
                        background: `radial-gradient(circle at 12% 15%, ${businessStatus.color}20, transparent 32%), radial-gradient(circle at 88% 12%, rgba(255,115,80,0.10), transparent 30%), linear-gradient(135deg, rgba(15,23,36,0.99), rgba(6,11,20,0.99))`,
                        border: `1px solid ${businessStatus.color}38`,
                        boxShadow:
                            "0 28px 90px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.03)",
                    }}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                "1.1fr 0.9fr",
                            gap: 25,
                            alignItems: "center",
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    color: businessStatus.color,
                                    fontSize: 10,
                                    fontWeight: 950,
                                    letterSpacing: "0.14em",
                                    textTransform: "uppercase",
                                }}
                            >
                                {language === "it"
                                    ? "STATO DEL MONITORAGGIO"
                                    : "MONITORING STATUS"}
                            </div>

                            <h2
                                style={{
                                    margin: "11px 0 0",
                                    color: "#f8fafc",
                                    fontSize: 36,
                                    lineHeight: 1.12,
                                    fontWeight: 950,
                                    letterSpacing: "-0.045em",
                                }}
                            >
                                {businessStatus.label}
                            </h2>

                            <p
                                style={{
                                    margin: "12px 0 0",
                                    maxWidth: 720,
                                    color:
                                        "rgba(255,255,255,0.64)",
                                    fontSize: 14,
                                    lineHeight: 1.7,
                                    fontWeight: 730,
                                }}
                            >
                                {businessStatus.description}
                            </p>

                            <div
                                style={{
                                    marginTop: 20,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    flexWrap: "wrap",
                                }}
                            >
                                <TinyBadge
                                    color={businessStatus.color}
                                >
                                    {lifecycleCounts.unread}{" "}
                                    {language === "it"
                                        ? "non letti"
                                        : "unread"}
                                </TinyBadge>

                                <TinyBadge color="#38bdf8">
                                    {lifecycleCounts.active}{" "}
                                    {language === "it"
                                        ? "attivi"
                                        : "active"}
                                </TinyBadge>

                                <TinyBadge color="#c084fc">
                                    {lifecycleCounts.acknowledged}{" "}
                                    {language === "it"
                                        ? "presi in carico"
                                        : "acknowledged"}
                                </TinyBadge>
                            </div>
                        </div>

                        <div
                            style={{
                                borderRadius: 25,
                                padding: 23,
                                background:
                                    "rgba(255,255,255,0.025)",
                                border:
                                    "1px solid rgba(255,255,255,0.075)",
                            }}
                        >
                            <div
                                style={{
                                    color:
                                        "rgba(255,255,255,0.42)",
                                    fontSize: 9,
                                    fontWeight: 950,
                                    letterSpacing: "0.12em",
                                    textTransform: "uppercase",
                                }}
                            >
                                {language === "it"
                                    ? "IMPATTO COMPLESSIVO MENSILE"
                                    : "TOTAL MONTHLY IMPACT"}
                            </div>

                            <div
                                style={{
                                    marginTop: 13,
                                    color: "#f8fafc",
                                    fontSize: 47,
                                    lineHeight: 1,
                                    fontWeight: 950,
                                    letterSpacing: "-0.055em",
                                }}
                            >
                                {money(totalMonthlyImpact)}
                            </div>

                            <div
                                style={{
                                    marginTop: 9,
                                    color:
                                        "rgba(255,255,255,0.47)",
                                    fontSize: 11,
                                    lineHeight: 1.55,
                                    fontWeight: 750,
                                }}
                            >
                                {language === "it"
                                    ? "Somma indicativa dei rischi e delle opportunità rilevate nel periodo selezionato."
                                    : "Indicative total of risks and opportunities detected during the selected period."}
                            </div>
                        </div>
                    </div>
                </section>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(4,minmax(0,1fr))",
                        gap: 13,
                        marginBottom: 25,
                    }}
                >
                    <SummaryCard
                        label={
                            language === "it"
                                ? "Critici"
                                : "Critical"
                        }
                        value={`${severityCounts.critical}`}
                        note={
                            language === "it"
                                ? "Richiedono priorità"
                                : "Require priority"
                        }
                        color="#ff6b4a"
                    />

                    <SummaryCard
                        label={
                            language === "it"
                                ? "Attenzione"
                                : "Warnings"
                        }
                        value={`${severityCounts.warning}`}
                        note={
                            language === "it"
                                ? "Da controllare"
                                : "Need review"
                        }
                        color="#f59e0b"
                    />

                    <SummaryCard
                        label={
                            language === "it"
                                ? "Opportunità"
                                : "Opportunities"
                        }
                        value={`${severityCounts.opportunity}`}
                        note={
                            language === "it"
                                ? "Possibile miglioramento"
                                : "Potential improvement"
                        }
                        color="#22c55e"
                    />

                    <SummaryCard
                        label={
                            language === "it"
                                ? "Non letti"
                                : "Unread"
                        }
                        value={`${lifecycleCounts.unread}`}
                        note={
                            language === "it"
                                ? "Nuovi segnali"
                                : "New signals"
                        }
                        color="#38bdf8"
                    />
                </div>

                <section
                    className="panel"
                    style={{
                        margin: 0,
                        padding: 22,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent:
                                "space-between",
                            alignItems: "center",
                            gap: 16,
                            flexWrap: "wrap",
                        }}
                    >
                        <div>
                            <div className="panel-eyebrow">
                                {language === "it"
                                    ? "SEGNALI ATTIVI"
                                    : "ACTIVE SIGNALS"}
                            </div>

                            <h2
                                className="panel-title"
                                style={{ marginTop: 6 }}
                            >
                                {language === "it"
                                    ? "Profit Alert Feed"
                                    : "Profit Alert Feed"}
                            </h2>
                        </div>

                        <label
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 9,
                                color:
                                    "rgba(255,255,255,0.55)",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={showAcknowledged}
                                onChange={(event) =>
                                    setShowAcknowledged(
                                        event.target.checked,
                                    )
                                }
                            />

                            {language === "it"
                                ? "Mostra presi in carico"
                                : "Show acknowledged"}
                        </label>
                    </div>

                    <div
                        style={{
                            marginTop: 20,
                            display: "flex",
                            gap: 9,
                            flexWrap: "wrap",
                        }}
                    >
                        {filters.map((filter) => {
                            const selected =
                                severityFilter === filter.id;

                            return (
                                <button
                                    key={filter.id}
                                    type="button"
                                    onClick={() =>
                                        setSeverityFilter(
                                            filter.id,
                                        )
                                    }
                                    style={{
                                        cursor: "pointer",
                                        minHeight: 38,
                                        padding: "9px 13px",
                                        borderRadius: 999,
                                        color: selected
                                            ? filter.color
                                            : "rgba(255,255,255,0.52)",
                                        background: selected
                                            ? `${filter.color}16`
                                            : "rgba(255,255,255,0.025)",
                                        border: selected
                                            ? `1px solid ${filter.color}42`
                                            : "1px solid rgba(255,255,255,0.07)",
                                        fontSize: 10,
                                        fontWeight: 900,
                                    }}
                                >
                                    {filter.label}{" "}
                                    <span
                                        style={{
                                            marginLeft: 5,
                                            opacity: 0.72,
                                        }}
                                    >
                                        {filter.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div
                        style={{
                            marginTop: 21,
                            display: "grid",
                            gap: 14,
                        }}
                    >
                        {filteredAlerts.length > 0 ? (
                            filteredAlerts.map((alert) => (
                                <AlertCard
                                    key={alert.id}
                                    alert={alert}
                                    alertStates={alertStates}
                                    language={language}
                                    onOpen={handleOpenAlert}
                                    onAcknowledge={
                                        handleAcknowledge
                                    }
                                />
                            ))
                        ) : (
                            <div
                                style={{
                                    padding: 32,
                                    textAlign: "center",
                                    borderRadius: 21,
                                    color:
                                        "rgba(255,255,255,0.54)",
                                    background:
                                        "rgba(255,255,255,0.025)",
                                    border:
                                        "1px solid rgba(255,255,255,0.07)",
                                    fontSize: 13,
                                    fontWeight: 760,
                                }}
                            >
                                {language === "it"
                                    ? "Nessun alert corrisponde ai filtri selezionati."
                                    : "No alerts match the selected filters."}
                            </div>
                        )}
                    </div>
                </section>

                <div
                    style={{
                        marginTop: 23,
                        marginBottom: 24,
                        padding: 18,
                        borderRadius: 18,
                        background:
                            "rgba(255,115,60,0.065)",
                        border:
                            "1px solid rgba(255,115,60,0.18)",
                        color:
                            "rgba(255,255,255,0.62)",
                        fontSize: 12,
                        lineHeight: 1.65,
                        fontWeight: 700,
                    }}
                >
                    {language === "it"
                        ? "Gli alert vengono generati usando i dati Shopify del periodo selezionato. Gli impatti economici sono stime e non rappresentano profitto perso o recuperato già verificato. MarginLab non modifica automaticamente prodotti, prezzi, costi o campagne."
                        : "Alerts are generated using Shopify data from the selected period. Financial impacts are estimates and do not represent verified lost or recovered profit. MarginLab does not automatically modify products, prices, costs or campaigns."}
                </div>
            </div>
        </div>
    );
}