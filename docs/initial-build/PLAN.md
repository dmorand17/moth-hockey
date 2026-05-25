# M.O.T.H Hockey — Build Plan

Single source of truth for scope, decisions, and progress. The Phase 1 / Phase 2 sections are a living checklist — tick boxes here as work ships rather than maintaining a separate progress doc.

Last updated: 2026-05-24

**League name:** M.O.T.H Hockey ("Mostly Over The Hill" hockey). Header should display "M.O.T.H Hockey" with the expansion as a tagline/subtitle.

---

## Design

### Visual style

Dark theme with hockey-rink vibe — dark background, high-contrast text, accent colors per team. Designed to read well on phones at the rink. Tailwind v4 default dark palette + per-team accent from `teams.color`.

**Typography:** Bebas Neue for display/headers (scoreboard feel), Inter for body, JetBrains Mono for numeric/stat columns.

**Footer/branding:** Footer reads "Powered by the Milkman"; tagline reads "EST. PRE-COVID".

### Team colors

Placeholder distinct colors auto-assigned at seed time (e.g. red, blue, green, yellow, purple, orange, teal, pink). Admin can override per team in the UI later.

### Mobile-first

The vast majority of users access this site from a phone — at the rink, on the bench, between shifts. Every page must be designed and verified at mobile viewports first; desktop is the secondary view. Practically that means:

- **Design at 360–390px width first.** Don't add a desktop layout until the mobile layout works.
- **Tailwind utilities default to mobile.** Use `sm:` / `md:` / `lg:` breakpoints to *progressively enhance* — never to fix something that's broken on mobile.
- **Tap targets ≥ 44×44px.** Buttons, nav links, table rows that link somewhere — all must be thumbable.
- **No horizontal scroll.** Wide tables must collapse, scroll-snap, or hide non-essential columns on small screens. Test at 360px.
- **Avoid hover-only affordances.** Anything important on hover must also work on tap (or be re-thought for mobile). Tooltips/popovers should toggle on tap.
- **Sticky headers/footers used sparingly** — they eat phone real estate. Reserve for the scorekeeper clock and similar tools-of-the-moment.
- **Verify in a real mobile browser** (or DevTools mobile emulation) before merging UI changes — not just by resizing the desktop window.

---

## Infrastructure

- **Stack:** Next.js 16 (App Router) + Tailwind v4 + Supabase (Postgres / Auth / Realtime). Cloudflare R2 added in Phase 2 for photos.
- **Hosting:** Vercel Hobby (free) + Supabase Free (+ Cloudflare R2 free tier in Phase 2).
- **Cost target:** $0/mo (custom domain ~$10/year is the only spend).
- **Domain:** using the free `*.vercel.app` subdomain at launch. Custom domain deferred.

---

## League rules that shape the model

This is a beer league with one non-standard rule that affects everything:

> **Penalties result in a penalty shot, not a power play.** We track the *count* of penalties per player, not penalty minutes (PIM). A penalty event always has an associated penalty-shot outcome (made / missed / saved).

Implications:
- Drop PIM entirely from the model and UI.
- A penalty is logically two linked events: the infraction, and the resulting shot.
- Goals scored from penalty shots should be distinguishable from regular goals in stats (some leagues count them separately).

**Regulation:** 3 periods, **17 minutes running time** each. The scorekeeper clock counts down 17:00 → 0:00 per period without stopping for whistles.

**Standings:** 2-1-0 points scheme — win = 2 pts, OT/SO loss = 1 pt, regulation loss = 0. Standings columns: GP · W · L · OTL · PTS · GF · GA · DIFF. Tiebreakers (in order): points → wins → goal differential → goals for.

**Goalie required:** every game roster must include exactly one goalie per team. Enforced in the admin/scorekeeper roster check-in.

**Overtime:** if a game is tied at the end of regulation, play a **5-minute OT** (sudden death). If still tied, go to a **shootout**. Implications:
- A goal scored in OT is a regular `goal` event in `game_events` with `period = 4` (or whatever convention we pick — see open items).
- A shootout is *not* tracked as individual `game_events`. Instead, the game stores final shootout tallies (`shootout_home_goals`, `shootout_away_goals`) and the winning team gets +1 added to their final `home_score`/`away_score`. Shootout goals/saves do **not** count toward player or goalie season stats.
- `games.decided_in` records how the game ended (`regulation` | `ot` | `shootout`) so the standings can award points correctly and the boxscore can label the result.

