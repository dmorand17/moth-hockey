import { describe, expect, test } from "bun:test";
import type { FinalizeEvent, SeasonTotals } from "@/lib/season-finalize";
import {
  describeMoment,
  goalieMinGames,
  notableMoments,
  playoffPath,
  seasonNumbers,
  topGoalies,
  topSkaters,
  type RecapGame,
} from "@/lib/season-recap";

let day = 1;
const g = (id: string, home: string | null, away: string | null, hs: number, as: number, extra: Partial<RecapGame> = {}): RecapGame => ({
  id,
  kind: "regular",
  status: "final",
  playoff_round: null,
  home_team_id: home,
  away_team_id: away,
  home_score: hs,
  away_score: as,
  decided_in: "regulation",
  scheduled_at: `2026-03-${String(day++).padStart(2, "0")}T23:00:00Z`,
  shootout_home_goals: null,
  shootout_away_goals: null,
  ...extra,
});
const goal = (game_id: string, team_id: string, scorer: string, a1: string | null = null): FinalizeEvent => ({
  game_id, team_id, type: "goal", player_id: scorer, assist1_player_id: a1, assist2_player_id: null,
  penalty_shot_taker_id: null, penalty_shot_result: null,
});
const pen = (game_id: string, team_id: string, player: string): FinalizeEvent => ({
  game_id, team_id, type: "penalty", player_id: player, assist1_player_id: null, assist2_player_id: null,
  penalty_shot_taker_id: null, penalty_shot_result: null,
});
const totals = (player_id: string, x: Partial<SeasonTotals>): SeasonTotals => ({
  player_id, team_id: "A", position: "forward", games_played: 1, goals: 0, assists: 0, penalties: 0,
  penalty_shots_taken: 0, penalty_shots_made: 0, goals_against: null, penalty_shots_faced: null,
  penalty_shots_saved: null, wins: null, losses: null, ot_losses: null, ...x,
});

describe("seasonNumbers", () => {
  test("returns null numbers for no games", () => {
    expect(seasonNumbers([], [], "regular")).toBeNull();
  });

  test("counts regular and playoff separately", () => {
    const games = [
      g("r1", "A", "B", 4, 2, { decided_in: "ot" }),
      g("r2", "A", "B", 3, 1),
      g("p1", "A", "B", 2, 1, { kind: "playoff", playoff_round: "final" }),
      g("s1", "A", "B", 0, 0, { status: "scheduled" }),
    ];
    const events = [pen("r1", "A", "x")];
    expect(seasonNumbers(games, events, "regular")).toEqual({ games: 2, goals: 10, goalsPerGame: 5, overtime: 1, shootouts: 0, penalties: 1 });
    expect(seasonNumbers(games, events, "playoff")).toMatchObject({ games: 1, goals: 3, penalties: 0 });
  });
});

describe("notableMoments", () => {
  test("ignores tied games for margins", () => {
    const games = [g("so", "A", "B", 3, 3, { decided_in: "shootout" }), g("big", "A", "B", 5, 1)];
    const m = notableMoments(games, [], "regular").find((x) => x.kind === "margin");
    expect(m).toMatchObject({ gameId: "big", value: 4 });
  });

  test("breaks ties by earliest game", () => {
    const games = [g("early", "A", "B", 5, 1), g("late", "B", "A", 6, 2)];
    expect(notableMoments(games, [], "regular").find((x) => x.kind === "margin")?.gameId).toBe("early");
  });

  test("hat tricks collapse into one card, most first", () => {
    const games = [g("h1", "A", "B", 3, 0), g("h2", "A", "B", 3, 0), g("h3", "B", "A", 3, 0)];
    const ev = [
      ...[1, 2, 3].map(() => goal("h1", "A", "p1")),
      ...[1, 2, 3].map(() => goal("h2", "A", "p1")),
      ...[1, 2, 3].map(() => goal("h3", "B", "p2")),
    ];
    const m = notableMoments(games, ev, "regular");
    expect(m.filter((x) => x.kind === "hat-tricks")).toEqual([
      expect.objectContaining({ gameId: null, value: 3, players: [{ playerId: "p1", count: 2 }, { playerId: "p2", count: 1 }] }),
    ]);
    expect(m.some((x) => (x.kind as string) === "hat-trick")).toBe(false);
  });

  test("a 4+ goal game is a big night and still counts as a hat trick", () => {
    const games = [g("b", "A", "B", 4, 0)];
    const ev = [1, 2, 3, 4].map(() => goal("b", "A", "p1"));
    const m = notableMoments(games, ev, "regular");
    expect(m).toContainEqual(expect.objectContaining({ kind: "big-night", gameId: "b", playerId: "p1", value: 4 }));
    expect(m.find((x) => x.kind === "hat-tricks")?.value).toBe(1);
  });

  test("describeMoment formats the hat-trick card", () => {
    const names = { teams: new Map(), players: new Map([["p1", { id: "p1", name: "Lane Kane" }], ["p2", { id: "p2", name: "Kai Hale" }]]) };
    const m = { kind: "hat-tricks" as const, gameId: null, teamId: null, playerId: null, value: 3, date: "", players: [{ playerId: "p1", count: 2 }, { playerId: "p2", count: 1 }] };
    expect(describeMoment(m, undefined, names)).toEqual({ label: "Hat tricks · 3", text: "Lane Kane ×2 · Kai Hale" });
  });

  test("finds win streaks of 3+", () => {
    const games = [g("1", "A", "B", 2, 1), g("2", "C", "A", 0, 3), g("3", "A", "B", 4, 0), g("4", "A", "C", 0, 1)];
    const streaks = notableMoments(games, [], "regular").filter((x) => x.kind === "win-streak");
    expect(streaks).toEqual([expect.objectContaining({ teamId: "A", value: 3 })]);
  });

  test("only counts the requested kind", () => {
    const games = [g("r", "A", "B", 9, 0), g("p", "A", "B", 2, 1, { kind: "playoff", playoff_round: "sf1" })];
    expect(notableMoments(games, [], "playoff").find((x) => x.kind === "margin")?.gameId).toBe("p");
  });
});

