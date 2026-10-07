# Development

Day-to-day workflow for working in this repo. For *running and signing in*
locally, see [`LOCAL-TESTING.md`](./LOCAL-TESTING.md); for the release process
(branch model, staging → main, tagging), see [`RELEASING.md`](./RELEASING.md);
for the initial Vercel + Supabase setup, see
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

This repo uses a `feature → staging → main` model. Always cut branches off
`staging`, not `main`. See [`RELEASING.md`](./RELEASING.md) for the full
workflow: feature PRs, the staging → main promotion, migration pushes, and
release tagging.

`NEXT_PUBLIC_*` vars are baked in at build time, so each branch builds with its
own Supabase URL + publishable key scoped in Vercel. For the initial provisioning
runbook (Supabase projects, Vercel env vars, auth/SMTP, custom domain), see
[`initial-build/DEPLOY.md`](./initial-build/DEPLOY.md).

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

## Box scores and locked availability (#122)

- Live and final games show a **box score** built from the scorekeeper's check-in (`game_appearances`) and the game's events (`lib/box-score.ts`, tested). Skaters: G · A · PTS · PEN · PS · PSG; goalies: GA · PSF · PSV · result.
- **Starting a game locks in availability:** every rostered player becomes `in` if checked in and `out` if not, overriding earlier self-reports (`lib/lineup-availability.ts`, called from `startGame` and `updateRoster`). Subs get no availability row. Failures are logged as `[lineup-availability]` and never block a start or a lineup edit. Games played before this shipped were not backfilled.
- **Availability is locked after puck drop:** `setAvailability` (player self-service) and `setPlayerAvailability` (captain) reject changes once the game is no longer `scheduled`. Admins may still correct availability on started or final games via `setPlayerAvailability`.
- **Per-game positions** (`0025`): `game_appearances.position` stores the position a player actually plays in that game. `startGame` and `updateRoster` write it from the check-in roster; `resolvePosition` (`lib/box-score.ts`) resolves the final display position (appearance → `game_subs` → `team_players` → `"forward"`). Older games (pre-`0025`) have `null` and fall back through the chain.
- The game page's Box score, Availability and Play-by-play sections collapse (`components/CollapsibleSection.tsx`, native `<details>`).

## AI write-ups (#19)

Game previews and recaps are written by a model through OpenRouter.

- **Model:** `WRITE_UP_MODEL` (default `openai/gpt-6-luna`), falling back to
  `WRITE_UP_FALLBACK_MODEL` (default `google/gemini-2.5-flash-lite`). Change either in
  Vercel's env settings; no deploy needed.
- **When:** a Vercel Cron job (`vercel.json`, daily 18:00 UTC) calls
  `/api/cron/write-ups` for previews of games in the next 36h and recaps missing
  from the last 7 days. Finalizing a game also writes its recap in the background.
- **Run it locally:**
  `curl -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3001/api/cron/write-ups`
- **Env:** `OPENROUTER_API_KEY`, `SUPABASE_SECRET_KEY` (server-only), `CRON_SECRET`,
  plus the two model vars. See `.env.local.example`.
- **OpenRouter guardrails:** the workspace must allow the OpenAI and Google
  providers. With Zero Data Retention on, at least one ZDR-compliant endpoint per
  model must stay allowed.
- **Tests:** `bun run test` runs the pure-module tests in `lib/`.
- **Regenerate (admin):** generates the new text first and only replaces the current
  write-up if that succeeds; on failure the current write-up is kept.
- **AI input stored:** each write-up stores the exact model input (`input`); admins
  can open "View AI input" on the card to inspect it.
- **Generation log line format:**
  `[write-ups] {"gameId":…,"kind":…,"status":…,"detail":"<model> in=<prompt tokens> out=<completion tokens> $<cost>"}`
