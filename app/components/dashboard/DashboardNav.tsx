import * as React from "react";
import {
  getStoredLanguage,
  setStoredLanguage,
  translations,
  type Language,
} from "~/utils/i18n";

type NavId =
  | "overview"
  | "products"
  | "profit"
  | "alert-center"
  | "recommendations"
  | "ai-advisor"
  | "recovery-simulator"
  | "forecasting"
  | "profit-assumptions"
  | "billing";

type Props = {
  active: NavId;
  navigate: (path: string) => void;
};

export default function DashboardNav({
  active,
  navigate,
}: Props) {
  const [language, setLanguage] =
    React.useState<Language>("en");

  const [growthOpen, setGrowthOpen] =
    React.useState(false);

  const growthMenuRef =
    React.useRef<HTMLDivElement | null>(null);

  const closeTimerRef =
    React.useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const openGrowthMenu = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setGrowthOpen(true);
  };

  const scheduleGrowthMenuClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = setTimeout(() => {
      setGrowthOpen(false);
    }, 220);
  };

  React.useEffect(() => {
    setLanguage(getStoredLanguage());
  }, []);

  React.useEffect(() => {
    const handleOutsideClick = (
      event: MouseEvent,
    ) => {
      if (
        growthMenuRef.current &&
        !growthMenuRef.current.contains(
          event.target as Node,
        )
      ) {
        setGrowthOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick,
      );
    };
  }, []);

  const t = translations[language];

  const labels =
    language === "it"
      ? {
          alerts: "Alert",
          growth: "Growth",
          profitCopilot: "Profit Copilot",
          profitActionCenter:
            "Profit Action Center",
          recoverySimulator:
            "Recovery Simulator",
          profitForecast:
            "Previsioni di profitto",
          businessModelStudio:
            "Business Model Studio",
          growthDescription:
            "Strumenti avanzati per aumentare il profitto",
        }
      : {
          alerts: "Alerts",
          growth: "Growth",
          profitCopilot: "Profit Copilot",
          profitActionCenter:
            "Profit Action Center",
          recoverySimulator:
            "Recovery Simulator",
          profitForecast: "Profit Forecast",
          businessModelStudio:
            "Business Model Studio",
          growthDescription:
            "Advanced tools to increase profit",
        };

  const changeLanguage = (
    nextLanguage: Language,
  ) => {
    setLanguage(nextLanguage);
    setStoredLanguage(nextLanguage);

    const params = new URLSearchParams(
      window.location.search,
    );

    params.set("lang", nextLanguage);

    navigate(
      `${window.location.pathname}?${params.toString()}`,
    );
  };

  const openPage = (
    id: NavId,
    path: string,
  ) => {
    setGrowthOpen(false);

    if (active !== id) {
      navigate(path);
    }
  };

  const mainItems = [
    {
      id: "overview",
      label: t.nav.overview,
      path: "/app",
    },
    {
      id: "products",
      label: t.nav.products,
      path: "/app/products",
    },
    {
      id: "profit",
      label: t.nav.profitIntelligence,
      path: "/app/profit-intelligence",
    },
    {
      id: "alert-center",
      label: labels.alerts,
      path: "/app/alert-center",
    },
  ] as const;

  const growthItems = [
    {
      id: "ai-advisor",
      label: labels.profitCopilot,
      description:
        language === "it"
          ? "Briefing, priorità e consulenza AI"
          : "AI briefing, priorities and advice",
      path: "/app/ai-advisor",
      icon: "✦",
    },
    {
      id: "recommendations",
      label: labels.profitActionCenter,
      description:
        language === "it"
          ? "Azioni ordinate per impatto e urgenza"
          : "Actions ranked by impact and urgency",
      path: "/app/recommendations",
      icon: "✓",
    },
    {
      id: "recovery-simulator",
      label: labels.recoverySimulator,
      description:
        language === "it"
          ? "Simula prezzi, costi e vendite"
          : "Simulate pricing, costs and sales",
      path: "/app/recovery-simulator",
      icon: "↗",
    },
    {
      id: "forecasting",
      label: labels.profitForecast,
      description:
        language === "it"
          ? "Previsioni a 3, 6 e 12 mesi"
          : "3, 6 and 12-month forecasts",
      path: "/app/forecasting",
      icon: "⌁",
    },
    {
      id: "profit-assumptions",
      label: labels.businessModelStudio,
      description:
        language === "it"
          ? "Costi, commissioni e break-even"
          : "Costs, fees and break-even",
      path: "/app/profit-assumptions",
      icon: "◇",
    },
  ] as const;

  const growthActive = growthItems.some(
    (item) => item.id === active,
  );

  return (
    <div className="navbar">
      <div
        className="logo"
        onClick={() => navigate("/app")}
        style={{ cursor: "pointer" }}
      >
        MARGIN<span>LAB</span>
      </div>

      <div className="nav-tabs">
        {mainItems.map((item) => (
          <div
            key={item.id}
            className={
              active === item.id
                ? "nav-tab active"
                : "nav-tab"
            }
            onClick={() =>
              openPage(item.id, item.path)
            }
          >
            {item.label}
          </div>
        ))}

        <div
          ref={growthMenuRef}
          style={{
            position: "relative",
          }}
          onMouseEnter={openGrowthMenu}
          onMouseLeave={
            scheduleGrowthMenuClose
          }
        >
          <button
            type="button"
            className={
              growthActive
                ? "nav-tab active"
                : "nav-tab"
            }
            onClick={() =>
              setGrowthOpen(
                (current) => !current,
              )
            }
            aria-expanded={growthOpen}
            aria-haspopup="menu"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              font: "inherit",
            }}
          >
            <span>{labels.growth}</span>

            <span
              style={{
                display: "inline-block",
                fontSize: 10,
                transform: growthOpen
                  ? "rotate(180deg)"
                  : "rotate(0deg)",
                transition:
                  "transform 160ms ease",
              }}
            >
              ▼
            </span>
          </button>

          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              width: 330,
              height: 10,
              pointerEvents: growthOpen
                ? "auto"
                : "none",
            }}
          />

          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              width: 330,
              padding: 10,
              borderRadius: 20,
              background:
                "radial-gradient(circle at top right, rgba(255,115,60,0.10), transparent 38%), linear-gradient(180deg, rgba(17,24,39,0.99), rgba(8,13,22,0.99))",
              border:
                "1px solid rgba(255,115,60,0.24)",
              boxShadow:
                "0 26px 70px rgba(0,0,0,0.52)",
              opacity: growthOpen ? 1 : 0,
              visibility: growthOpen
                ? "visible"
                : "hidden",
              pointerEvents: growthOpen
                ? "auto"
                : "none",
              transform: growthOpen
                ? "translateY(0)"
                : "translateY(-7px)",
              transition:
                "opacity 150ms ease, transform 150ms ease, visibility 150ms ease",
              zIndex: 100,
            }}
          >
            <div
              style={{
                padding: "10px 12px 12px",
                borderBottom:
                  "1px solid rgba(255,255,255,0.07)",
                marginBottom: 7,
              }}
            >
              <div
                style={{
                  color: "#ff9a70",
                  fontSize: 10,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.13em",
                }}
              >
                MarginLab Growth
              </div>

              <div
                style={{
                  marginTop: 5,
                  color:
                    "rgba(255,255,255,0.48)",
                  fontSize: 11,
                  fontWeight: 720,
                }}
              >
                {labels.growthDescription}
              </div>
            </div>

            {growthItems.map((item) => {
              const itemActive =
                active === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    openPage(
                      item.id,
                      item.path,
                    )
                  }
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns:
                      "34px minmax(0, 1fr)",
                    gap: 10,
                    alignItems: "center",
                    padding: "11px 12px",
                    borderRadius: 14,
                    border: itemActive
                      ? "1px solid rgba(255,115,60,0.24)"
                      : "1px solid transparent",
                    background: itemActive
                      ? "rgba(255,115,60,0.12)"
                      : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 11,
                      color: itemActive
                        ? "#ffffff"
                        : "#ff9a70",
                      background: itemActive
                        ? "rgba(255,115,60,0.24)"
                        : "rgba(255,115,60,0.09)",
                      border:
                        "1px solid rgba(255,115,60,0.16)",
                      fontSize: 13,
                      fontWeight: 950,
                    }}
                  >
                    {item.icon}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: itemActive
                          ? "#ffffff"
                          : "rgba(255,255,255,0.82)",
                        fontSize: 13,
                        fontWeight: 900,
                      }}
                    >
                      {item.label}
                    </div>

                    <div
                      style={{
                        marginTop: 3,
                        color:
                          "rgba(255,255,255,0.42)",
                        fontSize: 10,
                        lineHeight: 1.35,
                        fontWeight: 700,
                      }}
                    >
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() =>
                openPage(
                  "billing",
                  "/app/billing",
                )
              }
              style={{
                width: "100%",
                marginTop: 8,
                padding: "12px 14px",
                borderRadius: 14,
                border:
                  "1px solid rgba(255,115,60,0.24)",
                background:
                  "linear-gradient(135deg, rgba(255,115,60,0.22), rgba(255,115,60,0.09))",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 950,
              }}
            >
              {language === "it"
                ? "Scopri il piano Growth →"
                : "Explore Growth Plan →"}
            </button>
          </div>
        </div>

        <div
          className={
            active === "billing"
              ? "nav-tab active"
              : "nav-tab"
          }
          onClick={() =>
            openPage(
              "billing",
              "/app/billing",
            )
          }
        >
          {t.nav.billing}
        </div>

        <div
          style={{
            display: "inline-flex",
            padding: 4,
            borderRadius: 999,
            background:
              "rgba(255,115,60,0.08)",
            border:
              "1px solid rgba(255,115,60,0.18)",
            gap: 4,
          }}
        >
          {(["en", "it"] as const).map(
            (lang) => (
              <button
                key={lang}
                type="button"
                onClick={() =>
                  changeLanguage(lang)
                }
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "7px 10px",
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 12,
                  color:
                    language === lang
                      ? "#ffffff"
                      : "rgba(255,255,255,0.55)",
                  background:
                    language === lang
                      ? "rgba(255,115,60,0.22)"
                      : "transparent",
                }}
              >
                {lang.toUpperCase()}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}