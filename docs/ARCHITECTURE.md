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
  auth/callback/route.ts  magic-link code → session exchange
components/           shared components (mostly client/presentational)
lib/
  queries.ts          server-side read helpers (typed Supabase selects)
  auth.ts             session + role gating (getAuthSession / requireRole / …)
  format.ts           pure formatters (clock, period labels)
  supabase/           Supabase client factories + generated types
proxy.ts              Next 16 middleware (refreshes the auth cookie per request)
supabase/             migrations/, seed.sql, config.toml (local stack)
docs/                 this folder
```

## Rendering & data flow

- **Reads:** pages are React Server Components. They call typed helpers in
  `lib/queries.ts`, which use the server Supabase client. Stats and standings are
  **derived** at query time from `game_events` (not stored) — see
  [`DATABASE.md`](./DATABASE.md).
- **Writes:** each route keeps its mutations in a colocated `actions.ts`
  (`"use server"`). Examples: `app/score/[gameId]/actions.ts`,
  `app/admin/teams/actions.ts`. Actions call `requireRole(...)` first, then write
  via the server client; RLS is the second line of defense in Postgres.
- **Interactive UI** is isolated to client components (`"use client"`): e.g.
  `components/LiveScoring.tsx`, `components/RosterCheckIn.tsx`,
  `components/StatsExplorer.tsx`, `app/admin/teams/color-swatches.tsx`.

## Supabase client split

Four entrypoints, each for a different execution context:

| File | Context | Purpose |
| --- | --- | --- |
| `lib/supabase/server.ts` | RSC / route handlers / server actions | Server client bound to the request cookie store |
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
  `supabase.auth.signInWithOtp(...)`; the emailed link hits
  `app/auth/callback/route.ts`, which runs `exchangeCodeForSession` and sets the
  session cookie. (The callback rebuilds redirect URLs from the request `host`
  to avoid Next dev's `127.0.0.1`→`localhost` cookie-stranding.)
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
`/schedule`, `/games/[id]`, `/standings`, `/stats`, `/about`, `/about/[section]`.

Auth flows: `/login`, `/signup`, `/account`, `/auth/callback`.

Role-gated (enforced by `requireRole` + RLS):

| Route | Required role |
| --- | --- |
| `/admin`, `/admin/*` | `admin` |
| `/score`, `/score/[gameId]`, `/score/[gameId]/roster` | `admin` or `scorekeeper` |
| `/captains/contacts` | `admin` or `team_captain` |

Contact info on `/players/[id]` is revealed only to `admin` / `team_captain` via
`getSessionIfRole`.
