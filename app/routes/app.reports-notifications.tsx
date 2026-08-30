import * as React from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useNavigate,
  redirect,
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
import { getBillingStatus, hasStarterAccess } from "~/utils/billing.server";
import {
  FlowPath,
  MetricCard,
  PremiumHero,
  PremiumPanel,
  StatusChip,
  VisualButton,
} from "~/components/ui/VisualSystem";

import "~/styles/dashboard.css";
import "~/styles/reports-notifications-v2.css";

type ActionData =
  | { ok: true; message: string }
  | { ok: false; message: string };

function parseBoolean(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

function parseNumber(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const dayOptions = [0, 1, 2, 3, 4, 5, 6];

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);
  const billing = await getBillingStatus(admin);

  if (!hasStarterAccess(billing)) {
    throw redirect("/app/billing");
  }

  const language: NotificationLanguage = getRequestLanguage(request);

  const preferences = await getOrCreateNotificationPreferences({
    shop: session.shop,
    language,
  });

  return { preferences };
}

export async function action({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);
  const billing = await getBillingStatus(admin);

  if (!hasStarterAccess(billing)) {
    throw redirect("/app/billing");
  }

  const formData = await request.formData();
  const language = normalizeNotificationLanguage(
    String(formData.get("language") || ""),
  );

  try {
    await updateNotificationPreferences({
      shop: session.shop,
      input: {
        recipientEmail: String(formData.get("recipientEmail") || ""),
        weeklyReportEnabled: parseBoolean(formData.get("weeklyReportEnabled")),
        emailAlertsEnabled: parseBoolean(formData.get("emailAlertsEnabled")),
        notifyCritical: parseBoolean(formData.get("notifyCritical")),
        notifyWarnings: parseBoolean(formData.get("notifyWarnings")),
        notifyOpportunities: parseBoolean(formData.get("notifyOpportunities")),
        weeklyReportDay: parseNumber(formData.get("weeklyReportDay"), 1),
        weeklyReportHour: parseNumber(formData.get("weeklyReportHour"), 8),
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
    <label className="reports-v2-toggle">
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <span className="reports-v2-switch">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} />
        <i aria-hidden="true" />
      </span>
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
        <DashboardNav active="reports-notifications" navigate={navigate} />

        <PremiumHero
          className="reports-v2-hero"
          tone="blue"
          eyebrow={labels.eyebrow}
          title={labels.title}
          description={labels.description}
          actions={
            <div className="reports-v2-hero-status">
              <StatusChip
                tone={preferences.weeklyReportEnabled ? "green" : "neutral"}
              >
                {labels.weeklyTitle}
              </StatusChip>
              <StatusChip
                tone={preferences.emailAlertsEnabled ? "green" : "neutral"}
              >
                {labels.alertsEyebrow}
              </StatusChip>
            </div>
          }
          visual={
            <div className="reports-v2-delivery-flow">
              <FlowPath
                tone="blue"
                trajectory="rising"
                motion="ambient"
                label={labels.description}
                nodes={[
                  {
                    id: "signal",
                    progress: 0.05,
                    tone: "orange",
                    label: labels.alertsEyebrow,
                  },
                  {
                    id: "analysis",
                    progress: 0.37,
                    tone: "violet",
                    label: labels.critical,
                  },
                  {
                    id: "report",
                    progress: 0.7,
                    tone: "blue",
                    emphasis: "strong",
                    label: labels.weeklyTitle,
                  },
                  {
                    id: "delivery",
                    progress: 0.96,
                    tone: "green",
                    emphasis: "strong",
                    label: labels.recipient,
                  },
                ]}
              />
              <div className="reports-v2-flow-legend" aria-hidden="true">
                <span>{labels.alertsEyebrow}</span>
                <span>{labels.weeklyTitle}</span>
                <span>{labels.recipient}</span>
              </div>
            </div>
          }
        />

        <section className="reports-v2-summary" aria-label={labels.eyebrow}>
          <MetricCard
            tone={preferences.weeklyReportEnabled ? "green" : "neutral"}
            label={labels.weeklyEyebrow}
            value={preferences.weeklyReportEnabled ? "✓" : "—"}
            detail={labels.weeklyTitle}
          />
          <MetricCard
            tone={preferences.emailAlertsEnabled ? "green" : "neutral"}
            label={labels.alertsEyebrow}
            value={preferences.emailAlertsEnabled ? "✓" : "—"}
            detail={labels.alertsTitle}
          />
          <MetricCard
            tone="blue"
            label={labels.day}
            value={labels.days[preferences.weeklyReportDay]}
            detail={`${String(preferences.weeklyReportHour).padStart(2, "0")}:00 · ${preferences.timezone || "UTC"}`}
          />
          <MetricCard
            tone="violet"
            label={labels.language}
            value={(preferences.language || language).toUpperCase()}
            detail={labels.recipient}
          />
        </section>

        <Form method="post" className="reports-v2-form">
          <PremiumPanel
            className="reports-v2-panel reports-v2-recipient"
            tone="cyan"
          >
            <div className="panel-eyebrow">{labels.recipientEyebrow}</div>
            <h2 className="panel-title">{labels.recipient}</h2>
            <p className="reports-v2-description">{labels.recipientNote}</p>
            <input
              className="reports-v2-control"
              type="email"
              name="recipientEmail"
              defaultValue={preferences.recipientEmail ?? ""}
              placeholder="name@example.com"
            />
          </PremiumPanel>

          <PremiumPanel
            className="reports-v2-panel reports-v2-weekly"
            tone="blue"
          >
            <div className="reports-v2-panel-heading">
              <div>
                <div className="panel-eyebrow">{labels.weeklyEyebrow}</div>
                <h2 className="panel-title">{labels.weeklyTitle}</h2>
                <p className="reports-v2-description">
                  {labels.weeklyDescription}
                </p>
              </div>
              <FlowPath
                className="reports-v2-mini-flow"
                tone={preferences.weeklyReportEnabled ? "green" : "neutral"}
                trajectory="steady"
                nodes={[{ id: "weekly", progress: 0.82, emphasis: "strong" }]}
              />
            </div>

            <div className="reports-v2-toggle-row">
              <Toggle
                name="weeklyReportEnabled"
                defaultChecked={preferences.weeklyReportEnabled}
                label={labels.weeklyEnabled}
                description={labels.weeklyEnabledDesc}
              />
            </div>

            <div className="reports-v2-schedule-grid">
              <label className="reports-v2-field">
                <span>{labels.language}</span>
                <select
                  className="reports-v2-control"
                  name="language"
                  defaultValue={preferences.language || language}
                >
                  <option value="en">English</option>
                  <option value="it">Italiano</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="es">Español</option>
                  <option value="pt-BR">Português (Brasil)</option>
                </select>
              </label>

              <label className="reports-v2-field">
                <span>{labels.day}</span>
                <select
                  className="reports-v2-control"
                  name="weeklyReportDay"
                  defaultValue={String(preferences.weeklyReportDay)}
                >
                  {dayOptions.map((day) => (
                    <option key={day} value={day}>
                      {labels.days[day]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="reports-v2-field">
                <span>{labels.hour}</span>
                <select
                  className="reports-v2-control"
                  name="weeklyReportHour"
                  defaultValue={String(preferences.weeklyReportHour)}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>

              <label className="reports-v2-field">
                <span>{labels.timezone}</span>
                <input
                  className="reports-v2-control"
                  type="text"
                  name="timezone"
                  defaultValue={preferences.timezone || "UTC"}
                  placeholder="Europe/Rome"
                />
              </label>
            </div>
            <div className="reports-v2-note">{labels.timezoneNote}</div>
          </PremiumPanel>

          <PremiumPanel
            className="reports-v2-panel reports-v2-alerts"
            tone="orange"
          >
            <div className="reports-v2-panel-heading">
              <div>
                <div className="panel-eyebrow">{labels.alertsEyebrow}</div>
                <h2 className="panel-title">{labels.alertsTitle}</h2>
                <p className="reports-v2-description">
                  {labels.alertsDescription}
                </p>
              </div>
              <StatusChip
                tone={preferences.emailAlertsEnabled ? "green" : "neutral"}
              >
                {labels.alertsEnabled}
              </StatusChip>
            </div>

            <div className="reports-v2-alert-stack">
              <Toggle
                name="emailAlertsEnabled"
                defaultChecked={preferences.emailAlertsEnabled}
                label={labels.alertsEnabled}
                description={labels.alertsEnabledDesc}
              />

              <div className="reports-v2-channel-grid">
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
          </PremiumPanel>

          <div className="reports-v2-submit-row">
            <div>{labels.note}</div>
            <VisualButton type="submit" size="large" disabled={saving}>
              {saving ? labels.saving : labels.save}
            </VisualButton>
          </div>

          {actionData ? (
            <div
              className={`reports-v2-feedback ${actionData.ok ? "is-success" : "is-error"}`}
              role="status"
            >
              {actionData.message}
            </div>
          ) : null}
        </Form>
      </div>
    </div>
  );
}
