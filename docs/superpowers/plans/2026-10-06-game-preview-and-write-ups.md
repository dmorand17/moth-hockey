# Game Preview, Matchup Analyzer & AI Write-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship #19 — a live matchup preview panel on scheduled games, plus AI-written previews (daily cron) and recaps (on finalize), editable/hideable by admins.

**Architecture:** Pure stats in `lib/matchup.ts` feed both the panel and the model input. `lib/write-ups/*` shapes inputs, calls OpenRouter, validates, and stores rows in `game_write_ups` through a server-only service-role client. A Vercel Cron route generates previews and back-fills recaps; `finalizeGame` schedules the recap with `after()`.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + RLS), Tailwind v4, Bun (`bun test` for pure modules), OpenRouter chat completions via `fetch`.

**Spec:** `docs/superpowers/specs/2026-10-06-game-preview-and-write-ups-design.md`

## Global Constraints

- Default model `openai/gpt-6-luna` with `reasoning: { effort: "low" }`; fallback `google/gemini-2.5-flash-lite`. Both read from env (`WRITE_UP_MODEL`, `WRITE_UP_FALLBACK_MODEL`).
- Write-ups are 120–160 words: headline line, blank line, plain prose. Stored output must be 60–250 words or it is rejected.
- Never overwrite an existing write-up: inserts use `on conflict (game_id, kind) do nothing`.
- Previews: games starting within the next **36 hours**. Recaps: final games from the last **7 days**. Cron schedule `0 18 * * *` (UTC).
- Projections need ≥ **2** games played per team; otherwise omitted.
- Absent players are named only if they're a team's top scorer or rostered goalie (enforced in the data, not just the prompt).
- `SUPABASE_SECRET_KEY` is server-only: never `NEXT_PUBLIC_`, only imported from files that `import "server-only"`.
- League timezone **`America/New_York`** (assumption — confirm with the user before Task 6 ships; nothing in the codebase defines one).
- Migration number is **`0023`** (`0021`/`0022` were taken by #120/#121).
- Package manager is bun: `bun add`, `bunx`. Preserve `trustedDependencies` / `ignoreScripts` in `package.json`.

## Branching

Work on `feat/game-write-ups`, already rebased onto `staging` (which includes #120's start-game fix and #121's `game_subs`). Open the PR against `staging`.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/local/seed-sample.ts` (modify) | Unique names, real OT goals, a few subs |
| `lib/matchup.ts` (create) | Pure stats: form, scorers, projection, key matchup, rosters, lineups |
| `lib/matchup.test.ts` (create) | `bun test` for the above |
| `supabase/migrations/0023_game_write_ups.sql` (create) | Table, enum, RLS |
| `lib/supabase/service.ts` (create) | Server-only service-role client |
| `lib/write-ups/prompt.ts` (create) | System prompt + pure input builders |
| `lib/write-ups/parse.ts` (create) | Headline/body split + validation |
| `lib/write-ups/*.test.ts` (create) | `bun test` for prompt builders + parser |
| `lib/write-ups/data.ts` (create) | Supabase queries that load builder inputs |
| `lib/write-ups/openrouter.ts` (create) | One model call, with fallback |
| `lib/write-ups/generate.ts` (create) | Load → build → call → parse → insert |
| `app/api/cron/write-ups/route.ts` (create) | Cron entry point |
| `vercel.json` (create) | Cron schedule |
| `app/score/[gameId]/actions.ts` (modify) | `after()` recap on finalize |
| `components/MatchupPanel.tsx` (create) | Preview panel UI |
| `components/WriteUpCard.tsx` (create) | Write-up display + admin controls |
| `app/games/[id]/write-up-actions.ts` (create) | Admin edit / hide / regenerate |
| `app/games/[id]/page.tsx` (modify) | Render panel + write-ups |
| `docs/DATABASE.md`, `.env.local.example`, `CLAUDE.md` (modify) | Docs + env + test command |

---
### Task 1: Fix the sample seed (names, OT goals, subs)

Prerequisite from the spec: recaps generated from today's seed are nonsense.

**Files:**
- Modify: `scripts/local/seed-sample.ts` (player name generation; the played-game goal loop)

**Interfaces:**
- Consumes: nothing.
- Produces: a local dataset where every current-season player name is unique, every `decided_in = 'ot'` game has exactly one period-4 goal (scored by the winner) and is tied after regulation, and roughly every 4th final game has one `is_sub` appearance.

- [ ] **Step 1: Write the failing checks**

Create `scripts/local/check-seed.sql`:

```sql
-- Each query must return 0 rows/0 for a healthy seed.
select 'duplicate names' as problem, first_name || ' ' || last_name as detail
from players p join team_players tp on tp.player_id = p.id
join seasons s on s.id = tp.season_id and s.is_current
group by 2 having count(*) > 1;

select 'ot game without exactly one P4 goal' as problem, g.id::text as detail
from games g
where g.status = 'final' and g.decided_in = 'ot'
  and (select count(*) from game_events e where e.game_id = g.id and e.type = 'goal' and e.period = 4) <> 1;

select 'no subs in seed' as problem, '' as detail
where not exists (select 1 from game_appearances where is_sub);
```

- [ ] **Step 2: Run it against the current seed to see it fail**

```bash
scripts/local/seed-sample.sh 5
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -f scripts/local/check-seed.sql
```

Expected: rows for `duplicate names`, `ot game without exactly one P4 goal`, and `no subs in seed`.

- [ ] **Step 3: Make names unique**

In `scripts/local/seed-sample.ts`, change the `last:` line inside the roster loop:

```ts
      first: FIRST[nameIdx % FIRST.length],
      // Shift the last-name cycle each time first names wrap, so (first, last)
      // pairs stay unique. 5 is coprime with 24, so 24×24 players before repeats.
      last: LAST[(Math.floor(nameIdx / FIRST.length) * 5 + nameIdx * 7 + 3) % LAST.length],
```

- [ ] **Step 4: Put the OT winner in period 4, and add subs**

Replace the per-team goal loop (the `for (const [teamId, goals] of [[home, hs], [away, as]] as const)` block) with:

```ts
  const winnerId = homeWins ? home : away;
  // Roughly every 4th played game, one skater from a team not in this game
  // subs for the home side and scores that side's first goal.
  const others = teams.filter((t) => t.id !== home && t.id !== away);
  const sub = i % 4 === 0 && others.length ? pick(rosterByTeam.get(pick(others).id)!.skaters) : null;

  for (const [teamId, goals] of [[home, hs], [away, as]] as const) {
    const roster = rosterByTeam.get(teamId)!;
    for (const p of roster.all) {
      appearances.push(`(${q(id)}, ${q(p.id)}, ${q(teamId)}, false)`);
    }
    if (sub && teamId === home) {
      appearances.push(`(${q(id)}, ${q(sub.id)}, ${q(teamId)}, true)`);
    }
    for (let g = 0; g < goals; g++) {
      const scorer = sub && teamId === home && g === 0 ? sub : pick(roster.skaters);
      const others2 = roster.skaters.filter((s) => s.id !== scorer.id);
      const a1 = Math.random() < 0.7 && others2.length ? pick(others2) : null;
      const a2 = a1 && Math.random() < 0.35
        ? pick(others2.filter((s) => s.id !== a1.id)) : null;
      // In an OT game the winner's last goal is the OT winner; everything else
      // is regulation, which leaves regulation tied (loser = winner − 1).
      const isOtWinner = ot && teamId === winnerId && g === goals - 1;
      const period = isOtWinner ? 4 : 1 + ri(3);
      const clock = isOtWinner ? ri(300) : ri(1200);
      events.push(
        `(${q(id)}, ${period}, ${clock}, 'goal', ${q(teamId)}, ${q(scorer.id)}, ${a1 ? q(a1.id) : "NULL"}, ${a2 ? q(a2.id) : "NULL"})`,
      );
    }
  }
```

- [ ] **Step 5: Reseed and confirm the checks pass**

```bash
scripts/local/seed-sample.sh 5
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -f scripts/local/check-seed.sql
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add scripts/local/seed-sample.ts scripts/local/check-seed.sql
git commit -m "fix(seed): unique names, real OT goals, sample subs"
```

---
### Task 2: Pure stats module `lib/matchup.ts`

**Files:**
- Create: `lib/matchup.ts`
- Test: `lib/matchup.test.ts`
- Modify: `package.json` (add `"test": "bun test lib"` to `scripts`)

**Interfaces:**
- Consumes: `StandingsRow` type from `lib/queries.ts` (type-only import; `gp`, `w`, `l`, `otl`, `pts`, `gf`, `ga`).
- Produces (all exported from `lib/matchup.ts`):
  - types `Position`, `DecidedIn`, `FinalGame`, `GoalEvent`, `RosterEntry`, `LineupEntry`, `TeamForm`, `Scorer`, `Projection`, `KeyMatchup`, `ProjectedRoster`, `Lineup`
  - `MIN_GAMES_FOR_PROJECTION = 2`
  - `teamForm(standing: StandingsRow, games: FinalGame[], teamId: string, teamName: (id: string) => string): TeamForm`
  - `topScorers(goals: GoalEvent[], teamId: string, nameOf: (playerId: string) => string, n?: number): Scorer[]`
  - `moneyline(p: number): string`
  - `projectMatchup(home: TeamForm, away: TeamForm): Projection | null`
  - `keyMatchup(home: TeamSide, away: TeamSide): KeyMatchup | null` where `TeamSide = { team: string; topScorer: Scorer | null; goalie: string | null; form: TeamForm }`
  - `projectedRoster(roster: RosterEntry[], status: Map<string, "in" | "out">, subs: { name: string; position: Position }[], keyPlayerIds: Set<string>): ProjectedRoster`
  - `gameLineup(entries: LineupEntry[]): Lineup`

`bun test` is built into Bun (no new dependency). This adds the repo's first test command.

- [ ] **Step 1: Add the test script**

In `package.json` `scripts`, after `"lint": "eslint"`:

```json
    "lint": "eslint",
    "test": "bun test lib"
```

- [ ] **Step 2: Write the failing tests**

Create `lib/matchup.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { StandingsRow } from "@/lib/queries";
import {
  gameLineup,
  keyMatchup,
  moneyline,
  projectMatchup,
  projectedRoster,
  teamForm,
  topScorers,
  type FinalGame,
  type GoalEvent,
  type TeamForm,
} from "@/lib/matchup";

const names: Record<string, string> = { R: "Iron Ravens", W: "Ember Wolves", V: "Green Vipers", F: "Frost Giants" };
const teamName = (id: string) => names[id] ?? id;

const row = (o: Partial<StandingsRow>): StandingsRow => ({
  team_id: "R", name: "Iron Ravens", slug: "iron-ravens", color: "#999",
  gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, diff: 0, ...o,
});

const game = (o: Partial<FinalGame>): FinalGame => ({
  id: crypto.randomUUID(), scheduledAt: "2026-03-01T23:00:00Z",
  homeTeamId: "R", awayTeamId: "W", homeScore: 0, awayScore: 0, decidedIn: "regulation", ...o,
});

const form = (gp: number, gf: number, ga: number): TeamForm => ({
  gp, record: "", points: 0, goalsFor: gf, goalsAgainst: ga,
  gfPerGame: gp ? gf / gp : 0, gaPerGame: gp ? ga / gp : 0, lastThreeMostRecentFirst: [],
});

describe("teamForm", () => {
  const games = [
    game({ scheduledAt: "2026-03-01T23:00:00Z", homeTeamId: "F", awayTeamId: "R", homeScore: 3, awayScore: 1 }),
    game({ scheduledAt: "2026-03-08T23:00:00Z", homeTeamId: "V", awayTeamId: "R", homeScore: 3, awayScore: 0 }),
    game({ scheduledAt: "2026-03-15T23:00:00Z", homeTeamId: "R", awayTeamId: "V", homeScore: 2, awayScore: 3, decidedIn: "ot" }),
    game({ scheduledAt: "2026-03-22T23:00:00Z", homeTeamId: "R", awayTeamId: "W", homeScore: 4, awayScore: 3 }),
    game({ scheduledAt: "2026-03-22T23:00:00Z", homeTeamId: "F", awayTeamId: "W", homeScore: 9, awayScore: 0 }),
  ];
  const f = teamForm(row({ gp: 4, w: 1, l: 2, otl: 1, pts: 4, gf: 7, ga: 12 }), games, "R", teamName);

  test("record and points come from the standings row", () => {
    expect(f.record).toBe("1-2-1");
    expect(f.points).toBe(4);
    expect(f.gfPerGame).toBe(1.75);
    expect(f.gaPerGame).toBe(3);
  });

  test("last three are most recent first, with OT marked, ignoring other teams' games", () => {
    expect(f.lastThreeMostRecentFirst).toEqual([
      "W 4-3 vs Ember Wolves",
      "OTL 2-3 vs Green Vipers (OT)",
      "L 0-3 vs Green Vipers",
    ]);
  });

  test("zero games played gives zero rates, not NaN", () => {
    const empty = teamForm(row({}), [], "R", teamName);
    expect(empty.gfPerGame).toBe(0);
    expect(empty.lastThreeMostRecentFirst).toEqual([]);
  });
});

describe("topScorers", () => {
  const goals: GoalEvent[] = [
    { teamId: "R", playerId: "a", period: 1, clockSeconds: 100, assist1Id: null, assist2Id: null },
    { teamId: "R", playerId: "b", period: 1, clockSeconds: 90, assist1Id: null, assist2Id: null },
    { teamId: "R", playerId: "a", period: 2, clockSeconds: 80, assist1Id: null, assist2Id: null },
    { teamId: "W", playerId: "z", period: 2, clockSeconds: 70, assist1Id: null, assist2Id: null },
    { teamId: "R", playerId: "c", period: 3, clockSeconds: 60, assist1Id: null, assist2Id: null },
  ];
  const nameOf = (id: string) => ({ a: "Marlow Fenn", b: "Frankie Byrne", c: "Alex Boyd", z: "Quinn Cross" })[id] ?? id;

  test("counts only that team's goals, most first, ties by name", () => {
    expect(topScorers(goals, "R", nameOf)).toEqual([
      { playerId: "a", name: "Marlow Fenn", goals: 2 },
      { playerId: "c", name: "Alex Boyd", goals: 1 },
    ]);
  });
});

describe("moneyline", () => {
  test("favorite is negative, underdog positive, even is -100", () => {
    expect(moneyline(0.515)).toBe("-106");
    expect(moneyline(0.485)).toBe("+106");
    expect(moneyline(0.5)).toBe("-100");
    expect(moneyline(0.75)).toBe("-300");
  });
});

describe("projectMatchup", () => {
  test("Poisson projection matches the bake-off inputs", () => {
    const p = projectMatchup(form(6, 14, 17), form(6, 12, 16))!;
    expect(p.expectedGoalsHome).toBeCloseTo(2.5, 2);
    expect(p.expectedGoalsAway).toBeCloseTo(2.42, 2);
    expect(p.overUnderLine).toBe(4.5);
    expect(p.winProbabilityHome + p.winProbabilityAway).toBeCloseTo(1, 6);
    expect(p.winProbabilityHome).toBeGreaterThan(0.5);
    expect(p.moneylineHome.startsWith("-")).toBe(true);
  });

  test("omitted below the minimum sample", () => {
    expect(projectMatchup(form(1, 3, 1), form(6, 12, 16))).toBeNull();
  });
});

describe("keyMatchup", () => {
  test("the bigger top scorer faces the other side's goalie", () => {
    const k = keyMatchup(
      { team: "Iron Ravens", topScorer: { playerId: "a", name: "Marlow Fenn", goals: 4 }, goalie: "Jordan Shaw", form: form(6, 14, 17) },
      { team: "Crimson Bears", topScorer: { playerId: "d", name: "Cameron Dolan", goals: 3 }, goalie: "Harper Judd", form: form(6, 12, 16) },
    );
    expect(k).toEqual({
      scorer: { name: "Marlow Fenn", team: "Iron Ravens", goals: 4 },
      goalie: { name: "Harper Judd", team: "Crimson Bears", teamGaPerGame: 16 / 6 },
    });
  });

  test("null when a side has no goalie or no scorer", () => {
    expect(keyMatchup(
      { team: "A", topScorer: null, goalie: "G1", form: form(2, 2, 2) },
      { team: "B", topScorer: null, goalie: "G2", form: form(2, 2, 2) },
    )).toBeNull();
  });
});

describe("projectedRoster", () => {
  const roster = [
    { playerId: "a", name: "Marlow Fenn", teamId: "R", position: "forward" as const },
    { playerId: "b", name: "Frankie Byrne", teamId: "R", position: "forward" as const },
    { playerId: "g", name: "Jordan Shaw", teamId: "R", position: "goalie" as const },
    { playerId: "c", name: "Alex Boyd", teamId: "R", position: "defense" as const },
  ];

  test("names only key players who are out; counts the rest", () => {
    const status = new Map<string, "in" | "out">([["a", "out"], ["b", "out"], ["c", "in"]]);
    const r = projectedRoster(roster, status, [{ name: "Kai Hale", position: "forward" }], new Set(["a", "g"]));
    expect(r).toEqual({
      rosterSize: 4,
      inCount: 1,
      outCount: 2,
      outKeyPlayers: ["Marlow Fenn"],
      noResponseCount: 1,
      rosteredGoalie: "Jordan Shaw",
      subsLinedUp: [{ name: "Kai Hale", position: "forward" }],
    });
  });
});

describe("gameLineup", () => {
  test("counts skaters, finds the goalie, lists subs", () => {
    expect(gameLineup([
      { name: "A", position: "forward", isSub: false },
      { name: "B", position: "defense", isSub: false },
      { name: "Kai Hale", position: "forward", isSub: true },
      { name: "Jordan Shaw", position: "goalie", isSub: false },
    ])).toEqual({ skatersDressed: 3, goalie: "Jordan Shaw", subs: ["Kai Hale"] });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test lib/matchup.test.ts`
Expected: FAIL — `Cannot find module '@/lib/matchup'`.

- [ ] **Step 4: Implement `lib/matchup.ts`**

```ts
// Pure matchup statistics. No database access here: the game page and the
// write-up generator both load rows, then call these. Keep it that way so the
// numbers can be checked against fixed inputs with `bun test`.
import type { StandingsRow } from "@/lib/queries";

export type Position = "forward" | "defense" | "goalie";
export type DecidedIn = "regulation" | "ot" | "shootout";

export type FinalGame = {
  id: string;
  scheduledAt: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  decidedIn: DecidedIn | null;
};

export type GoalEvent = {
  teamId: string;
  playerId: string;
  period: number;
  clockSeconds: number;
  assist1Id: string | null;
  assist2Id: string | null;
};

export type RosterEntry = { playerId: string; name: string; teamId: string; position: Position };
export type LineupEntry = { name: string; position: Position; isSub: boolean };

export type TeamForm = {
  gp: number;
  record: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  gfPerGame: number;
  gaPerGame: number;
  // Explicit ordering in the name: the bake-off showed models misread an
  // unlabeled list as oldest-first.
  lastThreeMostRecentFirst: string[];
};

export type Scorer = { playerId: string; name: string; goals: number };

export type Projection = {
  expectedGoalsHome: number;
  expectedGoalsAway: number;
  overUnderLine: number;
  winProbabilityHome: number;
  winProbabilityAway: number;
  moneylineHome: string;
  moneylineAway: string;
};

export type TeamSide = { team: string; topScorer: Scorer | null; goalie: string | null; form: TeamForm };

export type KeyMatchup = {
  scorer: { name: string; team: string; goals: number };
  goalie: { name: string; team: string; teamGaPerGame: number };
};

export type ProjectedRoster = {
  rosterSize: number;
  inCount: number;
  outCount: number;
  // Only top scorers / the goalie are named when out; everyone else is a count.
  outKeyPlayers: string[];
  noResponseCount: number;
  rosteredGoalie: string | null;
  subsLinedUp: { name: string; position: Position }[];
};

export type Lineup = { skatersDressed: number; goalie: string | null; subs: string[] };

export const MIN_GAMES_FOR_PROJECTION = 2;

export function teamForm(
  standing: StandingsRow,
  games: FinalGame[],
  teamId: string,
  teamName: (id: string) => string,
): TeamForm {
  const mine = games
    .filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .slice(0, 3);

  const lastThree = mine.map((g) => {
    const home = g.homeTeamId === teamId;
    const gf = home ? g.homeScore : g.awayScore;
    const ga = home ? g.awayScore : g.homeScore;
    const extra = g.decidedIn === "ot" || g.decidedIn === "shootout";
    const result = gf > ga ? "W" : extra ? "OTL" : "L";
    const suffix = extra ? ` (${g.decidedIn === "ot" ? "OT" : "SO"})` : "";
    return `${result} ${gf}-${ga} vs ${teamName(home ? g.awayTeamId : g.homeTeamId)}${suffix}`;
  });

  return {
    gp: standing.gp,
    record: `${standing.w}-${standing.l}-${standing.otl}`,
    points: standing.pts,
    goalsFor: standing.gf,
    goalsAgainst: standing.ga,
    gfPerGame: standing.gp ? standing.gf / standing.gp : 0,
    gaPerGame: standing.gp ? standing.ga / standing.gp : 0,
    lastThreeMostRecentFirst: lastThree,
  };
}

export function topScorers(
  goals: GoalEvent[],
  teamId: string,
  nameOf: (playerId: string) => string,
  n = 2,
): Scorer[] {
  const counts = new Map<string, number>();
  for (const g of goals) {
    if (g.teamId !== teamId) continue;
    counts.set(g.playerId, (counts.get(g.playerId) ?? 0) + 1);
  }
  return [...counts]
    .map(([playerId, count]) => ({ playerId, name: nameOf(playerId), goals: count }))
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function moneyline(p: number): string {
  if (p >= 0.5) return `-${Math.round((100 * p) / (1 - p))}`;
  return `+${Math.round((100 * (1 - p)) / p)}`;
}

function poisson(lambda: number, k: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / f;
}

export function projectMatchup(home: TeamForm, away: TeamForm): Projection | null {
  if (home.gp < MIN_GAMES_FOR_PROJECTION || away.gp < MIN_GAMES_FOR_PROJECTION) return null;
  // Each side's expected goals blend its own scoring rate with the other
  // side's conceding rate.
  const lamH = (home.gfPerGame + away.gaPerGame) / 2;
  const lamA = (away.gfPerGame + home.gaPerGame) / 2;

  let pHome = 0;
  let pAway = 0;
  let pTie = 0;
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 15; j++) {
      const p = poisson(lamH, i) * poisson(lamA, j);
      if (i > j) pHome += p;
      else if (j > i) pAway += p;
      else pTie += p;
    }
  }
  // Regulation ties go to OT/shootout; call that a coin flip. Normalize so the
  // two probabilities sum to exactly 1 despite the truncated grid.
  const total = pHome + pAway + pTie;
  const winHome = (pHome + pTie / 2) / total;
  const winAway = 1 - winHome;

  return {
    expectedGoalsHome: Math.round(lamH * 100) / 100,
    expectedGoalsAway: Math.round(lamA * 100) / 100,
    overUnderLine: Math.floor(lamH + lamA) + 0.5,
    winProbabilityHome: winHome,
    winProbabilityAway: winAway,
    moneylineHome: moneyline(winHome),
    moneylineAway: moneyline(winAway),
  };
}

export function keyMatchup(home: TeamSide, away: TeamSide): KeyMatchup | null {
  // The stronger of the two top scorers takes on the other team's goalie;
  // ties go to the home side.
  const homeGoals = home.topScorer?.goals ?? -1;
  const awayGoals = away.topScorer?.goals ?? -1;
  const [attack, defend] = homeGoals >= awayGoals ? [home, away] : [away, home];
  if (!attack.topScorer || !defend.goalie) return null;
  return {
    scorer: { name: attack.topScorer.name, team: attack.team, goals: attack.topScorer.goals },
    goalie: { name: defend.goalie, team: defend.team, teamGaPerGame: defend.form.gaPerGame },
  };
}

export function projectedRoster(
  roster: RosterEntry[],
  status: Map<string, "in" | "out">,
  subs: { name: string; position: Position }[],
  keyPlayerIds: Set<string>,
): ProjectedRoster {
  let inCount = 0;
  let outCount = 0;
  const outKeyPlayers: string[] = [];
  for (const p of roster) {
    const s = status.get(p.playerId);
    if (s === "in") inCount++;
    else if (s === "out") {
      outCount++;
      if (keyPlayerIds.has(p.playerId)) outKeyPlayers.push(p.name);
    }
  }
  return {
    rosterSize: roster.length,
    inCount,
    outCount,
    outKeyPlayers,
    noResponseCount: roster.length - inCount - outCount,
    rosteredGoalie: roster.find((p) => p.position === "goalie")?.name ?? null,
    subsLinedUp: subs,
  };
}

export function gameLineup(entries: LineupEntry[]): Lineup {
  return {
    skatersDressed: entries.filter((e) => e.position !== "goalie").length,
    goalie: entries.find((e) => e.position === "goalie")?.name ?? null,
    subs: entries.filter((e) => e.isSub).map((e) => e.name),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test lib/matchup.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
bunx tsc --noEmit
git add lib/matchup.ts lib/matchup.test.ts package.json
git commit -m "feat(matchup): pure stats for game previews"
```

---
### Task 3: `game_write_ups` table + service-role client

**Files:**
- Create: `supabase/migrations/0023_game_write_ups.sql`
- Create: `lib/supabase/service.ts`
- Modify: `lib/supabase/database.types.ts` (regenerated)
- Modify: `package.json` / `bun.lock` (add `server-only`)
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: `public.is_admin()` (0001).
- Produces:
  - table `game_write_ups (game_id, kind, headline, body, model, generated_at, edited_at, edited_by, hidden)`, PK `(game_id, kind)`; enum `write_up_kind ('preview','recap')`
  - `createSupabaseServiceClient(): SupabaseClient<Database>` from `lib/supabase/service.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0023_game_write_ups.sql`:

```sql
-- AI-generated game previews and recaps (#19). One row per (game, kind).
-- Rows are written by the server with the service role (cron + finalize);
-- admins edit or hide them through the app.

create type write_up_kind as enum ('preview', 'recap');

create table game_write_ups (
  game_id      uuid not null references games(id) on delete cascade,
  kind         write_up_kind not null,
  headline     text not null,
  body         text not null,
  model        text not null,
  generated_at timestamptz not null default now(),
  edited_at    timestamptz,
  edited_by    uuid references auth.users(id) on delete set null,
  hidden       boolean not null default false,
  primary key (game_id, kind)
);

alter table game_write_ups enable row level security;

create policy "public read visible write-ups" on game_write_ups for select
  using (not hidden or public.is_admin());

create policy "admins manage write-ups" on game_write_ups for all
  using (public.is_admin())
  with check (public.is_admin());
```

- [ ] **Step 2: Apply it and verify the policies**

```bash
bunx supabase migration up --local
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -c \
  "select policyname from pg_policies where tablename = 'game_write_ups' order by 1"
```

Expected:
```
admins manage write-ups
public read visible write-ups
```

- [ ] **Step 3: Verify a hidden row is invisible to anonymous readers**

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres <<'SQL'
begin;
insert into game_write_ups (game_id, kind, headline, body, model, hidden)
select id, 'preview', 'h', 'b', 'test', true from games limit 1;
set local role anon;
select count(*) as visible_to_anon from game_write_ups;
rollback;
SQL
```

Expected: `visible_to_anon` is `0`.

- [ ] **Step 4: Regenerate types**

```bash
bunx supabase gen types typescript --local > lib/supabase/database.types.ts
grep -c "game_write_ups\|write_up_kind" lib/supabase/database.types.ts
```

Expected: a count of at least 3.

- [ ] **Step 5: Add `server-only` and the service client**

```bash
bun add server-only
```

Confirm `package.json` still has the `trustedDependencies` and `ignoreScripts` arrays unchanged.

Create `lib/supabase/service.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Service-role client: bypasses RLS. Only for server jobs with no user session
// (the write-ups cron and the after-finalize recap). Never import this from a
// client component — `server-only` turns that into a build error.
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 6: Document the env vars**

Append to `.env.local.example`:

```bash
# Server-only. Service-role key for background jobs (write-up cron). From
# `supabase status` → "Secret" locally. Never prefix with NEXT_PUBLIC_.
SUPABASE_SECRET_KEY=""

# AI game write-ups (#19) via OpenRouter.
OPENROUTER_API_KEY=""
WRITE_UP_MODEL="openai/gpt-6-luna"
WRITE_UP_FALLBACK_MODEL="google/gemini-2.5-flash-lite"

# Vercel attaches this to cron requests as `Authorization: Bearer ...`.
CRON_SECRET=""
```

Then set `SUPABASE_SECRET_KEY`, `WRITE_UP_MODEL`, `WRITE_UP_FALLBACK_MODEL` and a random `CRON_SECRET` (`openssl rand -hex 32`) in your own `.env.local`. **Do not commit `.env.local`.**

- [ ] **Step 7: Typecheck and commit**

```bash
bunx tsc --noEmit
git add supabase/migrations/0023_game_write_ups.sql lib/supabase/service.ts lib/supabase/database.types.ts package.json bun.lock .env.local.example
git commit -m "feat(write-ups): game_write_ups table and service-role client"
```

---
### Task 4: Prompt builders and output parser

**Files:**
- Create: `lib/write-ups/prompt.ts`
- Create: `lib/write-ups/parse.ts`
- Test: `lib/write-ups/prompt.test.ts`, `lib/write-ups/parse.test.ts`

**Interfaces:**
- Consumes (Task 2): `TeamForm`, `Scorer`, `ProjectedRoster`, `Projection`, `KeyMatchup`, `Lineup` from `@/lib/matchup`.
- Produces:
  - `LEAGUE_TIME_ZONE = "America/New_York"`, `SYSTEM_PROMPT: string`
  - types `WriteUpKind = "preview" | "recap"`, `PreviewSource`, `PreviewTeam`, `RecapSource`, `RecapTeam`, `RecapGoal`, `RecapPenalty`
  - `buildPreviewInput(src: PreviewSource): Record<string, unknown>`
  - `buildRecapInput(src: RecapSource): Record<string, unknown>`
  - `userMessage(kind: WriteUpKind, input: Record<string, unknown>): string`
  - `parseWriteUp(text: string): { ok: true; headline: string; body: string } | { ok: false; reason: string }`

- [ ] **Step 1: Write the failing parser tests**

Create `lib/write-ups/parse.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseWriteUp } from "@/lib/write-ups/parse";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("parseWriteUp", () => {
  test("first line is the headline, the rest is the body", () => {
    const r = parseWriteUp(`Ravens Rally Late\n\n${words(130)}`);
    expect(r).toEqual({ ok: true, headline: "Ravens Rally Late", body: words(130) });
  });

  test("strips markdown and quotes from the headline", () => {
    const r = parseWriteUp(`## **"Ravens Rally Late"**\n\n${words(130)}`);
    expect(r.ok && r.headline).toBe("Ravens Rally Late");
  });

  test("strips a 'Headline:' label and bold markers in the body", () => {
    const r = parseWriteUp(`Headline: Big Night\n\nThe **Ravens** won. ${words(120)}`);
    expect(r.ok && r.headline).toBe("Big Night");
    expect(r.ok && r.body.startsWith("The Ravens won.")).toBe(true);
  });

  test("keeps paragraph breaks, collapses extra blank lines", () => {
    const r = parseWriteUp(`H\n\n${words(70)}\n\n\n\n${words(70)}`);
    expect(r.ok && r.body).toBe(`${words(70)}\n\n${words(70)}`);
  });

  test("rejects empty, too short, and too long output", () => {
    expect(parseWriteUp("   ").ok).toBe(false);
    expect(parseWriteUp(`H\n\n${words(40)}`)).toEqual({ ok: false, reason: "body is 40 words (want 60-250)" });
    expect(parseWriteUp(`H\n\n${words(300)}`).ok).toBe(false);
  });

  test("rejects a headline with no body", () => {
    expect(parseWriteUp(words(130)).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/write-ups/parse.test.ts`
Expected: FAIL — cannot find module `@/lib/write-ups/parse`.

- [ ] **Step 3: Implement `lib/write-ups/parse.ts`**

```ts
// Turns raw model output into a stored headline + body, or a reason it was
// rejected. Rejected output is logged and retried on the next cron run —
// never stored.

export type ParsedWriteUp =
  | { ok: true; headline: string; body: string }
  | { ok: false; reason: string };

const MIN_WORDS = 60;
const MAX_WORDS = 250;

function cleanHeadline(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .replace(/^headline:\s*/i, "")
    .replace(/\*\*/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

export function parseWriteUp(text: string): ParsedWriteUp {
  const cleaned = text.replace(/^```[a-z]*\n?|```$/g, "").trim();
  if (!cleaned) return { ok: false, reason: "empty output" };

  const lines = cleaned.split("\n");
  const headline = cleanHeadline(lines[0]);
  const body = lines
    .slice(1)
    .join("\n")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!headline) return { ok: false, reason: "missing headline" };
  if (headline.length > 120) return { ok: false, reason: "headline too long" };
  const count = body ? body.split(/\s+/).length : 0;
  if (count < MIN_WORDS || count > MAX_WORDS) {
    return { ok: false, reason: `body is ${count} words (want ${MIN_WORDS}-${MAX_WORDS})` };
  }
  return { ok: true, headline, body };
}
```

- [ ] **Step 4: Run to verify the parser passes**

Run: `bun test lib/write-ups/parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing prompt-builder tests**

Create `lib/write-ups/prompt.test.ts`:

```ts
// Reads loosely-typed nested JSON from the builders; `any` keeps the
// assertions readable.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from "bun:test";
import type { TeamForm } from "@/lib/matchup";
import { buildPreviewInput, buildRecapInput, SYSTEM_PROMPT, userMessage } from "@/lib/write-ups/prompt";

const form: TeamForm = {
  gp: 6, record: "3-3-0", points: 9, goalsFor: 14, goalsAgainst: 17,
  gfPerGame: 14 / 6, gaPerGame: 17 / 6, lastThreeMostRecentFirst: ["W 4-3 vs Ember Wolves"],
};
const roster = {
  rosterSize: 9, inCount: 0, outCount: 0, outKeyPlayers: [], noResponseCount: 9,
  rosteredGoalie: "Jordan Shaw", subsLinedUp: [],
};

describe("buildPreviewInput", () => {
  const input = buildPreviewInput({
    scheduledAt: "2026-04-26T23:00:00Z",
    home: { name: "Iron Ravens", form, topScorers: [{ playerId: "a", name: "Marlow Fenn", goals: 4 }], roster },
    away: { name: "Frost Giants", form, topScorers: [], roster },
    projection: null,
    keyMatchup: null,
  }) as Record<string, any>;

  test("labels result order and formats the time in the league timezone", () => {
    expect(input.game.when).toBe("Sunday, April 26 at 7:00 PM");
    expect(input.home_team.last_3_most_recent_first).toEqual(["W 4-3 vs Ember Wolves"]);
  });

  test("rounds per-game rates and passes roster counts, not absent names", () => {
    expect(input.home_team.gf_per_game).toBe(2.33);
    expect(input.home_team.availability).toEqual({
      roster_size: 9, checked_in: 0, out: 0, out_key_players: [], no_response: 9,
    });
    expect(input.home_team.rostered_goalie).toBe("Jordan Shaw");
  });

  test("says why projections are missing instead of leaving a gap", () => {
    expect(input.projection).toBe("not available yet (fewer than 2 games played)");
  });
});

describe("buildRecapInput", () => {
  const input = buildRecapInput({
    scheduledAt: "2026-04-12T23:00:00Z",
    homeScore: 2, awayScore: 1, decidedIn: "ot",
    home: { name: "Iron Ravens", recordAfter: "3-3-0", lineup: { skatersDressed: 8, goalie: "Jordan Shaw", subs: ["Kai Hale"] } },
    away: { name: "Ember Wolves", recordAfter: "3-2-1", lineup: { skatersDressed: 6, goalie: "Devon Ward", subs: [] } },
    goals: [
      { period: 1, clockSeconds: 554, team: "Iron Ravens", scorer: "Kai Hale", scorerIsSub: true, assists: [] },
      { period: 3, clockSeconds: 209, team: "Ember Wolves", scorer: "Quinn Cross", scorerIsSub: false, assists: ["Parker Ellis"] },
      { period: 4, clockSeconds: 151, team: "Iron Ravens", scorer: "Frankie Byrne", scorerIsSub: false, assists: ["Alex Boyd", "Marlow Fenn"] },
    ],
    penalties: [{ period: 2, clockSeconds: 600, team: "Ember Wolves", player: "Rowan Iver", penalty: "Tripping" }],
  }) as Record<string, any>;

  test("date, final and decided_in", () => {
    expect(input.game.played_on).toBe("Sunday, April 12");
    expect(input.game.final).toBe("Iron Ravens 2, Ember Wolves 1");
    expect(input.game.decided_in).toBe("overtime");
  });

  test("goals carry period labels, time remaining, sub flag and running score", () => {
    expect(input.goals.map((g: any) => [g.period, g.time_remaining, g.score_after])).toEqual([
      ["P1", "9:14", "Iron Ravens 1, Ember Wolves 0"],
      ["P3", "3:29", "Iron Ravens 1, Ember Wolves 1"],
      ["OT", "2:31", "Iron Ravens 2, Ember Wolves 1"],
    ]);
    expect(input.goals[0].scorer_is_sub).toBe(true);
    expect(input.goals[2].assists).toBe("Alex Boyd, Marlow Fenn");
    expect(input.goals[1].assists).toBe("Parker Ellis");
  });

  test("lineups and penalties", () => {
    expect(input.lineups["Iron Ravens"]).toEqual({ skaters_dressed: 8, goalie: "Jordan Shaw", subs: ["Kai Hale"] });
    expect(input.penalties).toEqual([{ period: "P2", time_remaining: "10:00", team: "Ember Wolves", player: "Rowan Iver", penalty: "Tripping" }]);
  });
});

test("system prompt carries the bake-off rules", () => {
  expect(SYSTEM_PROMPT).toContain("Use ONLY facts in the provided JSON");
  expect(SYSTEM_PROMPT).toContain("unless every game in it fits");
  expect(userMessage("recap", { a: 1 })).toStartWith("Write the recap. Data:\n");
});
```

- [ ] **Step 6: Run to verify failure**

Run: `bun test lib/write-ups/prompt.test.ts`
Expected: FAIL — cannot find module `@/lib/write-ups/prompt`.

- [ ] **Step 7: Implement `lib/write-ups/prompt.ts`**

```ts
// System prompt and model inputs for game write-ups. Pure: the data layer
// loads rows, these shape them into the JSON contract from the spec. Field
// names are deliberate — the bake-off showed models misread unlabeled data
// (result order) and invent what's missing (the weekday).
import type { KeyMatchup, Lineup, ProjectedRoster, Projection, Scorer, TeamForm } from "@/lib/matchup";
import { formatClock, formatPeriod } from "@/lib/format";

export type WriteUpKind = "preview" | "recap";

// Assumption: the league plays in US Eastern. Nothing else in the app pins a
// timezone; server-rendered dates otherwise follow the host (UTC on Vercel).
export const LEAGUE_TIME_ZONE = "America/New_York";

export const SYSTEM_PROMPT = `You write short game write-ups for M.O.T.H. ("Mostly Over The Hill"), a friendly adult rec hockey league. Readers are the players themselves.

Rules:
- Use ONLY facts in the provided JSON. Never invent stats, plays, quotes, injuries, dates, or history. If something isn't in the data, don't mention it.
- 120-160 words. First line is a headline (no quotes, no markdown). Then a blank line, then the body as plain prose — no bullet points, no markdown.
- Tone: fun and a little playful, like a league newsletter. PG. Light ribbing of a TEAM's record is fine; never mock an individual player.
- Don't summarize a streak or pattern unless every game in it fits the description.
- Previews: projections are for fun, not betting advice. You may mention the projected total and who's slightly favored. If few players have checked in, say rosters are still TBD rather than guessing. Only name absent players listed in out_key_players, and never guess why anyone is out. Name subs who are lined up.
- Recaps: tell the story of the game from the goal sequence (leads, comebacks, the winner). Credit scorers by name. Credit a sub who scored or assisted as a sub. Mention a short bench only if a team dressed fewer than 7 skaters.`;

export type PreviewTeam = { name: string; form: TeamForm; topScorers: Scorer[]; roster: ProjectedRoster };

export type PreviewSource = {
  scheduledAt: string;
  home: PreviewTeam;
  away: PreviewTeam;
  projection: Projection | null;
  keyMatchup: KeyMatchup | null;
};

export type RecapTeam = { name: string; recordAfter: string; lineup: Lineup };
export type RecapGoal = {
  period: number;
  clockSeconds: number;
  team: string;
  scorer: string;
  scorerIsSub: boolean;
  assists: string[];
};
export type RecapPenalty = { period: number; clockSeconds: number; team: string; player: string; penalty: string };

export type RecapSource = {
  scheduledAt: string;
  homeScore: number;
  awayScore: number;
  decidedIn: "regulation" | "ot" | "shootout" | null;
  home: RecapTeam;
  away: RecapTeam;
  // In game order: period ascending, clock (time remaining) descending.
  goals: RecapGoal[];
  penalties: RecapPenalty[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function leagueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: LEAGUE_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function leagueTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: LEAGUE_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

function previewTeam(t: PreviewTeam) {
  return {
    name: t.name,
    record: t.form.record,
    points: t.form.points,
    gp: t.form.gp,
    goals_for: t.form.goalsFor,
    goals_against: t.form.goalsAgainst,
    gf_per_game: round2(t.form.gfPerGame),
    ga_per_game: round2(t.form.gaPerGame),
    last_3_most_recent_first: t.form.lastThreeMostRecentFirst,
    top_scorers: t.topScorers.map((s) => ({ name: s.name, goals: s.goals })),
    rostered_goalie: t.roster.rosteredGoalie,
    availability: {
      roster_size: t.roster.rosterSize,
      checked_in: t.roster.inCount,
      out: t.roster.outCount,
      out_key_players: t.roster.outKeyPlayers,
      no_response: t.roster.noResponseCount,
    },
    subs_lined_up: t.roster.subsLinedUp,
  };
}

export function buildPreviewInput(src: PreviewSource): Record<string, unknown> {
  return {
    game: {
      home: src.home.name,
      away: src.away.name,
      when: `${leagueDate(src.scheduledAt)} at ${leagueTime(src.scheduledAt)}`,
    },
    home_team: previewTeam(src.home),
    away_team: previewTeam(src.away),
    projection: src.projection
      ? {
          expected_goals_home: src.projection.expectedGoalsHome,
          expected_goals_away: src.projection.expectedGoalsAway,
          over_under_line: src.projection.overUnderLine,
          win_probability_home: round2(src.projection.winProbabilityHome),
          win_probability_away: round2(src.projection.winProbabilityAway),
          moneyline_home: src.projection.moneylineHome,
          moneyline_away: src.projection.moneylineAway,
        }
      : "not available yet (fewer than 2 games played)",
    key_matchup: src.keyMatchup ?? "none",
  };
}

const DECIDED: Record<string, string> = { regulation: "regulation", ot: "overtime", shootout: "shootout" };

export function buildRecapInput(src: RecapSource): Record<string, unknown> {
  let home = 0;
  let away = 0;
  const goals = src.goals.map((g) => {
    if (g.team === src.home.name) home++;
    else away++;
    return {
      period: formatPeriod(g.period),
      time_remaining: formatClock(g.clockSeconds),
      team: g.team,
      scorer: g.scorer,
      scorer_is_sub: g.scorerIsSub,
      assists: g.assists.length ? g.assists.join(", ") : null,
      score_after: `${src.home.name} ${home}, ${src.away.name} ${away}`,
    };
  });

  const lineup = (l: Lineup) => ({ skaters_dressed: l.skatersDressed, goalie: l.goalie, subs: l.subs });

  return {
    game: {
      home: src.home.name,
      away: src.away.name,
      played_on: leagueDate(src.scheduledAt),
      final: `${src.home.name} ${src.homeScore}, ${src.away.name} ${src.awayScore}`,
      decided_in: DECIDED[src.decidedIn ?? "regulation"],
    },
    goals,
    penalties: src.penalties.map((p) => ({
      period: formatPeriod(p.period),
      time_remaining: formatClock(p.clockSeconds),
      team: p.team,
      player: p.player,
      penalty: p.penalty,
    })),
    lineups: { [src.home.name]: lineup(src.home.lineup), [src.away.name]: lineup(src.away.lineup) },
    records_after: { [src.home.name]: src.home.recordAfter, [src.away.name]: src.away.recordAfter },
  };
}

export function userMessage(kind: WriteUpKind, input: Record<string, unknown>): string {
  return `Write the ${kind}. Data:\n${JSON.stringify(input, null, 2)}`;
}
```

- [ ] **Step 8: Run all write-up tests**

Run: `bun test lib/write-ups`
Expected: PASS (both files).

Note: `2026-04-26T23:00:00Z` is 7:00 PM EDT. If the league timezone assumption changes, update `LEAGUE_TIME_ZONE` and the two date expectations together.

- [ ] **Step 9: Typecheck and commit**

```bash
bunx tsc --noEmit
git add lib/write-ups/prompt.ts lib/write-ups/parse.ts lib/write-ups/prompt.test.ts lib/write-ups/parse.test.ts
git commit -m "feat(write-ups): prompt builders and output parser"
```

---
### Task 5: Data loaders `lib/write-ups/data.ts`

Database reads that produce `PreviewSource` / `RecapSource`. Used by the game page (with the request's client) and by generation (with the service client).

**Files:**
- Create: `lib/write-ups/data.ts`

**Interfaces:**
- Consumes: Task 2 (`teamForm`, `topScorers`, `projectMatchup`, `keyMatchup`, `projectedRoster`, `gameLineup`, `FinalGame`, `GoalEvent`, `RosterEntry`, `Position`); Task 4 (`PreviewSource`, `RecapSource`, `RecapGoal`, `RecapPenalty`); `getStandings(seasonId)` from `lib/queries.ts`.
- Produces:
  - `type Db = SupabaseClient<Database>`
  - `loadPreviewSource(db: Db, gameId: string): Promise<PreviewSource | null>` — null unless the game is `scheduled` with both teams set
  - `loadRecapSource(db: Db, gameId: string): Promise<RecapSource | null>` — null unless the game is `final` with both teams set

- [ ] **Step 1: Implement `lib/write-ups/data.ts`**

```ts
// Loads the rows behind a preview or recap and shapes them with the pure
// helpers in lib/matchup.ts. Takes the client as a parameter so the game page
// (request client, RLS) and the generator (service client) share one path.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getStandings, type StandingsRow } from "@/lib/queries";
import {
  gameLineup,
  keyMatchup,
  projectMatchup,
  projectedRoster,
  teamForm,
  topScorers,
  type FinalGame,
  type GoalEvent,
  type Position,
  type RosterEntry,
} from "@/lib/matchup";
import type { PreviewSource, PreviewTeam, RecapGoal, RecapPenalty, RecapSource } from "@/lib/write-ups/prompt";

export type Db = SupabaseClient<Database>;

type Name = { first_name: string; last_name: string };
const full = (p: Name | null | undefined) => (p ? `${p.first_name} ${p.last_name}` : "Unknown");

async function loadGame(db: Db, gameId: string) {
  const { data } = await db
    .from("games")
    .select(
      "id, season_id, scheduled_at, status, home_team_id, away_team_id, home_score, away_score, decided_in, " +
        "home_team:home_team_id(name), away_team:away_team_id(name)",
    )
    .eq("id", gameId)
    .maybeSingle();
  if (!data || !data.home_team_id || !data.away_team_id) return null;
  const g = data as unknown as {
    id: string; season_id: string; scheduled_at: string; status: string;
    home_team_id: string; away_team_id: string; home_score: number; away_score: number;
    decided_in: "regulation" | "ot" | "shootout" | null;
    home_team: { name: string }; away_team: { name: string };
  };
  return g;
}

function standingFor(rows: StandingsRow[], teamId: string): StandingsRow {
  return (
    rows.find((r) => r.team_id === teamId) ?? {
      team_id: teamId, name: "", slug: "", color: "", gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, diff: 0,
    }
  );
}

export async function loadPreviewSource(db: Db, gameId: string): Promise<PreviewSource | null> {
  const game = await loadGame(db, gameId);
  if (!game || game.status !== "scheduled") return null;
  const teamIds = [game.home_team_id, game.away_team_id];

  const [standings, { data: finals }, { data: goalRows }, { data: rosterRows }, { data: availRows }, { data: subRows }, { data: teamRows }] =
    await Promise.all([
      getStandings(game.season_id),
      db.from("games")
        .select("id, scheduled_at, home_team_id, away_team_id, home_score, away_score, decided_in")
        .eq("season_id", game.season_id).eq("status", "final").eq("kind", "regular"),
      db.from("game_events")
        .select("team_id, player_id, period, clock_seconds, assist1_player_id, assist2_player_id, game:game_id!inner(season_id, status, kind)")
        .eq("type", "goal").eq("game.season_id", game.season_id).eq("game.status", "final").eq("game.kind", "regular"),
      db.from("team_players")
        .select("team_id, position, player:player_id(id, first_name, last_name)")
        .eq("season_id", game.season_id).in("team_id", teamIds),
      db.from("game_availability").select("player_id, status").eq("game_id", gameId),
      db.from("game_subs").select("team_id, position, player:player_id(first_name, last_name)").eq("game_id", gameId),
      db.from("teams").select("id, name").eq("season_id", game.season_id),
    ]);

  const teamNames = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
  const games: FinalGame[] = (finals ?? []).flatMap((g) =>
    g.home_team_id && g.away_team_id
      ? [{ id: g.id, scheduledAt: g.scheduled_at, homeTeamId: g.home_team_id, awayTeamId: g.away_team_id,
           homeScore: g.home_score, awayScore: g.away_score, decidedIn: g.decided_in }]
      : [],
  );
  const goals: GoalEvent[] = (goalRows ?? []).flatMap((e) =>
    e.player_id
      ? [{ teamId: e.team_id, playerId: e.player_id, period: e.period, clockSeconds: e.clock_seconds,
           assist1Id: e.assist1_player_id, assist2Id: e.assist2_player_id }]
      : [],
  );

  const roster: RosterEntry[] = (rosterRows ?? []).flatMap((r) => {
    const p = r.player as unknown as ({ id: string } & Name) | null;
    return p ? [{ playerId: p.id, name: full(p), teamId: r.team_id, position: r.position as Position }] : [];
  });

  // Scorer names: rostered players first, then anyone else who scored (subs).
  const names = new Map(roster.map((r) => [r.playerId, r.name]));
  const missing = [...new Set(goals.map((g) => g.playerId))].filter((id) => !names.has(id));
  if (missing.length) {
    const { data: extra } = await db.from("players").select("id, first_name, last_name").in("id", missing);
    for (const p of extra ?? []) names.set(p.id, full(p));
  }
  const nameOf = (id: string) => names.get(id) ?? "Unknown";

  const status = new Map((availRows ?? []).map((a) => [a.player_id, a.status as "in" | "out"]));

  const side = (teamId: string): PreviewTeam => {
    const form = teamForm(standingFor(standings, teamId), games, teamId, (id) => teamNames.get(id) ?? "Unknown");
    const scorers = topScorers(goals, teamId, nameOf);
    const teamRoster = roster.filter((r) => r.teamId === teamId);
    const goalieId = teamRoster.find((r) => r.position === "goalie")?.playerId;
    const keyIds = new Set([...scorers.map((s) => s.playerId), ...(goalieId ? [goalieId] : [])]);
    const subs = (subRows ?? [])
      .filter((s) => s.team_id === teamId)
      .map((s) => ({ name: full(s.player as unknown as Name), position: s.position as Position }));
    return {
      name: teamNames.get(teamId) ?? "Unknown",
      form,
      topScorers: scorers,
      roster: projectedRoster(teamRoster, status, subs, keyIds),
    };
  };

  const home = side(game.home_team_id);
  const away = side(game.away_team_id);
  return {
    scheduledAt: game.scheduled_at,
    home,
    away,
    projection: projectMatchup(home.form, away.form),
    keyMatchup: keyMatchup(
      { team: home.name, topScorer: home.topScorers[0] ?? null, goalie: home.roster.rosteredGoalie, form: home.form },
      { team: away.name, topScorer: away.topScorers[0] ?? null, goalie: away.roster.rosteredGoalie, form: away.form },
    ),
  };
}

function penaltyLabel(type: string | null, other: string | null): string {
  if (type === "other") return other ?? "Penalty";
  if (!type) return "Penalty";
  return type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export async function loadRecapSource(db: Db, gameId: string): Promise<RecapSource | null> {
  const game = await loadGame(db, gameId);
  if (!game || game.status !== "final") return null;

  const [standings, { data: eventRows }, { data: appRows }, { data: rosterRows }, { data: subRows }] = await Promise.all([
    getStandings(game.season_id),
    db.from("game_events")
      .select(
        "type, team_id, period, clock_seconds, penalty_type, penalty_type_other, " +
          "scorer:player_id(first_name, last_name), a1:assist1_player_id(first_name, last_name), a2:assist2_player_id(first_name, last_name), player_id",
      )
      .eq("game_id", gameId)
      .order("period")
      .order("clock_seconds", { ascending: false }),
    db.from("game_appearances").select("player_id, team_id, is_sub, player:player_id(first_name, last_name)").eq("game_id", gameId),
    db.from("team_players").select("player_id, position").eq("season_id", game.season_id),
    db.from("game_subs").select("player_id, position").eq("game_id", gameId),
  ]);

  const teamName = (id: string) => (id === game.home_team_id ? game.home_team.name : game.away_team.name);
  const positionOf = new Map<string, Position>();
  for (const r of rosterRows ?? []) positionOf.set(r.player_id, r.position as Position);
  // A lined-up sub's chosen position wins over their own team's roster spot.
  for (const s of subRows ?? []) positionOf.set(s.player_id, s.position as Position);

  const apps = (appRows ?? []) as unknown as { player_id: string; team_id: string; is_sub: boolean; player: Name | null }[];
  const subIds = new Set(apps.filter((a) => a.is_sub).map((a) => a.player_id));
  const lineup = (teamId: string) =>
    gameLineup(
      apps
        .filter((a) => a.team_id === teamId)
        .map((a) => ({ name: full(a.player), position: positionOf.get(a.player_id) ?? "forward", isSub: a.is_sub })),
    );

  type Ev = {
    type: "goal" | "penalty"; team_id: string; period: number; clock_seconds: number;
    penalty_type: string | null; penalty_type_other: string | null; player_id: string | null;
    scorer: Name | null; a1: Name | null; a2: Name | null;
  };
  const events = (eventRows ?? []) as unknown as Ev[];
  const goals: RecapGoal[] = events
    .filter((e) => e.type === "goal")
    .map((e) => ({
      period: e.period,
      clockSeconds: e.clock_seconds,
      team: teamName(e.team_id),
      scorer: full(e.scorer),
      scorerIsSub: e.player_id ? subIds.has(e.player_id) : false,
      assists: [e.a1, e.a2].filter((a): a is Name => !!a).map(full),
    }));
  const penalties: RecapPenalty[] = events
    .filter((e) => e.type === "penalty")
    .map((e) => ({
      period: e.period,
      clockSeconds: e.clock_seconds,
      team: teamName(e.team_id),
      player: full(e.scorer),
      penalty: penaltyLabel(e.penalty_type, e.penalty_type_other),
    }));

  const record = (teamId: string) => {
    const s = standingFor(standings, teamId);
    return `${s.w}-${s.l}-${s.otl}`;
  };

  return {
    scheduledAt: game.scheduled_at,
    homeScore: game.home_score,
    awayScore: game.away_score,
    decidedIn: game.decided_in,
    home: { name: game.home_team.name, recordAfter: record(game.home_team_id), lineup: lineup(game.home_team_id) },
    away: { name: game.away_team.name, recordAfter: record(game.away_team_id), lineup: lineup(game.away_team_id) },
    goals,
    penalties,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. If `getStandings` (request client) and the passed `Db` disagree on a generic parameter, keep `Db = SupabaseClient<Database>` and cast at the call site (`client as unknown as Db`) — don't loosen the type in this file.

- [ ] **Step 3: Check against seeded data**

Create a throwaway script `/tmp/check-sources.ts` (do not commit):

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadPreviewSource, loadRecapSource } from "@/lib/write-ups/data";
import { buildPreviewInput, buildRecapInput } from "@/lib/write-ups/prompt";

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const { data: next } = await db.from("games").select("id").eq("status", "scheduled").not("home_team_id", "is", null).order("scheduled_at").limit(1).single();
const { data: last } = await db.from("games").select("id").eq("status", "final").order("scheduled_at", { ascending: false }).limit(1).single();
console.log(JSON.stringify(buildPreviewInput((await loadPreviewSource(db, next!.id))!), null, 2));
console.log(JSON.stringify(buildRecapInput((await loadRecapSource(db, last!.id))!), null, 2));
```

`getStandings` needs Next's request scope, so run it through a temporary route instead if Bun errors on `cookies()`: add `app/api/dev/check-sources/route.ts` that runs the same code and returns the JSON, hit it at `http://127.0.0.1:3001/api/dev/check-sources`, then **delete the route before committing**.

Verify by hand against `psql`: each team's `record` matches `/standings`; `last_3_most_recent_first` is newest first; the recap's goal count equals the final score (plus one shootout goal for SO games); `scorer_is_sub` is true for the seeded sub goal (Task 1).

- [ ] **Step 4: Commit**

```bash
git add lib/write-ups/data.ts
git commit -m "feat(write-ups): load preview and recap sources"
```

---
### Task 6: OpenRouter call + `generateAndStore`

**Files:**
- Create: `lib/write-ups/openrouter.ts`
- Test: `lib/write-ups/openrouter.test.ts`
- Create: `lib/write-ups/generate.ts`

**Interfaces:**
- Consumes: Task 3 `createSupabaseServiceClient()`; Task 4 `SYSTEM_PROMPT`, `buildPreviewInput`, `buildRecapInput`, `userMessage`, `parseWriteUp`, `WriteUpKind`; Task 5 `loadPreviewSource`, `loadRecapSource`.
- Produces:
  - `type ModelResult = { text: string; model: string; costUsd: number | null }`
  - `generateText(system: string, user: string): Promise<ModelResult>` — tries `WRITE_UP_MODEL`, then `WRITE_UP_FALLBACK_MODEL`; throws `Error` if both fail
  - `type GenerateResult = { gameId: string; kind: WriteUpKind; status: "created" | "exists" | "not_ready" | "failed"; detail?: string }`
  - `generateAndStore(kind: WriteUpKind, gameId: string): Promise<GenerateResult>` — never throws

`openrouter.ts` deliberately doesn't import `server-only`: that package throws outside Next's server build, which would break `bun test`. It reads only non-`NEXT_PUBLIC_` env vars, which Next never sends to the browser.

- [ ] **Step 1: Write the failing tests**

Create `lib/write-ups/openrouter.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { generateText } from "@/lib/write-ups/openrouter";

const realFetch = globalThis.fetch;
const calls: { model: string; reasoning?: unknown }[] = [];

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  calls.length = 0;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.WRITE_UP_MODEL = "openai/gpt-6-luna";
  process.env.WRITE_UP_FALLBACK_MODEL = "google/gemini-2.5-flash-lite";
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("generateText", () => {
  test("uses the primary model, with low reasoning for OpenAI models", async () => {
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      calls.push({ model: body.model, reasoning: body.reasoning });
      return respond(200, { model: body.model, choices: [{ message: { content: "Headline\n\nBody" } }], usage: { cost: 0.0002 } });
    }) as unknown as typeof fetch;

    const r = await generateText("sys", "user");
    expect(r).toEqual({ text: "Headline\n\nBody", model: "openai/gpt-6-luna", costUsd: 0.0002 });
    expect(calls).toEqual([{ model: "openai/gpt-6-luna", reasoning: { effort: "low" } }]);
  });

  test("falls back when the primary errors, without reasoning for non-OpenAI models", async () => {
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      calls.push({ model: body.model, reasoning: body.reasoning });
      if (body.model.startsWith("openai/")) return respond(503, { error: { message: "overloaded" } });
      return respond(200, { model: body.model, choices: [{ message: { content: "ok" } }] });
    }) as unknown as typeof fetch;

    const r = await generateText("sys", "user");
    expect(r.model).toBe("google/gemini-2.5-flash-lite");
    expect(r.costUsd).toBeNull();
    expect(calls.map((c) => c.model)).toEqual(["openai/gpt-6-luna", "google/gemini-2.5-flash-lite"]);
    expect(calls[1].reasoning).toBeUndefined();
  });

  test("throws when both models fail", async () => {
    globalThis.fetch = mock(async () => respond(500, { error: { message: "down" } })) as unknown as typeof fetch;
    await expect(generateText("sys", "user")).rejects.toThrow(/both models failed/);
  });

  test("throws a clear error with no API key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(generateText("sys", "user")).rejects.toThrow("OPENROUTER_API_KEY is not set");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/write-ups/openrouter.test.ts`
Expected: FAIL — cannot find module `@/lib/write-ups/openrouter`.

- [ ] **Step 3: Implement `lib/write-ups/openrouter.ts`**

```ts
// One chat-completion call through OpenRouter (OpenAI-compatible API), with a
// fallback model. Model IDs come from env so they can be swapped in Vercel
// without a deploy.

export type ModelResult = { text: string; model: string; costUsd: number | null };

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-6-luna";
const DEFAULT_FALLBACK = "google/gemini-2.5-flash-lite";

async function callOnce(apiKey: string, model: string, system: string, user: string): Promise<ModelResult> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 1000,
    usage: { include: true },
  };
  // OpenAI's reasoning models default to medium effort; a 150-word write-up
  // from precomputed stats doesn't need it, and reasoning tokens bill as output.
  if (model.startsWith("openai/")) body.reasoning = { effort: "low" };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "moth-hockey write-ups",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { cost?: number };
    error?: { message?: string };
  };
  if (!res.ok || json.error) throw new Error(`${model}: ${json.error?.message ?? `HTTP ${res.status}`}`);
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${model}: empty response`);
  return { text, model: json.model ?? model, costUsd: json.usage?.cost ?? null };
}

export async function generateText(system: string, user: string): Promise<ModelResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const primary = process.env.WRITE_UP_MODEL || DEFAULT_MODEL;
  const fallback = process.env.WRITE_UP_FALLBACK_MODEL || DEFAULT_FALLBACK;

  try {
    return await callOnce(apiKey, primary, system, user);
  } catch (first) {
    try {
      return await callOnce(apiKey, fallback, system, user);
    } catch (second) {
      throw new Error(`both models failed — ${String(first)}; ${String(second)}`);
    }
  }
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `bun test lib/write-ups/openrouter.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `lib/write-ups/generate.ts`**

```ts
import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { loadPreviewSource, loadRecapSource } from "@/lib/write-ups/data";
import { generateText } from "@/lib/write-ups/openrouter";
import { parseWriteUp } from "@/lib/write-ups/parse";
import { buildPreviewInput, buildRecapInput, SYSTEM_PROMPT, userMessage, type WriteUpKind } from "@/lib/write-ups/prompt";

export type GenerateResult = {
  gameId: string;
  kind: WriteUpKind;
  status: "created" | "exists" | "not_ready" | "failed";
  detail?: string;
};

// Generate one write-up and store it. Never throws: callers (cron, after())
// log the result and move on. Never overwrites — admin edits survive re-runs.
export async function generateAndStore(kind: WriteUpKind, gameId: string): Promise<GenerateResult> {
  const result = (status: GenerateResult["status"], detail?: string): GenerateResult => {
    const r = { gameId, kind, status, detail };
    (status === "failed" ? console.error : console.info)("[write-ups]", JSON.stringify(r));
    return r;
  };

  try {
    const db = createSupabaseServiceClient();
    const { data: existing } = await db
      .from("game_write_ups")
      .select("game_id")
      .eq("game_id", gameId)
      .eq("kind", kind)
      .maybeSingle();
    if (existing) return result("exists");

    const input =
      kind === "preview"
        ? await loadPreviewSource(db, gameId).then((s) => (s ? buildPreviewInput(s) : null))
        : await loadRecapSource(db, gameId).then((s) => (s ? buildRecapInput(s) : null));
    if (!input) return result("not_ready", "game is not in the right state");

    const out = await generateText(SYSTEM_PROMPT, userMessage(kind, input));
    const parsed = parseWriteUp(out.text);
    if (!parsed.ok) return result("failed", `${out.model}: ${parsed.reason}`);

    const { error } = await db.from("game_write_ups").upsert(
      { game_id: gameId, kind, headline: parsed.headline, body: parsed.body, model: out.model },
      { onConflict: "game_id,kind", ignoreDuplicates: true },
    );
    if (error) return result("failed", error.message);
    return result("created", `${out.model}${out.costUsd != null ? ` $${out.costUsd.toFixed(5)}` : ""}`);
  } catch (e) {
    return result("failed", e instanceof Error ? e.message : String(e));
  }
}
```

- [ ] **Step 6: Typecheck, run all tests, commit**

```bash
bunx tsc --noEmit
bun test lib
git add lib/write-ups/openrouter.ts lib/write-ups/openrouter.test.ts lib/write-ups/generate.ts
git commit -m "feat(write-ups): OpenRouter call with fallback and generateAndStore"
```

---
### Task 7: Triggers — daily cron + recap after finalize

**Files:**
- Create: `app/api/cron/write-ups/route.ts`
- Create: `vercel.json`
- Modify: `app/score/[gameId]/actions.ts` (`finalizeGame`, imports)

**Interfaces:**
- Consumes: Task 6 `generateAndStore`, `GenerateResult`; Task 3 `createSupabaseServiceClient`.
- Produces: `GET /api/cron/write-ups` → `200 { results: GenerateResult[] }`, `401` without the secret, `500` when `CRON_SECRET` or `OPENROUTER_API_KEY` is unset.

- [ ] **Step 1: Write the cron route**

Create `app/api/cron/write-ups/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { generateAndStore, type GenerateResult } from "@/lib/write-ups/generate";

// Previews look 36h ahead (not 24h) so Sunday-evening games, which land just
// after midnight UTC, are still caught by Saturday's 18:00 UTC run.
const PREVIEW_WINDOW_HOURS = 36;
// Recaps are normally written right after finalize; this is the backstop.
const RECAP_LOOKBACK_DAYS = 7;

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Fail loudly instead of returning 200 with every job "failed".
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY is not set" }, { status: 500 });
  }

  const db = createSupabaseServiceClient();
  const now = Date.now();
  const until = new Date(now + PREVIEW_WINDOW_HOURS * 3_600_000).toISOString();
  const since = new Date(now - RECAP_LOOKBACK_DAYS * 86_400_000).toISOString();

  const [{ data: upcoming }, { data: recent }, { data: existing }] = await Promise.all([
    db.from("games").select("id")
      .eq("status", "scheduled").not("home_team_id", "is", null).not("away_team_id", "is", null)
      .gte("scheduled_at", new Date(now).toISOString()).lte("scheduled_at", until),
    db.from("games").select("id").eq("status", "final").gte("scheduled_at", since),
    db.from("game_write_ups").select("game_id, kind").gte("generated_at", new Date(now - 30 * 86_400_000).toISOString()),
  ]);

  const have = new Set((existing ?? []).map((w) => `${w.game_id}:${w.kind}`));
  const jobs: { kind: "preview" | "recap"; gameId: string }[] = [
    ...(upcoming ?? []).filter((g) => !have.has(`${g.id}:preview`)).map((g) => ({ kind: "preview" as const, gameId: g.id })),
    ...(recent ?? []).filter((g) => !have.has(`${g.id}:recap`)).map((g) => ({ kind: "recap" as const, gameId: g.id })),
  ];

  // One at a time: a handful of games per day, and it keeps OpenRouter calls
  // and logs easy to follow. Failures don't stop the rest.
  const results: GenerateResult[] = [];
  for (const job of jobs) results.push(await generateAndStore(job.kind, job.gameId));

  return NextResponse.json({ results });
}
```

- [ ] **Step 2: Add the schedule**

Create `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/write-ups", "schedule": "0 18 * * *" }]
}
```

- [ ] **Step 3: Verify the route's auth locally**

With the dev server running (`bun dev`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/api/cron/write-ups
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer wrong" http://127.0.0.1:3001/api/cron/write-ups
```

