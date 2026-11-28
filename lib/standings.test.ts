import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TIEBREAKERS,
  buildStandings,
  computeGamePoints,
  normalizeTiebreakers,
  type StandingsGameInput,
  type StandingsPenaltyInput,
  type StandingsTeamInput,
  type TieKey,
} from "./standings";

const team = (id: string, name: string): StandingsTeamInput => ({
  id,
  name,
  slug: id,
  color: "#000",
});

const game = (
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  decided: StandingsGameInput["decided_in"] = "regulation",
): StandingsGameInput => ({
  home_team_id: home,
  away_team_id: away,
  home_score: homeScore,
  away_score: awayScore,
  decided_in: decided,
});

const alpha = team("a", "Alpha");
const bravo = team("b", "Bravo");
const charlie = team("c", "Charlie");

const ids = (rows: { team_id: string }[]) => rows.map((r) => r.team_id);

const standings = (
  games: StandingsGameInput[],
  penalties: StandingsPenaltyInput[] = [],
  keys: TieKey[] = DEFAULT_TIEBREAKERS,
  teams: StandingsTeamInput[] = [alpha, bravo, charlie],
) => buildStandings(teams, games, penalties, "3-2-1", keys);

describe("computeGamePoints", () => {
  test("3-2-1 awards 3 for a regulation win, 2 for OT win, 1 for OT loss, 0 for a regulation loss", () => {
    expect(computeGamePoints("3-2-1", true, false)).toBe(3);
    expect(computeGamePoints("3-2-1", true, true)).toBe(2);
    expect(computeGamePoints("3-2-1", false, true)).toBe(1);
    expect(computeGamePoints("3-2-1", false, false)).toBe(0);
  });
});

describe("normalizeTiebreakers", () => {
  test("defaults to PIM, then GA, then GF", () => {
    expect(DEFAULT_TIEBREAKERS).toEqual(["pim", "ga", "gf"]);
    expect(normalizeTiebreakers(null)).toEqual(["pim", "ga", "gf"]);
    expect(normalizeTiebreakers(undefined)).toEqual(["pim", "ga", "gf"]);
  });

  test("drops unknown keys and keeps the configured order", () => {
    expect(normalizeTiebreakers(["wins", "nope", "gf", "pim"])).toEqual(["wins", "gf", "pim"]);
  });
});

describe("buildStandings", () => {
  test("ranks by points before any tiebreaker, even if the leader has more PIM", () => {
    const rows = standings(
      [game("a", "b", 2, 0), game("a", "c", 2, 0)],
      [{ team_id: "a" }, { team_id: "a" }, { team_id: "a" }],
    );
    expect(ids(rows)).toEqual(["a", "b", "c"]);
    expect(rows[0]).toMatchObject({ pts: 6, pim: 3 });
    expect(rows[1].pts).toBeLessThan(6);
  });

  test("fewest PIM breaks a points tie", () => {
    const rows = standings(
      [game("a", "b", 1, 0), game("b", "a", 1, 0)],
      [{ team_id: "a" }, { team_id: "b" }, { team_id: "b" }],
      DEFAULT_TIEBREAKERS,
      [alpha, bravo],
    );
    expect(rows[0]).toMatchObject({ team_id: "a", pts: 3, pim: 1, gf: 1, ga: 1 });
    expect(rows[1]).toMatchObject({ team_id: "b", pts: 3, pim: 2, gf: 1, ga: 1 });
  });

  test("fewest GA breaks a points and PIM tie", () => {
    // A 4-1 B, B 2-0 A: both 1-1, 3 pts, same PIM. A has GA 3, B has GA 4.
    const rows = standings(
      [game("a", "b", 4, 1), game("b", "a", 2, 0)],
      [{ team_id: "a" }, { team_id: "b" }],
      DEFAULT_TIEBREAKERS,
      [alpha, bravo],
    );
    expect(rows[0]).toMatchObject({ team_id: "a", pts: 3, pim: 1, ga: 3, gf: 4 });
    expect(rows[1]).toMatchObject({ team_id: "b", pts: 3, pim: 1, ga: 4, gf: 3 });
  });

  test("most GF breaks a points, PIM, and GA tie", () => {
    // Both beat Charlie once: A 5-2, B 3-2. Same pts, PIM, GA; A has more GF.
    const rows = standings(
      [game("a", "c", 5, 2), game("b", "c", 3, 2)],
      [{ team_id: "a" }, { team_id: "b" }],
    );
    expect(rows[0]).toMatchObject({ team_id: "a", pts: 3, pim: 1, ga: 2, gf: 5 });
    expect(rows[1]).toMatchObject({ team_id: "b", pts: 3, pim: 1, ga: 2, gf: 3 });
    expect(rows[2].team_id).toBe("c");
  });

  test("team name is the final deterministic fallback when every stat is tied", () => {
    const zulu = team("z", "Zulu");
    const rows = standings(
      [game("z", "c", 1, 0), game("b", "c", 1, 0)],
      [],
      DEFAULT_TIEBREAKERS,
      [zulu, bravo, charlie],
    );
    expect(rows[0]).toMatchObject({ team_id: "b", name: "Bravo", pts: 3, pim: 0, ga: 0, gf: 1 });
    expect(rows[1]).toMatchObject({ team_id: "z", name: "Zulu", pts: 3, pim: 0, ga: 0, gf: 1 });
  });

  test("counts each penalty event toward that team's PIM and ignores unknown teams", () => {
    const rows = standings(
      [game("a", "b", 1, 0)],
      [{ team_id: "a" }, { team_id: "a" }, { team_id: "nobody" }],
      DEFAULT_TIEBREAKERS,
      [alpha, bravo],
    );
    expect(rows.find((r) => r.team_id === "a")?.pim).toBe(2);
    expect(rows.find((r) => r.team_id === "b")?.pim).toBe(0);
  });

  test("head-to-head still resolves a group when it is in the configured order", () => {
    // A and B each have 6 pts; A beat B, but B has fewer PIM. With h2h before
    // pim, A ranks first.
    const rows = standings(
      [game("a", "b", 1, 0), game("a", "c", 1, 0), game("b", "c", 1, 0), game("b", "c", 2, 0)],
      [{ team_id: "a" }, { team_id: "a" }],
      ["h2h", "pim"],
      [alpha, bravo, charlie],
    );
    expect(rows.find((r) => r.team_id === "a")).toMatchObject({ pts: 6, pim: 2 });
    expect(rows.find((r) => r.team_id === "b")).toMatchObject({ pts: 6, pim: 0 });
    expect(ids(rows).slice(0, 2)).toEqual(["a", "b"]);
  });
});
