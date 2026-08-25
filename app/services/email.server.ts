import { Resend } from "resend";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
  idempotencyKey?: string;
};

export type SendEmailResult = {
  id: string | null;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getResendClient() {
  return new Resend(getRequiredEnv("RESEND_API_KEY"));
}

function getDefaultFrom() {
  return getRequiredEnv("EMAIL_FROM");
}

function getDefaultReplyTo() {
  return process.env.EMAIL_REPLY_TO?.trim() || undefined;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  from,
  idempotencyKey,
}: SendEmailInput): Promise<SendEmailResult> {
  const recipients = (Array.isArray(to) ? to : [to])
    .map((recipient) => recipient.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    throw new Error("At least one email recipient is required.");
  }

  const defaultReplyTo = getDefaultReplyTo();

  const response = await getResendClient().emails.send(
    {
      from: from?.trim() || getDefaultFrom(),
      to: recipients,
      subject: subject.trim(),
      html,
      ...(text ? { text } : {}),
      ...(replyTo?.trim() || defaultReplyTo
        ? { replyTo: replyTo?.trim() || defaultReplyTo }
        : {}),
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  if (response.error) {
    throw new Error(
      response.error.message || "Resend failed to send the email.",
    );
  }

  return {
    id: response.data?.id ?? null,
  };
}

export async function sendTestEmail(to: string) {
  return sendEmail({
    to,
    subject: "MarginLab email test",
    text:
      "MarginLab email delivery is working correctly. This message was sent through Resend.",
    html: `
      <div style="margin:0;padding:32px;background:#050910;font-family:Arial,Helvetica,sans-serif;color:#f8fafc;">
        <div style="max-width:620px;margin:0 auto;padding:28px;border-radius:20px;background:#0f1724;border:1px solid rgba(255,115,60,0.24);">
          <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#ff875f;">
            MarginLab
          </div>

          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;color:#ffffff;">
            Email delivery is working.
          </h1>

          <p style="margin:14px 0 0;font-size:15px;line-height:1.7;color:#cbd5e1;">
            MarginLab can now send transactional emails through Resend using your verified domain.
          </p>

          <div style="margin-top:22px;padding:14px 16px;border-radius:14px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.20);color:#4ade80;font-size:13px;font-weight:700;">
            Resend connection verified
          </div>
        </div>
      </div>
    `,
  });
}
