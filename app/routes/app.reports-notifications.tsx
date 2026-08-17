import * as React from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useNavigate,
} from "react-router";

import { authenticate } from "~/shopify.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import {
  getOrCreateNotificationPreferences,
  updateNotificationPreferences,
} from "~/services/notification.server";
import { getStoredLanguage } from "~/utils/i18n";

import "~/styles/dashboard.css";

type NotificationLanguage = "it" | "en";

type ActionData =
  | { ok: true; message: string }
  | { ok: false; message: string };

function parseBoolean(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

function parseNumber(
  value: FormDataEntryValue | null,
  fallback: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLanguage(
  value: FormDataEntryValue | null,
): NotificationLanguage {
  return value === "it" ? "it" : "en";
}

const dayOptions = [
  { value: 0, en: "Sunday", it: "Domenica" },
  { value: 1, en: "Monday", it: "Lunedì" },
  { value: 2, en: "Tuesday", it: "Martedì" },
  { value: 3, en: "Wednesday", it: "Mercoledì" },
  { value: 4, en: "Thursday", it: "Giovedì" },
  { value: 5, en: "Friday", it: "Venerdì" },
  { value: 6, en: "Saturday", it: "Sabato" },
];

export async function loader({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const language: NotificationLanguage =
    url.searchParams.get("lang") === "it" ? "it" : "en";

  const preferences = await getOrCreateNotificationPreferences({
    shop: session.shop,
    language,
  });

  return { preferences };
}

export async function action({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const language = normalizeLanguage(formData.get("language"));

  try {
    await updateNotificationPreferences({
      shop: session.shop,
      input: {
        recipientEmail: String(formData.get("recipientEmail") || ""),
        weeklyReportEnabled: parseBoolean(
          formData.get("weeklyReportEnabled"),
        ),
        emailAlertsEnabled: parseBoolean(
          formData.get("emailAlertsEnabled"),
        ),
        notifyCritical: parseBoolean(
          formData.get("notifyCritical"),
        ),
        notifyWarnings: parseBoolean(
          formData.get("notifyWarnings"),
        ),
        notifyOpportunities: parseBoolean(
          formData.get("notifyOpportunities"),
        ),
        weeklyReportDay: parseNumber(
          formData.get("weeklyReportDay"),
          1,
        ),
        weeklyReportHour: parseNumber(
          formData.get("weeklyReportHour"),
          8,
        ),
        timezone: String(formData.get("timezone") || "UTC"),
        language,
      },
    });

    return {
      ok: true as const,
      message:
        language === "it"
          ? "Preferenze salvate."
          : "Preferences saved.",
    };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save notification preferences.",
    };
  }
}

function Toggle({
  name,
  defaultChecked,
  label,
  description,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  description: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        padding: 16,
        borderRadius: 16,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        cursor: "pointer",
      }}
    >
      <div>
        <div
          style={{
            color: "#f8fafc",
            fontSize: 14,
            fontWeight: 900,
          }}
        >
          {label}
        </div>

        <div
          style={{
            marginTop: 5,
            color: "rgba(255,255,255,0.50)",
            fontSize: 11,
            lineHeight: 1.5,
            fontWeight: 720,
          }}
        >
          {description}
        </div>
      </div>

      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        style={{
          width: 18,
          height: 18,
          marginTop: 2,
          accentColor: "#ff7346",
          flexShrink: 0,
        }}
      />
    </label>
  );
}

export default function ReportsNotificationsPage() {
  const { preferences } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const navigate = useNavigate();

  const language = getStoredLanguage() === "it" ? "it" : "en";
  const saving = navigation.state !== "idle";

  const labels =
    language === "it"
      ? {
          eyebrow: "REPORT E NOTIFICHE",
          title: "Scegli cosa ricevere e dove",
          description:
            "Configura il Weekly Profit Report e gli alert email di MarginLab. Queste preferenze vengono usate direttamente dal sistema di notifica dello store.",
          recipient: "Email destinataria",
          recipientNote:
            "Indirizzo a cui MarginLab invierà report e alert.",
          weeklyTitle: "Weekly Profit Report",
          weeklyDescription:
            "Ricevi ogni settimana il riepilogo degli ultimi 7 giorni con redditività, rischi e prossime azioni.",
          weeklyEnabled: "Attiva Weekly Profit Report",
          weeklyEnabledDesc:
            "Invia automaticamente il report settimanale all'indirizzo configurato.",
          language: "Lingua email",
          day: "Giorno di invio",
          hour: "Ora di invio",
          timezone: "Fuso orario",
          timezoneNote:
            "Usato per interpretare giorno e ora del report.",
          alertsTitle: "Profit Monitor via email",
          alertsDescription:
            "Scegli quali segnali del Profit Monitor possono generare una notifica email.",
          alertsEnabled: "Attiva alert email",
          alertsEnabledDesc:
            "Consente a MarginLab di inviare notifiche quando emergono nuovi segnali rilevanti.",
          critical: "Alert critici",
          criticalDesc:
            "Problemi che richiedono una verifica prioritaria.",
          warnings: "Avvisi",
          warningsDesc:
            "Segnali da controllare prima che diventino più importanti.",
          opportunities: "Opportunità",
          opportunitiesDesc:
            "Gap e scenari di ottimizzazione che meritano una valutazione.",
          save: "Salva preferenze",
          saving: "Salvataggio...",
          note:
            "MarginLab non invia automaticamente report o alert senza un indirizzo email configurato.",
        }
      : {
          eyebrow: "REPORTS & NOTIFICATIONS",
          title: "Choose what to receive and where",
          description:
            "Configure the Weekly Profit Report and MarginLab email alerts. These preferences are used directly by the store notification system.",
          recipient: "Recipient email",
          recipientNote:
            "Address where MarginLab will send reports and alerts.",
          weeklyTitle: "Weekly Profit Report",
          weeklyDescription:
            "Receive a weekly summary of the last 7 days with profitability, risks and next actions.",
          weeklyEnabled: "Enable Weekly Profit Report",
          weeklyEnabledDesc:
            "Automatically sends the weekly report to the configured email address.",
          language: "Email language",
          day: "Delivery day",
          hour: "Delivery time",
          timezone: "Time zone",
          timezoneNote:
            "Used to interpret the report delivery day and time.",
          alertsTitle: "Profit Monitor by email",
          alertsDescription:
            "Choose which Profit Monitor signals are allowed to generate email notifications.",
          alertsEnabled: "Enable email alerts",
          alertsEnabledDesc:
            "Allows MarginLab to send notifications when relevant new signals appear.",
          critical: "Critical alerts",
          criticalDesc:
            "Issues that require prioritized review.",
          warnings: "Warnings",
          warningsDesc:
            "Signals to review before they become more important.",
          opportunities: "Opportunities",
          opportunitiesDesc:
            "Optimization gaps and modeled scenarios worth evaluating.",
          save: "Save preferences",
          saving: "Saving...",
          note:
            "MarginLab does not send reports or alerts automatically without a configured email address.",
        };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav
          active="reports-notifications"
          navigate={navigate}
        />

        <div className="hero-header">
          <div>
            <div className="eyebrow">{labels.eyebrow}</div>
            <div className="hero-title">{labels.title}</div>
            <div className="hero-description">
              {labels.description}
            </div>
          </div>
        </div>

        <Form method="post">
          <div style={{ display: "grid", gap: 22 }}>
            <section className="panel" style={{ margin: 0, padding: 24 }}>
              <div className="panel-eyebrow">
                {language === "it" ? "DESTINATARIO" : "RECIPIENT"}
              </div>

              <h2 className="panel-title" style={{ marginTop: 6 }}>
                {labels.recipient}
              </h2>

              <div
                style={{
                  marginTop: 8,
                  color: "rgba(255,255,255,0.52)",
                  fontSize: 12,
                  lineHeight: 1.55,
                  fontWeight: 720,
                }}
              >
                {labels.recipientNote}
              </div>

              <input
                type="email"
                name="recipientEmail"
                defaultValue={preferences.recipientEmail ?? ""}
                placeholder="name@example.com"
                style={{
                  width: "100%",
                  marginTop: 16,
                  padding: "15px 16px",
                  borderRadius: 14,
                  color: "#ffffff",
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,115,60,0.18)",
                  outline: "none",
                  fontWeight: 800,
                }}
              />
            </section>

            <section className="panel" style={{ margin: 0, padding: 24 }}>
              <div className="panel-eyebrow">
                {language === "it" ? "REPORT SETTIMANALE" : "WEEKLY REPORT"}
              </div>

              <h2 className="panel-title" style={{ marginTop: 6 }}>
                {labels.weeklyTitle}
              </h2>

              <div
                style={{
                  marginTop: 8,
                  color: "rgba(255,255,255,0.52)",
                  fontSize: 12,
                  lineHeight: 1.55,
                  fontWeight: 720,
                }}
              >
                {labels.weeklyDescription}
              </div>

              <div style={{ marginTop: 18 }}>
                <Toggle
                  name="weeklyReportEnabled"
                  defaultChecked={preferences.weeklyReportEnabled}
                  label={labels.weeklyEnabled}
                  description={labels.weeklyEnabledDesc}
                />
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      marginBottom: 7,
                      color: "rgba(255,255,255,0.52)",
                      fontSize: 10,
                      fontWeight: 900,
                    }}
                  >
                    {labels.language}
                  </div>

                  <select
                    name="language"
                    defaultValue={preferences.language || language}
                    style={{
                      width: "100%",
                      padding: "13px 14px",
                      borderRadius: 13,
                      color: "#f8fafc",
                      background: "#0f1724",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontWeight: 800,
                    }}
                  >
                    <option value="en">English</option>
                    <option value="it">Italiano</option>
                  </select>
                </div>

                <div>
                  <div
                    style={{
                      marginBottom: 7,
                      color: "rgba(255,255,255,0.52)",
                      fontSize: 10,
                      fontWeight: 900,
                    }}
                  >
                    {labels.day}
                  </div>

                  <select
                    name="weeklyReportDay"
                    defaultValue={String(preferences.weeklyReportDay)}
                    style={{
                      width: "100%",
                      padding: "13px 14px",
                      borderRadius: 13,
                      color: "#f8fafc",
                      background: "#0f1724",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontWeight: 800,
                    }}
                  >
                    {dayOptions.map((day) => (
                      <option key={day.value} value={day.value}>
                        {language === "it" ? day.it : day.en}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div
                    style={{
                      marginBottom: 7,
                      color: "rgba(255,255,255,0.52)",
                      fontSize: 10,
                      fontWeight: 900,
                    }}
                  >
                    {labels.hour}
                  </div>

                  <select
                    name="weeklyReportHour"
                    defaultValue={String(preferences.weeklyReportHour)}
                    style={{
                      width: "100%",
                      padding: "13px 14px",
                      borderRadius: 13,
                      color: "#f8fafc",
                      background: "#0f1724",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontWeight: 800,
                    }}
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div
                    style={{
                      marginBottom: 7,
                      color: "rgba(255,255,255,0.52)",
                      fontSize: 10,
                      fontWeight: 900,
                    }}
                  >
                    {labels.timezone}
                  </div>

                  <input
                    type="text"
                    name="timezone"
                    defaultValue={preferences.timezone || "UTC"}
                    placeholder="Europe/Rome"
                    style={{
                      width: "100%",
                      padding: "13px 14px",
                      borderRadius: 13,
                      color: "#f8fafc",
                      background: "#0f1724",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontWeight: 800,
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: 9,
                  color: "rgba(255,255,255,0.38)",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {labels.timezoneNote}
              </div>
            </section>

            <section className="panel" style={{ margin: 0, padding: 24 }}>
              <div className="panel-eyebrow">
                {language === "it" ? "ALERT EMAIL" : "EMAIL ALERTS"}
              </div>

              <h2 className="panel-title" style={{ marginTop: 6 }}>
                {labels.alertsTitle}
              </h2>

              <div
                style={{
                  marginTop: 8,
                  color: "rgba(255,255,255,0.52)",
                  fontSize: 12,
                  lineHeight: 1.55,
                  fontWeight: 720,
                }}
              >
                {labels.alertsDescription}
              </div>

              <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
                <Toggle
                  name="emailAlertsEnabled"
                  defaultChecked={preferences.emailAlertsEnabled}
                  label={labels.alertsEnabled}
                  description={labels.alertsEnabledDesc}
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                    gap: 12,
                  }}
                >
                  <Toggle
                    name="notifyCritical"
                    defaultChecked={preferences.notifyCritical}
                    label={labels.critical}
                    description={labels.criticalDesc}
                  />

                  <Toggle
                    name="notifyWarnings"
                    defaultChecked={preferences.notifyWarnings}
                    label={labels.warnings}
                    description={labels.warningsDesc}
                  />

                  <Toggle
                    name="notifyOpportunities"
                    defaultChecked={preferences.notifyOpportunities}
                    label={labels.opportunities}
                    description={labels.opportunitiesDesc}
                  />
                </div>
              </div>
            </section>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  color: "rgba(255,255,255,0.42)",
                  fontSize: 11,
                  lineHeight: 1.5,
                  fontWeight: 720,
                  maxWidth: 720,
                }}
              >
                {labels.note}
              </div>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? labels.saving : labels.save}
              </button>
            </div>

            {actionData ? (
              <div
                style={{
                  padding: 15,
                  borderRadius: 15,
                  background: actionData.ok
                    ? "rgba(34,197,94,0.08)"
                    : "rgba(239,68,68,0.08)",
                  border: actionData.ok
                    ? "1px solid rgba(34,197,94,0.20)"
                    : "1px solid rgba(239,68,68,0.20)",
                  color: actionData.ok ? "#86efac" : "#fca5a5",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {actionData.message}
              </div>
            ) : null}
          </div>
        </Form>
      </div>
    </div>
  );
}