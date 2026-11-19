import { describe, expect, test } from "bun:test";
import {
  championTeamId,
  computeSeasonTotals,
  finalizeBlockers,
  proposeAwards,
  type FinalizeAppearance,
  type FinalizeEvent,
  type FinalizeGame,
  type FinalizeRosterEntry,
} from "@/lib/season-finalize";

const game = (id: string, home: string, away: string, hs: number, as: number, extra: Partial<FinalizeGame> = {}): FinalizeGame => ({
  id,
  kind: "regular",
  status: "final",
  playoff_round: null,
  home_team_id: home,
  away_team_id: away,
  home_score: hs,
  away_score: as,
  decided_in: "regulation",
  ...extra,
});

const goal = (game_id: string, team_id: string, scorer: string, a1: string | null = null): FinalizeEvent => ({
  game_id, team_id, type: "goal", player_id: scorer, assist1_player_id: a1, assist2_player_id: null,
  penalty_shot_taker_id: null, penalty_shot_result: null,
});

const penalty = (game_id: string, team_id: string, player: string, shot: { taker: string; result: "goal" | "saved" } | null = null): FinalizeEvent => ({
  game_id, team_id, type: "penalty", player_id: player, assist1_player_id: null, assist2_player_id: null,
  penalty_shot_taker_id: shot?.taker ?? null, penalty_shot_result: shot?.result ?? null,
});

const roster: FinalizeRosterEntry[] = [
  { player_id: "r-f", team_id: "red", position: "forward" },
  { player_id: "r-d", team_id: "red", position: "defense" },
  { player_id: "r-g", team_id: "red", position: "goalie" },
  { player_id: "b-f", team_id: "blue", position: "forward" },
  { player_id: "b-d", team_id: "blue", position: "defense" },
  { player_id: "b-g", team_id: "blue", position: "goalie" },
];

const appear = (game_id: string, players: string[], team_id: string): FinalizeAppearance[] =>
  players.map((player_id) => ({ game_id, player_id, team_id }));

describe("computeSeasonTotals", () => {
  const games = [
    game("g1", "red", "blue", 3, 1),
    game("g2", "blue", "red", 2, 1, { decided_in: "ot" }),
    game("p1", "red", "blue", 5, 0, { kind: "playoff", playoff_round: "final" }),
  ];
  const appearances = [
    ...appear("g1", ["r-f", "r-d", "r-g"], "red"),
    ...appear("g1", ["b-f", "b-d", "b-g"], "blue"),
    ...appear("g2", ["r-f", "r-d", "r-g"], "red"),
    ...appear("g2", ["b-f", "b-g"], "blue"),
    // b-d subbed for red in g2: shouldn't count toward b-d's totals.
    ...appear("g2", ["b-d"], "red"),
    ...appear("p1", ["r-f", "r-g", "b-g"], "red"),
  ];
  const events = [
    goal("g1", "red", "r-f", "r-d"),
    goal("g1", "red", "r-f"),
    goal("g1", "red", "r-d", "r-f"),
    goal("g1", "blue", "b-f"),
    penalty("g1", "blue", "b-d", { taker: "r-f", result: "saved" }),
    goal("g2", "blue", "b-f"),
    goal("g2", "red", "b-d"), // scored while subbing for red
    penalty("g2", "red", "r-d", { taker: "b-f", result: "goal" }),
    goal("p1", "red", "r-f"), // playoff — excluded
  ];
  const totals = computeSeasonTotals(games, roster, appearances, events);
  const by = (id: string) => totals.find((t) => t.player_id === id)!;

  test("counts regular-season skater stats only", () => {
    expect(by("r-f")).toMatchObject({ games_played: 2, goals: 2, assists: 1, penalty_shots_taken: 1, penalty_shots_made: 0 });
    expect(by("r-f").goals_against).toBeNull();
    expect(by("r-d")).toMatchObject({ goals: 1, assists: 1, penalties: 1 });
  });

  test("skips games subbed for another team", () => {
    expect(by("b-d")).toMatchObject({ games_played: 1, goals: 0, penalties: 1 });
  });

  test("computes goalie record and goals against", () => {
    // g1: 1 GA, W. g2: 1 goal + 1 penalty-shot goal, OTL.
    expect(by("r-g")).toMatchObject({ games_played: 2, goals_against: 3, penalty_shots_faced: 1, wins: 1, losses: 0, ot_losses: 1 });
    // g1: 3 GA + 1 PS saved, L. g2: 1 GA (b-d's goal for red), W.
    expect(by("b-g")).toMatchObject({ goals_against: 4, penalty_shots_faced: 1, penalty_shots_saved: 1, wins: 1, losses: 1 });
  });

  test("omits players with no counted games", () => {
    const t = computeSeasonTotals(games, [...roster, { player_id: "x", team_id: "red", position: "forward" }], appearances, events);
    expect(t.find((r) => r.player_id === "x")).toBeUndefined();
  });
});

