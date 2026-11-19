import { describe, expect, test } from "bun:test";
import { aggregateScoringLeaders, type LeaderGoalEvent, type LeaderRosterEntry } from "./leaders";

const p = (id: string) => ({ id, first_name: id.toUpperCase(), last_name: "X" });
const roster: LeaderRosterEntry[] = [
  { player_id: "a", team_id: "red", team: { name: "Red", slug: "red", color: "#f00" } },
  { player_id: "b", team_id: "red", team: { name: "Red", slug: "red", color: "#f00" } },
  { player_id: "c", team_id: "blue", team: { name: "Blue", slug: "blue", color: "#00f" } },
];

describe("aggregateScoringLeaders", () => {
  test("counts goals and assists for the player's own team", () => {
    const events: LeaderGoalEvent[] = [
      { team_id: "red", scorer: p("a"), assist1: p("b"), assist2: null },
      { team_id: "red", scorer: p("a"), assist1: null, assist2: null },
    ];
    const out = aggregateScoringLeaders(events, roster);
    expect(out.map((l) => [l.player_id, l.goals, l.assists, l.points])).toEqual([
      ["a", 2, 0, 2],
      ["b", 0, 1, 1],
    ]);
    expect(out[0].team?.slug).toBe("red");
  });

  test("ignores points scored while subbing for another team", () => {
    const events: LeaderGoalEvent[] = [
      // c is rostered on blue but subbed for red here: none of it counts for c.
      { team_id: "red", scorer: p("c"), assist1: p("a"), assist2: null },
      { team_id: "blue", scorer: p("c"), assist1: null, assist2: null },
    ];
    const out = aggregateScoringLeaders(events, roster);
    expect(out.find((l) => l.player_id === "c")).toMatchObject({ goals: 1, assists: 0, points: 1 });
    expect(out.find((l) => l.player_id === "a")).toMatchObject({ goals: 0, assists: 1 });
  });

  test("ignores players with no roster spot this season", () => {
    const events: LeaderGoalEvent[] = [{ team_id: "red", scorer: p("z"), assist1: null, assist2: null }];
    expect(aggregateScoringLeaders(events, roster)).toEqual([]);
  });

  test("sorts by points, then goals, then name", () => {
    const events: LeaderGoalEvent[] = [
      { team_id: "red", scorer: p("b"), assist1: null, assist2: null },
      { team_id: "red", scorer: p("a"), assist1: null, assist2: null },
      { team_id: "blue", scorer: null, assist1: p("c"), assist2: null },
    ];
    expect(aggregateScoringLeaders(events, roster).map((l) => l.player_id)).toEqual(["a", "b", "c"]);
  });
});
