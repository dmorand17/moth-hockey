# Season Recap — PR 1 (Recap Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/seasons/[slug]/recap` page for every season (live computed sections, separate playoffs section), `/recap` redirect, links in, OG image, and Award Winners moved off `/stats`.

**Architecture:** Pure, tested helpers in `lib/seasons.ts` (slug, season state, redirect target) and `lib/season-recap.ts` (numbers, leaders, moments, playoff path); one server query `getSeasonRecap(slug)` in `lib/queries.ts` gathers data; the page is a server component composed of small section components under `components/recap/`. No schema changes in this PR.

**Tech Stack:** Next.js 16.2.6 App Router (server components, `generateMetadata`, `opengraph-image.tsx` via `next/og`), React 19, Tailwind v4, Supabase, bun test.

**Spec:** `docs/superpowers/specs/2026-11-19-season-recap-design.md`

## Global Constraints

- No changes to existing data, routes or scoring logic; no schema changes in this PR.
- Regular season and playoffs are never mixed: sections 4–7 count final regular-season games only; everything playoff is in the Playoffs section, shown only when ≥1 playoff game is final.
- Leaders exclude sub appearances (roster-team rule, as `computeSeasonTotals`).
- Every season gets a recap; sections without data are omitted (no empty placeholders). Upcoming seasons 404.
- Penalties are counts (minutes aren't tracked).
- Design system: `SectionHeader`, `DataTable`, `GameRow`/`GameList`, `AwardWinners` (`layout="row"` mobile / `"grid"` desktop), `ScrollFade`, 44px targets, no text < 12px, Bebas ≥ 20px only.
- Page title `"<Season> Season Recap"` (layout template appends "— M.O.T.H Hockey").
- Lint + build after each task; small commits; branch `feat/season-recap`.

## Review Focus

1. Imported season with no game data (Spring 2025): page renders hero, awards, standings (goal diff), leaders from `season_player_stats`; numbers/moments/playoffs omitted; no crash. → Task 2 test `returns null numbers for no games`; Task 4 Step "imported season check".
2. Playoffs scheduled but unplayed (TBD teams, status scheduled): Playoffs section hidden, hero has no championship score. → Task 2 test `playoff path ignores unplayed games`.
3. Shootout finals stored as a tied score (`home_score === away_score`, decided by `shootout_*_goals`): champion comes from `getChampionTeamId` (existing rule); moments skip zero-margin games rather than reporting a 0-goal "biggest win". → Task 2 test `ignores tied games for margins`.
4. Ties between moments (two games with the same margin): deterministic — earliest game first. → Task 2 test `breaks ties by earliest game`.
5. Slugs: `Winter 2025-26` → `winter-2025-26`; unknown slug and upcoming season → 404 (not a 500). → Task 1 tests; Task 4 Step "404 check".

---

### Task 1: Season slug, state and redirect target

**Files:**
- Create: `lib/seasons.ts`, `lib/seasons.test.ts`

**Interfaces:**
- Produces:
  - `type RecapSeason = { id: string; name: string; start_date: string; is_current: boolean; finalized_at: string | null }`
  - `seasonSlug(name: string): string`
  - `recapState(season: RecapSeason, all: RecapSeason[], today: string): "complete" | "in-progress" | "upcoming"`
  - `recapTarget(all: RecapSeason[], today: string): RecapSeason | null` (season `/recap` should open)

- [ ] **Step 1: Write failing tests** in `lib/seasons.test.ts`:
  - `seasonSlug("Fall 2026") === "fall-2026"`, `seasonSlug("Winter 2025-26") === "winter-2025-26"`, `seasonSlug("  Spring  2025 ") === "spring-2025"`.
  - `recapState`: current + `finalized_at` set → `"complete"`; current, not finalized → `"in-progress"`; not current, `start_date` before the current season's → `"complete"`; not current, `start_date` after the current season's → `"upcoming"`; no current season: start before `today` → `"complete"`, after → `"upcoming"`.
  - `recapTarget`: current finalized → current; current in progress + older complete seasons → most recent complete by `start_date`; only an upcoming season and an in-progress current → the current one; empty list → `null`; never returns an upcoming season.
- [ ] **Step 2:** `bun test lib/seasons.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement the three functions in `lib/seasons.ts` (slug: lowercase, runs of non-`[a-z0-9]` → `-`, trim `-`).
- [ ] **Step 4:** `bun test lib/seasons.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(recap): season slug, state and recap target helpers`.

### Task 2: Recap computations

**Files:**
- Modify: `lib/season-finalize.ts` (`computeSeasonTotals` gains `opts?: { kind?: "regular" | "playoff" }`, default `"regular"`), `lib/season-finalize.test.ts`
- Create: `lib/season-recap.ts`, `lib/season-recap.test.ts`

**Interfaces:**
- Consumes: `FinalizeGame`, `FinalizeEvent`, `FinalizeRosterEntry`, `FinalizeAppearance`, `SeasonTotals`, `computeSeasonTotals` (lib/season-finalize.ts).
- Produces (lib/season-recap.ts):
  - `type RecapGame = FinalizeGame & { scheduled_at: string; shootout_home_goals: number | null; shootout_away_goals: number | null }`
  - `seasonNumbers(games: RecapGame[], events: FinalizeEvent[], kind: "regular" | "playoff"): { games: number; goals: number; goalsPerGame: number; overtime: number; shootouts: number; penalties: number } | null` (null when no final games of that kind; `goalsPerGame` rounded to 1 decimal)
  - `type Moment = { kind: "margin" | "high-scoring" | "hat-trick" | "points-game" | "win-streak"; gameId: string | null; teamId: string | null; playerId: string | null; value: number; date: string }` (`win-streak`: `gameId` = game that ended/extended it, `value` = length)
  - `notableMoments(games: RecapGame[], events: FinalizeEvent[], kind: "regular" | "playoff"): Moment[]` — at most: 1 biggest margin, 1 highest-scoring, every hat trick (≥3 goals by one player in one game), 1 best single-game points (goals+assists), 1 longest win streak per team (only streaks ≥ 3); ties → earliest `scheduled_at`.
  - `topSkaters(totals: SeasonTotals[], key: "points" | "goals" | "assists", n = 5): SeasonTotals[]` (points = goals+assists; ties by goals then player_id)
  - `topGoalies(totals: SeasonTotals[], minGames: number, n = 5): SeasonTotals[]` (by GA/GP ascending, then wins desc)
  - `goalieMinGames(games: RecapGame[], kind: "regular" | "playoff"): number` (half the most final games any team played, rounded up — same rule as the Vezina)
  - `playoffPath(games: RecapGame[]): RecapGame[]` (final playoff games with both teams set, ordered sf1, sf2, …, final by round then date)

- [ ] **Step 1: Failing test** in `lib/season-finalize.test.ts`: `computeSeasonTotals(..., { kind: "playoff" })` counts only final playoff games (fixture: 1 regular + 1 playoff game, a player scores in each → goals 1 with kind playoff, 1 by default).
- [ ] **Step 2:** `bun test lib/season-finalize.test.ts` → FAIL; implement the option; → PASS (existing tests unchanged).
- [ ] **Step 3: Failing tests** in `lib/season-recap.test.ts` (small fixtures built inline):
  - `returns null numbers for no games`: `seasonNumbers([], [], "regular") === null`.
  - `counts regular and playoff separately`: fixture with 2 regular finals (4-2 OT, 3-1) and 1 playoff final (2-1) + 1 penalty event in a regular game → regular `{games:2, goals:10, goalsPerGame:5, overtime:1, shootouts:0, penalties:1}`, playoff `{games:1, goals:3, …}`.
  - `ignores tied games for margins`: a 3-3 shootout game and a 5-1 game → margin moment is the 5-1 game, value 4.
  - `breaks ties by earliest game`: two 4-goal margins → the earlier `scheduled_at`.
  - `finds hat tricks`: 3 goal events by player p1 in game g1 → a `hat-trick` moment `{playerId:"p1", gameId:"g1", value:3}`.
  - `finds win streaks of 3+`: team A wins 3 consecutive games by date then loses → `win-streak` `{teamId:"A", value:3}`; a team with max 2 → none.
  - `playoff path ignores unplayed games`: sf1 final, sf2 scheduled with null teams, final scheduled → `[sf1]` only.
  - `topGoalies respects minimum games`: goalie with 1 GP and 0 GA excluded when `minGames = 2`.
- [ ] **Step 4:** `bun test lib/season-recap.test.ts` → FAIL; implement; → PASS. `bun run test` → all pass.
- [ ] **Step 5:** Commit `feat(recap): season numbers, leaders, moments and playoff path`.

### Task 3: Recap data query

**Files:** Modify `lib/queries.ts`

**Interfaces:**
- Consumes: Task 1 helpers; `getSeasonFinalizeInputs`, `getStandings`, `getHistoricalStandings`, `getChampionTeamId`, `getBoardPosts`, `boardSeasonWindow`, `getBoardSeasons`.
- Produces: `getRecapSeasons(): Promise<RecapSeason[]>` and `getSeasonRecap(slug: string): Promise<SeasonRecap | null>` where
  `SeasonRecap = { season: RecapSeason; state: "complete" | "in-progress"; hasGames: boolean; teams: Map<string, {id,name,slug,color}>; players: Map<string, {id,name}>; games: RecapGame[]; inputs: SeasonFinalizeInputs; standings: StandingsRow[] | null; historical: HistoricalStandingsRow[] | null; championTeamId: string | null; awards: AwardWinnerGroup[]; storedTotals: SeasonTotals[] | null; board: { threads: Thread[]; from: string | null; to: string | null } }`
  - returns `null` for an unknown slug or an upcoming season.
  - `storedTotals` from `season_player_stats` (mapped to `SeasonTotals`) when the season has no final games; else `null` (computed from `inputs`).
  - `awards` built exactly like `app/stats/page.tsx` does today (`AWARD_ORDER`, excluding `champion`).
  - games query: `id, kind, status, playoff_round, home_team_id, away_team_id, home_score, away_score, decided_in, scheduled_at, shootout_home_goals, shootout_away_goals` for the season.
- [ ] **Step 1:** Implement both functions (server-only, like the rest of the file). Move the award grouping from `app/stats/page.tsx` into a shared `groupAwards(rows)` in `lib/awards.ts` and use it in both places.
- [ ] **Step 2:** `bunx tsc --noEmit -p .` → no errors; `bun run test` → pass (add a `groupAwards` test in `lib/awards.test.ts`: champion excluded, `AWARD_ORDER` order, winners sorted by name).
- [ ] **Step 3:** Commit `feat(recap): season recap data query`.

### Task 4: Recap page

**Files:**
- Create: `app/seasons/[slug]/recap/page.tsx`; `components/recap/RecapHero.tsx`, `components/recap/RecapNumbers.tsx`, `components/recap/RecapLeaders.tsx`, `components/recap/RecapMoments.tsx`, `components/recap/RecapPlayoffs.tsx`, `components/recap/RecapLockerRoom.tsx`, `components/recap/ShareButton.tsx` (client)
- Modify (local-only tooling): `scripts/local/seed-sample.ts` gains `--complete` (all regular weeks final, SF1 = standings 1 v 4, SF2 = 2 v 3, final = SF winners, all final)

**Interfaces:**
- Consumes: `getSeasonRecap` (Task 3), Task 2 functions, `AwardWinners`, `DataTable`, `GameRow`/`GameList`, `PostThread`.
- Produces: route `/seasons/[slug]/recap` with `generateMetadata` → `{ title: "<Season> Season Recap", description }`.

- [ ] **Step 1:** Seed a complete local season: `bun run scripts/local/seed-sample.ts 5 --complete | docker exec -i supabase_db_moth-hockey psql -U postgres -q`, then finalize it as admin in `/admin/seasons` (magic link via Mailpit). Expected: the season shows "Finalized", its final has a winner, awards exist.
- [ ] **Step 2:** Build the page in the spec's section order: Hero (season name; champion with team bar; champion's W-L-OTL; championship score as a `GameRow` link; `ShareButton` → `navigator.share({ title, url })`, fallback copy-to-clipboard with a 2s "Link copied"); Awards (`AwardWinners` row below `lg`, grid from `lg`); Regular season by the numbers; Final standings (`DataTable`; historical table when no games); Regular-season leaders (points, goals, assists top 5; goalies via `topGoalies(…, goalieMinGames(…))`); Regular-season moments (each links to `/games/{id}`, player/team names from the maps); Playoffs (path as `GameList`, playoff leaders top 5 points + goalies, playoff moments); Locker Room (read-only threads from the season window + "Season board archive →" `/?boardSeason={id}#board`). In-progress state: hero + "Recap available when the season ends" + regular-season leaders only.
- [ ] **Step 3:** Imported-season check: open `/seasons/spring-2025/recap` → hero, awards, historical standings, leaders render; no numbers/moments/playoffs sections; no console errors.
- [ ] **Step 4:** 404 check: `/seasons/nope/recap` and an upcoming season's slug return 404.
- [ ] **Step 5:** Lint + build; commit `feat(recap): season recap page`.

### Task 5: OG image and `/recap` redirect

**Files:** Create `app/seasons/[slug]/recap/opengraph-image.tsx`, `app/recap/page.tsx`

- [ ] **Step 1:** `opengraph-image.tsx`: 1200×630 `ImageResponse` — dark board background, `public/moth-banner-strip.png` art on the left, season name and `Champions: <Team>` (team color bar) on the right; season name only when no champion. `alt` = `"<Season> Season Recap"`.
- [ ] **Step 2:** `app/recap/page.tsx`: `redirect("/seasons/" + seasonSlug(target.name) + "/recap")` for `recapTarget(await getRecapSeasons(), today)`; `notFound()` when `null`.
- [ ] **Step 3:** Verify: `curl -sI /recap` → 307 to the expected slug; `curl -s /seasons/<slug>/recap | grep og:image` present; open the image URL → 200 `image/png`.
- [ ] **Step 4:** Lint + build; commit `feat(recap): share image and /recap redirect`.

### Task 6: Links in, awards off /stats, admin links

**Files:** Modify `components/StatsExplorer.tsx`, `app/stats/page.tsx`, `app/standings/page.tsx`, `app/page.tsx`, `components/MobileChrome.tsx`, `app/admin/seasons/[id]/finalize/page.tsx`, `app/admin/seasons/page.tsx`

- [ ] **Step 1:** `/stats`: remove the `awards()` helper and both placements; replace with a slim "Season Recap →" card (season name, champion if known) linking to the selected season's recap. Drop the now-unused `awardWinners`/`awardsPending` props and the awards query in `app/stats/page.tsx` (keep champion detection used for trophies).
- [ ] **Step 2:** "Recap →" link next to `SeasonSelect` on `/stats` and `/standings` for the selected season (hidden for upcoming seasons).
- [ ] **Step 3:** Home: when the current season is complete, a "Season Recap" card under the hero.
- [ ] **Step 4:** More sheet: "Season recap" → `/recap` (between About and the account links).
- [ ] **Step 5:** Admin: finalize page shows "Season recap →" once `finalized_at` is set; admin seasons list shows a "Recap" link for each complete season.
- [ ] **Step 6:** Verify: player-page award badges unchanged; `/stats` has no "Award winners" heading; each link resolves (Playwright clicks → 200).
- [ ] **Step 7:** Lint + build; commit `feat(recap): link the recap; move award winners off /stats`.

### Task 7: Verification

- [ ] **Step 1:** `bun run lint`, `bun run test`, `bun run build`.
- [ ] **Step 2:** Matrix (scratchpad `matrix.ts`, routes: complete-season recap, in-progress recap, imported recap, `/stats`) at 360, 390, 430, 1440: `ovx=0`, mobile `tap<44=0`, `tiny=0`, `err=0`, `end=clear`.
- [ ] **Step 3:** Award row swipes on mobile (ScrollFade `scrollLeft` changes after a horizontal drag; `data-end` flips at the end).
- [ ] **Step 4:** axe on the complete-season recap at 390 and 1440 → 0 violations.
- [ ] **Step 5:** Spot-check numbers: recap regular-season leaders equal `/stats` regular-season leaders for the same season; standings equal `/standings`.