Expected: `401` and `401`.

- [ ] **Step 4: Run it for real against seeded data**

Pick a scheduled game and move it into the window, then call the route with the real secret:

```bash
G=$(psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -c \
  "select id from games where status='scheduled' and home_team_id is not null order by scheduled_at limit 1")
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
  "update games set scheduled_at = now() + interval '20 hours' where id = '$G'"
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '"')
curl -s -H "Authorization: Bearer $SECRET" http://127.0.0.1:3001/api/cron/write-ups | python3 -m json.tool
```

Expected: one `preview` result with `"status": "created"` for `$G`, and `recap` results (`created`) for finals from the last 7 days, if any. Then confirm idempotency by running the same `curl` again: no `created` results the second time.

Read each created row and fact-check it against the input:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
  "select kind, model, headline, left(body, 300) from game_write_ups order by generated_at desc limit 5"
```

- [ ] **Step 5: Schedule the recap on finalize**

In `app/score/[gameId]/actions.ts`, add to the imports:

```ts
import { after } from "next/server";
import { generateAndStore } from "@/lib/write-ups/generate";
```

In `finalizeGame`, after the `if (error) return { ok: false, error: error.message };` that follows the `status: "final"` update, and before the `revalidatePath` calls, add:

```ts
  // Write the recap in the background so finalize stays instant. A failure
  // here is logged; the daily cron retries any final game missing a recap.
  // No revalidatePath needed: /games/[id] reads cookies, so it renders fresh
  // on every request.
  after(() => generateAndStore("recap", input.gameId));
