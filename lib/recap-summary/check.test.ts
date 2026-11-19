import { describe, expect, test } from "bun:test";
import { numbersNotInFacts, parseRecapSummary } from "@/lib/recap-summary/check";
import { facts } from "./fixture.test-helper";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i % 7 ? "" : "."}`).join(" ");

describe("parseRecapSummary", () => {
  test("strips code fences", () => {
    const r = parseRecapSummary("```markdown\n" + words(300) + "\n```");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.markdown.startsWith("```")).toBe(false);
  });
  test("rejects a too-short summary", () => {
    const r = parseRecapSummary(words(40));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("40 words");
  });
  test("rejects empty output", () => {
    expect(parseRecapSummary("  ").ok).toBe(false);
  });
});

describe("numbersNotInFacts", () => {
  test("flags numbers the facts don't contain", () => {
    expect(numbersNotInFacts("went 3-4-1 with 10 points and 99 goals in 2026, 99 again", facts())).toEqual(["99"]);
  });
  test("accepts decimals present in the facts", () => {
    expect(numbersNotInFacts("a 2.5 GAA", facts())).toEqual([]);
  });
});