Goalie tracking includes:
- **Goals against** — regular goals scored on them
- **Penalty shots faced** — count of penalty shots taken against their team
- **Penalty shots saved** — count of those that resulted in `saved`

We don't track shots-on-goal or save % for regular play.

---

## Data model

```text
seasons          (id, season_type, year, name, start_date, end_date, is_current)
                  -- season_type: spring | fall | winter
                  -- year: e.g. 2026
                  -- name: derived/cached label like "Spring 2026"
                  -- league runs three seasons per calendar year

teams            (id, season_id, name, slug, logo_url, color)
                  -- a "team" row is per-season; team identity across seasons
                     can be derived from name/slug if needed later

players          (id, first_name, last_name, photo_url, user_id)
                  -- player identity persists across seasons
                  -- user_id (nullable) links a roster player to a
                     signed-up auth user. Set by an admin in /admin/users
                     after the user signs up; one user ↔ one player.

team_players     (team_id, player_id, season_id, jersey_number, position)
                  -- position: forward | defense | goalie
                  -- a player can be on different teams in different seasons

user_roles       (user_id, role)
                  -- role: admin | scorekeeper | team_captain | player
                  -- maps Supabase auth users to app roles for RLS policies
                  -- 'player' is the default role assigned at signup
                  -- 'team_captain' is DERIVED — set by a trigger when a row
                     exists in team_captains for the user. Captains can read
                     every linked player's contact info league-wide
                     (per-team scoping deferred to "stricter privacy mode")
                  -- 'scorekeeper' replaces the older 'scorer' name

team_captains    (team_id, user_id, season_id)
                  -- one captain per team per season, PK (team_id, season_id)
                  -- public-readable so /teams/[slug] can show "Captain: ..."
                  -- admin-write only; assigning/unassigning syncs the user's
                     user_roles.role via trigger

user_profiles    (user_id, email, phone, full_name, created_at, updated_at)
                  -- private contact info captured at signup
                  -- email mirrors auth.users.email; phone is optional
                  -- NEVER public. RLS: self-read, admin-read, and
                     team_captain-read only. Never selected by anonymous
                     queries that power the public site.

games            (id, season_id, home_team_id, away_team_id,
                  scheduled_at, location, status,        -- scheduled|live|final
                  home_score, away_score, period, clock_seconds,
                  decided_in,                            -- regulation | ot | shootout
                  shootout_home_goals, shootout_away_goals)

game_appearances (game_id, player_id, team_id, is_sub)
                  -- one row per player who actually played in the game
                  -- is_sub = true for substitutes (not on the team's season roster)
                  -- games_played is COUNT(*) over this table per player

game_events      (id, game_id, period, clock_seconds, type, team_id,
                  player_id, assist1_player_id, assist2_player_id,
                  -- penalty-specific fields:
                  penalty_type,                          -- e.g. tripping, hooking
                  penalty_shot_result,                   -- goal | saved
                  penalty_shot_taker_id,                 -- player who took the shot
                  notes, created_at)
                  -- type: goal | penalty

content_pages    (id, slug, section, title, body_md, sort_order, updated_at)
                  -- section: rules | faq | league
                  -- powers /about/rules, /about/faq, /about/league
                  -- multiple entries per section render as collapsible items

account_requests (id, email, full_name, reason, status, created_at,
                  reviewed_at, reviewed_by)
                  -- status: pending | approved | denied
                  -- LEGACY from the no-public-signup era. Now that signup
                     is open, this is only used for elevation requests
                     (a 'player' asking to become scorekeeper/captain/admin)
                     or kept for migration. Not part of the new flow.

season_player_stats (season_id, player_id, team_id,
                     games_played, goals, assists, penalties,
                     penalty_shots_taken, penalty_shots_made,
                     -- goalie-only (nullable for skaters):
                     goals_against,
                     penalty_shots_faced, penalty_shots_saved)
                  -- aggregated per-season totals for historical seasons that
                     don't have underlying events. Player profile unions these
                     with live-derived stats. Pulled forward from Phase 2 so
                     the schema and UI handle historical data on day one.

player_awards    (id, player_id, season_id, award_type, notes)
                  -- award_type: champion | mvp | mvd | vezina | sniper |
                                 most_hat_tricks | playmaker | iron_man | goon
                  -- one row per award per player per season
                  -- rendered as interactive badges on /players/[id]
```

