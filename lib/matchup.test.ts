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