```

- [ ] **Step 6: Verify the finalize path**

Sign in as `scorekeeper@moth.test` (magic link via Mailpit, `http://127.0.0.1:54324`), start a scheduled game at `/score/[gameId]`, record a goal, and finalize it. Within about 10 seconds:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c \
  "select kind, model, headline from game_write_ups where kind = 'recap' order by generated_at desc limit 1"
```

Expected: a recap row for that game. Check the dev-server log for a `[write-ups]` line with `"status":"created"`.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
bunx tsc --noEmit && bun run lint
git add app/api/cron/write-ups/route.ts vercel.json "app/score/[gameId]/actions.ts"
git commit -m "feat(write-ups): daily cron and recap after finalize"
```

---
### Task 8: Matchup panel and write-up display

**Files:**
- Create: `components/MatchupPanel.tsx`
- Create: `components/WriteUpCard.tsx`
- Modify: `app/games/[id]/page.tsx` (imports; load preview source + write-ups; render after the availability section and at the top of the events section for finals)

**Interfaces:**
- Consumes: Task 4 `PreviewSource`, `PreviewTeam`; Task 5 `loadPreviewSource`, `Db`.
- Produces:
  - `MatchupPanel({ source }: { source: PreviewSource })` (server component)
  - `type WriteUp = { kind: "preview" | "recap"; headline: string; body: string; model: string; hidden: boolean; edited_at: string | null }`
  - `WriteUpCard({ writeUp, admin }: { writeUp: WriteUp; admin?: ReactNode })` — `admin` is a slot Task 9 fills

