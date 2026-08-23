import * as React from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";

import DashboardNav from "~/components/dashboard/DashboardNav";
import { sendEmail } from "~/services/email.server";
import { authenticate } from "~/shopify.server";
import {
  getBillingStatus,
  hasGrowthAccess,
} from "~/utils/billing.server";
import { useI18n } from "~/components/i18n/I18nProvider";

import "~/styles/dashboard.css";


type SupportActionData = {
  ok: boolean;
  error?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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


export async function action({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const language =
    String(formData.get("language") ?? "en") === "it" ? "it" : "en";

  const email = String(formData.get("email") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const respondError = (
    it: string,
    en: string,
    status = 400,
  ) =>
    Response.json(
      {
        ok: false,
        error: language === "it" ? it : en,
      } satisfies SupportActionData,
      { status },
    );

  if (!email || !isValidEmail(email)) {
    return respondError(
      "Inserisci un indirizzo email valido.",
      "Enter a valid email address.",
    );
  }

  if (!topic) {
    return respondError(
      "Seleziona l'argomento della richiesta.",
      "Select a support topic.",
    );
  }

  if (!subject || subject.length < 3) {
    return respondError(
      "Inserisci un oggetto di almeno 3 caratteri.",
      "Enter a subject of at least 3 characters.",
    );
  }

  if (subject.length > 140) {
    return respondError(
      "L'oggetto è troppo lungo.",
      "The subject is too long.",
    );
  }

  if (!message || message.length < 10) {
    return respondError(
      "Descrivi il problema con almeno 10 caratteri.",
      "Describe the issue using at least 10 characters.",
    );
  }

  if (message.length > 6000) {
    return respondError(
      "Il messaggio è troppo lungo.",
      "The message is too long.",
    );
  }

  const supportEmail = "support@marginlab.net";
  const shop = session.shop;

  const safeEmail = escapeHtml(email);
  const safeTopic = escapeHtml(topic);
  const safeSubject = escapeHtml(subject);
  const safeShop = escapeHtml(shop);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");

  const emailSubject = `[MarginLab Support] ${shop} — ${subject}`;

  const text = [
    "MarginLab Support Request",
    "",
    `Store: ${shop}`,
    `Contact email: ${email}`,
    `Topic: ${topic}`,
    `Subject: ${subject}`,
    "",
    message,
  ].join("\n");

  const html = `
    <div style="margin:0;padding:32px;background:#050910;font-family:Arial,Helvetica,sans-serif;color:#f8fafc;">
      <div style="max-width:700px;margin:0 auto;">
        <div style="font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#ff875f;">
          MARGINLAB SUPPORT REQUEST
        </div>
        <div style="margin-top:10px;font-size:30px;line-height:1.2;font-weight:900;color:#ffffff;">
          ${safeSubject}
        </div>
        <div style="margin-top:20px;padding:16px;border-radius:14px;background:#0f1724;border:1px solid rgba(255,255,255,.07);">
          <div style="font-size:12px;line-height:1.8;color:#cbd5e1;">
            <strong style="color:#ffffff;">Store:</strong> ${safeShop}<br />
            <strong style="color:#ffffff;">Contact email:</strong> ${safeEmail}<br />
            <strong style="color:#ffffff;">Topic:</strong> ${safeTopic}
          </div>
        </div>
        <div style="margin-top:18px;padding:18px;border-radius:16px;background:#0b1220;border:1px solid rgba(255,255,255,.08);">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;">Message</div>
          <div style="margin-top:10px;font-size:14px;line-height:1.75;color:#cbd5e1;">
            ${safeMessage}
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    await sendEmail({
      to: supportEmail,
      subject: emailSubject,
      html,
      text,
    });

    return Response.json({
      ok: true,
    } satisfies SupportActionData);
  } catch (sendError) {
    console.error("[MarginLab Support] Email send failed", sendError);

    return respondError(
      "Non è stato possibile inviare il messaggio. Riprova tra poco.",
      "The message could not be sent. Please try again shortly.",
      500,
    );
  }
}

export default function SupportPage() {
  const navigate = useNavigate();
  const supportFetcher = useFetcher<SupportActionData>();
  const formRef = React.useRef<HTMLFormElement | null>(null);

  const {
    growthAccess,
    whatsappAvailable,
    whatsappNumber,
  } = useLoaderData() as Awaited<
    ReturnType<typeof loader>
  >;

  const { language, messages } = useI18n();
  const copy = messages.supportPage;

  const sending = supportFetcher.state !== "idle";

  React.useEffect(() => {
    if (supportFetcher.data?.ok) {
      formRef.current?.reset();
    }
  }, [supportFetcher.data?.ok]);

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

                {copy.eyebrow}
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
                {copy.title}
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
                {copy.description}
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
              minHeight: 430,
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
              EMAIL SUPPORT
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
              {copy.emailTitle}
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
              {copy.emailDescription}
            </p>

            <supportFetcher.Form
              ref={formRef}
              method="post"
              style={{ marginTop: 20 }}
            >
              <input
                type="hidden"
                name="language"
                value={language}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(2,minmax(0,1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      color:
                        "rgba(255,255,255,0.48)",
                      fontSize: 10,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 7,
                    }}
                  >
                    {copy.yourEmail}
                  </div>

                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      minHeight: 48,
                      padding: "0 14px",
                      borderRadius: 13,
                      color: "#f8fafc",
                      background:
                        "rgba(4,8,15,0.72)",
                      border:
                        "1px solid rgba(56,189,248,0.18)",
                      outline: "none",
                      fontWeight: 760,
                    }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      color:
                        "rgba(255,255,255,0.48)",
                      fontSize: 10,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 7,
                    }}
                  >
                    {copy.topic}
                  </div>

                  <select
                    name="topic"
                    required
                    defaultValue=""
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      minHeight: 48,
                      padding: "0 14px",
                      borderRadius: 13,
                      color: "#f8fafc",
                      background:
                        "rgba(4,8,15,0.92)",
                      border:
                        "1px solid rgba(56,189,248,0.18)",
                      outline: "none",
                      fontWeight: 760,
                    }}
                  >
                    <option value="" disabled>
                      {copy.selectTopic}
                    </option>
                    <option value="Setup & configuration">
                      {copy.topics.setup}
                    </option>
                    <option value="Metrics & analysis">
                      {copy.topics.metrics}
                    </option>
                    <option value="Features & usage">
                      {copy.topics.features}
                    </option>
                    <option value="Technical issue">
                      {copy.topics.technical}
                    </option>
                    <option value="Billing">
                      {copy.topics.billing}
                    </option>
                    <option value="Other">
                      {copy.topics.other}
                    </option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    color:
                      "rgba(255,255,255,0.48)",
                    fontSize: 10,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 7,
                  }}
                >
                  {copy.subject}
                </div>

                <input
                  type="text"
                  name="subject"
                  required
                  maxLength={140}
                  placeholder={copy.subjectPlaceholder}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: 48,
                    padding: "0 14px",
                    borderRadius: 13,
                    color: "#f8fafc",
                    background:
                      "rgba(4,8,15,0.72)",
                    border:
                      "1px solid rgba(56,189,248,0.18)",
                    outline: "none",
                    fontWeight: 760,
                  }}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    color:
                      "rgba(255,255,255,0.48)",
                    fontSize: 10,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 7,
                  }}
                >
                  {copy.message}
                </div>

                <textarea
                  name="message"
                  required
                  minLength={10}
                  maxLength={6000}
                  placeholder={copy.messagePlaceholder}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: 145,
                    resize: "vertical",
                    padding: 14,
                    borderRadius: 13,
                    color: "#f8fafc",
                    background:
                      "rgba(4,8,15,0.72)",
                    border:
                      "1px solid rgba(56,189,248,0.18)",
                    outline: "none",
                    lineHeight: 1.6,
                    fontWeight: 760,
                  }}
                />
              </div>

              {supportFetcher.data?.ok && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 13,
                    borderRadius: 13,
                    color: "#bbf7d0",
                    background:
                      "rgba(34,197,94,0.08)",
                    border:
                      "1px solid rgba(34,197,94,0.20)",
                    fontSize: 11,
                    fontWeight: 850,
                    lineHeight: 1.5,
                  }}
                >
                  ✓{" "}
                  {copy.sentSuccessfully}
                </div>
              )}

              {supportFetcher.data?.error && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 13,
                    borderRadius: 13,
                    color: "#fecaca",
                    background:
                      "rgba(239,68,68,0.08)",
                    border:
                      "1px solid rgba(239,68,68,0.20)",
                    fontSize: 11,
                    fontWeight: 850,
                    lineHeight: 1.5,
                  }}
                >
                  {supportFetcher.data.error}
                </div>
              )}

              <button
                type="submit"
                disabled={sending}
                style={{
                  marginTop: 16,
                  minHeight: 48,
                  padding: "0 18px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: 14,
                  color: "#ffffff",
                  cursor: sending
                    ? "wait"
                    : "pointer",
                  opacity: sending ? 0.7 : 1,
                  background:
                    "linear-gradient(135deg, rgba(56,189,248,0.92), rgba(37,99,235,0.86))",
                  border:
                    "1px solid rgba(125,211,252,0.24)",
                  fontSize: 13,
                  fontWeight: 950,
                }}
              >
                {sending ? copy.sending : copy.sendMessage}
                {!sending && <span>→</span>}
              </button>
            </supportFetcher.Form>
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
              {copy.whatsappEyebrow}
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
              {copy.whatsappTitle}
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
              {copy.whatsappDescription}
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
                    {copy.includedGrowth}
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
                    {copy.openWhatsapp}
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
                    {copy.whatsappUnavailable}
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
                    {copy.growthFeature}
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
                    {copy.growthDescription}
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
                  {copy.exploreGrowth}
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
            {copy.helpEyebrow}
          </div>

          <div
            style={{
              marginTop: 8,
              color: "#f8fafc",
              fontSize: 21,
              fontWeight: 950,
            }}
          >
            {copy.helpTitle}
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
              { key: "Setup", icon: "⚙" },
              { key: "Analysis", icon: "↗" },
              { key: "Features", icon: "◇" },
              { key: "Technical issues", icon: "!" },
            ].map((item, index) => (
              <div
                key={item.key}
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
                  {copy.helpItems[index].title}
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
                  {copy.helpItems[index].description}
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
          {copy.footerNote}
        </div>
      </div>
    </div>
  );
}
