# AI Write-ups: Season Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AI previews and recaps season context: standings place, points/assists leaders with league ranks, each scorer's season totals, goalie season records, and head-to-head this season.

**Architecture:** New pure helpers in `lib/matchup.ts` (tested); `lib/write-ups/data.ts` loads the season rows they need; `lib/write-ups/prompt.ts` adds snake_case fields to the input contract and rules to `SYSTEM_PROMPT` (tested).

**Tech Stack:** TypeScript, Bun (`bun test`), Supabase.

**Spec:** `docs/superpowers/specs/2026-10-07-write-ups-season-context-design.md`

## Global Constraints

- Current season, **regular-season finals only** (`games.status = 'final'`, `games.kind = 'regular'`).
- Standing place = 1-based index of the team in `getStandings(seasonId)` (already ordered with tiebreakers); `of` = number of rows.
- League rank = competition ranking ("1224"), over players with ≥ 1 point; 0 points → `null`.
- Goalie GA = opposing goals + opposing made penalty shots; GAA = GA / GP rounded to 2 decimals; W if the team scored more, else OTL when `decided_in` is `ot`/`shootout`, else L.
- Goalie position per game: `game_appearances.position`, else the season roster position.
- Prompt field names are snake_case and exactly: `standing`, `standing_after`, `season_leaders`, `season_totals_after`, `goalie_season`, `goalies_season_after`, `head_to_head_this_season`.
- Existing exports keep their names and signatures; `top_scorers` in the preview input is replaced by `season_leaders`.
- No `.eyebrow` + `text-*` combos in any UI touched (none planned).

---

### Task 1: Pure season helpers in `lib/matchup.ts`

**Files:**
- Modify: `lib/matchup.ts` (append exports)
- Test: `lib/matchup.test.ts` (append)

**Interfaces:**
- Consumes: existing `FinalGame`, `GoalEvent`, `Position`, `StandingsRow` (type import).
- Produces:
  - `type SeasonGoal = GoalEvent & { gameId: string }`
  - `type SeasonShot = { gameId: string; committingTeamId: string; result: "goal" | "saved" | null }`
  - `type SeasonAppearance = { gameId: string; playerId: string; teamId: string; position: Position }`
  - `type PlayerTotals = { goals: number; assists: number; points: number; leagueRankPoints: number | null; leagueRankGoals: number | null }`
  - `type GoalieRecord = { gp: number; w: number; l: number; otl: number; ga: number; gaa: number }`
  - `standingsPlace(rows: StandingsRow[], teamId: string): { place: number; of: number } | null`
  - `seasonPlayerTotals(goals: SeasonGoal[]): Map<string, PlayerTotals>`
  - `goalieSeasonRecord(goalieId: string, games: FinalGame[], appearances: SeasonAppearance[], goals: SeasonGoal[], shots: SeasonShot[]): GoalieRecord`
  - `headToHead(games: FinalGame[], teamA: string, teamB: string): FinalGame[]` (newest first)

- [ ] **Step 1: Write the failing tests** — append to `lib/matchup.test.ts`:

