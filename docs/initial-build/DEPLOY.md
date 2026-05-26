# Deploying M.O.T.H Hockey to Vercel + Supabase

This is the **single staging environment** path: one Supabase project + one Vercel
deployment with the seed data loaded for QA. When you're ready for real prod,
spin up a second Supabase project and a second Vercel project — same steps,
different env values.

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
# Truncates all data but preserves schema. Run from repo root.
supabase db reset --linked
```

⚠️ This wipes the seed data permanently. Only run when you're sure.

**Option B — separate prod project (recommended):**

1. Repeat step 1 with name `moth-hockey-prod` (do NOT seed)
2. Apply only the migrations: `supabase db push` (point to the new project)
3. In Vercel: **Project Settings → Environments** → create a `Production`
   environment with the prod Supabase URL + key
4. Configure your custom domain on the prod environment

## Notes

- `.env.local` is gitignored. Never commit Supabase keys.
- The `anon`/`publishable` key is safe to expose client-side. The `service_role`
  key is NOT — only use it server-side and never check it in.
- RLS policies are enforced in production. Read access is open; writes require
  an authenticated user with `admin` or `scorekeeper` role in the `user_roles` table.
- To create the first admin: insert a row into `user_roles` via the Supabase
  SQL editor after a user has signed up via magic-link.
