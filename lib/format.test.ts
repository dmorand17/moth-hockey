import { describe, expect, test } from "bun:test";
import { maskClockInput } from "./format";

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
