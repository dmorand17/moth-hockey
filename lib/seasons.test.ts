import { describe, expect, test } from "bun:test";
import { recapState, recapTarget, seasonSlug, type RecapSeason } from "./seasons";

const s = (name: string, start_date: string, extra: Partial<RecapSeason> = {}): RecapSeason => ({
  id: name,
  name,
  start_date,
  is_current: false,
  finalized_at: null,
  ...extra,
});

describe("seasonSlug", () => {
  test("lowercases and hyphenates", () => {
    expect(seasonSlug("Fall 2026")).toBe("fall-2026");
    expect(seasonSlug("Winter 2025-26")).toBe("winter-2025-26");
    expect(seasonSlug("  Spring  2025 ")).toBe("spring-2025");
  });
});

describe("recapState", () => {
  const today = "2026-11-19";
  const fall = s("Fall 2026", "2026-09-01", { is_current: true });
  const spring = s("Spring 2026", "2026-03-01");
  const winter = s("Winter 2026-27", "2027-01-05");
  const all = [fall, spring, winter];

  test("current + finalized is complete", () => {
    expect(recapState({ ...fall, finalized_at: "2026-11-01T00:00:00Z" }, all, today)).toBe("complete");
  });
  test("current, not finalized is in progress", () => {
    expect(recapState(fall, all, today)).toBe("in-progress");
  });
  test("non-current seasons before the current one are complete", () => {
    expect(recapState(spring, all, today)).toBe("complete");
  });
  test("non-current seasons after the current one are upcoming", () => {
    expect(recapState(winter, all, today)).toBe("upcoming");
  });
  test("with no current season, start date vs today decides", () => {
    const none = [spring, winter];
    expect(recapState(spring, none, today)).toBe("complete");
    expect(recapState(winter, none, today)).toBe("upcoming");
  });
});

describe("recapTarget", () => {
  const today = "2026-11-19";
  const spring = s("Spring 2026", "2026-03-01");
  const spring25 = s("Spring 2025", "2025-03-01");
  const winter = s("Winter 2026-27", "2027-01-05");

  test("finalized current season", () => {
    const fall = s("Fall 2026", "2026-09-01", { is_current: true, finalized_at: "2026-11-01T00:00:00Z" });
    expect(recapTarget([spring, fall, winter], today)?.name).toBe("Fall 2026");
  });
  test("in-progress current → most recent complete season", () => {
    const fall = s("Fall 2026", "2026-09-01", { is_current: true });
    expect(recapTarget([spring25, spring, fall, winter], today)?.name).toBe("Spring 2026");
  });
  test("only in-progress current and upcoming → current", () => {
    const fall = s("Fall 2026", "2026-09-01", { is_current: true });
    expect(recapTarget([fall, winter], today)?.name).toBe("Fall 2026");
  });
  test("empty list → null", () => {
    expect(recapTarget([], today)).toBeNull();
  });
  test("never an upcoming season", () => {
    expect(recapTarget([winter], today)).toBeNull();
  });
});
