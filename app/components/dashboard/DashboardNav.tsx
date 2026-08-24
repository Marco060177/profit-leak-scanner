import * as React from "react";
import { useI18n } from "~/components/i18n/I18nProvider";
import { isSupportedLanguage, type Language } from "~/utils/i18n";

import {
  getStoredProfitAlertStates,
  getUnreadProfitAlertCount,
} from "~/utils/profit-alert-state";

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
  | "tax-profile"
  | "reports-notifications"
  | "glossary"
  | "support"
  | "billing";

type Props = {
  active: NavId;
  navigate: (path: string) => void;
};

export default function DashboardNav({
  active,
  navigate,
}: Props) {
  const { language, messages: t, setLanguage } = useI18n();

  const [growthOpen, setGrowthOpen] =
    React.useState(false);

  const [moreOpen, setMoreOpen] =
    React.useState(false);

  const [languageOpen, setLanguageOpen] =
    React.useState(false);

  const [unreadAlertCount, setUnreadAlertCount] =
    React.useState(0);

  const growthMenuRef =
    React.useRef<HTMLDivElement | null>(null);

  const moreMenuRef =
    React.useRef<HTMLDivElement | null>(null);

  const languageMenuRef =
    React.useRef<HTMLDivElement | null>(null);

  const closeTimerRef =
    React.useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const moreCloseTimerRef =
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

  const openMoreMenu = () => {
    if (moreCloseTimerRef.current) {
      clearTimeout(moreCloseTimerRef.current);
      moreCloseTimerRef.current = null;
    }

    setMoreOpen(true);
  };

  const scheduleMoreMenuClose = () => {
    if (moreCloseTimerRef.current) {
      clearTimeout(moreCloseTimerRef.current);
    }

    moreCloseTimerRef.current = setTimeout(() => {
      setMoreOpen(false);
    }, 220);
  };

  React.useEffect(() => {
    const refreshUnreadAlertCount = () => {
      const storedStates =
        getStoredProfitAlertStates();

      setUnreadAlertCount(
        getUnreadProfitAlertCount(storedStates),
      );
    };

    refreshUnreadAlertCount();

    const handleStorageChange = () => {
      refreshUnreadAlertCount();
    };

    const handleWindowFocus = () => {
      refreshUnreadAlertCount();
    };

    window.addEventListener(
      "storage",
      handleStorageChange,
    );

    window.addEventListener(
      "focus",
      handleWindowFocus,
    );

    const refreshInterval = window.setInterval(
      refreshUnreadAlertCount,
      1500,
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorageChange,
      );

      window.removeEventListener(
        "focus",
        handleWindowFocus,
      );

      window.clearInterval(refreshInterval);
    };
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

      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(
          event.target as Node,
        )
      ) {
        setMoreOpen(false);
      }

      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(
          event.target as Node,
        )
      ) {
        setLanguageOpen(false);
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

  const labels = t.dashboardNav;

  const changeLanguage = (
    nextLanguage: Language,
  ) => {
    setLanguageOpen(false);
    setLanguage(nextLanguage);

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
    setMoreOpen(false);

    if (active === id) return;

    const currentParams = new URLSearchParams(
      window.location.search,
    );

    const nextParams = new URLSearchParams();

    const lang = currentParams.get("lang");
    const period = currentParams.get("period");

    if (isSupportedLanguage(lang)) {
      nextParams.set("lang", lang);
    }

    const periodAwarePages: NavId[] = [
      "overview",
      "products",
      "profit",
      "alert-center",
      "recommendations",
      "ai-advisor",
      "recovery-simulator",
      "forecasting",
      "profit-assumptions",
    ];

    if (
      periodAwarePages.includes(id) &&
      (period === "7" ||
        period === "30" ||
        period === "90")
    ) {
      nextParams.set("period", period);
    }

    const query = nextParams.toString();

    navigate(query ? `${path}?${query}` : path);
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
  ] as const;

  const growthItems = [
    {
      id: "alert-center",
      label: labels.alerts,
      description: labels.alertsDescription,
      path: "/app/alert-center",
      icon: "♢",
    },
    {
      id: "ai-advisor",
      label: labels.profitCopilot,
      description: labels.profitCopilotDescription,
      path: "/app/ai-advisor",
      icon: "✦",
    },
    {
      id: "recommendations",
      label: labels.profitActionCenter,
      description: labels.profitActionCenterDescription,
      path: "/app/recommendations",
      icon: "✓",
    },
    {
      id: "recovery-simulator",
      label: labels.recoverySimulator,
      description: labels.recoverySimulatorDescription,
      path: "/app/recovery-simulator",
      icon: "↗",
    },
    {
      id: "forecasting",
      label: labels.profitForecast,
      description: labels.profitForecastDescription,
      path: "/app/forecasting",
      icon: "⌁",
    },
    {
      id: "profit-assumptions",
      label: labels.businessModelStudio,
      description: labels.businessModelStudioDescription,
      path: "/app/profit-assumptions",
      icon: "◇",
    },
  ] as const;

  const growthActive = growthItems.some(
    (item) => item.id === active,
  );

  const moreActive =
    active === "tax-profile" ||
    active === "reports-notifications" ||
    active === "glossary" ||
    active === "support" ||
    active === "billing";

  const moreItems = [
    {
      id: "tax-profile",
      label: labels.taxProfile,
      description: labels.taxProfileDescription,
      path: "/app/tax-profile",
      icon: "◇",
    },
    {
      id: "reports-notifications",
      label: labels.reportsNotifications,
      description: labels.reportsNotificationsDescription,
      path: "/app/reports-notifications",
      icon: "✉",
    },
    {
      id: "glossary",
      label: labels.glossary,
      description: labels.glossaryDescription,
      path: "/app/glossary",
      icon: "A",
    },
    {
      id: "support",
      label: labels.support,
      description: labels.supportDescription,
      path: "/app/support",
      icon: "?",
    },
    {
      id: "billing",
      label: t.nav.billing,
      description: labels.billingDescription,
      path: "/app/billing",
      icon: "$",
    },
  ] as const;

  return (
    <div className="navbar">
      <div
        className="logo"
        onClick={() =>
          openPage("overview", "/app")
        }
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

        {/* GROWTH */}
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
                        display: "flex",
                        alignItems: "center",
                        color: itemActive
                          ? "#ffffff"
                          : "rgba(255,255,255,0.82)",
                        fontSize: 13,
                        fontWeight: 900,
                      }}
                    >
                      <span>{item.label}</span>

                      {item.id ===
                        "alert-center" &&
                        unreadAlertCount > 0 && (
                          <span
                            aria-label={`${unreadAlertCount} unread alerts`}
                            style={{
                              marginLeft: 7,
                              minWidth: 18,
                              height: 18,
                              padding: "0 5px",
                              display:
                                "inline-flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              borderRadius: 999,
                              background:
                                "#ff7346",
                              border:
                                "1px solid rgba(255,255,255,0.18)",
                              color: "#ffffff",
                              boxShadow:
                                "0 0 14px rgba(255,115,70,0.30)",
                              fontSize: 9,
                              lineHeight: 1,
                              fontWeight: 950,
                            }}
                          >
                            {unreadAlertCount >
                            99
                              ? "99+"
                              : unreadAlertCount}
                          </span>
                        )}
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
              {labels.exploreGrowthPlan}
            </button>
          </div>
        </div>

        {/* MORE */}
        <div
          ref={moreMenuRef}
          style={{ position: "relative" }}
          onMouseEnter={openMoreMenu}
          onMouseLeave={
            scheduleMoreMenuClose
          }
        >
          <button
            type="button"
            className={
              moreActive
                ? "nav-tab active"
                : "nav-tab"
            }
            onClick={() =>
              setMoreOpen(
                (current) => !current,
              )
            }
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              font: "inherit",
            }}
          >
            <span>{labels.more}</span>

            <span
              style={{
                display: "inline-block",
                fontSize: 10,
                transform: moreOpen
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
              width: 270,
              height: 10,
              pointerEvents: moreOpen
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
              width: 270,
              padding: 10,
              borderRadius: 18,
              background:
                "radial-gradient(circle at top right, rgba(255,115,60,0.10), transparent 38%), linear-gradient(180deg, rgba(17,24,39,0.99), rgba(8,13,22,0.99))",
              border:
                "1px solid rgba(255,115,60,0.24)",
              boxShadow:
                "0 26px 70px rgba(0,0,0,0.52)",
              opacity: moreOpen ? 1 : 0,
              visibility: moreOpen
                ? "visible"
                : "hidden",
              pointerEvents: moreOpen
                ? "auto"
                : "none",
              transform: moreOpen
                ? "translateY(0)"
                : "translateY(-7px)",
              transition:
                "opacity 150ms ease, transform 150ms ease, visibility 150ms ease",
              zIndex: 100,
            }}
          >
            {moreItems.map((item) => {
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
                      "34px minmax(0,1fr)",
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
                      color:
                        item.id === "support"
                          ? "#86efac"
                          : "#ff9a70",
                      background:
                        item.id === "support"
                          ? "rgba(34,197,94,0.08)"
                          : "rgba(255,115,60,0.09)",
                      border:
                        item.id === "support"
                          ? "1px solid rgba(34,197,94,0.16)"
                          : "1px solid rgba(255,115,60,0.16)",
                      fontSize: 13,
                      fontWeight: 950,
                    }}
                  >
                    {item.icon}
                  </div>

                  <div>
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
          </div>
        </div>

        {/* LANGUAGE */}
        <div
          ref={languageMenuRef}
          style={{
            position: "relative",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setLanguageOpen((current) => !current)}
            aria-haspopup="menu"
            aria-expanded={languageOpen}
            style={{
              minHeight: 34,
              borderRadius: 999,
              padding: "7px 11px",
              cursor: "pointer",
              color: "#ffffff",
              background: "rgba(255,115,60,0.12)",
              border: "1px solid rgba(255,115,60,0.24)",
              fontWeight: 900,
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <span>{language.toUpperCase()}</span>
            <span style={{ color: "#ff936f", fontSize: 10 }}>▾</span>
          </button>

          {languageOpen ? (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                right: 0,
                zIndex: 120,
                width: 178,
                padding: 7,
                borderRadius: 16,
                background: "rgba(8,13,22,0.99)",
                border: "1px solid rgba(255,115,60,0.24)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.42)",
              }}
            >
              {([
                { id: "en", name: "English" },
                { id: "it", name: "Italiano" },
                { id: "fr", name: "Français" },
                { id: "de", name: "Deutsch" },
                { id: "es", name: "Español" },
              ] as const).map((option) => {
                const activeLanguage = language === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeLanguage}
                    onClick={() => changeLanguage(option.id)}
                    style={{
                      width: "100%",
                      minHeight: 38,
                      padding: "8px 10px",
                      borderRadius: 11,
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 14,
                      color: activeLanguage ? "#ffffff" : "rgba(255,255,255,0.72)",
                      background: activeLanguage ? "rgba(255,115,60,0.18)" : "transparent",
                      fontSize: 12,
                      fontWeight: activeLanguage ? 900 : 750,
                      textAlign: "left",
                    }}
                  >
                    <span>{option.name}</span>
                    <span style={{ color: activeLanguage ? "#ff936f" : "rgba(255,255,255,0.38)", fontWeight: 950 }}>
                      {option.id.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