### Notes on the schema

- **Stats are derived, not stored.** Career and per-season stats come from `SUM`/`COUNT` over `game_events` joined to `team_players` and `game_appearances`. We can materialize a view if it gets slow.
- **Games played** is derived from `game_appearances` filtered to appearances where the player played for their *own* season-roster team. If a player subs for another team, the boxscore shows their events but neither GP nor goal/assist/penalty totals roll into their season stats. (This applies to goalie GA / PSF / PSV the same way.) See Phase 2 backlog "Sub stats accounting" for surfacing these elsewhere.
- **Goalie stats are derived** by joining `game_events` to `team_players` for each game's roster. We assume the goalie listed for the team is in net the entire game unless we explicitly add a goalie-change event later.
  - **Goals against** = `goal` events scored *against* this goalie's team + `penalty` events with `penalty_shot_result = 'goal'` against this goalie's team.
  - **Penalty shots faced** = `penalty` events where this goalie's team did *not* commit the penalty.
  - **Penalty shots saved** = subset of the above where `penalty_shot_result = 'saved'`.
- **Historical data** comes in via CSV import. The `season_player_stats` table (defined above) holds imported totals that don't have underlying events. The player profile page unions live-derived stats with imported stats so historical seasons "just appear" once the CSV is loaded. The table itself ships in Phase 1; the CSV import UI ships in Phase 2.
- **Awards** are stored per player per season in `player_awards`. They surface on `/players/[id]` as interactive badges (hover/click reveals which seasons earned the award). Admins grant/revoke awards via the admin UI.

---

## Routes

```
/                              landing — current standings + next games
/teams                         all teams (current season)
/teams/[slug]                  roster + team stats + schedule + results
/players/[id]                  player profile + per-season + career stats
/schedule                      full schedule, filter by team
/games/[id]                    boxscore — live or final
/standings                     table for current season
/stats                         league leaders (points, goals, assists, penalties, goalies)
/about                         league hub — links to rules, league details, FAQs, contact
/about/rules                   league rules (markdown)
/about/faq                     frequently asked questions (markdown)
/about/league                  league details — history, format, contact info (markdown)
/seasons/[id]                  archive view of any past season

/score                         scorekeeper home (auth required)
/score/[gameId]                live scoring UI (mobile-first)

/admin                         CRUD: teams, players, schedule, content pages, awards
/admin/users                   manage signed-up users: assign roles, link a
                               user to a player row
/admin/import                  CSV upload for historical season stats

/signup                        public magic-link signup (email + optional phone)
/login                         public magic-link login
/account                       signed-in user's profile — edit phone, see role,
                               see linked player
/captains/contacts             team_captain view: roster of every team with
                               email + phone for each linked player
```

---

## Auth (Supabase Auth)

- Anonymous read for all public pages.
- **Open self-signup via magic link.** Anyone visits `/signup`, enters email + optional phone + full name, and receives a magic link. On first link click their auth user is created, a `user_profiles` row is inserted, and a `user_roles` row is created with `role = 'player'` (the default).
- An admin then links the new user to the correct `players` row in `/admin/users` (sets `players.user_id`). Until linked, the user is a generic signed-in player with no roster association.
- **Role elevation** (`scorekeeper`, `team_captain`, `admin`) is admin-only — set in `/admin/users`. There is no public request UI for elevated roles in this iteration; users ping an admin out-of-band.

**Why magic link only?** Players sign in maybe once or twice a season, so a password is overhead they'd just forget. Admin/scorekeepers sign in more often, but Supabase refresh tokens last 90 days here — once they're logged in on their phone, they stay logged in for the whole season. Adding password / OAuth was considered and deferred until a real friction point shows up.

### Roles

| Role | Default? | Description |
|---|---|---|
| `player` | yes | Any signed-up user. Can edit own profile (phone, etc.), see own linked player. No special read access to others' contact info. |
| `team_captain` | no | All-league captain. Sees email/phone for **every** linked player in the league via `/captains/contacts` and on `/players/[id]`. Per-team scoping is deferred. |
| `scorekeeper` | no | Renamed from `scorer`. Same scoring permissions as before. |
| `admin` | no | Full CRUD + manages users / roles / player links. |