- [ ] **Step 1: Create `components/WriteUpCard.tsx`**

```tsx
import type { ReactNode } from "react";

export type WriteUp = {
  kind: "preview" | "recap";
  headline: string;
  body: string;
  model: string;
  hidden: boolean;
  edited_at: string | null;
};

// An AI-written preview or recap. `admin` is where edit/hide controls go for
// admins; everyone else just reads it.
export function WriteUpCard({ writeUp, admin }: { writeUp: WriteUp; admin?: ReactNode }) {
  return (
    <article className={`panel p-4 sm:p-5 space-y-3 ${writeUp.hidden ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="chip">{writeUp.kind === "preview" ? "Game preview" : "Recap"}</span>
        {writeUp.hidden && <span className="chip">Hidden</span>}
      </div>
      <h3 className="font-display text-[24px] sm:text-[28px] tracking-[0.03em] leading-tight text-ink">
        {writeUp.headline}
      </h3>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink-dim">
        {writeUp.body.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <p className="text-[12px] text-ink-faint">
        {writeUp.edited_at ? "Written with AI, edited by an admin." : "Written with AI from league stats."}
      </p>
      {admin}
    </article>
  );
}
```

- [ ] **Step 2: Create `components/MatchupPanel.tsx`**

```tsx
import type { PreviewSource, PreviewTeam } from "@/lib/write-ups/prompt";

