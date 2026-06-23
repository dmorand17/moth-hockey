# ADR 0001 — Game Preview / Matchup Analyzer

Records how we build the upcoming-game preview panel from [issue #19](https://github.com/dmorand17/moth-hockey/issues/19), and how we split a feature that mixes shippable-now work with two net-new subsystems.

Last updated: 2026-06-23

---

## Status

**Proposed.**

This is the project's first ADR. It depends on, but is not blocked by:

- [ADR 0002 — Player Availability Check-in](./0002-player-availability-checkin.md) (proposed, deferred)
- [ADR 0003 — Projection Engine Hardening](./0003-projection-engine-hardening.md) (deferred)

---

## Context

[Issue #19](https://github.com/dmorand17/moth-hockey/issues/19) asks for a **Game Preview /
Matchup Analyzer** shown when a user opens an *upcoming* game. Today, `app/games/[id]/page.tsx`
renders a read-only boxscore for every game; for a `scheduled` game it shows only a `0–0`
scoreboard with an `UPCOMING` chip and an empty events list. There is no contextual content,
which limits engagement for the most-visited state of any not-yet-played game.

The issue lists five sections: team form (last 3 results), projected rosters, a key matchup,
projected over/under + moneyline, and top goal scorers. A maintainer comment adds that the
preview should be available until game start, then give way to the live view.

Exploring the codebase surfaced two facts that reshape the scope:

1. **The "in/out check-in tool" the issue depends on does not exist.** `components/RosterCheckIn.tsx`
   is a *scorekeeper-only* tool (admin/`scorekeeper`) that records who actually played — it
   writes `game_appearances` at game start. It is **not** a player-facing pre-game
   availability/RSVP system. A real "projected roster" needs a new table, a player-facing
   surface, and RLS — built from scratch.
2. **The projection engine does not exist** either, but a simple heuristic is feasible with
   **no new tables**: the data it needs is already computed by `getStandings()` in `lib/queries.ts`.

The remaining four sections (team form, top scorers, a roster snapshot, the key matchup),
the panel UI, and the `scheduled → live` transition are all **buildable now** against the
current schema. The work therefore splits cleanly along buildability lines.

> **Schema facts (verified against `supabase/migrations/0001_initial_schema.sql`):**
> stats are *derived at query time* — player stats from `game_events`, standings from the
> denormalized `games.home_score`/`games.away_score`. There is no materialized view, and we
> keep that pattern. `team_players` is the per-season roster; `game_appearances` records who
> actually played.

---

## Decision

**Build the preview panel now as a server-rendered component, mounted in the
`status === 'scheduled'` branch of `app/games/[id]/page.tsx`. No migration. Defer the two
net-new subsystems to their own ADRs.**

Split the issue into three ADRs:

| ADR | Scope | Status |
| --- | --- | --- |
| **0001** (this) | Preview panel + team form, top scorers, season-roster snapshot, key matchup, heuristic projections, `scheduled → live` transition | Proposed |
| **0002** | Player availability "in/out" check-in (new table, enum, player route, RLS) | Proposed (deferred) |
| **0003** | Richer projection model once multi-season data exists | Deferred |

Splitting keeps a shippable panel from being blocked on two subsystems that carry unresolved
product/RLS questions. It mirrors the repo's existing habit of deferring hard schema work
(see [MULTI-ROLE.md](../initial-build/MULTI-ROLE.md)).

Until ADR 0002 ships, the "projected roster" section shows the **season roster** from
`team_players`, labelled honestly (e.g. *"Season roster — check-in coming soon"*) so it does
not imply confirmed attendance.

---

## Architecture

### Mount point and component tree

`app/games/[id]/page.tsx` already branches on `game.status`. The preview renders only in the
`scheduled` branch (replacing the empty events state); `live` and `final` keep the existing
boxscore. Data is fetched once in `GamePreview.tsx` via `Promise.all`; sub-components are
presentational and server-rendered (no `"use client"`).

```
app/games/[id]/page.tsx              (RSC — add season_id to select; branch on status)
  components/GamePreview.tsx         (RSC orchestrator — one Promise.all)
    components/preview/TeamFormStrip.tsx
    components/preview/TopScorers.tsx
    components/preview/ProjectedRoster.tsx   # Phase 1: season roster, labelled
    components/preview/KeyMatchup.tsx
    components/preview/ProjectionCard.tsx
```

`app/games/[id]/page.tsx` currently does not select `season_id`; add it to the game query so
it can be passed to `GamePreview`.

### Query helpers (`lib/queries.ts`)

Three new helpers, each *extracting logic that already exists inline* elsewhere — keep the
codebase's query-time JS-derivation pattern; do **not** add a Postgres view or function.

| Helper | Derives from | Existing inline source to extract |
| --- | --- | --- |
| `getTeamRecentResults(teamId, seasonId, limit = 3)` | `games` where team is home/away and `status = 'final'`, newest first | subset of `app/teams/[slug]/page.tsx` |
| `getTeamTopScorers(teamId, seasonId, limit = 3)` | `game_appearances` (team's finalized games) + `game_events` of `type = 'goal'`, grouped by `player_id` | `app/stats/page.tsx` (`StatsExplorer`) |
| `getTeamRoster(teamId, seasonId)` | `team_players` joined to `players` | `app/teams/[slug]/page.tsx` |

Reuse the existing **`getStandings(seasonId)`** — it already returns `gp`, `gf`, `ga`, `pts`
per team, which is exactly what the projection engine and form context need.

### Projection engine (`lib/projections.ts`)

Pure, synchronous functions. Input is the existing `StandingsRow` type. No Supabase imports,
no async, no new tables — fully unit-testable.

- **Over/Under** from goals pace, where `GPG = gf/gp` and `GAA = ga/gp`:
  ```
  expHome = (home.GPG + away.GAA) / 2
  expAway = (away.GPG + home.GAA) / 2
  overUnder = expHome + expAway
  ```
- **Win probability** via Pythagorean expectation (hockey exponent ≈ `2.37`):
  ```
  pyth(t) = t.gf^2.37 / (t.gf^2.37 + t.ga^2.37)
  homeWinProb = pyth(home) / (pyth(home) + (1 - pyth(away)))
  ```
  Optionally render as American-odds (`p > 0.5 → -round(p/(1-p)*100)`, else `+round((1-p)/p*100)`).
- **Guard rails:** `gp === 0` → render "not enough data" (return `null`); `gp < 3` → append a
  `(small sample)` caveat. Cap displayed over/under to one decimal.

This ADR records: **heuristic only, no stored model, labelled as entertainment** (see O4).

### Key matchup (deterministic)

No new query beyond the helpers above:

1. **Preferred:** away team's top scorer vs. home team's starting goalie (goalie = roster
   `position = 'goalie'` with the most `game_appearances` in finalized games).
2. **Fallback:** top scorer vs. top scorer (if a team has no goalie on roster).
3. **Fallback:** "Season just started — no stats yet" placeholder (no goals recorded).

### Scheduled → live transition

The public game page already re-branches when `status` flips to `live`, rendering the existing
**read-only** boxscore.

> **Constraint:** the public `app/games/[id]/page.tsx` must **never** mount the scorekeeper-only
> `components/LiveScoring.tsx`. That tool is gated to admin/`scorekeeper` on `app/score/[gameId]`.
> The public "live" view is the read-only boxscore.

To make the swap feel automatic, an optional `components/GameStatusWatcher.tsx` (`"use client"`)
subscribes via Supabase Realtime (`lib/supabase/client.ts`) to the `games` row and calls
`router.refresh()` when `status` changes from `scheduled` to `live`. It renders nothing and is
placed inside the `scheduled` branch, so it self-removes after the swap. Gated on O1/O2.

---

## Consequences

### What this enables

- A data-rich upcoming-game page with **zero migrations** and **zero new tables** in Phase 1.
- Centralized, reusable query helpers (`getTeamRoster`, `getTeamTopScorers`,
  `getTeamRecentResults`) that today live duplicated inline across `app/teams/[slug]` and
  `app/stats`.
- A testable projection module independent of the database.

### What this defers

- **True projected rosters** → ADR 0002. Until then `ProjectedRoster` shows the season roster,
  labelled as such (O7). On 0002 it upgrades to confirmed *in / out / maybe*.
- **A better projection model** → ADR 0003. The heuristic intentionally ignores head-to-head
  history, home/away splits, and roster strength.
- **Auto-refresh into the live view** is gated on O1/O2; without it, the swap happens on the
  next page load/navigation, which is acceptable for launch.

### Verification (when implemented)

- `bun run build` and `bun run lint` pass.
- Open an upcoming game locally (see [LOCAL-TESTING.md](../LOCAL-TESTING.md)): the panel renders
  the five sections; projections show guard-rail text when a team has `gp < 3`.
- Flip a game to `live` and confirm the page shows the read-only boxscore (and auto-refreshes
  if `GameStatusWatcher` is enabled).

---

## Open decisions

- [ ] **O1 — auto-refresh on go-live?** Use `GameStatusWatcher` + `router.refresh()`, or accept
  refresh-on-next-load? *Recommend the watcher for an auto feel.*
- [ ] **O2 — "transition into live scoring interface" intent.** Confirm the public live view is
  the existing read-only boxscore (not a new public real-time view, not the scorekeeper tool).
  *Recommend read-only boxscore.*
- [ ] **O3 — preview window.** Show for all `scheduled` games, or only within N days?
  *Recommend all, with a countdown.*
- [ ] **O4 — gambling language.** Keep "moneyline / over-under", or soften to "Win Likelihood /
  Predicted Score Range" for a rec league? *Recommend softened labels.*
- [ ] **O7 — Phase 1 roster label.** *Recommend "Season roster — check-in coming soon".*

(O5/O6 belong to ADR 0002.)
