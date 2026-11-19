# Database

Schema reference built from `supabase/migrations/0001`–`0028`. The conceptual
model and rationale live in [`initial-build/PLAN.md`](./initial-build/PLAN.md);
this doc reflects what the migrations actually create.

## Migrations

| File | What it does |
| --- | --- |
| `0001_initial_schema.sql` | Enums, all core tables, RLS, helper fns, `updated_at` triggers |
| `0002_add_game_kind.sql` | `game_kind` enum + `games.kind` (regular / playoff) |
| `0003_user_role_enum.sql` | Rename `scorer`→`scorekeeper`; add `team_captain`, `player` |
| `0004_auth_roles.sql` | `players.user_id`, `user_profiles`, new role helpers, signup trigger |
| `0005_team_captains.sql` | `team_captains` + role-sync triggers |
| `0006_seasons_period_length.sql` | `seasons.period_length_minutes` (default 17) |
| `0007_games_playoffs.sql` | `playoff_round` enum + `games.playoff_round`; nullable team ids for playoff stubs; one game per round per season |
| `0008_seasons_end_date_optional.sql` | `seasons.end_date` nullable |
| `0009_game_availability.sql` | `availability_status` enum + `game_availability` (player in/out per game) |
| `0010_roster_captain.sql` | `team_players.is_captain`; `reconcile_team_captain()` + captain-sync triggers derive `team_captains` |
| `0011_team_players_unique_season.sql` | Unique `(player_id, season_id)` on `team_players` (one team per season) |
| `0012_schedule_skips.sql` | `schedule_skips` (skipped weeks shown on the schedule) |
| `0013_season_type_summer.sql` | Add `summer` to `season_type` |
| `0014_season_scoring.sql` | `seasons.point_system` (`2-1-0`/`3-2-1`) + `tiebreakers` |
| `0015_playoff_quarterfinals.sql` | Add `qf1`–`qf4` to `playoff_round` (top-8 bracket) |
| `0016_season_regular_weeks.sql` | `seasons.regular_weeks` (backfilled from start/end) |
| `0017_season_default_location.sql` | `seasons.default_location` |
| `0018_fix_captain_sync_search_path.sql` | Captain-sync trigger fns become `security definer` with pinned `search_path` (fixes auth-user delete) |
| `0019_admin_user_last_sign_in.sql` | `admin_user_last_sign_in()` for the admin Users view |
| `0020_availability_admin_captain_rls.sql` | `game_availability` RLS for admins and team captains |
| `0021_scorekeeper_start_game.sql` | Scorekeepers may write appearances on scheduled games and flip `scheduled → live` |
| `0022_game_subs.sql` | `game_subs`, `add_new_game_sub()`; captain availability policy tied to the game's season |
| `0023_game_write_ups.sql` | `write_up_kind` enum + `game_write_ups` (AI previews/recaps) |
| `0024_scorekeeper_availability.sql` | Scorekeepers may write `game_availability` on scheduled/live games |
| `0025_game_appearance_position.sql` | `game_appearances.position` (nullable) |
| `0026_write_up_input.sql` | `game_write_ups.input` (jsonb sent to the model) |
| `0027_posts.sql` | Message board: `posts`, `is_linked_player()`, threading, rate-limit and column-immutability triggers (#140) |
| `0028_season_finalize.sql` | `seasons.finalized_at`; goalie `wins`/`losses`/`ot_losses` on `season_player_stats` |
| `0029_season_recaps.sql` | `season_recaps` (published AI season summary) and admin-only `season_recap_drafts` |
| `0030_season_media.sql` | `season_media` — recap photo/video/PDF gallery (files in Vercel Blob) |

Enum changes are isolated in `0003` on purpose: Postgres won't let a new enum
value be used in the same transaction that adds it.

## Enums

| Enum | Values |
| --- | --- |
| `season_type` | `spring`, `summer`, `fall`, `winter` |
| `player_position` | `forward`, `defense`, `goalie` |
| `game_status` | `scheduled`, `live`, `final` |
| `game_decided_in` | `regulation`, `ot`, `shootout` |
| `game_kind` | `regular`, `playoff` |
| `playoff_round` | `qf1`, `qf2`, `qf3`, `qf4`, `sf1`, `sf2`, `final` |
| `availability_status` | `in`, `out` |
| `write_up_kind` | `preview`, `recap` |
| `game_event_type` | `goal`, `penalty` |
| `penalty_shot_result` | `goal`, `saved` |
| `content_section` | `rules`, `faq`, `league` |
| `account_request_status` | `pending`, `approved`, `denied` |
| `user_role` | `admin`, `scorekeeper`, `team_captain`, `player` |

## Tables

### Core

- **`seasons`** — `season_type`+`year` unique; `is_current` (partial unique index
  enforces at most one current); `end_date` (nullable); `period_length_minutes`
  (default 17); `point_system` (`'2-1-0'` | `'3-2-1'`, default `3-2-1`);
  `tiebreakers` (`text[]`, default `{wins,diff,gf}`); `regular_weeks`;
  `default_location`; `finalized_at` (set by the admin Finalize action, cleared
  by Reset).
- **`teams`** — per-season (`season_id`); `slug` + `name` unique within a season;
  `color`, `logo_url`. **League convention:** teams are named by **color**
  (Red, Blue, White, Black) and the same colors recur every season, but each
  season is a distinct `teams` row with its own roster — players are redrafted
  year to year, so a color team's lineup changes between seasons. Because
  `players` are league-wide and `team_players` is per-season, the same player can
  appear on different color teams in different seasons.
- **`players`** — league-wide identity (`first_name`, `last_name`, `photo_url`);
  `user_id` nullable FK to `auth.users` (admin-set link; unique when present).
- **`team_players`** — roster membership PK `(team_id, player_id)`;
  `season_id`, `jersey_number`, `position`, `is_captain` (captain label; no
  account needed). Unique `(player_id, season_id)` — one team per player per season.
- **`schedule_skips`** (`0012`) — weeks skipped mid-season: `season_id`,
  `skip_date`, `reason`; unique `(season_id, skip_date)`. Shown on the schedule.

### Games & events

- **`games`** — `home_team_id`/`away_team_id` (must differ; nullable only for
  playoff stubs awaiting bracket seeding), `status`, `kind`, `playoff_round`
  (at most one game per round per season),
  `home_score`/`away_score`, `period`, `clock_seconds` (default 1020 = 17:00),
  `decided_in` (null until final), `shootout_home_goals`/`shootout_away_goals`.
- **`game_appearances`** — one row per player who played; PK `(game_id, player_id)`;
  `is_sub`; `position` (`player_position`, nullable — added in `0025`; null on pre-`0025`
  rows). Callers resolve final position via `resolvePosition` (appearance → `game_subs`
  → `team_players` → `"forward"`). Games-played is `COUNT(*)` over this.
- **`game_availability`** (`0009`) — pre-game check-in: `game_id`, `player_id`,
  `status` (`in`|`out`), `updated_at`. PK `(game_id, player_id)`; no row = no
  response. `startGame`/`updateRoster` write the scorekeeper's check-in back here.
- **`game_subs`** (`0022`) — subs lined up *before* a game by a captain or admin:
  `game_id`, `team_id`, `player_id`, `position`, `added_by`. PK `(game_id, player_id)`.
  The scorekeeper's check-in starts with these pre-checked; `startGame` turns them
  into `is_sub` appearances.
- **`game_write_ups`** (`0023`, `0026`) — AI-written `preview` / `recap` per game: `headline`,
  `body`, `model`, `generated_at`, `edited_at`/`edited_by`, `hidden`. PK `(game_id, kind)`.
  `input` (jsonb, since `0026`) stores the exact JSON object passed to the model;
  null for rows written before that migration. Written by the server with the service
  role (daily cron + after finalize); never overwritten by re-runs.
- **`game_events`** — `type` (`goal`|`penalty`), `period`, `clock_seconds`,
  scorer/assists or penalty fields. A CHECK constraint enforces shape per type
  (goals have a `player_id`, no penalty fields; penalties require
  `penalty_type` + `penalty_shot_result` + `penalty_shot_taker_id` and no assists).

### Stats, awards, content

- **`season_player_stats`** — saved per-season totals: CSV imports for old seasons,
  and regular-season rollups written by **Finalize season**
  (`/admin/seasons/[id]/finalize`, logic in `lib/season-finalize.ts`). PK
  `(season_id, player_id)`. Past-season pages and `/stats/all-time` read this
  table; the current season derives stats from `game_events` until finalized.
  Goalie `wins`/`losses`/`ot_losses` are null for imported seasons.
- **`player_awards`** — repeatable per player/season (`award_type` text). Finalize
  replaces the season's `champion`, `mvp`, `mvd`, `vezina`, `sniper`, `playmaker`
  and `goon` rows; other types (e.g. imported `most_hat_tricks`) are left alone.
- **`content_pages`** — `section`+`slug` unique; markdown `body_md`; powers `/about/*`.
- **`posts`** — message board (#140). `game_id` null = site board, otherwise a
  game's discussion; `parent_id` null = top-level, otherwise a reply (one level
  only). `body` 1–2000 chars after trim; `edited_at` set on body change. Only
  `body` is updatable (enforced by `posts_before_update`).
- **`season_recaps`** — the published AI season summary on `/seasons/[slug]/recap`,
  one per season (PK `season_id`). `summary_markdown`, `input` (the exact facts
  JSON sent to the model), `model`, `generated_at`, `edited_by`/`edited_at`,
  `published` (Unpublish sets false) and `published_at`.
- **`season_recap_drafts`** — the admin working copy (same shape, `draft_markdown`).
  Generate / Regenerate / Edit write here; Publish copies the draft into
  `season_recaps` and deletes it. A separate table because RLS can't hide one
  column of a public row.
- **`season_media`** — the recap gallery. The file lives in Vercel Blob
  (`blob_url`, unique `pathname` under `seasons/{slug}/`, or `dev/seasons/{slug}/`
  outside production); the row holds `content_type`, `size_bytes`, optional
  `width`/`height`, `caption` (≤ 300 chars), `uploaded_by` and `sort_order`.

### Auth

- **`user_roles`** — PK `user_id`; single `role`. RLS keys off this. (Multi-role
  is planned — see [`initial-build/MULTI-ROLE.md`](./initial-build/MULTI-ROLE.md).)
- **`user_profiles`** — private contact info (`email`, `phone`, `full_name`).
  **Never** exposed on public pages (RLS below).
- **`team_captains`** — PK `(team_id, season_id)`; unique `(user_id, season_id)`.
  A row *is* the captain role (synced via trigger). Since `0010` it is derived
  from `team_players.is_captain` by `reconcile_team_captain()`: a row exists only
  when the captain's player has a linked account. Public-readable.
- **`account_requests`** — **legacy** (pre-open-signup). Kept but unused by the
  current flow.

## Helper functions (RLS)

All `security definer`, `search_path = public`, keyed on `auth.uid()`:

- `is_admin()` — role is `admin`.
- `is_scorekeeper_or_admin()` — role in (`scorekeeper`, `admin`).
- `is_team_captain_or_admin()` — role in (`team_captain`, `admin`).
- `add_new_game_sub(game_id, team_id, first, last, position)` (`0022`) — creates
  a player and its `game_subs` row atomically, after checking the caller is an
  admin or that team's captain for the game's season and the game is scheduled.
  Lets captains add brand-new subs without INSERT rights on `players`.
- `current_user_role()` — returns the single role. Legacy from `0001`, still
  present; slated for removal under the multi-role plan.
- `is_linked_player()` (`0027`) — a `players` row exists with `user_id = auth.uid()`. Gates posting.
- `reconcile_team_captain(team, season)` (`0010`) — rebuilds that team/season's
  `team_captains` row from the `is_captain` roster row (only if the player has a
  linked account).
- `admin_user_last_sign_in()` (`0019`) — returns `auth.users.last_sign_in_at`
  per user; raises unless `is_admin()`.

(`is_scorer_or_admin()` from `0001` was dropped in `0004`.)

## Triggers

- **`on_auth_user_created`** (`auth.users` after insert → `handle_new_auth_user`) —
  inserts a `user_profiles` row (email/phone/full_name from `raw_user_meta_data`)
  and a `user_roles` row defaulting to `player`. Both `on conflict do nothing`.
- **`team_captains_sync_assign` / `_unassign`** — inserting a captain row promotes
  a `player`→`team_captain`; removing the user's last row demotes
  `team_captain`→`player`. Never downgrades `admin`/`scorekeeper`.
- **`team_players_captain_sync`** (`team_players` after insert/update/delete) and
  **`players_userid_captain_sync`** (`players` after update of `user_id`) — call
  `reconcile_team_captain()` so captain labels and account links keep
  `team_captains` in step. Both `security definer` since `0018`.
- **`*_touch_updated_at`** — keep `updated_at` fresh on `games`, `content_pages`,
  `user_profiles`.
- **`posts_before_insert`** — takes a per-author `pg_advisory_xact_lock` to
  serialize concurrent inserts; server-sets `created_at = now()` and
  `edited_at = null` (clients cannot back-date or pre-mark edited); normalizes
  `body` with `btrim(body, E' \t\r\n')` before the check constraint is
  evaluated; rejects replies whose parent is itself a reply or belongs to a
  different game (`posts_invalid_parent`); enforces the rate limit: 5
  posts/minute and 50 per 24 hours per author (`posts_rate_limited`).
- **`posts_before_update`** — rejects changes to `id`, `author_id`, `game_id`,
  `parent_id`, `created_at` (`posts_immutable_column`); normalizes `body` with
  `btrim` before comparing; sets `edited_at` when `body` changes and otherwise
  keeps it unchanged. (A column grant would not work locally: `seed.sql`
  re-grants all table privileges.)

## Row-Level Security (summary)

| Table(s) | Read | Write |
| --- | --- | --- |
| seasons, teams, players, team_players, games, game_appearances, game_events, content_pages, season_player_stats, player_awards | public | admin (all) |
| games / game_appearances / game_events (live) | public read | **scorekeeper** may manage while `status = 'live'`; admin any time. Since `0021`, scorekeepers may also write appearances on scheduled games and move a game `scheduled → live` (needed by `startGame`) |
| players (insert) | — | scorekeeper/admin (on-the-fly subs) |
| `user_roles` | own row, or admin | admin |
| `user_profiles` | self, admin, **team_captain** | self (own), admin |
| `team_captains` | public | admin |
| `game_subs` | public | admin; **team_captain** for their own team, that season, while the game is scheduled |
| `game_availability` (`0009`; policies `0020`, `0022`, `0024`) | public | player (own row), captain (own team, that season), admin; **scorekeeper** while the game is scheduled or live — `startGame`/`updateRoster` write the check-in back as in/out |
| `schedule_skips` | public | admin |
| `game_write_ups` | public when not `hidden`; admins see all | admin (service role writes generated rows) |
| `account_requests` | admin | anyone may INSERT; admin update |
| `season_recaps` | public when `published`; admins see all | admin |
| `season_recap_drafts` | admin only | admin |
| `season_media` | public | admin |
| `posts` | public | insert: linked player as self; update (body only, via trigger): author or admin; delete: admin (replies cascade) |

Anonymous queries never return `user_profiles` rows — no public select policy
exists on that table.
