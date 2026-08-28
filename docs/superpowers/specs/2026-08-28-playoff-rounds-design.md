# Configurable playoff rounds (up to top-8)

**Date:** 2026-08-28
**Status:** Approved design
**Branch:** `feat/playoff-rounds` (off `staging`)

## Context

Playoffs are a fixed top-4 bracket: the `playoff_round` enum is `sf1 | sf2 | final`,
created by the "Reserve last 2 weeks for playoffs" checkbox on the Schedule
Generator and seeded/advanced by `generatePlayoffs` ("Update Playoff Matchups").
Users want the number of playoff rounds configurable.

Decision (leaner of the options considered): **extend the enum to top-8** rather
than a fully generalized round/match model. Rounds ∈ {0,1,2,3}, default **2**.

## Round formats

| Rounds | Teams | Playoff games (in bracket order) |
|--------|-------|-----------------------------------|
| 0 | — | none |
| 1 | top 2 | `final` (#1 v #2) |
| 2 | top 4 | `sf1` (#1 v #4), `sf2` (#2 v #3), `final` (TBD) |
| 3 | top 8 | `qf1` (#1 v #8), `qf2` (#4 v #5), `qf3` (#3 v #6), `qf4` (#2 v #7), `sf1`, `sf2`, `final` (TBD) |

Seeds come from the season's standings (top `2^rounds`). Later-round games start
TBD and fill from winners as earlier rounds finish.

## Data model — migration `0015_playoff_quarterfinals.sql`

```sql
alter type playoff_round add value if not exists 'qf1' before 'sf1';
alter type playoff_round add value if not exists 'qf2' before 'sf1';
alter type playoff_round add value if not exists 'qf3' before 'sf1';
alter type playoff_round add value if not exists 'qf4' before 'sf1';
```

- The existing unique index `(season_id, playoff_round) where kind='playoff'` still holds — each round value appears at most once per season.
- Regenerate `lib/supabase/database.types.ts`.
- **Widen** the hardcoded `playoff_round: "sf1" | "sf2" | "final" | null` unions (≈10 files: `app/schedule/page.tsx`, `app/players/[id]/page.tsx`, `app/admin/schedule/page.tsx`, `app/admin/seasons/page.tsx`, `app/admin/seasons/actions.ts`, `app/score/page.tsx`, `app/teams/[slug]/page.tsx`, `components/GameRow.tsx`, `components/GameLogSection.tsx`, others surfaced by `tsc`) to `"qf1"|"qf2"|"qf3"|"qf4"|"sf1"|"sf2"|"final"`. tsc will flag any missed.

## Shared bracket helpers — `lib/season-schedule.ts`

- `type PlayoffRound = "qf1"|"qf2"|"qf3"|"qf4"|"sf1"|"sf2"|"final"`.
- `playoffRoundsFor(rounds: 1|2|3): PlayoffRound[]` → bracket order per the table (e.g. rounds=3 → `[qf1,qf2,qf3,qf4,sf1,sf2,final]`).
- `playoffLabel(r: PlayoffRound): string` → "QF1"/"SF1"/"Final" (used by the bracket UI; the existing `=== "final" ? "FINAL" : toUpperCase()` inline pattern already covers chips elsewhere).
- Round-1 seed pairings by rounds: `{1:[[1,2]], 2:[[1,4],[2,3]], 3:[[1,8],[4,5],[3,6],[2,7]]}` (1-indexed seeds).
- Feeder map for advancement: which two earlier games feed each later game — `{ sf1:["qf1","qf2"], sf2:["qf3","qf4"], final:[<the two round-before games>] }` where for rounds=2 `final` feeds from `["sf1","sf2"]`, and for rounds=1 `final` has no feeders (seeded directly).
- Playoff dates: replace the special-case `buildPlayoffSlots` with laying the ordered playoff games into the weekly grid after the regular season — `buildGameSlots(start, weekday, times, regularCount + playoffGames.length)` and assign the tail slots to the playoff games in bracket order.

## Schedule Generator (create stubs)

`app/admin/seasons/page.tsx` — replace the `with_playoffs` checkbox with a **Playoff rounds** `<select>` (`name="playoff_rounds"`, options 0/1/2/3, default 2, labels "None / Final only (top 2) / Semis + Final (top 4) / Quarters + Semis + Final (top 8)").

`generateSchedule` (`actions.ts`) — read `playoff_rounds` (0–3). When > 0, append TBD-teamless stub rows for `playoffRoundsFor(rounds)` with dates from the generalized slot layout. (Removes the boolean `with_playoffs` handling.)

## Seeding + advancement — `generatePlayoffs`

Generalize the current SF/Final logic:
1. Load the season's playoff games; infer `rounds` from which round values exist (qf* → 3, else sf* → 2, else final → 1). If none, nothing to do (stubs are created at generation).
2. Standings via `getStandings`; require ≥ `2^rounds` teams (else `error=playoffs_need_four` → generalize message to the needed count).
3. Round 1: seed each round-1 game from the pairing table (skip games already `final`).
4. Later rounds: for each game with feeders, if both feeder games are `final`, set its teams to the winners (higher seed = home); skip if already `final`.
Idempotent; re-run advances the bracket as results come in.

## Bracket display — season card Playoffs section

`app/admin/seasons/page.tsx` — instead of hardcoded SF1/SF2/Final `BracketRow`s, render the season's playoff games sorted by bracket order, labeled via `playoffLabel`, grouped by round (Quarterfinals / Semifinals / Final headers when present).

## Errors / labels

- `playoffs_need_four` message becomes generic: "Need at least N teams with standings for an R-round bracket." (or keep a single clear message).
- Public chips (`GameRow`, schedule, game log) already render `qf1`→"QF1" via the existing toUpperCase pattern — verify each; no bracket-position math needed there.

## Non-goals

- Rounds beyond 3 / top-8 (enum-bounded).
- Non-power-of-2 fields with byes (require exactly `2^rounds` teams).
- Storing `playoff_rounds` on the season (it's inferred from the created games).

## Testing

No test runner. Manual on the local stack (`scripts/local/seed-sample.sh 5` gives 5 teams — enough for rounds=1 or 2; for rounds=3 add teams to reach 8): generate with each rounds value → correct stubs + dates; mark round games final and re-run **Update Playoff Matchups** → next round fills from winners; bracket display + public schedule show QF/SF/Final labels.
