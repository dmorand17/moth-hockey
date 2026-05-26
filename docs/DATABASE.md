# Database

Schema reference built from `supabase/migrations/0001`–`0006`. The conceptual
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

Enum changes are isolated in `0003` on purpose: Postgres won't let a new enum
value be used in the same transaction that adds it.

## Enums

| Enum | Values |
| --- | --- |
| `season_type` | `spring`, `fall`, `winter` |
| `player_position` | `forward`, `defense`, `goalie` |
| `game_status` | `scheduled`, `live`, `final` |
| `game_decided_in` | `regulation`, `ot`, `shootout` |
| `game_kind` | `regular`, `playoff` |
| `game_event_type` | `goal`, `penalty` |
| `penalty_shot_result` | `goal`, `saved` |
| `content_section` | `rules`, `faq`, `league` |
| `account_request_status` | `pending`, `approved`, `denied` |
| `user_role` | `admin`, `scorekeeper`, `team_captain`, `player` |

## Tables

### Core

- **`seasons`** — `season_type`+`year` unique; `is_current` (partial unique index
  enforces at most one current); `period_length_minutes` (default 17).
- **`teams`** — per-season (`season_id`); `slug` + `name` unique within a season;
  `color`, `logo_url`.
- **`players`** — league-wide identity (`first_name`, `last_name`, `photo_url`);
  `user_id` nullable FK to `auth.users` (admin-set link; unique when present).
- **`team_players`** — roster membership PK `(team_id, player_id)`;
  `season_id`, `jersey_number`, `position`.

### Games & events

- **`games`** — `home_team_id`/`away_team_id` (must differ), `status`, `kind`,
  `home_score`/`away_score`, `period`, `clock_seconds` (default 1020 = 17:00),
  `decided_in` (null until final), `shootout_home_goals`/`shootout_away_goals`.
- **`game_appearances`** — one row per player who played; PK `(game_id, player_id)`;
  `is_sub`. Games-played is `COUNT(*)` over this.
- **`game_events`** — `type` (`goal`|`penalty`), `period`, `clock_seconds`,
  scorer/assists or penalty fields. A CHECK constraint enforces shape per type
  (goals have a `player_id`, no penalty fields; penalties require
  `penalty_type` + `penalty_shot_result` + `penalty_shot_taker_id` and no assists).

### Stats, awards, content

- **`season_player_stats`** — pre-aggregated totals for historical seasons with no
  underlying events (CSV import target). PK `(season_id, player_id)`. Live seasons
  derive stats from `game_events` instead; the player profile unions both.
- **`player_awards`** — repeatable per player/season (`award_type` text).
- **`content_pages`** — `section`+`slug` unique; markdown `body_md`; powers `/about/*`.

### Auth

- **`user_roles`** — PK `user_id`; single `role`. RLS keys off this. (Multi-role
  is planned — see [`initial-build/MULTI-ROLE.md`](./initial-build/MULTI-ROLE.md).)
- **`user_profiles`** — private contact info (`email`, `phone`, `full_name`).
  **Never** exposed on public pages (RLS below).
- **`team_captains`** — PK `(team_id, season_id)`; unique `(user_id, season_id)`.
  A row *is* the captain role (synced via trigger). Public-readable.
- **`account_requests`** — **legacy** (pre-open-signup). Kept but unused by the
  current flow.

## Helper functions (RLS)

All `security definer`, `search_path = public`, keyed on `auth.uid()`:

- `is_admin()` — role is `admin`.
- `is_scorekeeper_or_admin()` — role in (`scorekeeper`, `admin`).
- `is_team_captain_or_admin()` — role in (`team_captain`, `admin`).
- `current_user_role()` — returns the single role. Legacy from `0001`, still
  present; slated for removal under the multi-role plan.

(`is_scorer_or_admin()` from `0001` was dropped in `0004`.)

## Triggers

- **`on_auth_user_created`** (`auth.users` after insert → `handle_new_auth_user`) —
  inserts a `user_profiles` row (email/phone/full_name from `raw_user_meta_data`)
  and a `user_roles` row defaulting to `player`. Both `on conflict do nothing`.
- **`team_captains_sync_assign` / `_unassign`** — inserting a captain row promotes
  a `player`→`team_captain`; removing the user's last row demotes
  `team_captain`→`player`. Never downgrades `admin`/`scorekeeper`.
- **`*_touch_updated_at`** — keep `updated_at` fresh on `games`, `content_pages`,
  `user_profiles`.

## Row-Level Security (summary)

| Table(s) | Read | Write |
| --- | --- | --- |
| seasons, teams, players, team_players, games, game_appearances, game_events, content_pages, season_player_stats, player_awards | public | admin (all) |
| games / game_appearances / game_events (live) | public read | **scorekeeper** may manage while `status = 'live'`; admin any time |
| players (insert) | — | scorekeeper/admin (on-the-fly subs) |
| `user_roles` | own row, or admin | admin |
| `user_profiles` | self, admin, **team_captain** | self (own), admin |
| `team_captains` | public | admin |
| `account_requests` | admin | anyone may INSERT; admin update |

Anonymous queries never return `user_profiles` rows — no public select policy
exists on that table.