### Privacy of contact info

- `user_profiles.email` and `user_profiles.phone` are **never** exposed on public pages.
- RLS on `user_profiles`: self-read, admin-read, team_captain-read. No anonymous select.
- Server-side queries that power public routes (`/players/[id]`, `/teams/[slug]`, etc.) MUST NOT select from `user_profiles`. A separate, role-gated query is used by `/captains/contacts`, `/account`, and admin pages.

### Permissions

| Capability | Admin | Scorekeeper | Team Captain | Player | Anon |
|---|---|---|---|---|---|
| Read public pages | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sign up / log in | n/a | n/a | n/a | n/a | ✅ |
| Edit own `user_profiles` row | ✅ | ✅ | ✅ | ✅ | ❌ |
| Read own `user_profiles` row | ✅ | ✅ | ✅ | ✅ | ❌ |
| Read other users' contact info (email/phone) | ✅ | ❌ | ✅ | ❌ | ❌ |
| Score a game (events, clock/score) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Roster check-in (`game_appearances`), add subs | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit a `live` game's events | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit a `final` game's events | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create/edit teams, rosters, schedule | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit content pages (rules / FAQ / league) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Grant/revoke awards | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign roles, link user ↔ player | ✅ | ❌ | ❌ | ❌ | ❌ |
| CSV import (Phase 2) | ✅ | ❌ | ❌ | ❌ | ❌ |

Enforced in Postgres via Row-Level Security policies keyed on the user's role claim.

---

## Realtime

Spectators on `/games/[id]` subscribe to a Supabase Realtime channel for that game. Scorekeeper writes events → Postgres → Realtime broadcasts → boxscore updates without refresh.

---

## Scorekeeper UX (mobile-first)

Designed for one-handed use on a phone at the rink.

- **Top bar (sticky):** clock, period, +/- clock buttons, period advance (period advances 1 → 2 → 3 → OT → shootout)
- **Pre-game roster check-in:** before scoring starts, scorekeeper sees both rosters with checkboxes. Tap each player who's playing tonight. Add subs via:
  - "Add sub" → search/pick from existing players in the league, or
  - "New sub" → type first/last name to create a new player on the fly (created with no team assignment; just a `players` row + a `game_appearances` row with `is_sub = true`)
- **Primary actions (large buttons):** GOAL · PENALTY · UNDO
- **Goal flow:** pick scoring team → tap player → optional assist 1 → optional assist 2 → confirm. Player picker shows only players checked in for that team (regulars + subs).
- **Penalty flow:** pick team committing penalty → tap offending player → pick penalty type → record shot taker → record shot result (GOAL / SAVED) → confirm
- **Undo last event** is a first-class button — beer-league scorekeepers misclick.
- **Connectivity:** scorekeeper requires an internet connection. If wifi isn't available at a rink, the admin will enter the game's stats after the fact via the admin UI.

---

## CSV import (historical data)

Format (one row per player per season):
```
season,team,player_first,player_last,jersey,position,
games_played,goals,assists,penalties,
penalty_shots_taken,penalty_shots_made,
goals_against,penalty_shots_faced,penalty_shots_saved
```

Import flow at `/admin/import`:
1. Upload CSV → preview parsed rows + validation errors
2. Match players to existing rows by name; flag ambiguous matches for manual resolution
3. Create missing seasons / teams / players as needed
4. Insert into `season_player_stats`
5. Show a diff of what was created vs updated before commit

---

## Phase 1 — Must-have (MVP)

Goal: a usable league site where games can be scored on a phone and stats roll up correctly. Living checklist — update as work ships.

### 1. Schema + seed data ✅
- [x] Supabase project (local Docker via colima)
- [x] Initial migration: seasons, teams, players, team_players, games, game_appearances, game_events, content_pages, account_requests, user_roles
- [x] Phase 2 columns added now (`players.photo_url`, `teams.logo_url`) so no migration is needed later
- [x] `season_player_stats` table (pulled forward from Phase 2 for historical stats display)
- [x] `player_awards` table (Champion / MVP / MVD / Goon / Sniper / Playmaker / Vezina / Iron Man / Most Hat Tricks)
- [x] RLS policies for all tables
- [x] Seed data: 1 current + 2 historical seasons, 4 teams, 36 players, 5 games + events, 14 historical stat rows, 9 awards