describe("championTeamId / finalizeBlockers", () => {
  test("winner of the final", () => {
    expect(championTeamId([game("f", "red", "blue", 1, 2, { kind: "playoff", playoff_round: "final" })])).toBe("blue");
  });

  test("no final or unfinished games block finalizing", () => {
    expect(finalizeBlockers([game("g1", "red", "blue", 1, 0)])).toEqual(["No playoff final is scheduled."]);
    expect(
      finalizeBlockers([
        game("g1", "red", "blue", 0, 0, { status: "scheduled" }),
        game("f", "red", "blue", 0, 0, { kind: "playoff", playoff_round: "final", status: "scheduled" }),
      ]),
    ).toEqual(["2 games are not final yet."]);
    expect(finalizeBlockers([game("f", "red", "blue", 2, 1, { kind: "playoff", playoff_round: "final" })])).toEqual([]);
  });
});

describe("proposeAwards", () => {
  const t = (player_id: string, position: "forward" | "defense" | "goalie", s: Partial<{ gp: number; g: number; a: number; pen: number; ga: number }>) => ({
    player_id,
    team_id: player_id.startsWith("r") ? "red" : "blue",
    position,
    games_played: s.gp ?? 10,
    goals: s.g ?? 0,
    assists: s.a ?? 0,
    penalties: s.pen ?? 0,
    penalty_shots_taken: 0,
    penalty_shots_made: 0,
    goals_against: position === "goalie" ? (s.ga ?? 0) : null,
    penalty_shots_faced: null,
    penalty_shots_saved: null,
    wins: null,
    losses: null,
    ot_losses: null,
  });
  const games = [
    ...Array.from({ length: 10 }, (_, i) => game(`g${i}`, "red", "blue", 1, 0)),
    game("f", "red", "blue", 4, 2, { kind: "playoff", playoff_round: "final" }),
  ];

  test("ties produce co-winners; zero leaders get nothing", () => {
    const awards = proposeAwards(
      [t("r-f", "forward", { g: 5, a: 2 }), t("b-f", "forward", { g: 5, a: 4 }), t("r-d", "defense", { a: 3 })],
      roster,
      games,
    );
    expect(awards.sniper.sort()).toEqual(["b-f", "r-f"]);
    expect(awards.mvp).toEqual(["b-f"]);
    expect(awards.playmaker).toEqual(["b-f"]);
    expect(awards.mvd).toEqual(["r-d"]);
    expect(awards.goon).toEqual([]);
  });

  test("champion is the winning roster", () => {
    expect(proposeAwards([], roster, games).champion).toEqual(["r-f", "r-d", "r-g"]);
  });

  test("vezina is lowest GAA among goalies with half the season", () => {
    const awards = proposeAwards(
      [t("r-g", "goalie", { gp: 8, ga: 16 }), t("b-g", "goalie", { gp: 4, ga: 4 }), t("b-x", "goalie", { gp: 2, ga: 0 })],
      roster,
      games,
    );
    // b-g and b-x are under the 5-game minimum, so r-g wins despite a 2.0 GAA.
    expect(awards.vezina).toEqual(["r-g"]);
    const awards2 = proposeAwards(
      [t("r-g", "goalie", { gp: 8, ga: 16 }), t("b-g", "goalie", { gp: 5, ga: 5 }), t("b-x", "goalie", { gp: 2, ga: 0 })],
      roster,
      games,
    );
    expect(awards2.vezina).toEqual(["b-g"]);
  });
});
