import { describe, expect, test } from "bun:test";
import { buildRecapPrompt, RECAP_SYSTEM } from "@/lib/recap-summary/prompt";
import { facts } from "./fixture.test-helper";

describe("buildRecapPrompt", () => {
  test("includes the rules and every fact section", () => {
    const p = buildRecapPrompt(facts());
    for (const s of ["Ember Wolves", "250–400 words", "Use only the facts", "FACTS:", '"standings"', '"playoffs"', '"awards"']) expect(p).toContain(s);
    expect(RECAP_SYSTEM).toContain("Mostly Over The Hill");
  });

  test("with no champion or playoffs, tells the model not to name one", () => {
    const p = buildRecapPrompt(facts({ champion: null, playoffs: null }));
    expect(p).toContain("No champion");
    expect(p).toContain("no playoffs");
    expect(p).not.toContain("Name the champion");
  });
  test("a champion with no playoff games: name them, but describe no playoff run", () => {
    const p = buildRecapPrompt(facts({ playoffs: null }));
    expect(p).toContain("Ember Wolves won the championship");
    expect(p).not.toContain("playoff run");
  });
});
