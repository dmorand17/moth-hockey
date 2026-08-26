# Deploying M.O.T.H Hockey to Vercel + Supabase

This is the **single staging environment** path: one Supabase project + one Vercel
deployment with the seed data loaded for QA. When you're ready for real prod,
spin up a second **Supabase** project for prod — but keep the **same Vercel
project**. A Vercel project maps to one git repo; environments are separated by
branch + scoped env vars, not by separate projects (see §4 Option B).

## Prereqs

- Supabase cloud account
- Vercel account
- Repo pushed to GitHub (`git@github.com:dmorand17/moth-hockey.git`)
- Supabase CLI installed locally (`brew install supabase/tap/supabase`)

## 1. Create the Supabase staging project

1. Go to https://supabase.com/dashboard → **New project**
2. Name: `moth-hockey-staging` (or similar)
3. Region: pick the one closest to your users
4. Database password: save it in a password manager — you'll need it to run
   migrations
5. Wait ~2 min for the project to provision
6. **Project Settings → API** → copy these two values, you'll paste them into
   Vercel later:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` (or `publishable`) key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## 2. Push the schema + seed data to Supabase

From the repo root:

```bash
# Link this repo to the new Supabase project (interactive — paste the
# project ref from the dashboard URL: app.supabase.com/project/<ref>)
supabase link --project-ref <project-ref>

# Apply migrations
supabase db push
```

Now seed the data. The Supabase CLI doesn't have a `db seed` command for
remote projects, so run the seed file directly with `psql`.

**Get the connection string from the dashboard:**
Project Settings → Database → Connection string → **Session pooler** tab
(port 5432, not the transaction pooler on 6543 — seed files need multi-
statement transactions which the transaction pooler doesn't support).

It looks like:
```
postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```

> ⚠️ Don't use the **direct** connection string (`db.<ref>.supabase.co`).
> That hostname is deprecated and won't resolve on newer projects, giving
> a `could not translate host name` error.

Replace `[YOUR-PASSWORD]` with your db password, then:

```bash
psql "<paste-session-pooler-string>" -f supabase/seed.sql
```

If you don't have `psql`: `brew install libpq && brew link --force libpq`.

**Alternative if `psql` is a hassle:** open the Supabase dashboard SQL
Editor, paste the contents of `supabase/seed.sql`, click Run. Slower but
no CLI needed.

## 3. Deploy to Vercel

1. Go to https://vercel.com/new
2. Import the GitHub repo `dmorand17/moth-hockey`
3. Framework: **Next.js** (auto-detected)
4. Build command: leave default (`bun run build` via `package.json`)
5. **Environment Variables** — paste the two values from Supabase step 1.6:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
6. **Deploy**

First deploy takes ~2–3 min. You'll get a URL like
`https://moth-hockey-<hash>.vercel.app` — share that with QA.

## 4. After QA — wiping the DB for real prod

When the staging build is approved and you want to launch with a clean slate:

**Option A — same project, reset data:**

```bash
# Drops and recreates the database from migrations + seed. Run from repo root.
supabase db reset --linked
```

⚠️ This recreates the whole database — it wipes the seed data **and every auth
user** permanently. Only run when you're sure. To refresh the seed data while
keeping the accounts that have signed up, see the staging refresh runbook in
[`../OPERATIONS.md`](../OPERATIONS.md).

**Option B — separate prod project (recommended):**

This is the full prod runbook. It uses **one Vercel project** with two
environments split by branch:

| Vercel environment | Git branch | Supabase project |
|---|---|---|
| Production | `main` | `moth-hockey-prod` |
| Preview (staging) | `staging` | current staging project |

Prod starts **empty** (no seed) — real league data is entered through the admin
UI after launch.

1. **Provision the prod project.** Repeat step 1 with name `moth-hockey-prod`.
   Save the DB password in a password manager.
