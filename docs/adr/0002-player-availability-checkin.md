# ADR 0002 — Player Availability Check-in

Records the plan for a player-facing pre-game "in/out" check-in — the dependency that
[ADR 0001](./0001-game-preview-matchup-analyzer.md) needs to show *real* projected rosters.

Last updated: 2026-06-23

---

## Status

**Proposed (deferred).** Not blocking [ADR 0001](./0001-game-preview-matchup-analyzer.md):
the preview panel ships first showing the season roster, then upgrades when this lands. This
ADR carries unresolved product/RLS decisions (O5/O6) that must be settled before implementation.

---

## Context

[Issue #19](https://github.com/dmorand17/moth-hockey/issues/19) assumes an "in/out check-in
tool" for projected rosters. It does not exist. `components/RosterCheckIn.tsx` is a
*scorekeeper-only* tool that records who actually played (`game_appearances`) at game start —
not a player-facing declaration of availability *before* game day.

There is no table, route, component, or RLS for players to declare availability. The `player`
role exists, and `players.user_id` (added in `0004_auth_roles.sql`) links a player identity to
`auth.users`, which makes a self-service write policy possible.

---

## Decision

Add a minimal availability table and a player-facing CTA on the upcoming-game page. Following
the repo's enum-isolation convention (see [DATABASE.md](../DATABASE.md) — enum values must be
added in a migration separate from their first use):

```sql
-- 0008_availability_status_enum.sql
create type game_availability_status as enum ('in', 'out', 'maybe');

-- 0009_game_player_availability.sql
create table game_player_availability (
  game_id    uuid not null references games(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  status     game_availability_status not null default 'in',
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
create index game_player_availability_game_idx on game_player_availability (game_id);
```

**Player-facing surface:** an inline CTA on `app/games/[id]/page.tsx` for upcoming games, shown
to a logged-in player whose `players.user_id = auth.uid()` — *"Are you in? [In] [Out] [Maybe]"*.
A server action (`app/games/[id]/availability/actions.ts`) upserts on `(game_id, player_id)`.
No separate page needed initially.

**Read path:** `ProjectedRoster` in [ADR 0001](./0001-game-preview-matchup-analyzer.md) upgrades
from "season roster" to confirmed **in** / **out** (notable absences) / **maybe**, with
non-responders shown plain.

---

## Consequences

### What this enables

- The preview's projected-roster section reflects real declared availability.
- A foundation for captain/admin lineup planning.

### What this defers / constrains

- Adds the project's first player-write RLS policy — needs care (O5).
- Requires the player to have a linked `players.user_id`; unlinked players can't self-check-in.

---

## Open decisions

- [ ] **O5 — who can read availability?** Only the player + captains + admin, the whole team,
  or fully public (so the anonymous preview can show it)? *Most sensitive RLS decision.*
- [ ] **O6 — write window.** Can a player change status after `games.scheduled_at` / after the
  game goes `live`? Should the policy enforce `scheduled_at > now()`?
- [ ] **Default state.** What does `ProjectedRoster` show when *no one* has checked in?
- [ ] **Captain/admin override.** May a captain set availability on a player's behalf?
