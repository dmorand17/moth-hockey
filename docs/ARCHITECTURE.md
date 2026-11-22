# Architecture

Current-state map of how M.O.T.H Hockey is built. For *why* things are the way
they are (scope, decisions, league rules), see
[`initial-build/PLAN.md`](./initial-build/PLAN.md).

## Stack

- **Next.js 16** (App Router) + **React 19** — server-first rendering.
- **Tailwind v4** — configured in CSS (`app/globals.css`), not `tailwind.config.*`.
- **Supabase** — Postgres + Auth (+ Realtime, planned for the live boxscore).
- **bun** — package manager and runtime (`bun.lock`).
- **TypeScript** — path alias `@/*` → repo root (`tsconfig.json`).

## Directory layout

```
app/                  App Router routes (see Routes below)
  layout.tsx          root layout: fonts, header nav (role-aware), footer
  globals.css         Tailwind v4 entrypoint + design tokens
  <route>/page.tsx    a route (Server Component by default)
  <route>/actions.ts  server actions ("use server") for that route's mutations
  auth/confirm/       magic-link landing page; POSTs to verify the token
  auth/callback/route.ts  fallback: magic-link code → session exchange
  api/                route handlers: cron/write-ups (Vercel cron), hooks/new-user (DB webhook),
                      media/upload (admin-only Blob upload tokens)
  admin/players/export/route.ts  admin-only CSV download of the players list
  seasons/[slug]/recap/  recap page + summary-actions.ts (AI report) + media-actions.ts (gallery)
components/           shared components (mostly client/presentational)
  recap/              season recap sections: summary admin, jump bar, gallery + lightbox, uploader
lib/
  queries.ts          server-side read helpers (typed Supabase selects)
  auth.ts             session + role gating (getAuthSession / requireRole / …)
  format.ts           pure formatters (clock, period labels)
  matchup.ts          pure matchup stats (game preview + write-ups)
  leaders.ts          scoring-leader aggregation
  box-score.ts        box score stat lines from lineup + events
  board.ts            message-board helpers
  awards.ts           award labels, display order, badge styling
  seasons.ts          season identity/lifecycle (recap target, slugs)
  season-schedule.ts  round-robin schedule generation
  season-finalize.ts  season totals, champion, proposed award winners
  season-recap.ts     season recap computations (moments, leaders, jump links)
  recap-summary/      AI season report: facts, prompt, output checks, admin controls
  media.ts            recap media rules: paths, types/limits, URL checks, reorder, lightbox nav
  storage.ts          the only server touchpoint with Vercel Blob (head, delete, upload tokens)
  lineup-availability.ts  writes scorekeeper check-in back to game_availability
  paginate.ts         page slicing helper
  players-export.ts   admin player filters and formula-safe CSV columns
  *.test.ts           `bun test` specs for the pure modules
  write-ups/          AI game write-ups: OpenRouter client, prompt, parse, data, generate
  supabase/           Supabase client factories + generated types
proxy.ts              Next 16 middleware (refreshes the auth cookie per request)
scripts/              dev-lan.sh, supabase-push.sh, reset-staging.sh, local/ seed helpers
vercel.json           Vercel cron schedule (daily /api/cron/write-ups)
supabase/             migrations/, seed.sql, config.toml (local stack), templates/ (auth
                      emails), reset-staging.sql, seed-spring-2025.sql
docs/                 this folder
```

## Rendering & data flow

- **Reads:** pages are React Server Components. They call typed helpers in
  `lib/queries.ts`, which use the server Supabase client. Stats and standings are
  **derived** at query time from `game_events` (not stored) — see
  [`DATABASE.md`](./DATABASE.md).
- **Writes:** each route keeps its mutations in a colocated `actions.ts`
  (`"use server"`). Examples: `app/score/[gameId]/actions.ts`,
  `app/admin/seasons/actions.ts`. Actions call `requireRole(...)` first, then write
  via the server client; RLS is the second line of defense in Postgres.
- **Season recap AI report:** an admin server action builds a facts JSON from the
  page's own data (`lib/recap-summary/facts.ts`), calls OpenRouter, and writes a
  draft to `season_recap_drafts`. Publishing copies it to `season_recaps`, the only
  table the public can read. The page itself is computed live on every request.
- **Recap media:** the browser uploads straight to Vercel Blob (`upload()` from
  `@vercel/blob/client`), using a token from `/api/media/upload` that is issued only
  to admins and only for `seasons/{slug}/` (`dev/seasons/{slug}/` outside
  production). The browser then calls `recordSeasonMedia`, which checks the URL and
  the blob's real type/size before inserting the `season_media` row.
- **Interactive UI** is isolated to client components (`"use client"`): e.g.
  `components/LiveScoring.tsx`, `components/RosterCheckIn.tsx`,
  `components/StatsExplorer.tsx`, `app/admin/seasons/color-swatches.tsx`.