function TeamColumn({ team }: { team: PreviewTeam }) {
  const r = team.roster;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[18px] tracking-[0.04em] text-ink truncate">{team.name}</span>
        <span className="digit text-[15px] text-ink tnum">{team.form.record}</span>
      </div>
      <div className="text-[13px] text-ink-dim tnum">
        {team.form.points} pts · {team.form.goalsFor} GF · {team.form.goalsAgainst} GA
      </div>

      <div>
        <div className="eyebrow">Last 3</div>
        {team.form.lastThreeMostRecentFirst.length === 0 ? (
          <p className="text-[13px] text-ink-dim mt-1">No games yet</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-[13px] text-ink-dim">
            {team.form.lastThreeMostRecentFirst.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="eyebrow">Top scorers</div>
        <ul className="mt-1 space-y-0.5 text-[13px] text-ink-dim">
          {team.topScorers.length === 0 ? <li>None yet</li> : team.topScorers.map((s) => (
            <li key={s.playerId}>{s.name} · {s.goals} G</li>
          ))}
        </ul>
      </div>

      <div>
        <div className="eyebrow">Projected roster</div>
        <p className="mt-1 text-[13px] text-ink-dim tnum">
          {r.inCount} in · {r.outCount} out · {r.noResponseCount} no response
          {r.subsLinedUp.length > 0 && ` · ${r.subsLinedUp.length} sub${r.subsLinedUp.length === 1 ? "" : "s"}`}
        </p>
        {r.outKeyPlayers.length > 0 && (
          <p className="text-[13px] text-ink-dim">Out: {r.outKeyPlayers.join(", ")}</p>
        )}
        {r.rosteredGoalie && <p className="text-[13px] text-ink-dim">Goalie: {r.rosteredGoalie}</p>}
      </div>
    </div>
  );
}

// Live, deterministic matchup numbers for a scheduled game. No AI involved;
// the AI preview (when present) is rendered separately above this.
export function MatchupPanel({ source }: { source: PreviewSource }) {
  const p = source.projection;
  const k = source.keyMatchup;
  return (
    <div className="panel p-4 sm:p-5 space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TeamColumn team={source.away} />
        <TeamColumn team={source.home} />
      </div>

      {k && (
        <div className="border-t border-rule pt-4">
          <div className="eyebrow">Key matchup</div>
          <p className="mt-1 text-[14px] text-ink">
            {k.scorer.name} ({k.scorer.team}, {k.scorer.goals} G) vs {k.goalie.name} ({k.goalie.team},{" "}
            {k.goalie.teamGaPerGame.toFixed(2)} GA/game)
          </p>
        </div>
      )}

      <div className="border-t border-rule pt-4">
        <div className="eyebrow">Projection</div>
        {p ? (
          <>
            <div className="mt-2 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="digit text-[22px] text-ink tnum">{p.overUnderLine}</div>
                <div className="text-[12px] text-ink-dim">Over/under</div>
              </div>
              <div>
                <div className="digit text-[22px] text-ink tnum">{p.moneylineAway}</div>
                <div className="text-[12px] text-ink-dim">{source.away.name}</div>
              </div>
              <div>
                <div className="digit text-[22px] text-ink tnum">{p.moneylineHome}</div>
                <div className="text-[12px] text-ink-dim">{source.home.name}</div>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-ink-faint">
              {Math.round(p.winProbabilityAway * 100)}% / {Math.round(p.winProbabilityHome * 100)}% to win.
              For fun — not betting advice.
            </p>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-ink-dim">Projections start after week 2.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Load data on the game page**

In `app/games/[id]/page.tsx`, add imports:

```ts
import { MatchupPanel } from "@/components/MatchupPanel";
import { WriteUpCard, type WriteUp } from "@/components/WriteUpCard";
import { loadPreviewSource, type Db } from "@/lib/write-ups/data";
```

After the `const awayView = awayTeam ?? tbdTeam;` line, add:

```ts
  // Write-ups: RLS already hides hidden rows from everyone but admins.
  const { data: writeUpRows } = await supabase
    .from("game_write_ups")
    .select("kind, headline, body, model, hidden, edited_at")
    .eq("game_id", id);
  const writeUps = (writeUpRows ?? []) as WriteUp[];
  const previewWriteUp = writeUps.find((w) => w.kind === "preview") ?? null;
  const recapWriteUp = writeUps.find((w) => w.kind === "recap") ?? null;

  const previewSource =
    game.status === "scheduled" && homeTeam && awayTeam
      ? await loadPreviewSource(supabase as unknown as Db, id)
      : null;
```

- [ ] **Step 4: Render the panel and write-ups**

Immediately after the closing `)}` of the `{/* AVAILABILITY (scheduled games) */}` block, add:

```tsx
      {/* MATCHUP (scheduled games) */}
      {previewSource && (
        <section className="rise delay-1 space-y-4">
          <SectionHeader eyebrow="Preview" title="Matchup" />
          {previewWriteUp && <WriteUpCard writeUp={previewWriteUp} />}
          <MatchupPanel source={previewSource} />
        </section>
      )}

      {/* RECAP (final games) */}
      {isFinal && recapWriteUp && (
        <section className="rise delay-1">
          <WriteUpCard writeUp={recapWriteUp} />
        </section>
      )}
```

- [ ] **Step 5: Verify in the browser**

With write-ups from Task 7 in the local DB, check at 390px and desktop widths (playwright-cli `resize 390 844` / `resize 1280 900`):
- `/games/<scheduled game in window>`: preview write-up card above the panel; both team columns; key matchup line; projection with the "For fun" note.
- `/games/<scheduled game with <2 games played>`: "Projections start after week 2." (Simulate by checking a freshly seeded season, or skip if none exists and say so.)
- `/games/<final game with recap>`: recap card above the events log.
- Signed out: run `update game_write_ups set hidden = true where kind = 'recap'` for one row and confirm the card disappears; set it back to `false`.
- Numbers in the panel match `/standings` for both teams.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
bunx tsc --noEmit && bun run lint
git add components/MatchupPanel.tsx components/WriteUpCard.tsx "app/games/[id]/page.tsx"
git commit -m "feat(games): matchup panel and AI write-ups on the game page"
```

---
### Task 9: Admin edit / hide / regenerate

**Files:**
- Create: `app/games/[id]/write-up-actions.ts`
- Create: `components/WriteUpAdminControls.tsx`
- Modify: `app/games/[id]/page.tsx` (admin check; pass the controls into `WriteUpCard`'s `admin` slot)

**Interfaces:**
- Consumes: Task 6 `generateAndStore`; Task 8 `WriteUpCard` (`admin` slot), `WriteUp`; `getAuthSession`, `getSessionIfRole` from `lib/auth.ts`; `ok`, `fail`, `ActionResult` from `lib/action-result.ts`.
- Produces (server actions):
  - `updateWriteUp(input: { gameId: string; kind: "preview" | "recap"; headline: string; body: string }): Promise<ActionResult>`
  - `setWriteUpHidden(input: { gameId: string; kind: "preview" | "recap"; hidden: boolean }): Promise<ActionResult>`
  - `regenerateWriteUp(input: { gameId: string; kind: "preview" | "recap" }): Promise<ActionResult>`
  - `WriteUpAdminControls({ gameId, writeUp, canRegenerate }: { gameId: string; writeUp: WriteUp; canRegenerate: boolean })`

- [ ] **Step 1: Write the server actions**

Create `app/games/[id]/write-up-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getAuthSession } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { generateAndStore } from "@/lib/write-ups/generate";

type Kind = "preview" | "recap";

// Edits go through the request client, so RLS ("admins manage write-ups")
// enforces the same rule the check below reports.
async function adminOnly() {
  const session = await getAuthSession();
  if (!session) return { ok: false as const, error: "Not signed in." };
  if (session.role !== "admin") return { ok: false as const, error: "Admins only." };
  return { ok: true as const, session, supabase: await createSupabaseServerClient() };
}

export async function updateWriteUp(input: {
  gameId: string;
  kind: Kind;
  headline: string;
  body: string;
}): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const headline = input.headline.trim();
  const body = input.body.trim();
  if (!headline || !body) return fail("Headline and body are required.");

  const { error } = await auth.supabase
    .from("game_write_ups")
    .update({ headline, body, edited_at: new Date().toISOString(), edited_by: auth.session.userId })
    .eq("game_id", input.gameId)
    .eq("kind", input.kind);
  if (error) return fail(error.message);
  revalidatePath(`/games/${input.gameId}`);
  return ok("Saved");
}

export async function setWriteUpHidden(input: { gameId: string; kind: Kind; hidden: boolean }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);
  const { error } = await auth.supabase
    .from("game_write_ups")
    .update({ hidden: input.hidden })
    .eq("game_id", input.gameId)
    .eq("kind", input.kind);
  if (error) return fail(error.message);
  revalidatePath(`/games/${input.gameId}`);
  return ok(input.hidden ? "Hidden" : "Visible");
}

// Discards the current text (including edits) and writes a fresh one. Refuses
// when the game is no longer in the right state, so a click can't delete a
// preview for a game that has already started and leave nothing behind.
export async function regenerateWriteUp(input: { gameId: string; kind: Kind }): Promise<ActionResult> {
  const auth = await adminOnly();
  if (!auth.ok) return fail(auth.error);

  const { data: game } = await auth.supabase.from("games").select("status").eq("id", input.gameId).maybeSingle();
  const wanted = input.kind === "preview" ? "scheduled" : "final";
  if (game?.status !== wanted) return fail(`A ${input.kind} can only be regenerated for a ${wanted} game.`);

  const { error } = await auth.supabase
    .from("game_write_ups")
    .delete()
    .eq("game_id", input.gameId)
    .eq("kind", input.kind);
  if (error) return fail(error.message);

  const result = await generateAndStore(input.kind, input.gameId);
  revalidatePath(`/games/${input.gameId}`);
  if (result.status !== "created") {
    return fail(`Couldn't regenerate (${result.detail ?? result.status}). The next daily run will try again.`);
  }
  return ok("Regenerated");
}
```

- [ ] **Step 2: Write the controls**

Create `components/WriteUpAdminControls.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { WriteUp } from "@/components/WriteUpCard";
import { regenerateWriteUp, setWriteUpHidden, updateWriteUp } from "@/app/games/[id]/write-up-actions";

const btn =
  "min-h-[40px] px-3 text-[12px] font-semibold uppercase tracking-[0.08em] rounded-[2px] border border-rule bg-board-3 text-ink-dim hover:border-rule-strong hover:text-ink disabled:opacity-50";

export function WriteUpAdminControls({
  gameId,
  writeUp,
  canRegenerate,
}: {
  gameId: string;
  writeUp: WriteUp;
  canRegenerate: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState(writeUp.headline);
  const [body, setBody] = useState(writeUp.body);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.message ?? "Saved");
        after?.();
        router.refresh();
      }
    });

  if (editing) {
    return (
      <div className="space-y-2 border-t border-rule pt-3">
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          aria-label="Headline"
          className="w-full min-h-[40px] bg-board-2 border border-rule-strong rounded-[2px] px-2 text-[15px] text-ink"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Body"
          rows={8}
          className="w-full bg-board-2 border border-rule-strong rounded-[2px] p-2 text-[14px] leading-relaxed text-ink"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            className={btn}
            onClick={() => run(() => updateWriteUp({ gameId, kind: writeUp.kind, headline, body }), () => setEditing(false))}
          >
            Save
          </button>
          <button type="button" disabled={pending} className={btn} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 border-t border-rule pt-3">
      <button type="button" disabled={pending} className={btn} onClick={() => setEditing(true)}>
        Edit
      </button>
      <button
        type="button"
        disabled={pending}
        className={btn}
        onClick={() => run(() => setWriteUpHidden({ gameId, kind: writeUp.kind, hidden: !writeUp.hidden }))}
      >
        {writeUp.hidden ? "Show" : "Hide"}
      </button>
      {canRegenerate && (
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() => {
            if (!confirm("Replace this write-up with a new one? Any edits will be lost.")) return;
            run(() => regenerateWriteUp({ gameId, kind: writeUp.kind }));
          }}
        >
          {pending ? "Working…" : "Regenerate"}
        </button>
      )}
    </div>
  );
}
```

The buttons use explicit utilities instead of `.eyebrow` on purpose: until the eyebrow color fix lands, `.eyebrow` overrides text color utilities.

- [ ] **Step 3: Wire it into the game page**

In `app/games/[id]/page.tsx`, add imports:

```ts
import { WriteUpAdminControls } from "@/components/WriteUpAdminControls";
import { getSessionIfRole } from "@/lib/auth";
```

Next to the write-up query from Task 8, add:

```ts
  const viewerIsAdmin = !!(await getSessionIfRole(["admin"]));
  const adminSlot = (w: WriteUp) =>
    viewerIsAdmin ? (
      <WriteUpAdminControls
        gameId={id}
        writeUp={w}
        canRegenerate={w.kind === "preview" ? game.status === "scheduled" : game.status === "final"}
      />
    ) : undefined;
