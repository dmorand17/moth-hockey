# Game Box Scores — Design

**Date:** 2026-10-07
**Status:** Approved 2026-10-07.
**Issue:** #122

## Problem

A finished game's page shows the score, availability and a play-by-play, but no per-player stat lines. And because players often don't mark themselves in or out, many played games have incomplete availability even though the scorekeeper recorded exactly who played at check-in.

## Goal

1. A **box score** on live and final games: every player who played, subs included, with their stat line.
2. **Availability locked in at puck drop:** starting a game writes the scorekeeper's check-in back to availability, so every game started from now on has complete in/out data.
3. **Collapsible sections** in the order Box score → Availability → Play-by-play.

## Out of scope

- Backfilling availability for games already played. The user chose going forward only.
- Shots and saves, which aren't tracked.
- Remembering which sections a viewer collapsed.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Box score source | `game_appearances` (the scorekeeper's check-in) + `game_events` | It's the record of who actually played, written at every Start Game. |
| Stat columns | Skaters: G · A · PTS · PEN · PS · PSG. Goalies: GA · PSF · PSV + result | Same definitions as `/stats` and the player game log. |
| Availability write-back | At `startGame` and `updateRoster`: rostered players in the lineup → `in`, not in it → `out` | The check-in is what actually happened, so it overrides earlier self-reports in both directions. |
| Backfill | None | User decision. |
| Collapsing | Native `<details>`/`<summary>` | Works without JavaScript and is accessible; no saved state. |
| Default open | Live/final: Box score + Play-by-play open, Availability collapsed. Scheduled: Availability open | The stats matter after puck drop; the roster matters before. |

## Box score

A pure function, `buildBoxScore`, in `lib/box-score.ts`, tested with `bun test`:

- **Input:** the lineup (one entry per appearance: player id, name, jersey, team id, position, `isSub`), the game's goal and penalty events, the two team ids, and, for final games, each team's result.
- **Per-player rules** (matching `app/players/[id]/page.tsx`):
  - G = goals with this `player_id`; A = goals where this player is `assist1`/`assist2`; PTS = G + A.
  - PEN = penalty events with this `player_id` (the offender).
  - PS = penalty events with this `penalty_shot_taker_id`; PSG = those with `penalty_shot_result = 'goal'`.
  - **Goalies:** GA = opposing goals + opposing made penalty shots; PSF = penalty events committed by the goalie's own team (a shot taken against them); PSV = those with `penalty_shot_result = 'saved'`.
- **Position:** `team_players.position` for that season; a `game_subs` row's position overrides it; otherwise `forward`.
- **Output per team:** skater rows sorted by PTS desc, then G desc, then name; goalie rows; and a totals row.
- **Result** for goalies on final games: W if the team scored more, otherwise OTL when `decided_in` is `ot`/`shootout`, otherwise L. Live games show no result.
- **No lineup recorded** (older imported games): the section shows "No lineup recorded for this game."

## Availability write-back

`syncAvailabilityFromLineup` in `lib/lineup-availability.ts` (server-only). It upserts one `game_availability` row per rostered player on both teams for the game's season, on conflict `(game_id, player_id)`: `in` if the player is in the lineup, otherwise `out`. Subs aren't rostered, so they get no availability row. They appear only in the box score.

- Called at the end of a successful `startGame` and a successful `updateRoster`.
- **Non-blocking:** a failure is logged (`[lineup-availability]`) and doesn't fail the start or the lineup edit. Puck drop must not depend on it.
- The pure part, `availabilityFromLineup(rosterPlayerIds, lineupPlayerIds)`, is tested.

### RLS — migration `0024_scorekeeper_availability.sql`

Scorekeepers can't write `game_availability` today (only players for themselves, captains and admins can). Add:

```sql
create policy "scorekeepers sync availability on scheduled or live games" on game_availability for all
  using (public.is_scorekeeper_or_admin() and exists (
    select 1 from games g where g.id = game_availability.game_id and g.status in ('scheduled', 'live')))
  with check (public.is_scorekeeper_or_admin() and exists (
    select 1 from games g where g.id = game_availability.game_id and g.status in ('scheduled', 'live')));
```

This matches the scope of the scorekeepers' lineup permission (`0021`). Admins already have full access through `admin manages all availability`.

## Layout

`components/CollapsibleSection.tsx`: a `<details>` wrapping `SectionHeader` in its `<summary>`, with a chevron that rotates when the section is open.

- **Live/final:** scoreboard → write-up → **Box score** (open) → **Availability** (collapsed) → **Play-by-play** (open).
- **Scheduled:** scoreboard → write-up → **Availability** (open) → Matchup → Play-by-play (open).
- The box score shows the two teams side by side on desktop and stacked on mobile.

## Verification

- `bun test` for `buildBoxScore` (skater lines, goalie GA including penalty shots, PSF/PSV, sort order, totals, result, sub flag, position override) and `availabilityFromLineup`.
- Local stack: start a game as `scorekeeper@moth.test` with one player unchecked who had marked themselves `in`, and one checked who had marked `out`. Confirm availability flips both ways and is complete for both rosters. Score a goal, an assist and a made penalty shot, finalize, and confirm every box-score line by hand against `game_events`.
- RLS: as the scorekeeper, availability writes are allowed on a scheduled/live game and denied on a final one.
- `tsc`, lint and build clean. Screenshots of the collapsed/expanded states at 390px and desktop.