2. **Apply migrations only** (no seed): `supabase link --project-ref <prod-ref>`
   then `supabase db push`. This applies all migrations on a clean DB — do
   **not** run `supabase/seed.sql` (that's test fixture data).
3. **Configure auth URLs + SMTP** on the **prod** Supabase project (dashboard-only
   — `supabase/config.toml` carries localhost values that do not apply to cloud
   projects):
   - **Authentication → URL Configuration**: set `Site URL` to the prod domain
     and add it to `Redirect URLs`. Magic-link sign-in redirects break if this
     still points at localhost.
   - **Authentication → Emails (SMTP)**: configure a production SMTP provider
     (e.g. Resend, SendGrid). The built-in Supabase mailer is heavily
     rate-limited and will silently drop magic-link emails under real traffic.
4. **Point the Vercel environments at the right Supabase projects.** In
   **Project Settings → Environment Variables**, scope each value to its
   environment. `NEXT_PUBLIC_*` vars are **baked in at build time**, so each
   environment must build with its own values:
   - **Production** (`main`): set `NEXT_PUBLIC_SUPABASE_URL` +
     `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the **prod** project's values.
   - **Staging** (`staging` branch): set the same two vars to the **staging**
     project's values. Use the **branch-specific** scope (`staging`) rather than
     the broad Preview scope if you don't want every PR preview pointing at the
     staging DB.
   > If your existing single Vercel deployment currently points Production at the
   > staging Supabase project, "going to prod" is mostly **repointing** these
   > vars — prod values on Production, staging values on the `staging` branch —
   > not building anything new.
5. **Custom domain.** Attach it to the Production environment (`main`).
6. **Staging preview URL → Supabase redirect allow-list.** Vercel preview
   deploys get a generated, changing URL per push, but Supabase's redirect
   allow-list needs exact URLs. Either assign a **stable alias/domain** to the
   `staging` branch deploy and allow-list that one URL (cleaner), or add a
   **wildcard** redirect URL (e.g. `https://*.vercel.app`) on the staging
   Supabase project (broader). Do this on the staging project's
   **Authentication → URL Configuration**.
7. **GitHub `Production` environment.** The
   [`keep-supabase-warm.yml`](../../.github/workflows/keep-supabase-warm.yml)
   workflow pings both `Staging` and `Production` on a schedule. Create a
   `Production` environment under **Repo Settings → Environments** with
   `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` secrets set to the prod values,
   or that matrix leg fails on every run.
8. **Bootstrap the first admin.** Prod has no roles. After the first user signs
   in via magic link (step 3 must be done first), insert their row into
   `user_roles` with role `admin` via the SQL editor — see Notes below.
9. **Smoke test before go-live.** Confirm: magic-link sign-in works on the real
   domain; an authenticated admin write succeeds; an anonymous public read
   succeeds; an anonymous write is rejected (RLS). Verify no `service_role` key
   is set on any `NEXT_PUBLIC_*` / client-exposed Vercel var.

## 5. Recurring operations

Periodic, post-launch tasks (e.g. refreshing staging seed data while keeping
real users) live in the operations runbook: [`../OPERATIONS.md`](../OPERATIONS.md).

## Notes

- `.env.local` is gitignored. Never commit Supabase keys.
- The `anon`/`publishable` key is safe to expose client-side. The `service_role`
  key is NOT — only use it server-side and never check it in.
- RLS policies are enforced in production. Read access is open; writes require
  an authenticated user with `admin` or `scorekeeper` role in the `user_roles` table.
- To create the first admin: insert a row into `user_roles` via the Supabase
  SQL editor after a user has signed up via magic-link.

## Troubleshooting

### Magic-link sign-in redirects to a broken URL / `{"error":"requested path is invalid"}`

Symptom: after clicking the magic link, the browser lands on the Supabase host
with the app's domain mangled into the path, e.g.
`https://<ref>.supabase.co/moth-hockey-…vercel.app?code=…`, and shows
`{"error":"requested path is invalid"}`.

Cause: the app sends a correct `emailRedirectTo`
(`https://<domain>/auth/callback?next=…`), but the Supabase project's redirect
allow-list doesn't include that domain, so Supabase falls back to the **Site
URL** — and the Site URL is a **bare hostname without `https://`**, which
Supabase resolves as a path on its own host.

Fix (on the affected project's **Authentication → URL Configuration** — dashboard
only, `supabase/config.toml` is local-dev only):

1. **Site URL** must include the scheme, e.g.
   `https://moth-hockey-git-staging-<team>.vercel.app` (not the bare host).
2. **Redirect URLs** must allow-list the deploy domain, e.g.
   `https://moth-hockey-git-staging-<team>.vercel.app/**` (add a
   `https://*-<team>.vercel.app/**` wildcard to also cover per-commit previews).

Then request a **fresh** magic link — consumed/old links won't retry.