### 2. Public read-only site ✅
- [x] Layout with M.O.T.H branding (Bebas/Inter/JetBrains Mono fonts, dark scoreboard theme)
- [x] `/` landing — hero scoreboard, standings preview, upcoming, recent results
- [x] `/standings` — full table with tiebreakers (pts → wins → diff → GF)
- [x] `/teams` and `/teams/[slug]` — roster grouped Forwards / Defense / Goalies
- [x] `/schedule` — chronological game list grouped by month
- [x] `/games/[id]` — boxscore with goal/penalty event log, OT/SO support
- [x] `/players/[id]` — career table per season + ALL-TIME totals + interactive award badges
- [x] `/stats` — league leaders (points, goals, assists, penalties, goalies)
- [x] `/about` hub + `/about/{rules,faq,league}` content pages
- [x] Mobile responsive — verified at 360px (no horizontal scroll on any route)
- [x] Tap targets ≥44×44px — back links, in-row name links, stats filter controls all bumped to `min-h-11`
- [x] Lighthouse mobile audit on `/`, `/standings`, `/games/[id]` — all 100/100/100/100
- [x] No hydration errors

### 3. Open signup + roles ✅

**Wave 1 — Foundation ✅**
- [x] Migration: rename `user_role` enum value `scorer` → `scorekeeper`; add `team_captain` and `player`
- [x] Migration: add `players.user_id` (nullable FK to `auth.users`)
- [x] Migration: create `user_profiles` (user_id, email, phone, full_name, …) with RLS (self / admin / team_captain read; self / admin write)
- [x] Update existing RLS helper functions (`current_user_role`, `is_scorer_or_admin` → `is_scorekeeper_or_admin`) and any policies referencing the old `scorer` value
- [x] Trigger / handler: on first sign-in, insert `user_profiles` row and `user_roles` row with `role = 'player'`
- [x] Long-lived sessions (90-day timebox + inactivity timeout in `supabase/config.toml`)
- [x] Browser Supabase client + `proxy.ts` for cookie refresh on every request (Next 16 renamed `middleware.ts` → `proxy.ts`)
- [x] `/signup` magic-link flow (email + optional phone + full name)
- [x] `/login` magic-link flow
- [x] `/auth/callback` route — uses request `host` header for redirects (Next 16 dev normalizes `127.0.0.1`→`localhost` otherwise, stranding the cookie)
- [x] `/account` page: signed-in user edits own profile, sees role + linked player

**Wave 2 — Admin user management ✅**
- [x] Server util: `requireRole(['admin'])` for route-level gating
- [x] `/admin/layout.tsx` — admin-only gate + shared admin nav
- [x] `/admin/users`: list signed-up users, assign role (admin / scorekeeper / team_captain / player), link a user to a `players` row

> **Admin bootstrap.** Every signup gets `role = 'player'` via the `on_auth_user_created` trigger, so the very first admin has to be promoted by hand. After signing up the user who should own the league, run this against the database (locally: `psql` against `127.0.0.1:54322`; in cloud: Supabase SQL editor):
>
> ```sql
> update public.user_roles
> set role = 'admin'
> where user_id = (select id from auth.users where email = 'you@example.com');
> ```
>
> From that point forward all role changes flow through `/admin/users`.

**Wave 3 — Captain view + verification ✅**
- [x] `getSessionIfRole(['admin','team_captain'])` soft variant for pages that render publicly with extra UI for some roles
- [x] `/captains/contacts`: team_captain view of all linked players with email/phone, grouped by team
- [x] Surface contact info on `/players/[id]` ONLY when viewer is admin or team_captain
- [x] Verify: anonymous queries never return data from `user_profiles` (grep audit + live RLS test against the publishable key — confirmed `[]` for anon even with rows present)

**Wave 4 — Per-team captain tracking ✅**

Pulled forward from Phase 2. Captain reads stay league-wide (decision: captains need cross-team contact for sub-finding), but assignments are now real, queryable, historical data and become the source of truth for the `team_captain` role.

