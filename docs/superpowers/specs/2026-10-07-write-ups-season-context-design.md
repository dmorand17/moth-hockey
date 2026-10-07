# AI Write-ups: Season Context — Design

**Date:** 2026-10-07
**Status:** Approved 2026-10-07.
**Builds on:** `2026-10-06-game-preview-and-write-ups-design.md` (#19)

## Problem

Previews already use season records, goals for/against, the last 3 results and each team's top 2 goal scorers. Recaps use only the game itself plus each team's record after it. Neither knows a team's place in the standings, assists/points leaders, a goalie's season record, or head-to-head results. So a write-up can't say "first-place Ravens" or "his 7th of the season", and if it tries, it's guessing.

## Goal

Give the model the season facts behind those statements, with explicit field names, so it can use them accurately and can't invent them.

All of it is **current season, regular-season finals only**, matching `/standings` and `/stats`.

## Additions

| Field | Preview | Recap | Source |
|---|---|---|---|
| `standing { place, of }` per team | ✅ | ✅ as `standing_after` | Index in `getStandings(seasonId)`, which is already in final order with tiebreakers |
| `season_leaders` per team: top 3 by points, each `{ name, goals, assists, points, league_rank_points, league_rank_goals }` | ✅ (replaces `top_scorers`) | — | Season goal events |
| `season_totals_after` for every scorer/assister in this game: `{ goals, assists, points, league_rank_points, league_rank_goals }` | — | ✅ | Season goal events, this game included |
| Goalie season record `{ name, gp, w, l, otl, ga, gaa }` | ✅ the expected goalie (rostered, or the lined-up sub goalie if the rostered one is out) | ✅ each team's goalie(s) in this game, after it | Season appearances (position `goalie`), finals, goal + penalty-shot events |
| `head_to_head_this_season` (newest first; preview: earlier meetings; recap: including this game) | ✅ | ✅ | Season finals between the two teams |

**League rank** uses competition ranking (ties share a rank; the next rank skips), across every player with at least one point in the season. A player with 0 points has no rank (`null`).

**Goalie record** is over regular-season finals where the player appeared for that team with position `goalie`. Position comes from `game_appearances.position`, falling back to the season roster position, as in the box score. GA counts opposing goals plus opposing made penalty shots; GAA = GA / GP, rounded to 2 decimals; W/L/OTL follow the box score rule.

## Prompt rules (added to `SYSTEM_PROMPT`)

- Cite season numbers (totals, ranks, places, records) only exactly as given.
- Say "league-leading" (or similar) only for a `league_rank_*` of 1, and "tied for" when the data shows a tie.
- Don't describe movement in the standings ("climbs into first", "drops to third"): the data gives a place, not a change.
- Mention head-to-head only from `head_to_head_this_season`; if it's empty, it's the teams' first meeting this season.

## Out of scope

- Standings before the game (it would need a re-computation without that game).
- Career/all-time stats, playoff stats.
- Streaks beyond what `last_3_most_recent_first` already shows.

## Verification

- `bun test` for every new pure helper (place, totals + competition ranks, goalie record incl. penalty shots and sub goalies, head-to-head ordering) and for the new input fields.
- Local stack: generate one preview and one recap with the real model; fact-check every season claim against SQL computed independently.
- Then, after merge and deploy, trigger the prod cron for the two Oct 6 finals and fact-check their recaps.