```ts
import {
  goalieSeasonRecord,
  headToHead,
  seasonPlayerTotals,
  standingsPlace,
  type SeasonAppearance,
  type SeasonGoal,
  type SeasonShot,
} from "@/lib/matchup";

describe("standingsPlace", () => {
  const rows = ["T1", "T2", "T3"].map((id) => row({ team_id: id }));
  test("1-based index in the already-ordered standings", () => {
    expect(standingsPlace(rows, "T2")).toEqual({ place: 2, of: 3 });
  });
  test("null for an unknown team", () => {
    expect(standingsPlace(rows, "nope")).toBeNull();
  });
});

describe("seasonPlayerTotals", () => {
  const sg = (gameId: string, playerId: string, a1: string | null = null, a2: string | null = null): SeasonGoal => ({
    gameId, teamId: "R", playerId, period: 1, clockSeconds: 0, assist1Id: a1, assist2Id: a2,
  });
  const totals = seasonPlayerTotals([
    sg("g1", "a", "b"),
    sg("g1", "a", "c"),
    sg("g2", "b", "a"),
    sg("g2", "c"),
  ]);
  test("goals, assists and points per player", () => {
    expect(totals.get("a")).toMatchObject({ goals: 2, assists: 1, points: 3 });
    expect(totals.get("b")).toMatchObject({ goals: 1, assists: 1, points: 2 });
    expect(totals.get("c")).toMatchObject({ goals: 1, assists: 1, points: 2 });
  });
  test("competition ranking: ties share a rank, the next rank skips", () => {
    expect(totals.get("a")!.leagueRankPoints).toBe(1);
    expect(totals.get("b")!.leagueRankPoints).toBe(2);
    expect(totals.get("c")!.leagueRankPoints).toBe(2);
    expect(totals.get("a")!.leagueRankGoals).toBe(1);
    expect(totals.get("b")!.leagueRankGoals).toBe(2);
    expect(totals.get("c")!.leagueRankGoals).toBe(2);
  });
  test("a player with assists but no goals has no goals rank", () => {
    const t = seasonPlayerTotals([sg("g1", "a", "z")]);
    expect(t.get("z")).toMatchObject({ goals: 0, assists: 1, points: 1, leagueRankGoals: null, leagueRankPoints: 1 });
  });
});

describe("goalieSeasonRecord", () => {
  const games = [
    game({ id: "g1", homeTeamId: "R", awayTeamId: "W", homeScore: 3, awayScore: 1 }),
    game({ id: "g2", homeTeamId: "V", awayTeamId: "R", homeScore: 2, awayScore: 1, decidedIn: "ot" }),
    game({ id: "g3", homeTeamId: "R", awayTeamId: "F", homeScore: 0, awayScore: 4 }),
  ];
  const apps: SeasonAppearance[] = [
    { gameId: "g1", playerId: "gk", teamId: "R", position: "goalie" },
    { gameId: "g2", playerId: "gk", teamId: "R", position: "goalie" },
    // g3: gk played as a skater, so it doesn't count toward the goalie record.
    { gameId: "g3", playerId: "gk", teamId: "R", position: "forward" },
  ];
  const goals: SeasonGoal[] = [
    { gameId: "g1", teamId: "W", playerId: "x", period: 1, clockSeconds: 0, assist1Id: null, assist2Id: null },
    { gameId: "g2", teamId: "V", playerId: "y", period: 1, clockSeconds: 0, assist1Id: null, assist2Id: null },
    { gameId: "g2", teamId: "R", playerId: "z", period: 2, clockSeconds: 0, assist1Id: null, assist2Id: null },
  ];
  // In g2, R committed a penalty and V's made penalty shot counts against gk.
  const shots: SeasonShot[] = [{ gameId: "g2", committingTeamId: "R", result: "goal" }];

  test("GP, W/L/OTL, GA incl. penalty shots, GAA — goalie games only", () => {
    expect(goalieSeasonRecord("gk", games, apps, goals, shots)).toEqual({
      gp: 2, w: 1, l: 0, otl: 1, ga: 3, gaa: 1.5,
    });
  });
  test("zero games gives zeros, not NaN", () => {
    expect(goalieSeasonRecord("nobody", games, apps, goals, shots)).toEqual({ gp: 0, w: 0, l: 0, otl: 0, ga: 0, gaa: 0 });
  });
});

describe("headToHead", () => {
  test("only games between the two teams, newest first", () => {
    const gs = [
      game({ id: "a", scheduledAt: "2026-03-01T23:00:00Z", homeTeamId: "R", awayTeamId: "W" }),
      game({ id: "b", scheduledAt: "2026-03-08T23:00:00Z", homeTeamId: "R", awayTeamId: "V" }),
      game({ id: "c", scheduledAt: "2026-03-15T23:00:00Z", homeTeamId: "W", awayTeamId: "R" }),
    ];
    expect(headToHead(gs, "R", "W").map((g) => g.id)).toEqual(["c", "a"]);
  });
});
```