```

Change the two `WriteUpCard` usages from Task 8 to pass the slot:

```tsx
          {previewWriteUp && <WriteUpCard writeUp={previewWriteUp} admin={adminSlot(previewWriteUp)} />}
```

```tsx
          <WriteUpCard writeUp={recapWriteUp} admin={adminSlot(recapWriteUp)} />
```

- [ ] **Step 4: Verify as admin and as a non-admin**

Sign in as `admin@moth.test` and open a game with a write-up:
- **Edit** → change the headline → **Save**: new headline shows, and the footer reads "edited by an admin". `select edited_at, edited_by from game_write_ups ...` is set.
- **Hide**: card dims and shows "Hidden" for the admin. Sign out (or open a private window): the card is gone. **Show** restores it.
- **Regenerate** on a final game's recap: confirm dialog → new text, `edited_at` back to null, a new `[write-ups]` `created` log line.
- **Regenerate** is absent on a preview whose game is now final.

Sign in as `player@moth.test` (a captain, not an admin): no Edit/Hide/Regenerate buttons. Then confirm the server refuses even without the UI, directly against the DB as that user:

```bash
U=$(psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -c "select id from auth.users where email='player@moth.test'")
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres <<SQL | grep -E 'UPDATE [0-9]+'
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','$U','role','authenticated')::text, true);
update game_write_ups set headline = 'hacked';
rollback;
SQL
```

Expected: `UPDATE 0` (RLS filters every row).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
bunx tsc --noEmit && bun run lint
git add "app/games/[id]/write-up-actions.ts" components/WriteUpAdminControls.tsx "app/games/[id]/page.tsx"
git commit -m "feat(write-ups): admin edit, hide and regenerate"
```

