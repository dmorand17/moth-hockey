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

## Notes

- The **publishable/anon key is safe to expose**; the SMTP password and the
  Supabase **service_role/secret** key are not — keep them in the dashboard,
  never in `NEXT_PUBLIC_*` or git.
- This is a **per-project** setting. Staging and prod are configured
  independently; local uses Mailpit and needs nothing.
- Deliverability tip: set up **SPF + DKIM** (and ideally DMARC) for the sending
  domain, or magic links will land in spam.