describe("playoffPath", () => {
  test("playoff path ignores unplayed games", () => {
    const games = [
      g("f", null, null, 0, 0, { kind: "playoff", playoff_round: "final", status: "scheduled" }),
      g("sf2", null, null, 0, 0, { kind: "playoff", playoff_round: "sf2", status: "scheduled" }),
      g("sf1", "A", "B", 3, 2, { kind: "playoff", playoff_round: "sf1" }),
    ];
    expect(playoffPath(games).map((x) => x.id)).toEqual(["sf1"]);
  });

  test("orders rounds sf before final", () => {
    const games = [
      g("f", "A", "C", 2, 1, { kind: "playoff", playoff_round: "final" }),
      g("sf2", "C", "D", 3, 2, { kind: "playoff", playoff_round: "sf2" }),
      g("sf1", "A", "B", 3, 2, { kind: "playoff", playoff_round: "sf1" }),
    ];
    expect(playoffPath(games).map((x) => x.id)).toEqual(["sf1", "sf2", "f"]);
  });
});

describe("leaders", () => {
  test("topSkaters ranks points, then goals", () => {
    const t = [totals("a", { goals: 1, assists: 3 }), totals("b", { goals: 3, assists: 1 }), totals("c", { goals: 0, assists: 1 })];
    expect(topSkaters(t, "points", 2).map((x) => x.player_id)).toEqual(["b", "a"]);
  });

  test("topGoalies respects minimum games", () => {
    const t = [
      totals("one", { position: "goalie", games_played: 1, goals_against: 0, wins: 1 }),
      totals("two", { position: "goalie", games_played: 4, goals_against: 8, wins: 3 }),
    ];
    expect(topGoalies(t, 2).map((x) => x.player_id)).toEqual(["two"]);
  });

  test("goalieMinGames is half the most games played by a team, rounded up", () => {
    const games = [g("1", "A", "B", 1, 0), g("2", "A", "B", 1, 0), g("3", "A", "C", 1, 0)];
    expect(goalieMinGames(games, "regular")).toBe(2);
  });
});

describe("player moments follow the roster-team rule", () => {
  test("a sub's hat trick for another team (or with no roster spot) isn't a moment", () => {
    const games = [g("x", "A", "B", 3, 0)];
    const events = [goal("x", "A", "sub"), goal("x", "A", "sub"), goal("x", "A", "sub")];
    const rosterTeam = new Map([["sub", "C"]]);
    const m = notableMoments(games, events, "regular", rosterTeam);
    expect(m.filter((x) => x.kind === "hat-tricks" || x.kind === "points-game")).toEqual([]);
    const unrostered = notableMoments(games, events, "regular", new Map());
    expect(unrostered.filter((x) => x.kind === "hat-tricks" || x.kind === "points-game")).toEqual([]);
  });

  test("a rostered player's hat trick for their own team still counts", () => {
    const games = [g("y", "A", "B", 3, 0)];
    const events = [goal("y", "A", "p"), goal("y", "A", "p"), goal("y", "A", "p")];
    expect(notableMoments(games, events, "regular", new Map([["p", "A"]]))).toContainEqual(
      expect.objectContaining({ kind: "hat-tricks", players: [{ playerId: "p", count: 1 }] }),
    );
  });
});

describe("best single game", () => {
  test("needs at least 2 points", () => {
    const games = [g("z", "A", "B", 1, 0)];
    const events = [goal("z", "A", "p")];
    expect(notableMoments(games, events, "regular").filter((x) => x.kind === "points-game")).toEqual([]);
  });
});
