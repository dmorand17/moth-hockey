# Local Testing

How to run M.O.T.H Hockey locally against a local Supabase stack, and how to sign
in as each seeded test user. Auth is passwordless **magic-link** — there are no
passwords to remember; you grab the link from a local mail catcher (Mailpit).

## Prerequisites

- [bun](https://bun.sh) (package manager — see `bun.lock`)
- Supabase CLI (`brew install supabase/tap/supabase`)
- Docker running (Supabase's local stack runs in containers)

## Start the local stack

```bash
supabase start      # boots Postgres, Auth, Studio, Mailpit, etc. (first run pulls images)
bun install
bun dev             # Next.js dev server
```

Then open the app at **http://127.0.0.1:3000**. Use `127.0.0.1`, not `localhost` —
the auth callback sets its cookie on the host you came in on, and mixing the two
strands the session (see `app/auth/callback/route.ts`).

## Local service URLs

`supabase start` / `supabase status` print these. Defaults:

| Service          | URL                                                      |
| ---------------- | -------------------------------------------------------- |
| App (Next.js)    | http://127.0.0.1:3000                                    |
| Supabase API     | http://127.0.0.1:54321                                   |
| Studio (DB UI)   | http://127.0.0.1:54323                                   |
| Mailpit (emails) | http://127.0.0.1:54324                                   |
| Postgres         | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Test users

`supabase/seed.sql` seeds three deterministic accounts, recreated on every
`supabase db reset`. They're magic-link only (email pre-confirmed, no password).

| Email                   | Role          | Can access                                                        |
| ----------------------- | ------------- | ----------------------------------------------------------------- |
| `admin@moth.test`       | `admin`       | Everything — `/admin/*`, scoring, captain contacts                |
| `scorekeeper@moth.test` | `scorekeeper` | `/score/*` (live game scoring); some actions still require admin  |
| `player@moth.test`      | `player`      | Normal signed-in user — public pages + own account/profile only   |

Role gating lives in `lib/auth.ts` (`requireRole` / `getSessionIfRole`). For
reference, `team_captain` (not seeded by default) unlocks `/captains/contacts`
and the contact info on player profiles.

## Signing in

1. Start the stack and open **http://127.0.0.1:3000/login**.
2. Enter one of the emails above and submit. (The login form uses
   `shouldCreateUser: false`, so only emails that already exist receive a link —
   the seeded accounts qualify.)
3. Open **Mailpit** at http://127.0.0.1:54324, open the newest email, and click
   the magic link. It redirects back to the app, now signed in.

## Resetting & reseeding data

```bash
supabase db reset   # re-applies all migrations, then runs seed.sql
```

This wipes everything — including `auth.users` — and reseeds, so the three test
users always come back identically (same UUIDs). Run it whenever you want a clean
slate or after pulling new migrations.

## Inspecting data

- **Studio** (http://127.0.0.1:54323) — browse/edit tables, run SQL, view auth users.
- **psql** — `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Environment variables

Copy `.env.example` to `.env.local` and fill from `supabase status`:

| Variable                             | Local value (`supabase status`)        |
| ------------------------------------ | -------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`           | `Project URL` (http://127.0.0.1:54321) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `Publishable` key                    |

The publishable/anon key is safe to expose. Never commit the secret/service-role key.

## Troubleshooting

- **Magic link does nothing / logs me out** — make sure you opened the app at
  `127.0.0.1:3000`, not `localhost:3000`. The two are different cookie hosts.
- **"link if it exists" but no email** — the address must already be a user.
  Use a seeded email, or have an admin create one under `/admin/users`.
- **Test users disappeared** — they only live in `seed.sql`; re-run
  `supabase db reset`.
- **Stale schema after pulling** — `supabase db reset` re-applies migrations.
