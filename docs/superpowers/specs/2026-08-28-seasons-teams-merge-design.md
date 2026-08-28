# Fold Teams into Seasons (per-season team management)

**Date:** 2026-08-28
**Status:** Approved design
**Branch:** `feat/seasons-teams` (off `staging`)

## Context

Teams are season-scoped (`teams.season_id`), but managed on a separate
`/admin/teams` page that only ever targets the **current** season
(`getCurrentSeason()`). The seasons admin page shows a team *count* per season
but no team management. Users want teams managed **with** their season.

Team management today (`/admin/teams`):
- `createTeam`, `updateTeam` (name + color), `assignTeamCaptain` — in `app/admin/teams/actions.ts`; all read `season_id`/team id from the form.
- `RosterEditor` (client) — add/remove players, position, jersey #; saves via `saveRosterChanges` in `app/admin/rosters/actions.ts`.
- `ColorSwatches` (client), `PlayerCombobox` (shared `@/components`).

## Goal

Manage each season's teams **inside its season card** on `/admin/seasons`
(create/rename/recolor teams, captains, rosters), and **remove** `/admin/teams`.

## Non-goals

- Changing team/roster *actions'* logic — this is an IA/UI move (actions already take `season_id`/team id).
- Cross-season roster moves; player CRUD (players are created via roster add as today).

## What moves

- `app/admin/teams/RosterEditor.tsx` → `app/admin/seasons/RosterEditor.tsx` (its `../rosters/actions` import still resolves — `rosters/` stays put).
- `app/admin/teams/color-swatches.tsx` → `app/admin/seasons/color-swatches.tsx`.
- `createTeam`, `updateTeam`, `assignTeamCaptain` → moved from `app/admin/teams/actions.ts` into `app/admin/seasons/actions.ts` (redirect targets change `/admin/teams?…` → `/admin/seasons?…`).
- **Delete** `app/admin/teams/page.tsx` and `app/admin/teams/actions.ts`.
- Remove the **Teams** item from `app/admin/AdminNav.tsx`.
- `app/admin/rosters/actions.ts` stays; `saveRosterChanges` gains a revalidate of `/admin/seasons` (it currently revalidates `/admin/teams`).

## Seasons page — Teams section

Add a **Teams** `FieldGroup` to each expanded season card (after Standings rules,
before Playoffs). For that season:

- **Add team** — inline form (`createTeam`) with name + `ColorSwatches`, `season_id` = this season.
- **Team list** — each team an expandable row (reusing the `<details>`/summary
  pattern) showing:
  - **Edit** (`updateTeam`): name + color.
  - **Captain** (`assignTeamCaptain`): `PlayerCombobox` over the team's roster.
  - **Roster** (`RosterEditor`): `teamId`, `initialRows` (this team's roster),
    `unrosteredAll` (season players not on this team).

The Overview stat strip already shows the team count.

## Data loading (seasons page)

Extend the page's queries to fetch, for all seasons at once:
- `teams` (id, name, slug, color, **season_id**) — already partly fetched for counts; add the fields.
- `team_players` joined to `players` (team_id, season_id, player_id, first_name, last_name, position, jersey_number, is_captain).
- the full `players` pool (id, first_name, last_name) for the "add to roster" combobox.

Then group per season → per team in the page: `teamsBySeason`, roster rows per
team, and each season's unrostered pool (season players not on a given team).
Small league (few seasons, ~5 teams, ~9 players each) → one batched load is fine;
note lazy-loading as a future option if it grows.

## Flash / redirects

Team actions redirect to `/admin/seasons?saved=…`. Add flash entries:
`team_created`, `team_updated`, `captain_set` (and reuse existing roster flash on
`/admin/seasons`). Keep the existing team error messages (e.g. duplicate name).

## Layout

Follow the existing seasons-card language (the `FieldGroup` / `Disclosure` /
`StatTile` helpers, dark board theme, `ice`/`goal` accents). The Teams section is
itself a `FieldGroup`; individual teams are collapsible rows so a season with many
teams stays scannable. No new visual system.

## Edge cases

- Season with no teams → "No teams yet — add one" empty state + the add form.
- A team's captain list empty (no roster) → captain control disabled with a hint.
- Deleting `/admin/teams`: check for internal links to it (e.g. the players page's
  "Manage on Teams →" and the teams-page season header link) and repoint to
  `/admin/seasons`.

## Testing

No automated runner. Manual on the local stack (load the 5-team sample via
`scripts/local/seed-sample.sh 5`): on `/admin/seasons`, expand a season → add a
team, rename/recolor, set a captain, edit a roster (add/remove/jersey/position);
confirm the public `/teams`, `/schedule`, standings still reflect changes and that
`/admin/teams` is gone (nav item removed, route 404/redirs).
