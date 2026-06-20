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

export default function DashboardNav({ active, navigate }: Props) {
  const [language, setLanguage] = React.useState<Language>("en");

  React.useEffect(() => {
    setLanguage(getStoredLanguage());
  }, []);

  const t = translations[language];

  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setStoredLanguage(nextLanguage);
  };

  const mainItems = [
    { id: "overview", label: t.nav.overview, path: "/app" },
    { id: "products", label: t.nav.products, path: "/app/products" },
    {
      id: "profit",
      label: t.nav.profitIntelligence,
      path: "/app/profit-intelligence",
    },
    { id: "ai-advisor", label: t.nav.aiAdvisor, path: "/app/ai-advisor" },
  ] as const;

  const moreItems = [
    {
      id: "recommendations",
      label: t.nav.recommendations,
      path: "/app/recommendations",
    },
    {
      id: "recovery-simulator",
      label: t.nav.recovery,
      path: "/app/recovery-simulator",
    },
    {
      id: "forecasting",
      label: t.nav.forecasting,
      path: "/app/forecasting",
    },
    {
      id: "profit-assumptions",
      label: t.nav.profitAssumptions,
      path: "/app/profit-assumptions",
    },
    { id: "billing", label: t.nav.billing, path: "/app/billing" },
  ] as const;

  const moreActive = moreItems.some((item) => item.id === active);

  return (
    <div className="navbar">
      <div className="logo">
        MARGIN<span>LAB</span>
      </div>

      <div className="nav-tabs">
        {mainItems.map((item) => (
          <div
            key={item.id}
            className={active === item.id ? "nav-tab active" : "nav-tab"}
            onClick={() => active !== item.id && navigate(item.path)}
          >
            {item.label}
          </div>
        ))}

        <div
          className={moreActive ? "nav-tab active" : "nav-tab"}
          style={{ position: "relative" }}
        >
          {t.nav.more} ▾

          <div
            className="nav-more-menu"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              minWidth: 220,
              padding: 8,
              borderRadius: 16,
              background:
                "linear-gradient(180deg, rgba(17,24,39,0.98), rgba(8,13,22,0.98))",
              border: "1px solid rgba(255,115,60,0.22)",
              boxShadow: "0 22px 60px rgba(0,0,0,0.45)",
              display: "none",
              zIndex: 50,
            }}
          >
            {moreItems.map((item) => (
              <div
                key={item.id}
                onClick={() => active !== item.id && navigate(item.path)}
                style={{
                  padding: "11px 12px",
                  borderRadius: 12,
                  color:
                    active === item.id
                      ? "#ff9a70"
                      : "rgba(255,255,255,0.72)",
                  fontWeight: 850,
                  cursor: "pointer",
                  background:
                    active === item.id
                      ? "rgba(255,115,60,0.12)"
                      : "transparent",
                }}
              >
                {item.label}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "inline-flex",
            padding: 4,
            borderRadius: 999,
            background: "rgba(255,115,60,0.08)",
            border: "1px solid rgba(255,115,60,0.18)",
            gap: 4,
          }}
        >
          {(["en", "it"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => changeLanguage(lang)}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "7px 10px",
                cursor: "pointer",
                fontWeight: 900,
                fontSize: 12,
                color: language === lang ? "#ffffff" : "rgba(255,255,255,0.55)",
                background:
                  language === lang ? "rgba(255,115,60,0.22)" : "transparent",
              }}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}