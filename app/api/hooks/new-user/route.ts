import { NextResponse, type NextRequest } from "next/server";
import nodemailer from "nodemailer";

// Emails an admin when a new account registers, so they know to link the
// player record. Triggered by a Supabase Database Webhook on INSERT to
// public.user_profiles (see docs/EMAIL.md). nodemailer needs the Node runtime.
export const runtime = "nodejs";

type WebhookBody = {
  type?: string;
  table?: string;
  record?: { user_id?: string; email?: string; full_name?: string | null };
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export async function POST(request: NextRequest) {
  // Shared-secret check — set the same value as a custom header on the webhook.
  const secret = process.env.NEW_USER_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const record = body.record;
  if (!record?.email) {
    // Nothing to notify about — ack so the webhook isn't retried.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!host || !user || !pass || !to) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 500 });
  }

  const port = Number(process.env.SMTP_PORT ?? 465);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: { user, pass },
  });

  const name = record.full_name?.trim() || record.email;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const playersUrl = `${site}/admin/players`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? user,
      to,
      subject: `New M.O.T.H signup: ${name}`,
      text:
        `A new user just registered.\n\n` +
        `Name: ${record.full_name ?? "—"}\n` +
        `Email: ${record.email}\n\n` +
        `Link them to a player: ${playersUrl}`,
      html:
        `<p>A new user just registered on M.O.T.H Hockey.</p>` +
        `<p><strong>Name:</strong> ${escapeHtml(record.full_name ?? "—")}<br>` +
        `<strong>Email:</strong> ${escapeHtml(record.email)}</p>` +
        `<p><a href="${playersUrl}">Link them to a player →</a></p>`,
    });
  } catch (err) {
    return NextResponse.json({ error: "send_failed", detail: String(err) }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
