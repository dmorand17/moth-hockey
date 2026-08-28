# Fold Teams into Seasons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Manage each season's teams (create/rename/recolor, captains, rosters) inside its season card on `/admin/seasons`, and remove `/admin/teams`.

**Architecture:** UI/IA move — team + roster actions already take `season_id`/team id from the form; the seasons page gains a per-season **Teams** section reusing the current teams-page components. One real logic fix: roster writes must use the *team's* season, not the current season.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Supabase, bun.

## Global Constraints

- Package manager **bun** (`bunx`). **No test runner** — verify each task with `bunx tsc --noEmit` (0 errors) and `bun run lint` (no NEW warnings beyond the two pre-existing in `app/admin/schedule/page.tsx`).
- **Every task must leave the build green** (tsc 0 errors) — the sequence is ordered so nothing dangles.
- Server actions gate mutations with `requireRole(["admin"])`.
- Branch: `feat/seasons-teams` (checked out, rebased on `staging`).
- Spec: `docs/superpowers/specs/2026-08-28-seasons-teams-merge-design.md`.

---

### Task 1: Roster writes use the team's season; repoint roster redirects

**Files:** `app/admin/rosters/actions.ts`, `app/admin/rosters/page.tsx`

**Why:** `saveRosterChanges`/`addToRoster`/`updateRosterEntry` derive the season from `getCurrentSeason()`, so editing a non-current season's roster would write the wrong `season_id`. Use the team's season instead. Also repoint `/admin/teams` redirects/revalidates to `/admin/seasons` (that page is going away).

- [ ] **Step 1: In `saveRosterChanges`, replace the current-season lookup** with the team's season:

Replace:
```ts
  const season = await getCurrentSeason();
  if (!season) return { ok: false, error: "no_season" };
```
with:
```ts
  const { data: team } = await supabase
    .from("teams")
    .select("season_id")
    .eq("id", input.teamId)
    .single();
  if (!team) return { ok: false, error: "no_team" };
```
and change the insert's `season_id: season.id` → `season_id: team.season_id`.

- [ ] **Step 2: Do the same for `addToRoster` and `updateRosterEntry`** if they read `season_id`/`getCurrentSeason()` (addToRoster inserts `season_id: season.id`). Derive from the row's `team_id` the same way. If a function doesn't touch season, leave it. Then remove the now-unused `getCurrentSeason` import if nothing uses it.

- [ ] **Step 3: Repoint redirects/revalidates.** In `app/admin/rosters/actions.ts`, change every `"/admin/teams"` in `back()`, `revalidatePath`, and `redirect` to `"/admin/seasons"` (and `?saved=…` targets stay the same keys). In `app/admin/rosters/page.tsx`, change `redirect("/admin/teams")` → `redirect("/admin/seasons")`.

- [ ] **Step 4: Verify + commit**

`bunx tsc --noEmit && bun run lint`, then:
```bash
git add app/admin/rosters/actions.ts app/admin/rosters/page.tsx
git commit -m "fix(rosters): key roster writes to the team's season; point at Seasons"
```

---

### Task 2: Move `RosterEditor` + `ColorSwatches` into `seasons/`

**Files:** move `app/admin/teams/RosterEditor.tsx` → `app/admin/seasons/RosterEditor.tsx`; `app/admin/teams/color-swatches.tsx` → `app/admin/seasons/color-swatches.tsx`. Modify `app/admin/teams/page.tsx` imports.

**Interfaces:** `RosterEditor` import of `../rosters/actions` still resolves from `seasons/` (both are `app/admin/*` siblings). Props unchanged: `{ teamId, initialRows, unrosteredAll }`.

- [ ] **Step 1: Move the files** (preserve history):
```bash
git mv app/admin/teams/RosterEditor.tsx app/admin/seasons/RosterEditor.tsx
git mv app/admin/teams/color-swatches.tsx app/admin/seasons/color-swatches.tsx
```

- [ ] **Step 2: Fix `app/admin/teams/page.tsx` imports** to the new locations (keeps the teams page working until Task 5 deletes it):
```ts
import { ColorSwatches } from "../seasons/color-swatches";
import { RosterEditor } from "../seasons/RosterEditor";
```

