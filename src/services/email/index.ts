import { Resend } from "resend";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Sends one email via Resend. Server-only. Never throws: a failed send must not abort a bulk
 * announcement loop, so each attempt is recorded (ok/error) for the caller to log per-recipient.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, error: "Email is not configured (RESEND_API_KEY/RESEND_FROM_EMAIL)." };

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: input.to, subject: input.subject, html: input.html });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown send error" };
  }
}
