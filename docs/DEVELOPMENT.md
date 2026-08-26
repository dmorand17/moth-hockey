# Development

Day-to-day workflow for working in this repo. For *running and signing in*
locally, see [`LOCAL-TESTING.md`](./LOCAL-TESTING.md); for shipping, see
[`initial-build/DEPLOY.md`](./initial-build/DEPLOY.md).

## Prerequisites

- [bun](https://bun.sh) — package manager + runtime
- Supabase CLI (`brew install supabase/tap/supabase`)
- Docker running (the local Supabase stack runs in containers)

## App commands

```bash
bun install
bun dev          # Next.js dev server → http://127.0.0.1:3001
bun run build    # production build
bun start        # serve the production build
bun run lint     # ESLint (flat config, eslint.config.mjs)
```

`package.json` lists `sharp` and `unrs-resolver` under `trustedDependencies` /
`ignoreScripts` — preserve that when changing dependencies. Use `bun add` /
`bun install`, not npm/yarn.

## Local Supabase

```bash
supabase start   # boot Postgres/Auth/Studio/Mailpit (first run pulls images)
supabase status  # print URLs, ports, and keys
supabase stop    # shut the stack down
```

Studio (DB UI) is at `:54323`, Mailpit (catches outgoing email) at `:54324`.
Connection string for `psql`: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Migrations workflow

Migrations live in `supabase/migrations/` as `NNNN_name.sql`, applied in order.

**Create a migration** — add the next-numbered file, write plain SQL:

```bash
# either let the CLI scaffold a timestamped file:
supabase migration new add_something
# or follow the existing 000N_name.sql convention by hand
```

**Apply locally** — the simplest loop is a full reset (re-runs every migration,
then `seed.sql`):

```bash
supabase db reset
```

**Capture changes made in Studio** into a migration file:

```bash
supabase db diff -f my_change
```

**Push to a linked cloud project:** `supabase db push` (see DEPLOY.md).

> **Enum gotcha:** Postgres rejects using a new enum value in the same
> transaction that adds it. Put `alter type … add value` in its own migration
> *before* any migration that references the new value — see
> `0003_user_role_enum.sql`.

## Branches & deploys

Deploys are driven by git branch — Vercel builds each branch against its own
Supabase project:

| Git branch | Vercel environment | Supabase project |
|---|---|---|
| `staging` | Preview (staging) | staging project |
| `main` | Production | prod project |

Day-to-day work lands on `staging`: open PRs against `staging`, and a merge
there deploys the Preview build pointed at the **staging Supabase database**.
Use staging to QA against real cloud data before promoting to prod by merging
`staging` → `main`.

Because `NEXT_PUBLIC_*` vars are baked in at build time, each branch builds with
its own Supabase URL + publishable key (scoped per Vercel environment). Schema
changes reach staging by pushing migrations to the staging project:

```bash
supabase link --project-ref <staging-ref>   # one-time per machine
supabase db push                             # apply migrations to staging
```

For the full prod runbook (provisioning, env-var scoping, auth/SMTP, custom
domain), see [`initial-build/DEPLOY.md`](./initial-build/DEPLOY.md).

## Seed data

`supabase/seed.sql` runs automatically after `supabase db reset`. It seeds a
season/teams/players/games plus three deterministic dev users
(`admin@moth.test`, `scorekeeper@moth.test`, `player@moth.test`) — details in
[`LOCAL-TESTING.md`](./LOCAL-TESTING.md).

## Generated types

`lib/supabase/database.types.ts` is generated. Regenerate after schema changes:

```bash
supabase gen types typescript --local > lib/supabase/database.types.ts
```

## Conventions

- **Next.js 16 / React 19** — APIs differ from older versions. Consult
  `node_modules/next/dist/docs/` before writing framework code. Middleware is
  `proxy.ts` (not `middleware.ts`); page-level `themeColor` goes in the
  `viewport` export, not `metadata`.
- **Server-first** — pages are Server Components. Read via `lib/queries.ts`;
  mutate via colocated `actions.ts` (`"use server"`) that call `requireRole(...)`
  before writing. See [`ARCHITECTURE.md`](./ARCHITECTURE.md).
- **Tailwind v4** — configured in `app/globals.css`; there is no
  `tailwind.config.*`.
- **RLS-aware** — every write needs an authenticated user with the right role;
  the database enforces it even if a route guard is missed. See
  [`DATABASE.md`](./DATABASE.md).
- **Mobile-first** — design at 360–390px, tap targets ≥44px, no horizontal
  scroll. Full rules in [`initial-build/PLAN.md`](./initial-build/PLAN.md) and the
  punch list in [`initial-build/MOBILE-PLAN.md`](./initial-build/MOBILE-PLAN.md).

## Bootstrapping the first admin

Every signup gets `role = 'player'` via the `on_auth_user_created` trigger, so the
first admin is promoted by hand (locally via `psql`, in cloud via the SQL editor):

```sql
update public.user_roles
set role = 'admin'
where user_id = (select id from auth.users where email = 'you@example.com');
```

After that, role changes flow through `/admin/users`. (Locally, `admin@moth.test`
is already seeded as admin.)
