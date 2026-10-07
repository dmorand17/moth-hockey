// Reads loosely-typed nested JSON from the builders; `any` keeps the
// assertions readable.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from "bun:test";
import type { KeyMatchup, TeamForm } from "@/lib/matchup";
import { buildPreviewInput, buildRecapInput, SYSTEM_PROMPT, userMessage } from "@/lib/write-ups/prompt";

const form: TeamForm = {
  gp: 6, record: "3-3-0", points: 9, goalsFor: 14, goalsAgainst: 17,
  gfPerGame: 14 / 6, gaPerGame: 17 / 6, lastThreeMostRecentFirst: ["W 4-3 vs Ember Wolves"],
};
const roster = {
  rosterSize: 9, inCount: 0, outCount: 0, outKeyPlayers: [], noResponseCount: 9,
  rosteredGoalie: "Jordan Shaw", subsLinedUp: [],
};

const noSeason = { standing: null, seasonLeaders: [], goalieSeason: null };

describe("buildPreviewInput", () => {
  const km: KeyMatchup = {
    scorer: { name: "Marlow Fenn", team: "Iron Ravens", goals: 4 },
    goalie: { name: "Devon Ward", team: "Ember Wolves", teamGaPerGame: 2.833333 },
  };
  const input = buildPreviewInput({
    scheduledAt: "2026-04-26T23:00:00Z",
    home: { name: "Iron Ravens", form, topScorers: [{ playerId: "a", name: "Marlow Fenn", goals: 4 }], roster, ...noSeason },
    away: { name: "Frost Giants", form, topScorers: [], roster, ...noSeason },
    projection: null,
    keyMatchup: null,
    headToHead: [],
  }) as Record<string, any>;

  const inputWithMatchup = buildPreviewInput({
    scheduledAt: "2026-04-26T23:00:00Z",
    home: { name: "Iron Ravens", form, topScorers: [{ playerId: "a", name: "Marlow Fenn", goals: 4 }], roster, ...noSeason },
    away: { name: "Frost Giants", form, topScorers: [], roster, ...noSeason },
    projection: null,
    keyMatchup: km,
    headToHead: [],
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

  test("key_matchup emits snake_case with rounded teamGaPerGame", () => {
    expect(inputWithMatchup.key_matchup).toEqual({
      scorer: { name: "Marlow Fenn", team: "Iron Ravens", goals: 4 },
      goalie: { name: "Devon Ward", team: "Ember Wolves", team_ga_per_game: 2.83 },
    });
  });

  test("key_matchup is 'none' when null", () => {
    expect(input.key_matchup).toBe("none");
  });

  test("season_leaders replaces top_scorers in emitted JSON", () => {
    const leader = { name: "Marlow Fenn", goals: 7, assists: 3, points: 10, leagueRankPoints: 1, leagueRankGoals: 1 };
    const goalieSeason = { name: "Jordan Shaw", gp: 5, w: 3, l: 1, otl: 1, ga: 10, gaa: 2.0 };
    const rich = buildPreviewInput({
      scheduledAt: "2026-04-26T23:00:00Z",
      home: {
        name: "Iron Ravens", form, topScorers: [{ playerId: "a", name: "Marlow Fenn", goals: 7 }], roster,
        standing: { place: 2, of: 6 },
        seasonLeaders: [leader],
        goalieSeason,
      },
      away: { name: "Frost Giants", form, topScorers: [], roster, ...noSeason },
      projection: null, keyMatchup: null, headToHead: [],
    }) as Record<string, any>;

    expect(rich.home_team.standing).toEqual({ place: 2, of: 6 });
    expect(rich.home_team.season_leaders).toHaveLength(1);
    expect(rich.home_team.season_leaders[0]).toEqual({
      name: "Marlow Fenn", goals: 7, assists: 3, points: 10, league_rank_points: 1, league_rank_goals: 1,
    });
    expect(rich.home_team.goalie_season).toEqual({ name: "Jordan Shaw", gp: 5, w: 3, l: 1, otl: 1, ga: 10, gaa: 2.0 });
    expect(rich.home_team.top_scorers).toBeUndefined();
  });

  test("head_to_head_this_season formats dates and results", () => {
    const withH2H = buildPreviewInput({
      scheduledAt: "2026-04-26T23:00:00Z",
      home: { name: "Iron Ravens", form, topScorers: [], roster, ...noSeason },
      away: { name: "Frost Giants", form, topScorers: [], roster, ...noSeason },
      projection: null, keyMatchup: null,
      headToHead: [
        { playedOn: "2026-03-16T00:00:00Z", home: "Iron Ravens", away: "Frost Giants", homeScore: 3, awayScore: 2, decidedIn: "ot" },
      ],
    }) as Record<string, any>;

    expect(withH2H.head_to_head_this_season).toHaveLength(1);
    expect(withH2H.head_to_head_this_season[0].played_on).toBe("Sunday, March 15");
    expect(withH2H.head_to_head_this_season[0].result).toBe("Iron Ravens 3, Frost Giants 2 (OT)");
  });

  test("head_to_head_this_season is empty array when no prior meetings", () => {
    expect(input.head_to_head_this_season).toEqual([]);
  });

  test("(SO) suffix for shootout head-to-head", () => {
    const withSO = buildPreviewInput({
      scheduledAt: "2026-04-26T23:00:00Z",
      home: { name: "Iron Ravens", form, topScorers: [], roster, ...noSeason },
      away: { name: "Frost Giants", form, topScorers: [], roster, ...noSeason },
      projection: null, keyMatchup: null,
      headToHead: [
        { playedOn: "2026-03-16T00:00:00Z", home: "Iron Ravens", away: "Frost Giants", homeScore: 2, awayScore: 1, decidedIn: "shootout" },
      ],
    }) as Record<string, any>;
    expect(withSO.head_to_head_this_season[0].result).toBe("Iron Ravens 2, Frost Giants 1 (SO)");
  });
});

const noRecapSeason = { standingAfter: null, goaliesSeasonAfter: [] };

describe("buildRecapInput", () => {
  const src = {
    scheduledAt: "2026-04-12T23:00:00Z",
    homeScore: 2, awayScore: 1, decidedIn: "ot" as const,
    periodLengthSeconds: 1020,
    home: { name: "Iron Ravens", recordAfter: "3-3-0", lineup: { skatersDressed: 8, goalie: "Jordan Shaw", subs: ["Kai Hale"] }, ...noRecapSeason },
    away: { name: "Ember Wolves", recordAfter: "3-2-1", lineup: { skatersDressed: 6, goalie: "Devon Ward", subs: [] }, ...noRecapSeason },
    goals: [
      { period: 1, clockSeconds: 554, team: "Iron Ravens", scorer: "Kai Hale", scorerIsSub: true, assists: [], penaltyShot: false },
      { period: 3, clockSeconds: 209, team: "Ember Wolves", scorer: "Quinn Cross", scorerIsSub: false, assists: ["Parker Ellis"], penaltyShot: false },
      { period: 4, clockSeconds: 151, team: "Iron Ravens", scorer: "Frankie Byrne", scorerIsSub: false, assists: ["Alex Boyd", "Marlow Fenn"], penaltyShot: false },
    ],
    penalties: [
      { period: 2, clockSeconds: 600, team: "Ember Wolves", player: "Rowan Iver", penalty: "Tripping", shotResult: "saved" as const, shooter: null },
    ],
    shootout: null,
    seasonTotalsAfter: [],
    headToHead: [],
  };
  const input = buildRecapInput(src) as Record<string, any>;

  test("date, final and decided_in", () => {
    expect(input.game.played_on).toBe("Sunday, April 12");
    expect(input.game.final).toBe("Iron Ravens 2, Ember Wolves 1");
    expect(input.game.decided_in).toBe("overtime");
  });

  test("goals carry period labels, elapsed time, sub flag and running score", () => {
    // clockSeconds are time REMAINING; elapsed = periodLength - remaining
    // P1: 1020 - 554 = 466 = 7:46
    // P3: 1020 - 209 = 811 = 13:31
    // OT: 300 - 151 = 149 = 2:29
    expect(input.goals.map((g: any) => [g.period, g.time, g.score_after])).toEqual([
      ["P1", "7:46", "Iron Ravens 1, Ember Wolves 0"],
      ["P3", "13:31", "Iron Ravens 1, Ember Wolves 1"],
      ["OT", "2:29", "Iron Ravens 2, Ember Wolves 1"],
    ]);
    expect(input.goals[0].scorer_is_sub).toBe(true);
    expect(input.goals[2].assists).toBe("Alex Boyd, Marlow Fenn");
    expect(input.goals[1].assists).toBe("Parker Ellis");
    // no time_remaining field
    expect(input.goals[0].time_remaining).toBeUndefined();
  });

  test("goals emit penalty_shot flag", () => {
    expect(input.goals[0].penalty_shot).toBe(false);
    expect(input.goals[1].penalty_shot).toBe(false);
  });

  test("lineups and penalties", () => {
    expect(input.lineups["Iron Ravens"]).toEqual({ skaters_dressed: 8, goalie: "Jordan Shaw", subs: ["Kai Hale"] });
    expect(input.penalties).toEqual([{
      period: "P2", time: "7:00", team: "Ember Wolves", player: "Rowan Iver", penalty: "Tripping",
      shot_result: "saved", shooter: null,
    }]);
  });

  test("no shootout block when decidedIn is not shootout", () => {
    expect(input.shootout).toBeUndefined();
  });

  test("standing_after keyed by team name", () => {
    const rich = buildRecapInput({
      ...src,
      home: { ...src.home, standingAfter: { place: 1, of: 6 } },
      away: { ...src.away, standingAfter: { place: 3, of: 6 } },
    }) as Record<string, any>;
    expect(rich.standing_after["Iron Ravens"]).toEqual({ place: 1, of: 6 });
    expect(rich.standing_after["Ember Wolves"]).toEqual({ place: 3, of: 6 });
  });

  test("goalies_season_after keyed by team name", () => {
    const gr = { name: "Jordan Shaw", gp: 6, w: 3, l: 2, otl: 1, ga: 14, gaa: 2.33 };
    const rich = buildRecapInput({
      ...src,
      home: { ...src.home, goaliesSeasonAfter: [gr] },
    }) as Record<string, any>;
    expect(rich.goalies_season_after["Iron Ravens"]).toHaveLength(1);
    expect(rich.goalies_season_after["Iron Ravens"][0]).toEqual({ name: "Jordan Shaw", gp: 6, w: 3, l: 2, otl: 1, ga: 14, gaa: 2.33 });
    expect(rich.goalies_season_after["Ember Wolves"]).toEqual([]);
  });

  test("season_totals_after maps to snake_case", () => {
    const rich = buildRecapInput({
      ...src,
      seasonTotalsAfter: [
        { name: "Kai Hale", team: "Iron Ravens", goals: 5, assists: 3, points: 8, leagueRankPoints: 1, leagueRankGoals: 2 },
      ],
    }) as Record<string, any>;
    expect(rich.season_totals_after).toHaveLength(1);
    expect(rich.season_totals_after[0]).toEqual({
      name: "Kai Hale", team: "Iron Ravens", goals: 5, assists: 3, points: 8, league_rank_points: 1, league_rank_goals: 2,
    });
  });

  test("head_to_head_this_season in recap includes result string", () => {
    const rich = buildRecapInput({
      ...src,
      headToHead: [
        { playedOn: "2026-04-12T23:00:00Z", home: "Iron Ravens", away: "Ember Wolves", homeScore: 2, awayScore: 1, decidedIn: "ot" },
      ],
    }) as Record<string, any>;
    expect(rich.head_to_head_this_season).toHaveLength(1);
    expect(rich.head_to_head_this_season[0].result).toBe("Iron Ravens 2, Ember Wolves 1 (OT)");
  });
});

describe("buildRecapInput elapsed time edge cases", () => {
  const base = {
    scheduledAt: "2026-04-12T23:00:00Z",
    homeScore: 1, awayScore: 0, decidedIn: "regulation" as const,
    periodLengthSeconds: 1020,
    home: { name: "Home", recordAfter: "1-0-0", lineup: { skatersDressed: 7, goalie: "G", subs: [] }, ...noRecapSeason },
    away: { name: "Away", recordAfter: "0-1-0", lineup: { skatersDressed: 7, goalie: "G2", subs: [] }, ...noRecapSeason },
    goals: [] as any[],
    penalties: [] as any[],
    shootout: null,
    seasonTotalsAfter: [],
    headToHead: [],
  };

  test("puck drop: 17:00 remaining → 0:00 elapsed", () => {
    const src = {
      ...base,
      goals: [{ period: 1, clockSeconds: 1020, team: "Home", scorer: "X", scorerIsSub: false, assists: [], penaltyShot: false }],
    };
    const input = buildRecapInput(src) as Record<string, any>;
    expect(input.goals[0].time).toBe("0:00");
  });

  test("OT: 2:31 remaining → 2:29 elapsed", () => {
    const src = {
      ...base,
      homeScore: 1, awayScore: 0, decidedIn: "ot" as const,
      goals: [{ period: 4, clockSeconds: 151, team: "Home", scorer: "X", scorerIsSub: false, assists: [], penaltyShot: false }],
    };
    const input = buildRecapInput(src) as Record<string, any>;
    expect(input.goals[0].time).toBe("2:29");
  });
});

describe("buildRecapInput penalty-shot goal", () => {
  test("penalty-shot goal appears in goals[] attributed to the shooting team with penalty_shot: true", () => {
    const src = {
      scheduledAt: "2026-04-12T23:00:00Z",
      homeScore: 2, awayScore: 1, decidedIn: "regulation" as const,
      periodLengthSeconds: 1020,
      home: { name: "Iron Ravens", recordAfter: "2-0-0", lineup: { skatersDressed: 7, goalie: "GH", subs: [] }, ...noRecapSeason },
      away: { name: "Ember Wolves", recordAfter: "0-2-0", lineup: { skatersDressed: 7, goalie: "GA", subs: [] }, ...noRecapSeason },
      goals: [
        { period: 1, clockSeconds: 500, team: "Iron Ravens", scorer: "Alice", scorerIsSub: false, assists: [], penaltyShot: false },
        // A penalty-shot goal: committed by Iron Ravens, so shooting team = Ember Wolves
        { period: 2, clockSeconds: 800, team: "Ember Wolves", scorer: "Bob", scorerIsSub: false, assists: [], penaltyShot: true },
        { period: 3, clockSeconds: 200, team: "Iron Ravens", scorer: "Carol", scorerIsSub: false, assists: [], penaltyShot: false },
      ],
      penalties: [
        { period: 2, clockSeconds: 800, team: "Iron Ravens", player: "Dave", penalty: "Tripping", shotResult: "goal" as const, shooter: "Bob" },
      ],
      shootout: null,
      seasonTotalsAfter: [],
      headToHead: [],
    };
    const input = buildRecapInput(src) as Record<string, any>;
    // Three goals, running score reaches 2-1
    expect(input.goals).toHaveLength(3);
    expect(input.goals[1].penalty_shot).toBe(true);
    expect(input.goals[1].team).toBe("Ember Wolves");
    expect(input.goals[1].scorer).toBe("Bob");
    expect(input.goals[2].score_after).toBe("Iron Ravens 2, Ember Wolves 1");
    // penalty emits shot_result and shooter
    expect(input.penalties[0].shot_result).toBe("goal");
    expect(input.penalties[0].shooter).toBe("Bob");
  });
});

describe("buildRecapInput shootout block", () => {
  test("shootout game emits shootout block with winner", () => {
    const src = {
      scheduledAt: "2026-04-12T23:00:00Z",
      homeScore: 3, awayScore: 2, decidedIn: "shootout" as const,
      periodLengthSeconds: 1020,
      home: { name: "Iron Ravens", recordAfter: "3-0-0", lineup: { skatersDressed: 7, goalie: "GH", subs: [] }, ...noRecapSeason },
      away: { name: "Ember Wolves", recordAfter: "0-3-0", lineup: { skatersDressed: 7, goalie: "GA", subs: [] }, ...noRecapSeason },
      goals: [
        { period: 1, clockSeconds: 500, team: "Iron Ravens", scorer: "Alice", scorerIsSub: false, assists: [], penaltyShot: false },
        { period: 1, clockSeconds: 300, team: "Ember Wolves", scorer: "Bob", scorerIsSub: false, assists: [], penaltyShot: false },
      ],
      penalties: [],
      shootout: { homeGoals: 3, awayGoals: 2 },
      seasonTotalsAfter: [],
      headToHead: [],
    };
    const input = buildRecapInput(src) as Record<string, any>;
    expect(input.shootout).toBeDefined();
    expect(input.shootout.winner).toBe("Iron Ravens");
    expect(input.shootout.home_goals).toBe(3);
    expect(input.shootout.away_goals).toBe(2);
    expect(typeof input.shootout.note).toBe("string");
  });

  test("regulation game has no shootout block", () => {
    const src = {
      scheduledAt: "2026-04-12T23:00:00Z",
      homeScore: 2, awayScore: 1, decidedIn: "regulation" as const,
      periodLengthSeconds: 1020,
      home: { name: "Home", recordAfter: "1-0-0", lineup: { skatersDressed: 7, goalie: "GH", subs: [] }, ...noRecapSeason },
      away: { name: "Away", recordAfter: "0-1-0", lineup: { skatersDressed: 7, goalie: "GA", subs: [] }, ...noRecapSeason },
      goals: [{ period: 1, clockSeconds: 500, team: "Home", scorer: "X", scorerIsSub: false, assists: [], penaltyShot: false }],
      penalties: [],
      shootout: null,
      seasonTotalsAfter: [],
      headToHead: [],
    };
    const input = buildRecapInput(src) as Record<string, any>;
    expect(input.shootout).toBeUndefined();
  });
});

test("system prompt carries the bake-off rules", () => {
  expect(SYSTEM_PROMPT).toContain("Use ONLY facts in the provided JSON");
  expect(SYSTEM_PROMPT).toContain("unless every game in it fits");
  expect(userMessage("recap", { a: 1 })).toStartWith("Write the recap. Data:\n");
});

test("system prompt includes penalty-shot and shootout rules", () => {
  expect(SYSTEM_PROMPT).toContain("penalty_shot");
  expect(SYSTEM_PROMPT).toContain("shootout");
});

test("system prompt includes season context rules", () => {
  expect(SYSTEM_PROMPT).toContain("only exactly as given");
  expect(SYSTEM_PROMPT).toContain("league_rank_");
  expect(SYSTEM_PROMPT).toContain("movement in the standings");
  expect(SYSTEM_PROMPT).toContain("first meeting");
});