Decisions:
- One captain per team per season (`team_captains` PK = `(team_id, season_id)`)
- Captain reads of `user_profiles` remain league-wide (no per-team RLS scoping in v1)
- A row in `team_captains` IS the captain role: a trigger keeps `user_roles.role` in sync (`team_captain` while a row exists; demoted back to `player` when the last row is removed, unless the user is already `admin` or `scorekeeper`)
- Captain assignments are public-readable so `/teams/[slug]` can show "Captain: {name}" anonymously
- Captain history surfaces on `/players/[id]` ("Captained Spring 2026 — Ice Holes")

- [x] Migration `0005_team_captains.sql`:
  - `team_captains(team_id uuid, user_id uuid, season_id uuid)`, PK `(team_id, season_id)`
  - RLS: public read; admin write
  - Trigger to sync `user_roles.role` on insert/delete
- [x] Admin UI: per-team captain picker for the current season (lives as a section on `/admin/users`)
- [x] Remove manual `team_captain` from the role dropdown — trigger owns it now
- [x] `/teams/[slug]` — captain badge on the rostered player row
- [x] `/players/[id]` — captain history line under awards
- [x] Verify trigger: assigning a captain promotes the user; unassigning demotes them back to `player` (only when not admin/scorekeeper)

### 4. Admin CRUD ⬜
- [ ] Admin layout + route-level role gating (RLS already in place; needs route guards too)
- [ ] CRUD: teams (create/edit, color picker, slug)
- [ ] CRUD: players (create/edit names, jersey numbers; admin-only `user_id` link UI lives in `/admin/users`)
- [ ] CRUD: rosters (assign players to teams per season, set position)
- [ ] CRUD: schedule (create games, set status, manually enter scores)
- [ ] CRUD: content pages (markdown editor for rules / FAQ / league)
- [ ] CRUD: player awards (grant / revoke per season)
- [ ] Season management (start a new season)
- [ ] Verify: an admin can set up a real season end-to-end without SQL

### 5. Scorekeeper ⬜

Cross-cutting constraints (apply to every wave below):
- Mobile-first, one-handed UX. Verify at 360px before merge.
- Requires internet — no offline queue (per scope decision).
- Auth: `requireRole(['admin', 'scorekeeper'])` on every route in `/score/*`.
- Single URL per game (`/score/[gameId]`). The view switches based on `games.status` so refresh/bookmark/share works at any stage.

**Wave 1 — `/score` home + route stub ✅**
- [x] `/score` page lists current-season games where `status != 'final'`, grouped Live → Scheduled
- [x] Stub `/score/[gameId]` so links resolve while later waves land
- [x] Auth slot in header gains a "Score" link for `admin` and `scorekeeper`
- [ ] (Deferred) Verify at 360px width with a real signed-in scorekeeper — needs an admin account; will check when first signing in for real

**Wave 2 — Pre-game roster check-in ⬜**