- [ ] **Step 3: Verify + commit**

`bunx tsc --noEmit && bun run lint`, then:
```bash
git add -A
git commit -m "refactor: move RosterEditor + ColorSwatches into seasons/"
```

---

### Task 3: Add team actions to `seasons/actions.ts`

**Files:** `app/admin/seasons/actions.ts` (add `createTeam`, `updateTeam`, `assignTeamCaptain`).

**Interfaces:** Produces those three server actions (same form fields as today: `season_id`/`id`/`team_id`, `name`, `slug`, `color`, `player_id`) redirecting to `/admin/seasons?saved=…`.

- [ ] **Step 1: Append the actions** to `app/admin/seasons/actions.ts`. Copy the bodies from `app/admin/teams/actions.ts` (`createTeam`, `updateTeam`, `assignTeamCaptain`) plus the `HEX_COLOR` const and `slugify` helper, but use the seasons module's `back()` (which already redirects to `/admin/seasons`) and these redirect keys: create → `?saved=team_created`, update → `?saved=team_updated`, captain → `?saved=captain`. Keep the `assignTeamCaptain` extra `revalidatePath("/admin/players")`. Add `revalidatePublicSeasonPaths()` (already in the file) or at least `revalidatePath("/admin/seasons")` + `revalidatePath("/teams")` after each.

  Note: `slugify` may already be needed only here; if `HEX_COLOR`/`slugify` names collide with existing seasons/actions symbols, prefix or reuse. (They currently do not exist in seasons/actions.ts.)

- [ ] **Step 2: Point the teams page at the moved actions** — in `app/admin/teams/page.tsx` change `import { assignTeamCaptain, createTeam, updateTeam } from "./actions";` → `from "../seasons/actions";` (keeps the teams page green; `teams/actions.ts` becomes unused, deleted in Task 5).

- [ ] **Step 3: Verify + commit**

`bunx tsc --noEmit && bun run lint`, then:
```bash
git add app/admin/seasons/actions.ts app/admin/teams/page.tsx
git commit -m "refactor(seasons): add team create/update/captain actions"
```

---

### Task 4: Seasons page — per-season Teams section

**Files:** `app/admin/seasons/page.tsx`

**Interfaces:** Consumes `createTeam`/`updateTeam`/`assignTeamCaptain` (Task 3), `RosterEditor`/`ColorSwatches` (Task 2), `PlayerCombobox` (`@/components/PlayerCombobox`).

- [ ] **Step 1: Imports + flashes + errors.** Add imports for `createTeam`, `updateTeam`, `assignTeamCaptain` (from `./actions`), `ColorSwatches`, `RosterEditor` (from `./`), `PlayerCombobox`. Add flash cases: `team_created` → "Team created.", `team_updated` → "Team updated.", `captain` → "Captain updated.", `added`/`roster_updated`/`removed` → the roster messages. Add error messages: `invalid_color` → "Color must be a hex like #ef4444.", `already_rostered` → "That player is already on a team this season."

- [ ] **Step 2: Extend the data fetch.** Change the counts query to full team fields and add roster + player-pool queries. Replace the teams query in the `Promise.all` and add two more:
```ts
supabase.from("teams").select("id, name, slug, color, season_id").order("name"),
supabase
  .from("team_players")
  .select("team_id, season_id, player_id, position, jersey_number, is_captain, player:player_id(id, first_name, last_name)"),
supabase.from("players").select("id, first_name, last_name").order("last_name").order("first_name"),
```
Keep `teamCounts` working (derive from the fuller `teamRows`).

