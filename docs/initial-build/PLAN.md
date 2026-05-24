# M.O.T.H Hockey — Build Plan

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

players          (id, first_name, last_name, photo_url)
                  -- player identity persists across seasons

team_players     (team_id, player_id, season_id, jersey_number, position)
                  -- position: forward | defense | goalie
                  -- a player can be on different teams in different seasons

user_roles       (user_id, role)
                  -- role: admin | scorer
                  -- maps Supabase auth users to app roles for RLS policies

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
                  -- approved requests trigger a magic-link invite with a role

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
- **Games played** is derived from `game_appearances` — a player gets a GP whether they're a regular or a sub. Subs accumulate stats and GP under whichever team they played for that night.
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
/admin/users                   review account requests, manage roles
/admin/import                  CSV upload for historical season stats
/request-access                public form to request an account
```

---

## Auth (Supabase Auth)

- Anonymous read for all public pages.
- Magic-link login for **scorekeepers** (role: `scorer`) and **admins** (role: `admin`).
- **Account request flow:** users tap "Request access" → submit email + name + reason → row written to an `account_requests` table with status `pending`. Admin sees pending requests in `/admin/users`, approves with a role (`scorer` or `admin`), which sends the magic-link invite. Denied requests are marked `denied` and ignored. No public signup.

### Permissions

| Capability | Admin | Scorer | Anonymous |
|---|---|---|---|
| Read public pages (teams, schedule, standings, About, boxscores) | ✅ | ✅ | ✅ |
| Score a game (insert `game_events`, update `games` clock/score) | ✅ | ✅ | ❌ |
| Manage game roster check-in (`game_appearances`) | ✅ | ✅ | ❌ |
| Add a sub (existing or type-in new player) during check-in | ✅ | ✅ | ❌ |
| Edit a `live` game's events | ✅ | ✅ | ❌ |
| Edit a `final` game's events | ✅ | ❌ | ❌ |
| Create / edit teams | ✅ | ❌ | ❌ |
| Edit rosters (`team_players`) | ✅ | ❌ | ❌ |
| Create / edit schedule (games) | ✅ | ❌ | ❌ |
| Edit content pages (rules / FAQ / league details) | ✅ | ❌ | ❌ |
| Grant / revoke player awards | ✅ | ❌ | ❌ |
| Approve/deny account requests, assign roles | ✅ | ❌ | ❌ |
| CSV import (Phase 2) | ✅ | ❌ | ❌ |

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

Goal: a usable league site where games can be scored on a phone and stats roll up correctly. Everything below is required to ship.

1. **Schema + seed data** — Supabase project, migrations for the must-have tables. Includes `players.photo_url` and `teams.logo_url` columns now (nullable, unused in Phase 1 UI) so Phase 2 doesn't need a migration. `season_player_stats` and `player_awards` are also in this phase so historical stats and awards work on day one. Mock season with 4 teams / ~60 players / a handful of games. *Verify:* roster + fake boxscore queries work in SQL editor.
2. **Public read-only site** — teams, rosters, schedule, standings, league leaders (`/stats`), About hub (rules / FAQ / league details), boxscore pages, player profiles with award badges and historical stats. **Mobile-first** — designed at 360–390px width; desktop is progressive enhancement. No photos — use initials/team color tiles as placeholders. *Verify:* every page renders well at 360px (no horizontal scroll, tap targets ≥44px); Lighthouse mobile score >90.
3. **Admin CRUD** — auth + pages to manage teams, players, rosters, schedule, content pages (rules / FAQ / league details), and player awards. *Verify:* can set up a real season end-to-end without touching SQL.
4. **Scorekeeper** — pre-game roster check-in (regulars + subs, including type-in for new players), goal flow, penalty/penalty-shot flow, OT, shootout tally, undo. Mobile-first. *Verify:* score a fake game on a phone; final score and stats are correct.
5. **Realtime boxscore** — `/games/[id]` updates live as the scorekeeper enters events. *Verify:* second device sees updates within ~1s.
6. **Stats** — derived views for player season stats and team standings. *Verify:* numbers match a hand-tallied test game including OT and a shootout.
7. **Deploy** — Vercel + Supabase on free tiers, default `*.vercel.app` subdomain. *Verify:* league can use it for a real game.

## Phase 2 — Nice-to-have

Goal: polish, history, and admin ergonomics. Pull these in based on what the league actually asks for after using Phase 1.

1. **Photos** — Cloudflare R2 bucket, presigned-upload flow in admin UI. Columns already exist from Phase 1; this phase wires up the upload UI and renders the images, replacing placeholder tiles.
2. **CSV import for historical seasons** — `/admin/import` flow that populates the `season_player_stats` table (table itself ships in Phase 1). Player profiles already union live + imported stats. *Verify:* import last season's data; spot-check 5 players.
3. **Season archive** — `/seasons/[id]` view of any past season's standings, stats, and games.
4. **Quality-of-life admin features** — bulk schedule import, drag-to-reorder rules, player merge tool for duplicates created by the type-in-sub flow.

---

## Open items / decisions to revisit

- **Penalty types:** Tripping, Hooking, Slashing, High-sticking, Interference, Holding, Roughing, Cross-checking, Other. "Other" enables a free-text field for the scorer to describe.
- **Roster size cap:** 8 skaters + 1 goalie per team. The admin UI will warn (not block) if exceeded — beer leagues sometimes carry a couple of extras for injury coverage.
- **Initial data load:** current season's schedule and rosters live in another system. Plan: do a one-time copy/import during launch prep (manual or scripted scrape, depending on the source). Not blocking schema design.
- **Rulebook content:** no existing rulebook. The admin will author rules / FAQ / league details inside the new admin UI after launch. Phase 1 ships with empty `content_pages` rows or stub placeholders.
- **Photos** — deferred to Phase 2. Will be stored in **Cloudflare R2** (10GB free, zero egress fees). Postgres only stores the public URL in `players.photo_url` / `teams.logo_url`. Upload flow: admin UI → presigned R2 upload URL → store returned URL on the row. Decide whether photos are required or optional per player/team.
