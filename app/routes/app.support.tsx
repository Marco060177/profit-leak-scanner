import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";

import DashboardNav from "~/components/dashboard/DashboardNav";
import { authenticate } from "~/shopify.server";
import {
  getBillingStatus,
  hasGrowthAccess,
} from "~/utils/billing.server";
import { getStoredLanguage } from "~/utils/i18n";

import "~/styles/dashboard.css";

export async function loader({ request }: { request: Request }) {
  const { admin } = await authenticate.admin(request);

  const billing = await getBillingStatus(admin);
  const growthAccess = hasGrowthAccess(billing);

  const rawWhatsAppNumber =
    process.env.MARGINLAB_WHATSAPP_NUMBER ?? "";

  const whatsappNumber = rawWhatsAppNumber.replace(/\D/g, "");

  return {
    growthAccess,
    whatsappAvailable: Boolean(whatsappNumber),
    whatsappNumber,
  };
}

export default function SupportPage() {
  const navigate = useNavigate();

  const {
    growthAccess,
    whatsappAvailable,
    whatsappNumber,
  } = useLoaderData() as Awaited<
    ReturnType<typeof loader>
  >;

  const language =
    getStoredLanguage() === "it" ? "it" : "en";

  const supportEmail = "support@marginlab.net";

  const whatsappMessage =
    language === "it"
      ? "Ciao, ho bisogno di assistenza con MarginLab."
      : "Hi, I need help with MarginLab.";

  const whatsappUrl =
    whatsappAvailable && whatsappNumber
      ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
          whatsappMessage,
        )}`
      : "";

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav
          active="support"
          navigate={navigate}
        />

        {/* HERO */}
        <section
          style={{
            position: "relative",
            overflow: "hidden",
            padding: 32,
            borderRadius: 30,
            background:
              "radial-gradient(circle at 12% 10%, rgba(255,115,60,0.16), transparent 34%), radial-gradient(circle at 88% 15%, rgba(34,197,94,0.10), transparent 34%), linear-gradient(135deg, rgba(16,23,37,0.99), rgba(6,11,20,0.99))",
            border:
              "1px solid rgba(255,115,60,0.24)",
            boxShadow:
              "0 28px 90px rgba(0,0,0,0.38)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(0,1.25fr) minmax(280px,0.75fr)",
              gap: 28,
              alignItems: "end",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 999,
                  color: "#ff9a70",
                  background:
                    "rgba(255,115,60,0.09)",
                  border:
                    "1px solid rgba(255,115,60,0.22)",
                  fontSize: 10,
                  fontWeight: 950,
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#ff7346",
                    boxShadow:
                      "0 0 12px rgba(255,115,70,0.8)",
                  }}
                />

                {language === "it"
                  ? "MARGINLAB SUPPORT"
                  : "MARGINLAB SUPPORT"}
              </div>

              <h1
                style={{
                  margin: "18px 0 0",
                  maxWidth: 800,
                  color: "#f8fafc",
                  fontSize: 44,
                  lineHeight: 1.05,
                  fontWeight: 950,
                  letterSpacing: "-0.05em",
                }}
              >
                {language === "it"
                  ? "Hai bisogno di aiuto? Parla con MarginLab."
                  : "Need help? Talk to MarginLab."}
              </h1>

              <p
                style={{
                  margin: "15px 0 0",
                  maxWidth: 760,
                  color:
                    "rgba(255,255,255,0.62)",
                  fontSize: 14,
                  lineHeight: 1.7,
                  fontWeight: 720,
                }}
              >
                {language === "it"
                  ? "Supporto per configurazione, utilizzo dell'app, interpretazione delle analisi e problemi tecnici. Gli utenti Growth hanno anche accesso all'assistenza diretta via WhatsApp."
                  : "Support for setup, product usage, understanding MarginLab analyses and technical issues. Growth users also receive direct WhatsApp support."}
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 11,
              }}
            >
              <div
                style={{
                  padding: 18,
                  borderRadius: 18,
                  background:
                    "rgba(255,255,255,0.035)",
                  border:
                    "1px solid rgba(255,255,255,0.075)",
                }}
              >
                <div
                  style={{
                    color: "#f8fafc",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  Email
                </div>

                <div
                  style={{
                    marginTop: 5,
                    color:
                      "rgba(255,255,255,0.42)",
                    fontSize: 9,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.10em",
                  }}
                >
                  Starter + Growth
                </div>
              </div>

              <div
                style={{
                  padding: 18,
                  borderRadius: 18,
                  background:
                    growthAccess
                      ? "rgba(34,197,94,0.07)"
                      : "rgba(255,255,255,0.035)",
                  border:
                    growthAccess
                      ? "1px solid rgba(34,197,94,0.20)"
                      : "1px solid rgba(255,255,255,0.075)",
                }}
              >
                <div
                  style={{
                    color: growthAccess
                      ? "#4ade80"
                      : "#f8fafc",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  WhatsApp
                </div>

                <div
                  style={{
                    marginTop: 5,
                    color:
                      growthAccess
                        ? "rgba(134,239,172,0.68)"
                        : "rgba(255,255,255,0.42)",
                    fontSize: 9,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.10em",
                  }}
                >
                  Growth
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SUPPORT CHANNELS */}
        <section
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns:
              "repeat(2,minmax(0,1fr))",
            gap: 18,
          }}
        >
          {/* EMAIL */}
          <article
            style={{
              position: "relative",
              overflow: "hidden",
              minHeight: 330,
              padding: 26,
              borderRadius: 26,
              background:
                "radial-gradient(circle at top right, rgba(56,189,248,0.10), transparent 36%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
              border:
                "1px solid rgba(56,189,248,0.18)",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                display: "grid",
                placeItems: "center",
                borderRadius: 16,
                color: "#7dd3fc",
                background:
                  "rgba(56,189,248,0.09)",
                border:
                  "1px solid rgba(56,189,248,0.18)",
                fontSize: 20,
                fontWeight: 950,
              }}
            >
              ✉
            </div>

            <div
              style={{
                marginTop: 20,
                color: "#7dd3fc",
                fontSize: 10,
                fontWeight: 950,
                letterSpacing: "0.11em",
                textTransform: "uppercase",
              }}
            >
              {language === "it"
                ? "EMAIL SUPPORT"
                : "EMAIL SUPPORT"}
            </div>

            <h2
              style={{
                margin: "8px 0 0",
                color: "#f8fafc",
                fontSize: 24,
                fontWeight: 950,
                letterSpacing: "-0.025em",
              }}
            >
              {language === "it"
                ? "Supporto MarginLab"
                : "MarginLab Support"}
            </h2>

            <p
              style={{
                margin: "10px 0 0",
                color:
                  "rgba(255,255,255,0.56)",
                fontSize: 13,
                lineHeight: 1.65,
                fontWeight: 720,
              }}
            >
              {language === "it"
                ? "Scrivici per problemi tecnici, configurazione dell'app, domande sulle metriche o chiarimenti sull'utilizzo delle funzionalità MarginLab."
                : "Contact us for technical issues, app setup, metric questions or help using MarginLab features."}
            </p>

            <div
              style={{
                marginTop: 22,
                padding: 15,
                borderRadius: 15,
                background:
                  "rgba(255,255,255,0.035)",
                border:
                  "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                style={{
                  color:
                    "rgba(255,255,255,0.38)",
                  fontSize: 9,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.10em",
                }}
              >
                {language === "it"
                  ? "Disponibile con"
                  : "Available with"}
              </div>

              <div
                style={{
                  marginTop: 6,
                  color: "#f8fafc",
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                Starter + Growth
              </div>
            </div>

            <a
              href={`mailto:${supportEmail}?subject=${encodeURIComponent(
                "MarginLab Support",
              )}`}
              style={{
                marginTop: 20,
                minHeight: 48,
                padding: "0 18px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 14,
                color: "#ffffff",
                textDecoration: "none",
                background:
                  "linear-gradient(135deg, rgba(56,189,248,0.85), rgba(37,99,235,0.82))",
                border:
                  "1px solid rgba(125,211,252,0.24)",
                fontSize: 13,
                fontWeight: 950,
              }}
            >
              {language === "it"
                ? "Scrivi a MarginLab"
                : "Email MarginLab"}
              <span>→</span>
            </a>
          </article>

          {/* WHATSAPP */}
          <article
            style={{
              position: "relative",
              overflow: "hidden",
              minHeight: 330,
              padding: 26,
              borderRadius: 26,
              background:
                growthAccess
                  ? "radial-gradient(circle at top right, rgba(34,197,94,0.16), transparent 38%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))"
                  : "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
              border:
                growthAccess
                  ? "1px solid rgba(34,197,94,0.24)"
                  : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 20,
                right: 20,
                padding: "7px 10px",
                borderRadius: 999,
                color: "#86efac",
                background:
                  "rgba(34,197,94,0.09)",
                border:
                  "1px solid rgba(34,197,94,0.20)",
                fontSize: 9,
                fontWeight: 950,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
              }}
            >
              Growth
            </div>

            <div
              style={{
                width: 48,
                height: 48,
                display: "grid",
                placeItems: "center",
                borderRadius: 16,
                color: "#86efac",
                background:
                  "rgba(34,197,94,0.09)",
                border:
                  "1px solid rgba(34,197,94,0.18)",
                fontSize: 20,
                fontWeight: 950,
              }}
            >
              ◉
            </div>

            <div
              style={{
                marginTop: 20,
                color: "#86efac",
                fontSize: 10,
                fontWeight: 950,
                letterSpacing: "0.11em",
                textTransform: "uppercase",
              }}
            >
              {language === "it"
                ? "DIRECT WHATSAPP SUPPORT"
                : "DIRECT WHATSAPP SUPPORT"}
            </div>

            <h2
              style={{
                margin: "8px 0 0",
                color: "#f8fafc",
                fontSize: 24,
                fontWeight: 950,
                letterSpacing: "-0.025em",
              }}
            >
              {language === "it"
                ? "Parla direttamente con noi"
                : "Talk directly with us"}
            </h2>

            <p
              style={{
                margin: "10px 0 0",
                color:
                  "rgba(255,255,255,0.56)",
                fontSize: 13,
                lineHeight: 1.65,
                fontWeight: 720,
              }}
            >
              {language === "it"
                ? "Gli utenti Growth possono contattare MarginLab direttamente via WhatsApp per assistenza sull'utilizzo dell'app e sulle analisi disponibili."
                : "Growth users can contact MarginLab directly on WhatsApp for help with the app and understanding available analyses."}
            </p>

            {growthAccess ? (
              <>
                <div
                  style={{
                    marginTop: 22,
                    padding: 15,
                    borderRadius: 15,
                    background:
                      "rgba(34,197,94,0.055)",
                    border:
                      "1px solid rgba(34,197,94,0.15)",
                  }}
                >
                  <div
                    style={{
                      color: "#86efac",
                      fontSize: 10,
                      fontWeight: 950,
                    }}
                  >
                    ✓{" "}
                    {language === "it"
                      ? "Incluso nel tuo piano Growth"
                      : "Included in your Growth plan"}
                  </div>
                </div>

                {whatsappAvailable ? (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      marginTop: 20,
                      minHeight: 48,
                      padding: "0 18px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      borderRadius: 14,
                      color: "#ffffff",
                      textDecoration: "none",
                      background:
                        "linear-gradient(135deg, rgba(34,197,94,0.92), rgba(22,163,74,0.88))",
                      border:
                        "1px solid rgba(134,239,172,0.24)",
                      fontSize: 13,
                      fontWeight: 950,
                    }}
                  >
                    {language === "it"
                      ? "Apri WhatsApp"
                      : "Open WhatsApp"}
                    <span>↗</span>
                  </a>
                ) : (
                  <div
                    style={{
                      marginTop: 18,
                      color:
                        "rgba(255,255,255,0.48)",
                      fontSize: 11,
                      lineHeight: 1.55,
                      fontWeight: 720,
                    }}
                  >
                    {language === "it"
                      ? "Il canale WhatsApp sarà disponibile non appena il numero di assistenza verrà configurato."
                      : "WhatsApp support will become available once the support number is configured."}
                  </div>
                )}
              </>
            ) : (
              <>
                <div
                  style={{
                    marginTop: 22,
                    padding: 15,
                    borderRadius: 15,
                    background:
                      "rgba(255,115,60,0.06)",
                    border:
                      "1px solid rgba(255,115,60,0.16)",
                  }}
                >
                  <div
                    style={{
                      color: "#ff9a70",
                      fontSize: 10,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {language === "it"
                      ? "FUNZIONE GROWTH"
                      : "GROWTH FEATURE"}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      color:
                        "rgba(255,255,255,0.58)",
                      fontSize: 11,
                      lineHeight: 1.55,
                      fontWeight: 720,
                    }}
                  >
                    {language === "it"
                      ? "Passa a Growth per aggiungere l'assistenza diretta via WhatsApp agli strumenti avanzati MarginLab."
                      : "Upgrade to Growth to add direct WhatsApp support to MarginLab's advanced tools."}
                  </div>
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    navigate("/app/billing")
                  }
                  style={{
                    marginTop: 20,
                  }}
                >
                  {language === "it"
                    ? "Scopri Growth →"
                    : "Explore Growth →"}
                </button>
              </>
            )}
          </article>
        </section>

        {/* WHAT WE CAN HELP WITH */}
        <section
          style={{
            marginTop: 20,
            padding: 24,
            borderRadius: 24,
            background:
              "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
            border:
              "1px solid rgba(255,115,60,0.16)",
          }}
        >
          <div
            style={{
              color: "#ff9a70",
              fontSize: 10,
              fontWeight: 950,
              letterSpacing: "0.11em",
              textTransform: "uppercase",
            }}
          >
            {language === "it"
              ? "COME POSSIAMO AIUTARTI"
              : "HOW WE CAN HELP"}
          </div>

          <div
            style={{
              marginTop: 8,
              color: "#f8fafc",
              fontSize: 21,
              fontWeight: 950,
            }}
          >
            {language === "it"
              ? "Supporto pratico sull'utilizzo di MarginLab"
              : "Practical help using MarginLab"}
          </div>

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns:
                "repeat(4,minmax(0,1fr))",
              gap: 12,
            }}
          >
            {[
              {
                icon: "⚙",
                it: "Configurazione",
                en: "Setup",
                descIt:
                  "Impostazioni, costi, Tax Profile e configurazione iniziale.",
                descEn:
                  "Settings, costs, Tax Profile and initial setup.",
              },
              {
                icon: "↗",
                it: "Analisi",
                en: "Analysis",
                descIt:
                  "Comprendere metriche, margini e segnali MarginLab.",
                descEn:
                  "Understand MarginLab metrics, margins and signals.",
              },
              {
                icon: "◇",
                it: "Funzionalità",
                en: "Features",
                descIt:
                  "Aiuto con simulatori, forecasting, report e strumenti.",
                descEn:
                  "Help with simulators, forecasting, reports and tools.",
              },
              {
                icon: "!",
                it: "Problemi tecnici",
                en: "Technical issues",
                descIt:
                  "Segnalazione di errori o comportamenti inattesi dell'app.",
                descEn:
                  "Report errors or unexpected app behavior.",
              },
            ].map((item) => (
              <div
                key={item.en}
                style={{
                  padding: 17,
                  borderRadius: 17,
                  background:
                    "rgba(255,255,255,0.03)",
                  border:
                    "1px solid rgba(255,255,255,0.065)",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 10,
                    color: "#ff9a70",
                    background:
                      "rgba(255,115,60,0.08)",
                    fontWeight: 950,
                  }}
                >
                  {item.icon}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    color: "#f8fafc",
                    fontSize: 13,
                    fontWeight: 950,
                  }}
                >
                  {language === "it"
                    ? item.it
                    : item.en}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    color:
                      "rgba(255,255,255,0.46)",
                    fontSize: 10,
                    lineHeight: 1.55,
                    fontWeight: 700,
                  }}
                >
                  {language === "it"
                    ? item.descIt
                    : item.descEn}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FOOT NOTE */}
        <div
          style={{
            marginTop: 20,
            marginBottom: 24,
            padding: 17,
            borderRadius: 17,
            color:
              "rgba(255,255,255,0.42)",
            background:
              "rgba(255,255,255,0.025)",
            border:
              "1px solid rgba(255,255,255,0.06)",
            fontSize: 10,
            lineHeight: 1.6,
            fontWeight: 700,
          }}
        >
          {language === "it"
            ? "L'assistenza MarginLab riguarda il funzionamento e l'interpretazione del prodotto. MarginLab non sostituisce consulenza fiscale, contabile o professionale."
            : "MarginLab support covers product usage and interpretation. MarginLab does not replace tax, accounting or professional advice."}
        </div>
      </div>
    </div>
  );
}