- [ ] **Step 3: Build per-season/per-team maps** after the fetch:
```ts
type RosterPlayer = { player_id: string; first_name: string; last_name: string; position: string; jersey_number: number | null; is_captain: boolean };
const teamsBySeason = new Map<string, { id: string; name: string; slug: string; color: string }[]>();
for (const t of teamRows ?? []) {
  const arr = teamsBySeason.get(t.season_id) ?? [];
  arr.push({ id: t.id, name: t.name, slug: t.slug, color: t.color });
  teamsBySeason.set(t.season_id, arr);
}
const rosterByTeam = new Map<string, RosterPlayer[]>();
const rosteredBySeason = new Map<string, Set<string>>();
const captainByTeam = new Map<string, string>();
for (const r of rosterRows ?? []) {
  const p = r.player as { id: string; first_name: string; last_name: string } | null;
  if (!p) continue;
  (rosterByTeam.get(r.team_id) ?? rosterByTeam.set(r.team_id, []).get(r.team_id)!).push({
    player_id: p.id, first_name: p.first_name, last_name: p.last_name,
    position: r.position, jersey_number: r.jersey_number, is_captain: r.is_captain,
  });
  const set = rosteredBySeason.get(r.season_id) ?? new Set<string>();
  set.add(p.id); rosteredBySeason.set(r.season_id, set);
  if (r.is_captain) captainByTeam.set(r.team_id, p.id);
}
// sort each team's roster by jersey then name (as the teams page did).
```

- [ ] **Step 4: Render the Teams section** inside the expanded season card (a `<FieldGroup label="Teams">` after the Standings-rules group, before Playoffs). Adapt the markup from the current `app/admin/teams/page.tsx` (still present at this task): the **add-team** form (`createTeam`, hidden `season_id={season.id}`, name + `ColorSwatches`), then for each team of `teamsBySeason.get(season.id)` a `<details>` row with the name/color `updateTeam` form, the `assignTeamCaptain` form + `PlayerCombobox` over that team's roster, and `<RosterEditor teamId initialRows={rosterByTeam.get(team.id) ?? []} unrosteredAll={season's unrostered} />` where the season's unrostered = `(allPlayers ?? []).filter(p => !(rosteredBySeason.get(season.id)?.has(p.id)))`. Empty state when the season has no teams. Reuse the existing `FieldGroup`/`Disclosure`/`StatTile` helpers and styling; do not invent new visuals.

- [ ] **Step 5: Verify + commit**

`bunx tsc --noEmit && bun run lint`, then:
```bash
git add app/admin/seasons/page.tsx
git commit -m "feat(seasons): per-season team management (teams, captains, rosters)"
```

---

### Task 5: Remove `/admin/teams`; repoint links; drop nav

**Files:** delete `app/admin/teams/page.tsx`, `app/admin/teams/actions.ts`; `app/admin/AdminNav.tsx`; `app/admin/players/PlayerFilters.tsx`; `app/admin/seasons/page.tsx` (help text).

- [ ] **Step 1: Delete the teams route + old actions**
```bash
git rm app/admin/teams/page.tsx app/admin/teams/actions.ts
```
(Confirm nothing else imports `./teams/actions` or `teams/page` — Task 3 repointed the last importer.)

- [ ] **Step 2: Remove the Teams nav item** in `app/admin/AdminNav.tsx` (delete the `{ href: "/admin/teams", label: "Teams" }` entry).

- [ ] **Step 3: Repoint remaining links.** In `app/admin/players/PlayerFilters.tsx` change the `href="/admin/teams"` ("Manage on Teams →") to `"/admin/seasons"` (and update the label if it names Teams). In `app/admin/seasons/page.tsx`, update the generate help text "Add at least 2 teams in /admin/teams before generating." → "Add at least 2 teams (in this season's Teams section) before generating."

- [ ] **Step 4: Verify + commit**

`bunx tsc --noEmit && bun run lint` (0 errors; two pre-existing warnings only). Confirm `grep -rn "/admin/teams" app` returns nothing (except possibly historical docs). Then:
```bash
git add -A
git commit -m "feat(seasons): remove /admin/teams — folded into Seasons"
```

---

## Self-Review

- **Spec coverage:** per-season team CRUD + captains + rosters in the season card (T4) ✅; components/actions moved to seasons/ (T2, T3) ✅; `/admin/teams` + nav removed, links repointed (T5) ✅; roster writes correct for any season (T1 — beyond the spec, necessary) ✅.
- **Build-green ordering:** T2/T3 keep the teams page importing from the new locations so it compiles until T5 deletes it; no dangling imports between tasks.
- **Placeholder scan:** exact file ops + code given; T4's per-team row markup is adapted from the still-present teams page (subagent reads it).
- **Type consistency:** `RosterPlayer` shape matches `RosterEditor`'s `initialRows`/`RosterRow`; team action form-field names unchanged.
