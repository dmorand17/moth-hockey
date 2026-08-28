# Season scoring config + on-demand playoff generation

**Date:** 2026-08-27
**Status:** Approved design
**Branch:** `feat/season-scoring` (stacked on `feat/season-reset` / PR #80)

## Context

`lib/queries.ts#getStandings` is the single source of standings order. It:
- computes points with a hardcoded **2-1-0** scheme (win 2, OT/SO loss 1, reg loss 0), and
- sorts by a hardcoded **points → wins → diff → gf → name** tie-break chain.

That order drives **both** the public standings page and playoff seeding
(`seedPlayoffs` takes the top 4 from `getStandings`). Playoffs are pre-created
as TBD stubs by `generateSchedule` when its `with_playoffs` checkbox is on, then
filled by `seedPlayoffs`.

Games record `decided_in` (`regulation` | `ot` | `shootout`), so regulation vs
overtime outcomes are known.

## Goals

Make scoring configurable **per season** and generate playoffs on demand:

1. **Point system** per season: `2-1-0` or `3-2-1`.
2. **Tie-breakers** per season: an ordered list applied after points.
3. `getStandings` honors both (so standings + seeding stay consistent).
4. A per-season **Standings rules** config UI.
5. A **Generate Playoffs** button replacing the pre-created stubs.

## Non-goals

- Configuring the *primary* sort (points is always first).
- Per-game point overrides.
- Multi-team head-to-head beyond the group rule below.

## Data model — migration `0014_season_scoring.sql`

Add to `seasons`:

| column | type | default | notes |
|--------|------|---------|-------|
| `point_system` | text | `'3-2-1'` | check in (`'2-1-0'`, `'3-2-1'`) |
| `tiebreakers` | text[] | `'{wins,diff,gf}'` | ordered keys applied after points |

- **Backfill existing rows to `'3-2-1'`** (per decision — all seasons default to 3-2-1; override per season for historical 2-1-0). `tiebreakers` backfills to the default, preserving today's order.
- Allowed tie-break keys: `wins`, `diff`, `gf`, `ga`, `h2h`. Validated in the action (not a DB constraint, since it's an ordered list).
- Regenerate `lib/supabase/database.types.ts`.

## Point systems

Applied when tallying each final regular-season game in `getStandings`
(win/OT-loss/loss *counters* are unchanged — only `pts` differs):

| Outcome | `2-1-0` | `3-2-1` |
|---------|---------|---------|
| Regulation win | 2 | 3 |
| OT/SO win | 2 | 2 |
| OT/SO loss | 1 | 1 |
| Regulation loss | 0 | 0 |

"OT/SO" = `decided_in` is `ot` or `shootout`.

## Standings sort (`getStandings`)

1. Fetch the season's `point_system` + `tiebreakers`.
2. Tally points per the system above.
3. Sort:
   - **Primary:** points (desc), always.
   - Then each configured criterion in order. Numeric comparators: `wins`/`diff`/`gf` → higher first; `ga` → fewer first.
   - **Final fallback:** team name (alphabetical).
4. `h2h` is resolved **group-wise** (a pairwise comparator can't express it):
   - Sort by `cmpBefore` = points + criteria listed *before* `h2h`.
   - Partition into maximal groups where `cmpBefore` ties.
   - Within each group of >1, rank by **head-to-head points**: points each team earned in regular-season final games played *only against other teams in the group*, using the season's `point_system`. Remaining ties fall through to `cmpAfter` = criteria listed *after* `h2h`, then name.
   - Concatenate groups in order.
   - When `tiebreakers` contains no `h2h`, this collapses to a single comparator chain.

H2H points reuse the already-fetched regular-final games array — no extra query.

## Config UI — per season

A **Standings rules** section in the expanded season card (`page.tsx`), backed by
a client component `StandingsRulesEditor`:
- **Point system**: two labeled radio options (`2-1-0`, `3-2-1`) with their point breakdowns.
- **Tie-breakers**: an ordered list of chosen criteria with ▲/▼ reorder and add/remove; **Points** shown as a fixed first rank. Renders the ordered keys as hidden `tiebreakers` inputs for submission.
- Saved via `updateStandingsRules(formData)` → validates `point_system` and the tie-break keys, updates the season, revalidates standings/seeding paths.

The create form keeps the defaults (no scoring UI needed at create time).

## Playoff generation

Replace pre-created stubs with a single **Generate Playoffs** button (season card):

- **Remove** the `with_playoffs` checkbox and the stub-creation block from `generateSchedule` — it now creates **regular games only**.
- **`generatePlayoffs(formData)`** (idempotent — creates *and* advances):
  1. Admin gate; read `season_id`.
  2. If **no** playoff games exist yet and any regular-season game is not `final` → `error=regular_incomplete`.
  3. Standings via `getStandings`; need ≥4 teams → else `error=not_enough_teams`.
  4. Ensure the 3 games exist. When creating, derive dates from the existing schedule: weekday + time slots from the regular-season games, and `buildPlayoffSlots(start_date, weekday, times, regularGameCount)` for the SF1/SF2/Final timestamps.
  5. Seed: **SF1 = #1 v #4**, **SF2 = #2 v #3** (skip an SF that's already `final`). **Final** = SF winners once both SFs are `final` (folds in today's `seedPlayoffs` advancement).
  6. Revalidate `/admin/seasons`, `/admin/schedule`, `/schedule`; redirect with a flash.
- **Remove** `seedPlayoffs` (superseded) and its button; the bracket display stays, with the button now labelled **Generate Playoffs** (and effectively "advance" on re-run).

## Errors

- `regular_incomplete` — "Finish all regular-season games before generating playoffs."
- `not_enough_teams` — "Need at least 4 teams with standings to seed playoffs."

## Behavior changes to call out

- Existing seasons' standings recompute under **3-2-1** (regulation wins now 3). Set a season to `2-1-0` to restore prior numbers.
- Generate Schedule no longer creates playoff stubs; playoffs are a separate post-season step.
- Editing a season's point system / tie-breakers changes both the public standings page and any future playoff seeding.

## Testing

No automated test runner. Manual verification on the local stack:
1. Seed a 5-team, 10-week schedule; mark all regular games `final` with a mix of regulation/OT results.
2. Toggle point system 2-1-0 ↔ 3-2-1 → standings points change accordingly; toggle tie-breaker order (incl. h2h) → order changes as expected; contrive a points tie to exercise h2h.
3. Generate Playoffs before all regular games are final → error; after → SF1/SF2 seeded from standings, Final TBD; mark SFs final and re-run → Final advances to the winners.
