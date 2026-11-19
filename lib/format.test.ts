import { describe, expect, test } from "bun:test";
import { formatShortDate, maskClockInput, teamAbbr } from "./format";

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
  test("month and day without a weekday", () => {
    const out = formatShortDate("2026-04-12T23:00:00Z");
    expect(out).toContain("Apr");
    expect(out).toMatch(/1[12]/); // local day may shift by timezone
    expect(out).not.toMatch(/Sun|Sat|Mon/);
  });
});
