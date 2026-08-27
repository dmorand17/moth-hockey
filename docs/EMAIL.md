# Email / SMTP

How auth emails (magic links, signup confirmations) are sent, and how to fix
the **"email rate limit exceeded"** error in production.

## The problem

Supabase Auth sends the sign-in / sign-up emails. Out of the box it uses
Supabase's **built-in email service, which is heavily rate-limited and _not_
meant for production** — only a handful of emails per hour across the whole
project. Once a few people sign up or request magic links in the same hour,
further sends fail with:

> Email rate limit exceeded

Locally this never happens: `supabase start` routes all mail to **Mailpit**
(`http://127.0.0.1:54324`), which has no limit. Staging sees little traffic.
It's **production** (`fpvqzzkauhifixnzppwh`) that hits the wall.

## The fix: use your own SMTP provider

Configure a real email provider so sending is governed by _their_ limits, not
Supabase's tiny built-in cap.

### 1. Pick a provider

| Provider | Notes |
|----------|-------|
| **Amazon SES** | Fits our AWS default. Cheapest at volume. Needs domain verification + a request to leave the SES sandbox. |
| **Resend** | Fastest setup, generous free tier, good DX. |
| **Postmark** | Excellent deliverability for transactional mail. |
| **SendGrid** | Widely supported. |

Any of them work — they all expose an SMTP host/port/username/password. For a
small beer-league app, **Resend** is the quickest to stand up; **SES** is the
natural choice if we want to stay in AWS.

### 2. Verify your sending domain

In the provider, verify the domain you'll send **From** (e.g.
`noreply@yourdomain`) by adding the DNS records they give you (SPF / DKIM, and
DMARC if offered). Emails from an unverified domain land in spam or get
rejected.

### 3. Add custom SMTP to Supabase (prod)

Dashboard → project `fpvqzzkauhifixnzppwh` → **Authentication → Emails → SMTP
Settings** → enable **Custom SMTP** and fill in:

- **Sender email** — the verified From address (e.g. `noreply@yourdomain`)
- **Sender name** — e.g. `M.O.T.H Hockey`
- **Host / Port** — from the provider (commonly `587` STARTTLS, or `465` TLS)
- **Username / Password** — the provider's SMTP credentials / API key

Save, then send yourself a test (trigger a magic link from `/login`).

### 4. Raise the auth email rate limit

Dashboard → **Authentication → Rate Limits** → increase **"Rate limit for
sending emails"** (the built-in default is tiny). With your own SMTP you can
set a sane number; the provider's own limits are the real ceiling.

## Interim mitigations (before SMTP is set up)

- The built-in limit **resets hourly** — affected users can retry later.
- Sign-**in** for existing users still costs the same email budget as signup
  (both send a link), so a burst of logins can also trip it.
- To unblock one person immediately, an admin can create/confirm them directly:
  Dashboard → **Authentication → Users → Add user** (mark email confirmed), then
  link them to their player row in `/admin/users` → Players.

## New-user signup notifications

Separate from auth email: when someone registers, we email an **admin** so they
know to link the new account to a roster player. This does **not** go through
Supabase Auth — it's our own route sending over SMTP.

### How it flows

1. A user signs up → a row lands in `auth.users`.
2. The `handle_new_auth_user` trigger (migration `0004_auth_roles.sql`) seeds a
   `public.user_profiles` row with their email + name.
3. A **Supabase Database Webhook** on `INSERT` to `public.user_profiles` POSTs
   the new row to `app/api/hooks/new-user`.
4. The route verifies a shared secret, then emails `ADMIN_NOTIFY_EMAIL` via
   `nodemailer` with a link to `/admin/players`.

We hook `user_profiles` rather than `auth.users` because the webhook payload
carries the `email` and `full_name` we need directly, and it's a public-schema
table the dashboard can target cleanly.

### Why the dashboard, not a migration

Database Webhooks are ultimately a trigger calling `supabase_functions.http_request()`,
so they *can* live in a migration — but this one is configured in the
**dashboard per project**, on purpose:

- It carries the `x-webhook-secret` value. Putting that in a migration commits a
  **secret to git**, which we don't do.
- The target URL is **environment-specific** (staging vs. prod Vercel URLs). A
  migration applies identically everywhere it runs, so a hardcoded URL would be
  wrong for at least one environment and meaningless locally.
- It's the same class of per-project config as the SMTP settings above.

If we ever want it version-controlled and identical across environments, revisit
this — a migration referencing a Vault secret + a per-env URL GUC would be the
path. It isn't worth that today.

### 1. Set the server env vars (Vercel)

In the Vercel project, add these to the target environment (**Production** /
**Preview**), as plain server vars — **not** `NEXT_PUBLIC_*`. See
`.env.production.example` for the full list:

- `NEW_USER_WEBHOOK_SECRET` — a random shared secret (also set as the webhook
  header below)
- `ADMIN_NOTIFY_EMAIL` — who gets the "new signup" email
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` — the provider's SMTP
  creds (port `465` = TLS, `587` = STARTTLS)
- `SMTP_FROM` — verified From address (defaults to `SMTP_USER` if unset)

These can reuse the same provider credentials as the custom Auth SMTP above.

### 2. Create the Database Webhook

Dashboard → **Integrations → Webhooks → Create a new hook** (direct link:
`https://supabase.com/dashboard/project/<project-ref>/integrations/webhooks/overview`).
Webhooks are a wrapper around triggers using the **`pg_net`** extension — if the
option is unavailable or the hook never fires, enable `pg_net` under **Database
→ Extensions** first.

- **Table** — `public.user_profiles`
- **Events** — `INSERT` only
- **Type** — HTTP Request, method `POST`
- **URL** — `https://<your-domain>/api/hooks/new-user`
- **HTTP Headers** — add `x-webhook-secret` = the same value as
  `NEW_USER_WEBHOOK_SECRET`

### 3. Test

Create a user (Dashboard → **Authentication → Users → Add user**, or sign up
through `/login`). The admin address should receive a "New M.O.T.H signup"
email. If not, check the webhook's delivery log in the dashboard and the Vercel
function logs. The route returns:

- `401` — secret missing or mismatched
- `500 email_not_configured` — an SMTP var or `ADMIN_NOTIFY_EMAIL` is unset
- `502 send_failed` — SMTP rejected the send (check host/port/creds)

Locally there's no Vercel target, so the webhook isn't exercised; test in a
deployed environment.

## Notes

- The **publishable/anon key is safe to expose**; the SMTP password and the
  Supabase **service_role/secret** key are not — keep them in the dashboard,
  never in `NEXT_PUBLIC_*` or git.
- This is a **per-project** setting. Staging and prod are configured
  independently; local uses Mailpit and needs nothing.
- Deliverability tip: set up **SPF + DKIM** (and ideally DMARC) for the sending
  domain, or magic links will land in spam.
