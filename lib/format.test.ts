import { describe, expect, test } from "bun:test";
import { formatDate, formatShortDate, formatTime, maskClockInput, teamAbbr } from "./format";

describe("maskClockInput", () => {
  test("shifts digits in from the right with a colon always present", () => {
    expect(maskClockInput("1")).toBe("0:01");
    expect(maskClockInput("11")).toBe("0:11");
    expect(maskClockInput("111")).toBe("1:11");
    expect(maskClockInput("1117")).toBe("11:17");
  });

  test("re-masks after an edit to already-formatted text", () => {
    expect(maskClockInput("0:011")).toBe("0:11");
    expect(maskClockInput("11:1")).toBe("1:11"); // backspace
  });

  test("keeps only the last four digits", () => {
    expect(maskClockInput("11:175")).toBe("11:75");
  });

  test("empty when there are no digits", () => {
    expect(maskClockInput("")).toBe("");
    expect(maskClockInput("0:00")).toBe("");
  });
});

describe("teamAbbr", () => {
  test("multi-word names use initials", () => {
    expect(teamAbbr("Frost Giants")).toBe("FG");
    expect(teamAbbr("Mighty Ducks of Anaheim")).toBe("MDO");
  });
  test("single-word names use the first three letters", () => {
    expect(teamAbbr("Red")).toBe("RED");
    expect(teamAbbr("Yellow")).toBe("YEL");
  });
  test("trims extra whitespace", () => {
    expect(teamAbbr("  Ice   Holes ")).toBe("IH");
  });
});

describe("formatShortDate", () => {
  test("month and day without a weekday, in Eastern", () => {
    const out = formatShortDate("2026-04-12T23:00:00Z");
    expect(out).toBe("Apr 12");
  });
});

describe("formatDate and formatTime", () => {
  test("show Eastern wall-clock time, not the host timezone", () => {
    // 8:20 PM EST stored correctly as 01:20 UTC the next day.
    expect(formatTime("2026-12-02T01:20:00.000Z")).toBe("8:20 PM");
    expect(formatTime("2026-12-02T02:30:00.000Z")).toBe("9:30 PM");
    expect(formatDate("2026-12-02T01:20:00.000Z")).toBe("Tue, Dec 1");
  });

  test("a 20:20 UTC instant is 3:20 PM Eastern in winter", () => {
    // Values stored as 20:20Z (the previous generator bug) display as 3:20 PM
    // once the formatter is pinned to Eastern, until those rows are rewritten.
    expect(formatTime("2026-12-01T20:20:00.000Z")).toBe("3:20 PM");
  });
});