## Supabase client split

Five entrypoints, each for a different execution context:

| File | Context | Purpose |
| --- | --- | --- |
| `lib/supabase/server.ts` | RSC / route handlers / server actions | Server client bound to the request cookie store |
| `lib/supabase/service.ts` | server jobs with no user session | Service-role client (`SUPABASE_SECRET_KEY`, bypasses RLS); used by `app/api/cron/write-ups/route.ts` and `lib/write-ups/generate.ts` |
| `lib/supabase/client.ts` | browser (`"use client"`) | Browser client for client components |
| `lib/supabase/middleware.ts` | `updateAuthSession()` | Refreshes the JWT + rewrites auth cookies on each request |
| `proxy.ts` (repo root) | Next 16 middleware | Wires `updateAuthSession` for all non-static routes |

`lib/supabase/database.types.ts` holds the generated DB types consumed by every
client (`createServerClient<Database>`, etc.).

> **Next 16 note:** middleware is the file `proxy.ts` exporting `proxy(...)` —
> Next 16 renamed `middleware.ts` → `proxy.ts`. The `lib/supabase/middleware.ts`
> helper is just where the refresh logic lives.

## Auth & roles

- **Passwordless magic link.** `/login` and `/signup` call
  `supabase.auth.signInWithOtp(...)`; the emailed link goes to
  `/auth/confirm?token_hash=…`. `app/auth/confirm/page.tsx` renders a button
  that POSTs to `app/auth/confirm/actions.ts`, which calls `verifyOtp` and sets
  the session cookie. Verifying only on POST means email link scanners (which
  GET the link) can't burn the one-time token. `app/auth/callback/route.ts`
  (`exchangeCodeForSession`) remains as a fallback; it rebuilds redirect URLs
  from the request `host` to avoid Next dev's `127.0.0.1`→`localhost`
  cookie-stranding.
- **Role gating** lives in `lib/auth.ts`:
  - `getAuthSession()` → `{ userId, email, role }` (role from `user_roles`).
  - `requireRole([...])` → hard gate; redirects to `/login` or `/?error=forbidden`.
  - `getSessionIfRole([...])` → soft gate; returns the session or `null` without
    redirecting (for pages that render publicly but reveal extra UI to some roles).
- **RLS** enforces the same rules at the database layer via helper functions
  (`is_admin()`, `is_scorekeeper_or_admin()`, `is_team_captain_or_admin()`).
  See [`DATABASE.md`](./DATABASE.md).
- Roles are currently **single-valued** per user. A planned move to many-to-many
  is designed in [`initial-build/MULTI-ROLE.md`](./initial-build/MULTI-ROLE.md)
  (not yet implemented).

## Routes

Public (anonymous read): `/`, `/teams`, `/teams/[slug]`, `/players/[id]`,
`/schedule`, `/games/[id]`, `/standings`, `/stats`, `/stats/all-time`,
`/recap` (redirects to the latest season recap), `/seasons/[slug]/recap` (plus
its `opengraph-image` share card), `/about`, `/about/[section]`.

Auth flows: `/login`, `/signup`, `/account`, `/auth/confirm`, `/auth/callback`.

Role-gated (enforced by `requireRole` + RLS):

| Route | Required role |
| --- | --- |
| `/admin`, `/admin/*` (seasons, `seasons/[id]/finalize`, rosters, players, schedule, users, content) | `admin` |
| `/score`, `/score/[gameId]`, `/score/[gameId]/roster` | `admin` or `scorekeeper` |
| `/captains/contacts` | `admin` or `team_captain` |

Route handlers:

| Route | Auth |
| --- | --- |
| `/api/media/upload` | admin session (issues Vercel Blob client-upload tokens) |
| `/admin/players/export` | admin session, else 403 (CSV of the current season's players, honoring the screen's `q` / `team` / `link` filters and an allowlisted `columns` set; names only when that param is missing or invalid) |
| `/api/cron/write-ups` | `Authorization: Bearer $CRON_SECRET` (Vercel cron, `vercel.json`) |
| `/api/hooks/new-user` | `x-webhook-secret: $NEW_USER_WEBHOOK_SECRET` (Supabase DB webhook) |

Contact info on `/players/[id]` is revealed only to `admin` / `team_captain` via
`getSessionIfRole`.

The message board lives on the homepage (`components/HomeBoard.tsx`, section 01,
scoped to the current season with earlier seasons as a read-only archive via
`?boardSeason=`; paginated with `?before=`; also shown off-season) with mutations in
`app/post-actions.ts`. Posting there and in the game-page discussion requires a signed-in user
linked to a roster player (`getBoardViewer()` in `lib/auth.ts`, plus RLS);
reading is public.
