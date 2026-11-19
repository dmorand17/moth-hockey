import { describe, expect, test } from "bun:test";
import { groupAwards } from "./awards";

const row = (award_type: string, id: string, first: string, last: string) => ({
  award_type,
  player: { id, first_name: first, last_name: last },
});

describe("groupAwards", () => {
  test("excludes champion, follows AWARD_ORDER, sorts winners by name", () => {
    const out = groupAwards([
      row("goon", "g2", "Steve", "Yzerman"),
      row("champion", "c1", "Any", "One"),
      row("mvp", "m1", "Joe", "Melanson"),
      row("goon", "g1", "Brendan", "Shanahan"),
      row("unknown_award", "x", "No", "Body"),
    ]);
    expect(out.map((a) => a.type)).toEqual(["mvp", "goon"]);
    expect(out[0]).toEqual({ type: "mvp", label: "MVP", winners: [{ id: "m1", name: "Joe Melanson" }] });
    expect(out[1].winners.map((w) => w.name)).toEqual(["Brendan Shanahan", "Steve Yzerman"]);
  });

  test("skips rows without a player", () => {
    expect(groupAwards([{ award_type: "mvp", player: null }])).toEqual([]);
  });
});
