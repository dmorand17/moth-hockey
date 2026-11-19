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

Then open the app at **http://127.0.0.1:3001**. Use `127.0.0.1`, not `localhost` —
the auth callback sets its cookie on the host you came in on, and mixing the two
strands the session (see `app/auth/callback/route.ts`).

## Local service URLs

`supabase start` / `supabase status` print these. Defaults:

| Service          | URL                                                      |
| ---------------- | -------------------------------------------------------- |
| App (Next.js)    | http://127.0.0.1:3001                                    |
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

Auth is passwordless — there is nothing to type but the email. The link arrives
in **Mailpit**, the local mail catcher that intercepts every outgoing email, so
no real mail is ever sent and you never need a real inbox.

1. Start the stack and open **http://127.0.0.1:3001/login** (use `127.0.0.1`,
   not `localhost` — see the note at the top).
2. Enter one of the seeded emails above (e.g. `admin@moth.test`) and submit. The
   form uses `shouldCreateUser: false`, so only emails that already exist get a
   link — the seeded accounts qualify; a typo'd address silently gets nothing.
3. Open **Mailpit** at http://127.0.0.1:54324. The newest message at the top is
   your login email — open it and click **"Sign in"** (the magic link).
4. The link opens `/auth/confirm`; tap **SIGN IN** there to finish. It redirects
   back to the app, now signed in as that user.
   To switch users, sign out and repeat with a different seeded email.

Links are single-use and expire, so always click the newest message. If a link
seems dead, request a fresh one from `/login`.

## Previewing the mobile layout

Most league members use the site on a phone, so check every UI change at phone
width first. The quickest way is a desktop browser in device mode:

1. Open the app at http://127.0.0.1:3001.
2. Open DevTools (`Cmd+Option+I` in Chrome) and toggle device mode
   (`Cmd+Shift+M`), the phone-and-tablet icon in the DevTools toolbar.
3. Pick a phone preset such as **iPhone 12 Pro** (390×844) and reload.

Things to check at 390px wide:

- No sideways scrolling on the page (wide tables may scroll inside their own
  box).
- Buttons and links are easy to tap (at least 44px tall).
- The sticky header doesn't cover headings when you jump to an anchor.

Safari works too: enable **Settings → Advanced → Show features for web
developers**, then use **Develop → Enter Responsive Design Mode**
(`Cmd+Option+R`).

To try it on a real phone, see the next section.

## Testing from your phone (same Wi-Fi)

`bun dev` only listens on localhost, so a phone can't reach it. Use:

```bash
bun run dev:lan
```

It prints the URL to open on the phone, e.g. `http://192.168.68.57:3001`. Two
things it changes versus `bun dev`:

- Next binds to `0.0.0.0` instead of localhost.
- `NEXT_PUBLIC_SUPABASE_URL` is rewritten to this machine's LAN IP, because a
  browser on the phone resolves `127.0.0.1` to the phone itself.

The IP is detected from whichever interface holds the default route, so a new
DHCP lease needs no config edit. Override it with `--ip` if detection picks
wrong. Nothing is written to `.env.local`.

Signed-in pages don't work from the phone: Supabase builds magic links from
`site_url` (`http://127.0.0.1:3001` in `supabase/config.toml`), so the link
points back at the phone itself. Use this for public pages only. Networks with
client isolation (many corporate and guest Wi-Fi setups) block LAN traffic
entirely; in that case, use a mobile-sized browser window on the Mac instead.

If the page loads but data is missing, macOS likely blocked incoming connections
to Supabase — allow them when prompted, or check
`curl http://<your-lan-ip>:54321/rest/v1/` from the Mac.

## Resetting & reseeding data

```bash
supabase db reset   # re-applies all migrations, then runs seed.sql
```

This wipes everything — including `auth.users` — and reseeds, so the three test
users always come back identically (same UUIDs). Run it whenever you want a clean
slate or after pulling new migrations.

## Loading sample data (4 or 5 teams)

For a fuller demo — teams with rosters, a played schedule (standings + stats), and
byes — load a sample dataset into the current season:

```bash
scripts/local/seed-sample.sh 5   # 5 teams (odd → one bye per week)
scripts/local/seed-sample.sh 4   # 4 teams (even → no byes)
scripts/local/seed-sample.sh 5 --complete   # a finished season (see below)
```

Each run seeds the current season with:

- **N teams** with rosters (6 forwards, 2 defense, 1 goalie each; one captain)
- a **10-week schedule** (2 games/night) + playoff stubs (TBD-vs-TBD)
- the **first 7 weeks played** — final scores + goal events + appearances

So `/standings`, `/stats`, `/schedule` (with the bye lines), and player profiles
all populate. Use the **5-team** set to see bye weeks in action.

Add `--complete` to play **every** regular-season week plus the full playoff
bracket (semifinals and final), so the season can be finalized
(`/admin/seasons/[id]/finalize`) and recapped (`/recap`).

It's re-runnable — it wipes the season's games/rosters/stats and cleans up
orphaned seed players first. To get back to the base seed, run `supabase db reset`.
The dev server must be able to reach the local DB (`supabase start`).

## Inspecting data

- **Studio** (http://127.0.0.1:54323) — browse/edit tables, run SQL, view auth users.
- **psql** — `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Environment variables

Copy `.env.example` to `.env.local` and fill from `supabase status`:

| Variable                             | Local value                                         |
| ------------------------------------ | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`           | `Project URL` (http://127.0.0.1:54321)              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `Publishable` key                                 |
| `NEXT_PUBLIC_SITE_URL`               | Optional; base URL for OpenGraph links              |
| `SUPABASE_SECRET_KEY`                | `Secret` key (server-only; write-ups cron/finalize) |
| `OPENROUTER_API_KEY`                 | Your OpenRouter key (AI write-ups and season reports) |
| `WRITE_UP_MODEL`                     | Optional; primary write-up model                    |
| `WRITE_UP_FALLBACK_MODEL`            | Optional; fallback write-up model                   |
| `RECAP_SUMMARY_MODEL`                | Optional; season report model (default: write-up model) |
| `RECAP_SUMMARY_FALLBACK_MODEL`       | Optional; season report fallback (default: write-up fallback) |
| `CRON_SECRET`                        | Any string; `Authorization: Bearer` for the cron    |
| `BLOB_READ_WRITE_TOKEN`              | Optional; recap photo uploads (from Vercel or `vercel env pull`) |

`BLOB_READ_WRITE_TOKEN` points at the shared Blob store, so local and preview
uploads are kept under `dev/seasons/…` and never mix with production media.
Without it the recap uploader is disabled; the gallery still renders rows that exist.

The signup-email (`NEW_USER_WEBHOOK_SECRET`, `ADMIN_NOTIFY_EMAIL`, `SMTP_*`) and
"Scripts" variables in `.env.example` aren't needed for local development.

The publishable/anon key is safe to expose. Never commit the secret/service-role key.

## Troubleshooting

- **Magic link does nothing / logs me out** — make sure you opened the app at
  `127.0.0.1:3001`, not `localhost:3001`. The two are different cookie hosts.
- **"link if it exists" but no email** — the address must already be a user.
  Use a seeded email, or have an admin create one under `/admin/users`.
- **Test users disappeared** — they only live in `seed.sql`; re-run
  `supabase db reset`.
- **Stale schema after pulling** — `supabase db reset` re-applies migrations.
