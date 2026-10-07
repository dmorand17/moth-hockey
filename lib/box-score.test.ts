import { describe, expect, test } from "bun:test";
import { buildBoxScore, resolvePosition, type BoxEvent, type LineupPlayer } from "@/lib/box-score";

const H = "home";
const A = "away";

const lineup: LineupPlayer[] = [
  { playerId: "h1", name: "Alex Boyd", jersey: 7, teamId: H, position: "forward", isSub: false },
  { playerId: "h2", name: "Sam Lund", jersey: 9, teamId: H, position: "forward", isSub: false },
  { playerId: "h3", name: "Kai Hale", jersey: null, teamId: H, position: "defense", isSub: true },
  { playerId: "hg", name: "Drew Rask", jersey: 30, teamId: H, position: "goalie", isSub: false },
  { playerId: "a1", name: "Quinn Cross", jersey: 11, teamId: A, position: "forward", isSub: false },
  { playerId: "ag", name: "Avery Kane", jersey: 31, teamId: A, position: "goalie", isSub: false },
];

const goal = (teamId: string, playerId: string, a1: string | null = null, a2: string | null = null): BoxEvent => ({
  type: "goal", teamId, playerId, assist1Id: a1, assist2Id: a2, shotTakerId: null, shotResult: null,
});
const penalty = (committingTeam: string, offender: string, shooter: string | null, result: "goal" | "saved" | null): BoxEvent => ({
  type: "penalty", teamId: committingTeam, playerId: offender, assist1Id: null, assist2Id: null, shotTakerId: shooter, shotResult: result,
});

const events: BoxEvent[] = [
  goal(H, "h1", "h2", "h3"),
  goal(H, "h2", "h1"),
  goal(A, "a1"),
  // Away commits; home's h1 takes the shot and scores.
  penalty(A, "a1", "h1", "goal"),
  // Home commits; away's a1 takes the shot and it's saved.
  penalty(H, "h3", "a1", "saved"),
];

describe("buildBoxScore", () => {
  const box = buildBoxScore({
    lineup, events, homeTeamId: H, awayTeamId: A,
    final: { homeScore: 3, awayScore: 1, decidedIn: "regulation" },
  });

  test("skater lines count goals, assists, penalties and penalty shots", () => {
    const h1 = box.home.skaters.find((s) => s.playerId === "h1")!;
    expect(h1).toEqual({ playerId: "h1", name: "Alex Boyd", jersey: 7, isSub: false, g: 1, a: 1, pts: 2, pen: 0, ps: 1, psg: 1 });
    const h3 = box.home.skaters.find((s) => s.playerId === "h3")!;
    expect(h3).toMatchObject({ isSub: true, g: 0, a: 1, pts: 1, pen: 1, ps: 0, psg: 0 });
  });

  test("skaters sort by points, then goals, then name; goalies are separate", () => {
    expect(box.home.skaters.map((s) => s.playerId)).toEqual(["h1", "h2", "h3"]);
    expect(box.home.goalies.map((g) => g.playerId)).toEqual(["hg"]);
  });

  test("goalie GA includes made penalty shots; PSF/PSV count shots against", () => {
    expect(box.home.goalies[0]).toMatchObject({ ga: 1, psf: 1, psv: 1, result: "W" });
    // Away goalie: 2 goals + 1 made penalty shot against; 1 shot faced, 0 saved.
    expect(box.away.goalies[0]).toMatchObject({ ga: 3, psf: 1, psv: 0, result: "L" });
  });

  test("totals add up the skater lines", () => {
    expect(box.home.totals).toEqual({ g: 2, a: 3, pts: 5, pen: 1, ps: 1, psg: 1 });
  });

  test("players who recorded nothing still appear", () => {
    expect(box.away.skaters).toHaveLength(1);
    expect(box.away.skaters[0]).toMatchObject({ playerId: "a1", g: 1, pts: 1, pen: 1, ps: 1, psg: 0 });
  });
});

describe("resolvePosition", () => {
  test("prefers appearance position when set", () => {
    expect(resolvePosition("goalie", "forward", "defense")).toBe("goalie");
  });
  test("falls back to lined-up sub position when appearance is null", () => {
    expect(resolvePosition(null, "defense", "forward")).toBe("defense");
  });
  test("falls back to lined-up sub position when appearance is undefined", () => {
    expect(resolvePosition(undefined, "defense", "forward")).toBe("defense");
  });
  test("falls back to roster position when appearance and sub are null", () => {
    expect(resolvePosition(null, null, "defense")).toBe("defense");
  });
  test("defaults to forward when all are null", () => {
    expect(resolvePosition(null, null, null)).toBe("forward");
  });
  test("defaults to forward when all are undefined", () => {
    expect(resolvePosition(undefined, undefined, undefined)).toBe("forward");
  });
});

describe("goalie result", () => {
  const base = { lineup, events: [] as BoxEvent[], homeTeamId: H, awayTeamId: A };
  test("OTL for the loser of an OT or shootout game", () => {
    const box = buildBoxScore({ ...base, final: { homeScore: 2, awayScore: 3, decidedIn: "ot" } });
    expect(box.home.goalies[0].result).toBe("OTL");
    expect(box.away.goalies[0].result).toBe("W");
  });
  test("no result while the game is live", () => {
    const box = buildBoxScore({ ...base, final: null });
    expect(box.home.goalies[0].result).toBeNull();
  });
});
