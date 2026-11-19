import { describe, expect, test } from "bun:test";
import type { SeasonRecap } from "@/lib/queries";
import { buildRecapFacts, computeRecap } from "@/lib/recap-summary/facts";

const game = (id: string, kind: "regular" | "playoff", home: string, away: string, hs: number, as: number, date: string, round: string | null = null) => ({
  id, kind, status: "final" as const, playoff_round: round, home_team_id: home, away_team_id: away,
  home_score: hs, away_score: as, decided_in: "regulation", scheduled_at: `${date}T23:00:00Z`,
  shootout_home_goals: null, shootout_away_goals: null,
});
const goal = (game_id: string, team_id: string, player_id: string) => ({
  game_id, team_id, type: "goal" as const, player_id, assist1_player_id: null, assist2_player_id: null,
  penalty_shot_taker_id: null, penalty_shot_result: null,
});

function fixture(withPlayoffs = true): SeasonRecap {
  const games = [
    game("r1", "regular", "A", "B", 3, 1, "2026-03-01"),
    game("r2", "regular", "B", "A", 2, 1, "2026-03-08"),
    ...(withPlayoffs ? [game("f", "playoff", "B", "A", 1, 2, "2026-03-15", "final")] : []),
  ];
  return {
    season: { id: "s", name: "Spring 2026", start_date: "2026-03-01", is_current: false, finalized_at: "2026-03-20" },
    state: "complete",
    hasGames: true,
    teams: new Map([
      ["A", { id: "A", name: "Ember Wolves", slug: "ember-wolves", color: "#f80" }],
      ["B", { id: "B", name: "Green Vipers", slug: "green-vipers", color: "#0f8" }],
    ]),
    players: new Map([["p1", { id: "p1", name: "Lane Kane" }], ["p2", { id: "p2", name: "Kai Hale" }]]),
    games,
    inputs: {
      games,
      roster: [{ player_id: "p1", team_id: "A", position: "forward" }, { player_id: "p2", team_id: "B", position: "forward" }],
      appearances: games.flatMap((g) => [
        { game_id: g.id, player_id: "p1", team_id: "A" },
        { game_id: g.id, player_id: "p2", team_id: "B" },
      ]),
      events: [goal("r1", "A", "p1"), goal("r1", "A", "p1"), goal("r2", "B", "p2")],
    },
    standings: [
      { team_id: "A", name: "Ember Wolves", slug: "ember-wolves", color: "#f80", gp: 2, w: 1, l: 1, otl: 0, pts: 3, gf: 4, ga: 3, diff: 1 },
      { team_id: "B", name: "Green Vipers", slug: "green-vipers", color: "#0f8", gp: 2, w: 1, l: 1, otl: 0, pts: 3, gf: 3, ga: 4, diff: -1 },
    ],
    historical: null,
    championTeamId: withPlayoffs ? "A" : null,
    awards: [{ type: "mvp", label: "MVP", winners: [{ id: "p1", name: "Lane Kane" }] }],
    storedTotals: null,
    board: { threads: [], from: null, to: null },
  } as unknown as SeasonRecap;
}

describe("buildRecapFacts", () => {
  test("collects champion, standings, playoffs and awards", () => {
    const r = fixture();
    const f = buildRecapFacts(r, computeRecap(r));
    expect(f.season).toEqual({ name: "Spring 2026", start: "2026-03-01", end: "2026-03-15" });
    expect(f.champion).toBe("Ember Wolves");
    expect(f.standings?.[0]).toEqual({ team: "Ember Wolves", record: "1-1-0", pts: 3, gf: 4, ga: 3 });
    expect(f.playoffs?.games[0]).toMatchObject({ round: "final", away: "Ember Wolves", home: "Green Vipers", score: "2-1" });
    expect(f.awards).toEqual([{ award: "MVP", winners: ["Lane Kane"] }]);
    expect(f.regular.leaders.goals[0]).toEqual({ player: "Lane Kane", team: "Ember Wolves", value: 2 });
  });

  test("no playoffs and no champion", () => {
    const r = fixture(false);
    const f = buildRecapFacts(r, computeRecap(r));
    expect(f.champion).toBeNull();
    expect(f.playoffs).toBeNull();
  });
});
