import { describe, expect, test } from "bun:test";
import { buildGameSlots, localDateKey } from "./season-schedule";

describe("buildGameSlots", () => {
  test("places 8:20 and 9:30 PM Eastern on the first matching weekday", () => {
    // Tuesday Dec 1, 2026. Two slots that night, then the next Tuesday.
    const slots = buildGameSlots("2026-11-30", 2, ["20:20", "21:30"], 4);
    expect(slots).toEqual([
      "2026-12-02T01:20:00.000Z",
      "2026-12-02T02:30:00.000Z",
      "2026-12-09T01:20:00.000Z",
      "2026-12-09T02:30:00.000Z",
    ]);
    expect(slots.map(localDateKey)).toEqual([
      "2026-12-01",
      "2026-12-01",
      "2026-12-08",
      "2026-12-08",
    ]);
  });
});
