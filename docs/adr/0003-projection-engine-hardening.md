# ADR 0003 — Projection Engine Hardening

Records *when* and *how* to revisit the heuristic projections introduced in
[ADR 0001](./0001-game-preview-matchup-analyzer.md), and what that heuristic intentionally omits.

Last updated: 2026-06-23

---

## Status

**Deferred.** No work until the trigger condition below is met.

---

## Context

[ADR 0001](./0001-game-preview-matchup-analyzer.md) ships projections as pure heuristics in
`lib/projections.ts`: over/under from season goals-pace, win probability from Pythagorean
expectation. This is deliberately simple — for a recreational league with short, high-variance
seasons, a heavier model would imply a precision the data cannot support, and would add stored
state and complexity for little gain.

The heuristic intentionally ignores: head-to-head history between these teams, home/away splits,
roster strength (who is actually playing), goalie form, and rest/schedule effects.

---

## Decision

**Do nothing now.** Revisit only when **2+ complete regular seasons** of `game_events` data
exist *and* the simple model is observably misleading (e.g. consistently wrong favourites).

When revisited, candidate improvements, cheapest first:

- Incorporate ADR 0002 availability data so projections weight the *expected* lineup, not the
  full roster.
- Head-to-head adjustment from prior meetings of the same color teams.
- Home/away splits.
- An Elo/Glicko-style rating updated per game (introduces stored state — the first real schema
  cost; weigh carefully).

---

## Consequences

- Keeps Phase 1 free of stored model state and ML infrastructure.
- Risk: early-season projections are noisy. Mitigated by ADR 0001's guard rails
  (`gp === 0` → no projection; `gp < 3` → "small sample" caveat) and entertainment-only framing.

---

## Open decisions

- [ ] **Trigger.** Confirm "2+ seasons" is the right bar, vs. a qualitative "projections feel wrong".
- [ ] **Accuracy measure.** Do we even track projection accuracy? If not, hardening is guesswork.
