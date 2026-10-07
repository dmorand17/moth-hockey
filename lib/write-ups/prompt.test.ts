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