(`row`, `game` and `describe/expect/test` already exist at the top of `lib/matchup.test.ts`; add the new names to its existing `@/lib/matchup` import instead of a second import if you prefer — either works.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/matchup.test.ts` → FAIL (the new names aren't exported).

- [ ] **Step 3: Implement** — append to `lib/matchup.ts`:

```ts
// ---- Season context for write-ups (#19 follow-up) ----------------------------

export type SeasonGoal = GoalEvent & { gameId: string };
export type SeasonShot = { gameId: string; committingTeamId: string; result: "goal" | "saved" | null };
export type SeasonAppearance = { gameId: string; playerId: string; teamId: string; position: Position };
export type PlayerTotals = {
  goals: number;
  assists: number;
  points: number;
  leagueRankPoints: number | null;
  leagueRankGoals: number | null;
};
export type GoalieRecord = { gp: number; w: number; l: number; otl: number; ga: number; gaa: number };

// getStandings() already returns rows in final order (points + tiebreakers).
export function standingsPlace(rows: StandingsRow[], teamId: string): { place: number; of: number } | null {
  const i = rows.findIndex((r) => r.team_id === teamId);
  return i < 0 ? null : { place: i + 1, of: rows.length };
}

// Competition ranking ("1224"): equal values share a rank and the next rank
// skips. Players with a value of 0 aren't ranked.
function competitionRanks(values: Map<string, number>): Map<string, number | null> {
  const sorted = [...values.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number | null>();
  let prev: number | null = null;
  let rank = 0;
  sorted.forEach(([id, v], i) => {
    if (v !== prev) rank = i + 1;
    prev = v;
    ranks.set(id, rank);
  });
  for (const id of values.keys()) if (!ranks.has(id)) ranks.set(id, null);
  return ranks;
}

export function seasonPlayerTotals(goals: SeasonGoal[]): Map<string, PlayerTotals> {
  const g = new Map<string, number>();
  const a = new Map<string, number>();
  const bump = (m: Map<string, number>, id: string | null) => {
    if (id) m.set(id, (m.get(id) ?? 0) + 1);
  };
  for (const e of goals) {
    bump(g, e.playerId);
    bump(a, e.assist1Id);
    bump(a, e.assist2Id);
  }
  const ids = new Set([...g.keys(), ...a.keys()]);
  const points = new Map([...ids].map((id) => [id, (g.get(id) ?? 0) + (a.get(id) ?? 0)]));
  const goalsAll = new Map([...ids].map((id) => [id, g.get(id) ?? 0]));
  const rankPts = competitionRanks(points);
  const rankG = competitionRanks(goalsAll);
  const out = new Map<string, PlayerTotals>();
  for (const id of ids) {
    out.set(id, {
      goals: g.get(id) ?? 0,
      assists: a.get(id) ?? 0,
      points: points.get(id) ?? 0,
      leagueRankPoints: rankPts.get(id) ?? null,
      leagueRankGoals: rankG.get(id) ?? null,
    });
  }
  return out;
}

export function goalieSeasonRecord(
  goalieId: string,
  games: FinalGame[],
  appearances: SeasonAppearance[],
  goals: SeasonGoal[],
  shots: SeasonShot[],
): GoalieRecord {
  const byId = new Map(games.map((g) => [g.id, g]));
  let gp = 0, w = 0, l = 0, otl = 0, ga = 0;
  for (const app of appearances) {
    if (app.playerId !== goalieId || app.position !== "goalie") continue;
    const g = byId.get(app.gameId);
    if (!g) continue;
    gp++;
    const isHome = g.homeTeamId === app.teamId;
    const mine = isHome ? g.homeScore : g.awayScore;
    const theirs = isHome ? g.awayScore : g.homeScore;
    if (mine > theirs) w++;
    else if (g.decidedIn === "ot" || g.decidedIn === "shootout") otl++;
    else l++;
    ga += goals.filter((e) => e.gameId === g.id && e.teamId !== app.teamId).length;
    ga += shots.filter((s) => s.gameId === g.id && s.committingTeamId === app.teamId && s.result === "goal").length;
  }
  return { gp, w, l, otl, ga, gaa: gp ? Math.round((ga / gp) * 100) / 100 : 0 };
}

export function headToHead(games: FinalGame[], teamA: string, teamB: string): FinalGame[] {
  return games
    .filter(
      (g) =>
        (g.homeTeamId === teamA && g.awayTeamId === teamB) ||
        (g.homeTeamId === teamB && g.awayTeamId === teamA),
    )
    .sort((x, y) => y.scheduledAt.localeCompare(x.scheduledAt));
}
```

- [ ] **Step 4: Run tests** — `bun test lib` → all pass.

- [ ] **Step 5: Commit**

```bash
bunx tsc --noEmit
git add lib/matchup.ts lib/matchup.test.ts
git commit -m "feat(matchup): season helpers for write-up context"
```

---

### Task 2: Load season context and add it to the model input

**Files:**
- Modify: `lib/write-ups/data.ts` (`loadPreviewSource`, `loadRecapSource`)
- Modify: `lib/write-ups/prompt.ts` (types, builders, `SYSTEM_PROMPT`)
- Test: `lib/write-ups/prompt.test.ts`

**Interfaces:**
- Consumes (Task 1): `standingsPlace`, `seasonPlayerTotals`, `goalieSeasonRecord`, `headToHead`, `SeasonGoal`, `SeasonShot`, `SeasonAppearance`, `PlayerTotals`, `GoalieRecord`. Existing: `resolvePosition` (`lib/box-score.ts`), `getStandings`, the `must()` error wrapper in `data.ts`.
- Produces (new fields; existing fields unchanged except preview `top_scorers` → `season_leaders`):
  - `PreviewTeam` gains `standing: { place: number; of: number } | null`, `seasonLeaders: { name: string; goals: number; assists: number; points: number; leagueRankPoints: number | null; leagueRankGoals: number | null }[]` (top 3 by points, then goals, then name), `goalieSeason: ({ name: string } & GoalieRecord) | null` (the expected goalie: the rostered goalie unless marked out, else the first lined-up sub goalie, else null — the same rule as `availableGoalie`).
  - `PreviewSource` gains `headToHead: { playedOn: string; home: string; away: string; homeScore: number; awayScore: number; decidedIn: string | null }[]` (earlier meetings, newest first; `playedOn` is an ISO timestamp, formatted in the builder).
  - `RecapTeam` gains `standingAfter: { place: number; of: number } | null`, `goaliesSeasonAfter: ({ name: string } & GoalieRecord)[]` (this game's goalie(s) for that team).
  - `RecapSource` gains `seasonTotalsAfter: { name: string; team: string; goals: number; assists: number; points: number; leagueRankPoints: number | null; leagueRankGoals: number | null }[]` (everyone who scored or assisted in this game, sorted by name) and `headToHead` (same shape as the preview's, this game included).

- [ ] **Step 1: Write failing prompt tests** — in `lib/write-ups/prompt.test.ts`, extend the existing preview/recap fixtures with the new source fields and assert the emitted JSON:
  - preview: `home_team.standing` → `{ place: 2, of: 6 }`; `home_team.season_leaders[0]` → `{ name, goals, assists, points, league_rank_points, league_rank_goals }`; `home_team.goalie_season` → `{ name, gp, w, l, otl, ga, gaa }`; `head_to_head_this_season[0]` → `{ played_on: "Sunday, March 15", result: "Iron Ravens 3, Frost Giants 2 (OT)" }`; when the source list is empty, `head_to_head_this_season` is `[]`; `top_scorers` is absent.
  - recap: `standing_after` per team under `teams[<name>]` or the existing per-team structure (match the shape already used for `lineups`/`records_after`: keyed by team name), `goalies_season_after` keyed by team name, `season_totals_after` as an array of `{ name, team, goals, assists, points, league_rank_points, league_rank_goals }`, and `head_to_head_this_season`.
  - `SYSTEM_PROMPT` contains the four new rules (assert on `"only exactly as given"`, `"league_rank"`, `"movement in the standings"`, `"first meeting"`).

- [ ] **Step 2: Run** `bun test lib/write-ups/prompt.test.ts` → FAIL.

- [ ] **Step 3: Implement the builders** in `prompt.ts`:
  - Map the new source fields to the snake_case fields above. `head_to_head_this_season` entries: `{ played_on: leagueDate(playedOn), result: "<home> <hs>, <away> <as>" + (decidedIn === "ot" ? " (OT)" : decidedIn === "shootout" ? " (SO)" : "") }`.
  - Replace `top_scorers` with `season_leaders` in `previewTeam`.
  - Append to `SYSTEM_PROMPT`'s rules:

```
- Season numbers (totals, league ranks, standings places, goalie records, head-to-head) may be cited only exactly as given.
- Say "league-leading" or "leads the league" only when a league_rank_* is 1; if two players share rank 1, say "tied for the league lead".
- Never describe movement in the standings ("climbs into first", "drops to third"): you are given a place, not a change.
- Head-to-head: use only head_to_head_this_season; if it is empty, this is the teams' first meeting this season.
```

- [ ] **Step 4: Load the data** in `data.ts` (wrap every new query in `must(...)`; keep regular-season-finals scoping):
  - **Preview:** the existing season goals query also selects `game_id`; add a season penalty-shot query (`game_events` with `type = 'penalty'`, `penalty_shot_result is not null`, `team_id`, `game_id`, joined `game:game_id!inner(season_id, status, kind)` with the same filters) and a season appearances query (`game_appearances` with `game_id, player_id, team_id, position`, joined `game:game_id!inner(season_id, status, kind)`, same filters). Build `SeasonGoal[]`, `SeasonShot[]`, `SeasonAppearance[]` (appearance position via `resolvePosition(app.position, undefined, rosterPosition)`).
    - `standing`: `standingsPlace(standings, teamId)`.
    - `seasonLeaders`: from `seasonPlayerTotals(goals)` limited to players rostered on that team this season, top 3 by points → goals → name.
    - `goalieSeason`: the expected goalie's name + `goalieSeasonRecord(...)`; null if no expected goalie.
    - `headToHead`: `headToHead(finals, home, away)` mapped to the source shape.
  - **Recap:** load the same season goals/shots/appearances (this game is final, so it's included). `standingAfter` via `standingsPlace`; `goaliesSeasonAfter` for each goalie in this game's lineup; `seasonTotalsAfter` for every scorer/assister in this game (team = the team they played for in this game); `headToHead` including this game.

- [ ] **Step 5: Run** `bun test lib`, `bunx tsc --noEmit`, `bun run lint` (only the 2 pre-existing warnings).

- [ ] **Step 6: Commit**

```bash
git add lib/write-ups/data.ts lib/write-ups/prompt.ts lib/write-ups/prompt.test.ts
git commit -m "feat(write-ups): standings, leaders, goalie records and head-to-head in AI input"
```

---

### Task 3: Verify with real generations, then docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-06-game-preview-and-write-ups-design.md` (input contract lines) and `docs/DEVELOPMENT.md` (one line in the AI write-ups section)

- [ ] **Step 1: Local real generation (2 model calls, ~$0.0005)**
  - On the local stack (dev server at http://127.0.0.1:3001; Postgres `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), pick the next scheduled game with both teams and the latest final game.
  - Add a TEMPORARY route `app/api/dev/season-check/route.ts` that returns `{ previewInput, recapInput }` (built with `loadPreviewSource`/`loadRecapSource` + the builders, service client) and, on `?generate=1`, calls `generateAndStore("preview", id, { replace: true })` and `generateAndStore("recap", id, { replace: true })`.
  - Fact-check every season claim in both generated texts against independent SQL: standings place vs `/standings`; leaders' G/A/PTS and league ranks; scorers' season totals after the game; goalie GP/W/L/OTL/GA/GAA; head-to-head results. Any unsupported claim → fix the prompt/input and add a test before continuing.
  - **Delete the temp route**; confirm with `git status`.
- [ ] **Step 2: Docs** — update the input-contract bullets in the write-ups spec to list the new fields, and add to `docs/DEVELOPMENT.md`'s AI write-ups section: "Inputs include each team's standings place, top-3 season points leaders with league ranks, the expected goalie's season record, head-to-head this season, and (recaps) every scorer's season totals after the game."
- [ ] **Step 3: All checks** — `bun run test && bunx tsc --noEmit && bun run lint && bun run build`.
- [ ] **Step 4: Commit** — `git commit -m "docs: season context in AI write-up inputs"` (docs only).