---
### Task 10: Docs, full verification, deploy checklist

**Files:**
- Modify: `docs/DATABASE.md` (Games & events list; RLS table)
- Modify: `docs/DEVELOPMENT.md` (new "AI write-ups" section)
- Modify: `CLAUDE.md` (Commands: test command replaces "No test runner is configured.")

**Interfaces:**
- Consumes: everything above.
- Produces: documentation only, plus the verified branch ready for a PR.

- [ ] **Step 1: Document the table**

In `docs/DATABASE.md`, after the `game_subs` bullet under "Games & events", add:

```markdown
- **`game_write_ups`** (`0023`) — AI-written `preview` / `recap` per game: `headline`,
  `body`, `model`, `generated_at`, `edited_at`/`edited_by`, `hidden`. PK `(game_id, kind)`.
  Written by the server with the service role (daily cron + after finalize); never
  overwritten by re-runs.
```

In the RLS summary table, after the `game_subs` row, add:

```markdown
| `game_write_ups` | public when not `hidden`; admins see all | admin (service role writes generated rows) |
```

- [ ] **Step 2: Document the workflow**

Append to `docs/DEVELOPMENT.md`:

```markdown
## AI write-ups (#19)

Game previews and recaps are written by a model through OpenRouter.

- **Model:** `WRITE_UP_MODEL` (default `openai/gpt-6-luna`), falling back to
  `WRITE_UP_FALLBACK_MODEL` (default `google/gemini-2.5-flash-lite`). Change either in
  Vercel's env settings; no deploy needed.
- **When:** a Vercel Cron job (`vercel.json`, daily 18:00 UTC) calls
  `/api/cron/write-ups` for previews of games in the next 36h and recaps missing
  from the last 7 days. Finalizing a game also writes its recap in the background.
- **Run it locally:**
  `curl -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3001/api/cron/write-ups`
- **Env:** `OPENROUTER_API_KEY`, `SUPABASE_SECRET_KEY` (server-only), `CRON_SECRET`,
  plus the two model vars. See `.env.local.example`.
- **OpenRouter guardrails:** the workspace must allow the OpenAI and Google
  providers. With Zero Data Retention on, at least one ZDR-compliant endpoint per
  model must stay allowed.
- **Tests:** `bun run test` runs the pure-module tests in `lib/`.
```

