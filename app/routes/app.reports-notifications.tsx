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
  normalizeNotificationLanguage,
  updateNotificationPreferences,
  type NotificationLanguage,
} from "~/services/notification.server";
import { useI18n } from "~/components/i18n/I18nProvider";
import { getRequestLanguage } from "~/utils/i18n.server";

import "~/styles/dashboard.css";

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

const dayOptions = [0, 1, 2, 3, 4, 5, 6];

export async function loader({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);

  const language: NotificationLanguage = getRequestLanguage(request);

  const preferences = await getOrCreateNotificationPreferences({
    shop: session.shop,
    language,
  });

  return { preferences };
}

export async function action({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const language = normalizeNotificationLanguage(
    String(formData.get("language") || ""),
  );

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
      message: {
        en: "Preferences saved.",
        it: "Preferenze salvate.",
        fr: "Préférences enregistrées.",
        de: "Einstellungen gespeichert.",
        es: "Preferencias guardadas.",
        "pt-BR": "Preferências salvas.",
      }[language],
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

  const { language, messages } = useI18n();
  const saving = navigation.state !== "idle";
  const labels = messages.reportsNotificationsPage;

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
                {labels.recipientEyebrow}
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
                {labels.weeklyEyebrow}
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
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="es">Español</option>
                    <option value="pt-BR">Português (Brasil)</option>
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
                      <option key={day} value={day}>
                        {labels.days[day]}
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
                {labels.alertsEyebrow}
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
