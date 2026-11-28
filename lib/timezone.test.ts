import { describe, expect, test } from "bun:test";
import {
  buildScheduledAt,
  leagueDateKey,
  leagueTimeOfDay,
  leagueWeekday,
  startOfLeagueDay,
} from "./timezone";

describe("buildScheduledAt", () => {
  test("stores an Eastern Standard Time evening as the next-day UTC instant", () => {
    // 8:20 PM EST (UTC-5) on Dec 1, 2026.
    expect(buildScheduledAt("2026-12-01", "20:20")).toBe("2026-12-02T01:20:00.000Z");
    expect(buildScheduledAt("2026-12-01", "21:30")).toBe("2026-12-02T02:30:00.000Z");
  });

  test("stores an Eastern Daylight Time evening with a 4-hour offset", () => {
    // 7:00 PM EDT (UTC-4) on Apr 26, 2026 — the instant write-ups already use.
    expect(buildScheduledAt("2026-04-26", "19:00")).toBe("2026-04-26T23:00:00.000Z");
  });

  test("keeps the calendar date when the game is early enough to stay on the same UTC day", () => {
    // 6:00 PM EST on Jan 12, 2027 is 23:00 UTC the same day.
    expect(buildScheduledAt("2027-01-12", "18:00")).toBe("2027-01-12T23:00:00.000Z");
  });
});

describe("league date and time helpers", () => {
  test("read back the Eastern wall clock of a correctly stored instant", () => {
    const iso = "2026-12-02T01:20:00.000Z";
    expect(leagueDateKey(iso)).toBe("2026-12-01");
    expect(leagueTimeOfDay(iso)).toBe("20:20");
    // Tuesday, December 1, 2026.
    expect(leagueWeekday(iso)).toBe(2);
  });

  test("startOfLeagueDay is Eastern midnight as UTC", () => {
    // Midnight EST on Dec 8, 2026 is 05:00 UTC.
    expect(startOfLeagueDay("2026-12-08")).toBe("2026-12-08T05:00:00.000Z");
    // Midnight EDT on June 1, 2026 is 04:00 UTC.
    expect(startOfLeagueDay("2026-06-01")).toBe("2026-06-01T04:00:00.000Z");
  });

  test("does not roll a late Eastern game onto the next calendar day", () => {
    expect(leagueDateKey("2026-12-02T02:30:00.000Z")).toBe("2026-12-01");
  });
});
