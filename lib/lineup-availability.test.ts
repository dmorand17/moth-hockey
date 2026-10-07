import { describe, expect, test } from "bun:test";
import { availabilityFromLineup } from "@/lib/lineup-availability";

describe("availabilityFromLineup", () => {
  test("rostered players in the lineup are in; the rest are out", () => {
    expect(availabilityFromLineup(["a", "b", "c"], new Set(["a", "c"]))).toEqual([
      { playerId: "a", status: "in" },
      { playerId: "b", status: "out" },
      { playerId: "c", status: "in" },
    ]);
  });

  test("subs in the lineup who aren't rostered get no row", () => {
    expect(availabilityFromLineup(["a"], new Set(["a", "sub"]))).toEqual([{ playerId: "a", status: "in" }]);
  });

  test("empty lineup marks everyone out", () => {
    expect(availabilityFromLineup(["a", "b"], new Set())).toEqual([
      { playerId: "a", status: "out" },
      { playerId: "b", status: "out" },
    ]);
  });
});