- [ ] **Step 3: Update the commands in `CLAUDE.md`**

Replace the line `No test runner is configured.` with:

```markdown
- `bun run test` — `bun test` over `lib/` (pure modules: matchup stats, write-up prompts/parsing). UI and DB behavior are verified in the browser against the local stack.
```

- [ ] **Step 4: Run every automated check**

```bash
bun run test
bunx tsc --noEmit
bun run lint
bun run build
```

Expected: all tests pass; no type errors; lint shows only the 2 existing warnings in `app/admin/schedule/page.tsx`; build succeeds.

- [ ] **Step 5: End-to-end pass on a freshly seeded stack**

```bash
bunx supabase db reset && scripts/local/seed-sample.sh 5
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At -f scripts/local/check-seed.sql   # expect no output
```

Then, with `bun dev` running:
1. Line up a sub as `player@moth.test` (Frost Giants captain) on Frost Giants' next game, and mark one Frost Giants top scorer `out` from the admin view.
2. Move that game into the window (`update games set scheduled_at = now() + interval '20 hours' where id = '<id>'`) and run the cron `curl` from Step 2.
3. Open `/games/<id>` at 390px: the preview write-up mentions the sub by name, names the absent top scorer, and doesn't name any other absent player; the panel's records match `/standings`.
4. As `scorekeeper@moth.test`, start the game, record goals (including one by the sub), and finalize. Within ~10s the recap appears on `/games/<id>` and credits the sub's goal as a sub.
5. Fact-check both write-ups line by line against their input JSON (log it temporarily, or rebuild it with the Task 5 check route). Any invented fact is a bug in the prompt or input: fix it and add a test before shipping.

- [ ] **Step 6: Commit**

```bash
git add docs/DATABASE.md docs/DEVELOPMENT.md CLAUDE.md
git commit -m "docs: AI write-ups workflow, table and test command"
```

- [ ] **Step 7: Deploy checklist (for the PR description)**

- Apply migration `0023` with `supabase db push` to staging, then prod at release. Confirm with
  `select policyname from pg_policies where tablename = 'game_write_ups'` rather than `migration list`.
- Set in Vercel (Preview + Production): `OPENROUTER_API_KEY`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `WRITE_UP_MODEL`, `WRITE_UP_FALLBACK_MODEL`.
- Vercel Cron runs only on the production deployment; on staging, trigger the route by hand with the `curl` above.
- Confirm the league timezone (`LEAGUE_TIME_ZONE` in `lib/write-ups/prompt.ts`) before merging.