Shown when `games.status = 'scheduled'`. Flips the game to `live` when started.
- [x] Migration `0006_seasons_period_length.sql` — `seasons.period_length_minutes` (default 17), seeded into `clock_seconds` on game start
- [x] Two-column roster (away / home), each player with a checkbox; defaults to checked for the season roster
- [x] "Add sub" — search existing league players, exclude already-rostered for this game, prompt for position, then add as `is_sub = true`
- [x] "New sub" — inline form (first name, last name, position; jersey # intentionally omitted in scorekeeper UX); creates a new `players` row and adds with `is_sub = true`
- [x] Validation: each team must have ≥1 goalie checked in before "Start game" can fire (client-side gate + server-side guard)
- [x] "Start game" action — server mutation: insert all checked appearances, set `games.status = 'live'`, `games.period = 1`, `games.clock_seconds = season.period_length_minutes * 60`
- [x] Edit-lineup flow at `/score/[gameId]/roster` for live games (scorekeeper/admin) and final games (admin only). Locks players who already have `game_events` so removing them can't orphan stats. Links surfaced on the `/score` listing card and on the live/final views of `/score/[gameId]`.
- [ ] Verify in browser: starting a game moves the page to the Wave 3 stub without a manual refresh

**Wave 3 — Live scoring (goals, penalties, clock, undo) ⬜**

Shown when `games.status = 'live'`.
- [ ] Sticky top bar: clock (counts down 17:00 → 0:00 per period; manual `+`/`−` buttons; no auto-tick — scorekeeper drives it), period (P1 / P2 / P3 / OT / SO), period-advance button
- [ ] Primary actions: GOAL · PENALTY · UNDO (large, thumb-sized)
- [ ] Goal flow: pick scoring team → tap scorer → optional A1 → optional A2 → confirm. Player picker shows checked-in players for that team only (regulars + subs)
- [ ] Penalty flow: pick committing team → tap offender → pick penalty type (Tripping, Hooking, Slashing, High-sticking, Interference, Holding, Roughing, Cross-checking, Other) → record shot taker → record shot result (GOAL / SAVED) → confirm. Note: `home_score`/`away_score` increment on penalty-shot goals too
- [ ] Recent events log below the action buttons, newest first; each row shows team / player / time. Tap a row to undo that event (admins can undo any; scorekeepers can only undo most recent? — confirm during build)
- [ ] UNDO removes the most recent event AND reverses any score increments it caused
- [ ] "End regulation" button — visible only at the end of P3:
  - tied → moves to OT (Wave 4)
  - decided → moves to Wave 5 finalize

**Wave 4 — Overtime + shootout ⬜**

Sub-flow when regulation ends tied.
- [ ] OT period: 5-minute sudden-death; same goal/penalty flows as Wave 3 with `period = 4`. First goal ends the game and sets `decided_in = 'ot'`
- [ ] OT timer expires without a goal → moves to shootout
- [ ] Shootout UI: tally (`shootout_home_goals`, `shootout_away_goals`) with `+`/`−` buttons per team, no individual events. Winner gets `home_score`/`away_score` + 1; `decided_in = 'shootout'`
- [ ] Shootout goals do not count toward player or goalie season stats (handled by stats queries excluding `period >= 5`)

**Wave 5 — Finalize ⬜**
- [ ] "Finalize" button visible at end of regulation (if decided), end of OT (if decided), or after shootout
- [ ] Confirmation sheet: shows final score, decided_in, shootout tallies if applicable
- [ ] Server mutation: set `games.status = 'final'`, freeze `home_score` / `away_score` / `decided_in`
- [ ] Post-finalize view (status=`final`): read-only summary with link back to `/score`. Admins (only) see an "Edit events" affordance per the existing RLS rules
- [ ] Verify: finalized game disappears from `/score` home, appears in `/standings` + `/stats` + `/games/[id]` boxscore correctly

### 6. Realtime boxscore ⬜
- [ ] `/games/[id]` subscribes to Supabase Realtime channel
- [ ] Spectator updates within ~1s of scorekeeper input

### 7. Stats ✅
- [x] Per-player season stats derived inline (skater + goalie variants)
- [x] Standings derivation (points, tiebreakers)
- [x] League leaders on `/stats`
- [x] Historical stats display (live + imported, ALL-TIME totals)

### 8. Deploy ⬜
- [ ] Vercel project (Hobby / free)
- [ ] Supabase cloud project (free tier)
- [ ] Migrate local schema + seed to cloud
- [ ] Default `*.vercel.app` subdomain
- [ ] Test from a phone over LTE

---

## Phase 2 — Nice-to-have

Goal: polish, history, and admin ergonomics. Pull these in based on what the league actually asks for after using Phase 1.

- [ ] **Photos** — Cloudflare R2 bucket, presigned-upload flow in admin UI. Columns already exist; this phase wires up upload UI and renders images, replacing placeholder tiles.
- [ ] **CSV import for historical seasons** — `/admin/import` flow that populates `season_player_stats` (table ships in Phase 1). Player profiles already union live + imported stats.
- [ ] **Season archive** — `/seasons/[id]` view of any past season's standings, stats, and games.
- [ ] **Quality-of-life admin features** — bulk schedule import, drag-to-reorder rules, player merge tool for duplicates created by the type-in-sub flow.
- [ ] **Stricter contact privacy mode** — currently captains read every linked player's email/phone (intentional, for sub-finding). If the league later wants to lock this down: add an opt-in sub list on `/account`, or per-team RLS scoping with a "broadcast a sub request" workflow. The `team_captains` join exists already, so the model supports it.
- [ ] **WhatsApp group per team** — one-click "create WhatsApp group" from the team page. Generates a `wa.me/?text=...` invite URL or a `chat.whatsapp.com` group link, pre-populated with the captain-visible phone numbers from `user_profiles`. Captain-only action. Open question: WhatsApp's Business API requires a verified business number for programmatic group creation — the lighter-weight version is generating a `https://wa.me/<number>` per-roster directory and letting the captain add members manually.
- [ ] **Awards page** — `/awards` league-wide award browser. Group `player_awards` rows by award type (Champion / MVP / MVD / Vezina / Sniper / Most Hat Tricks / Playmaker / Iron Man / Goon) and season, with per-award all-time leaderboards (most wins, current holder, full history). Sources from the existing `player_awards` table — no schema work, just the UI.
- [ ] **Sub stats accounting.** Today, when a rostered player subs for another team, their goals/assists/penalties from that night appear in the boxscore but are NOT counted in their own season totals (and are also NOT counted on the team they subbed for). Decide whether to surface these somewhere — options include: (a) a separate "as a sub" row in the player profile, (b) a league-wide "sub stats" leaderboard, (c) opt-in toggle to fold them into the player's season totals. Boxscore behavior stays as-is regardless.
- [ ] **Custom domain.**

---

## Notable decisions made along the way

- Seasons use `season_type` enum (`spring | fall | winter`) + `year`; running 3 seasons/year
- Positions: `forward | defense | goalie` (was originally just skater + goalie)
- Penalty shot result: `goal | saved` only (no missed)
- 5 forwards + 3 defense + 1 goalie per team is the seed convention
- Footer reads "Powered by the Milkman"; tagline reads "EST. PRE-COVID"
- Award types: champion, mvp, mvd, vezina, sniper, most_hat_tricks, playmaker, iron_man, goon
- Award badges are interactive: hover/click to see which seasons earned
- No SV% column for goalies — only PSF/PSV (since we only track penalty shots)
- Auth: open self-signup via **magic link only** (no password, no OAuth); default role `player`; elevated roles assigned by admin
- Session length: refresh-token TTL set to **90 days** so admin/scorekeeper effectively stay logged in across a season
- `team_captain` role is **derived** from a `team_captains(team_id, user_id, season_id)` join — assigning a row promotes the user via trigger; removing the last row demotes back to `player` (unless admin/scorekeeper)
- Captain *reads* of contact info remain league-wide (decision: captains need cross-team contact for sub-finding); per-team RLS scoping is deferred to a Phase 2 "stricter privacy mode" if the league wants it
- User ↔ player mapping lives on `players.user_id` and is set by an admin (not self-claimed)
- `account_requests` is legacy — kept in the schema but unused by the new signup flow

---

## Open items / decisions to revisit

- **Multi-role users.** `user_roles.role` is currently a single enum, so a user can't be both an admin and a scorekeeper. Plan to make this many-to-many is captured in `MULTI-ROLE.md` — defer until after the scorekeeper UI ships.
- **Penalty types:** Tripping, Hooking, Slashing, High-sticking, Interference, Holding, Roughing, Cross-checking, Other. "Other" enables a free-text field for the scorer to describe.
- **Roster size cap:** 8 skaters + 1 goalie per team. The admin UI will warn (not block) if exceeded — beer leagues sometimes carry a couple of extras for injury coverage.
- **Initial data load:** current season's schedule and rosters live in another system. Plan: do a one-time copy/import during launch prep (manual or scripted scrape, depending on the source). Not blocking schema design.
- **Rulebook content:** no existing rulebook. The admin will author rules / FAQ / league details inside the new admin UI after launch. Phase 1 ships with empty `content_pages` rows or stub placeholders.
- **Photos** — deferred to Phase 2. Will be stored in **Cloudflare R2** (10GB free, zero egress fees). Postgres only stores the public URL in `players.photo_url` / `teams.logo_url`. Upload flow: admin UI → presigned R2 upload URL → store returned URL on the row. Decide whether photos are required or optional per player/team.
- **Phone field at signup:** required, optional, or collected later in `/account`? Current default: optional.
- **Self-claim of player row:** should a signed-up user be able to propose "I am player X" for admin approval, instead of admins linking blind? Deferred — admins do all linking in v1.
- **`account_requests` table:** keep, repurpose for role-elevation requests, or drop in a future migration? Currently kept and unused.
