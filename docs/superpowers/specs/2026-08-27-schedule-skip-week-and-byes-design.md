# Schedule: skip-a-week + bye display

**Date:** 2026-08-27
**Status:** Approved design

## Context

The season scheduler (`/admin/seasons` → generate) lays out a round-robin into
weekly game nights. Two gaps:

1. **Mid-season disruptions.** Weather (etc.) can cancel a game night. Admins
   need to skip that week, record why, and push all later games out by a week.
2. **Bye weeks are invisible.** With an odd number of teams, one team sits out
   each week. The generator drops those bye pairings, so the schedule never
   shows who is on bye.

A related change already landed on this branch: the schedule generator's
**"Rounds"** input was renamed to **"Weeks"** and now produces exactly
`weeks × slots-per-night` games (via `roundRobinGames`), so "12 weeks" means 12
game nights. This spec covers the two remaining features.

## Goals

- Admin can skip a week with a reason; all later **scheduled** games shift +7 days.
- The skip (date + reason) is recorded and shown on the **public** schedule.
- Bye teams are shown on the schedule (public + admin), derived from the games.

## Non-goals

- Un-shifting / undo of a skip's date changes (deleting a skip removes only the
  note). Reversing shifts is ambiguous and out of scope.
- Skipping individual games (only whole weeks).
- Byes for playoff weeks.

## Data model

New table `schedule_skips` (new migration, next sequential number):

| column | type | notes |
|--------|------|-------|
| `id` | uuid pk | `default gen_random_uuid()` |
| `season_id` | uuid not null | `references seasons(id) on delete cascade` |
| `skip_date` | date not null | the game-night date that was skipped |
| `reason` | text not null | |
| `created_at` | timestamptz not null | `default now()` |

- Unique index on `(season_id, skip_date)` — can't skip the same week twice.
- RLS mirrors existing tables: `create policy "public read schedule_skips" ... for select using (true)`; insert/delete gated by `is_admin()` (match the games/seasons write policies in the initial migration).

## Skip action — `skipWeek(formData)` in `app/admin/seasons/actions.ts`

Inputs: `season_id`, `skip_date` (`YYYY-MM-DD`), `reason`.

1. `requireRole(["admin"])`; validate all three present (else `back("error=invalid_input")`).
2. Fetch season games with `status = 'scheduled'` and `scheduled_at >= <skip_date local 00:00>` (regular **and** playoff).
3. For each, add 7 days in JS and update the row's `scheduled_at` (per-row update, same style as `generateSchedule`). Live/final games are left untouched.
4. Insert the `schedule_skips` row (`season_id`, `skip_date`, `reason`).
5. `revalidatePath` for `/admin/schedule`, `/schedule`, `/admin/seasons`; redirect back with a success flash.

A companion `removeScheduleSkip(formData)` deletes a skip row by id (admin-only) — removes the public note only; does not un-shift dates.

**Shift approach:** fetch + per-row update via supabase-js in the server action
(matches `generateSchedule`). Considered a Postgres RPC doing
`scheduled_at + interval '7 days'` in one statement — rejected to avoid adding a
DB function to maintain; game counts are small.

## Bye display — derived, no storage

Shared helper (e.g. in `lib/season-schedule.ts`): given the season's team list
and its games, group games by **local date** and, for each **regular-season**
date, compute `byes = allTeams − teamsPlayingThatDate`. Returns bye team(s) per
date. Even team count → empty. Not computed for playoff dates.

- **Public schedule** (`app/schedule/page.tsx`, currently grouped by month):
  render "Bye: Team X" for the relevant week, and a "Week of {date} — postponed ·
  {reason}" marker at each skipped date (from `schedule_skips`).
- **Admin schedule** (`app/admin/schedule/page.tsx`): show the same bye line per
  week in the game list.

## UI — admin schedule page

- A **"Skip a week"** form near the top: date input + reason input + submit.
- Below it, a list of recorded skips for the season (date + reason) each with a
  **Remove** button (calls `removeScheduleSkip`).

## Edge cases

- Even team count → no byes rendered.
- Skipping a date with no games still shifts everything on/after it (free-date form).
- A partially-played week keeps its live/final games; only `scheduled` games move.
- Re-skipping stacks: each skip shifts whatever is currently scheduled from that date on.

## Testing

No automated test runner is configured. Manual verification on the local stack:

1. Create an **odd** number of teams; generate a schedule → confirm "Bye: X"
   appears once per week and rotates.
2. Skip a mid-season week with a reason → confirm that week empties, all later
   scheduled games (incl. playoffs) move +7 days, and live/final games do not.
3. Confirm the skip note shows on the public schedule; Remove deletes the note
   without changing dates.
