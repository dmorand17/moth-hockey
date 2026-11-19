import { describe, expect, test } from "bun:test";
import { groupAwards, tieSummary } from "./awards";

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

describe("tieSummary", () => {
  const t = (player_id: string, penalties: number, goals = 0, assists = 0) => ({ player_id, goals, assists, penalties });
  test("names the shared stat when everyone tied on it", () => {
    expect(tieSummary("goon", ["a", "b", "c"], [t("a", 4), t("b", 4), t("c", 4)])).toBe("3 tied with 4 penalties");
  });
  test("falls back to a plain count when values differ", () => {
    expect(tieSummary("goon", ["a", "b", "c"], [t("a", 4), t("b", 3), t("c", 4)])).toBe("3 tied");
  });
  test("plain count for awards without a stat", () => {
    expect(tieSummary("mvd", ["a", "b", "c"], [t("a", 4), t("b", 4), t("c", 4)])).toBe("3 tied");
  });
  test("no stat line for a zero value", () => {
    expect(tieSummary("goon", ["a", "b", "c"], [t("a", 0), t("b", 0), t("c", 0)])).toBe("3 tied");
  });
  test("singular unit", () => {
    expect(tieSummary("goon", ["a", "b", "c"], [t("a", 1), t("b", 1), t("c", 1)])).toBe("3 tied with 1 penalty");
  });
});
