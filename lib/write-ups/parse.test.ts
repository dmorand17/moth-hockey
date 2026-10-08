import { describe, expect, test } from "bun:test";
import { parseWriteUp } from "@/lib/write-ups/parse";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("parseWriteUp", () => {
  test("first line is the headline, the rest is the body", () => {
    const r = parseWriteUp(`Ravens Rally Late\n\n${words(130)}`);
    expect(r).toEqual({ ok: true, headline: "Ravens Rally Late", body: words(130) });
  });

  test("strips markdown and quotes from the headline", () => {
    const r = parseWriteUp(`## **"Ravens Rally Late"**\n\n${words(130)}`);
    expect(r.ok && r.headline).toBe("Ravens Rally Late");
  });

  test("strips a 'Headline:' label and bold markers in the body", () => {
    const r = parseWriteUp(`Headline: Big Night\n\nThe **Ravens** won. ${words(120)}`);
    expect(r.ok && r.headline).toBe("Big Night");
    expect(r.ok && r.body.startsWith("The Ravens won.")).toBe(true);
  });

  test("keeps paragraph breaks, collapses extra blank lines", () => {
    const r = parseWriteUp(`H\n\n${words(70)}\n\n\n\n${words(70)}`);
    expect(r.ok && r.body).toBe(`${words(70)}\n\n${words(70)}`);
  });

  test("rejects empty, too short, and too long output", () => {
    expect(parseWriteUp("   ").ok).toBe(false);
    expect(parseWriteUp(`H\n\n${words(30)}`)).toEqual({ ok: false, reason: "body is 30 words (want 40-250)" });
    expect(parseWriteUp(`H\n\n${words(300)}`).ok).toBe(false);
  });

  test("rejects a headline with no body", () => {
    expect(parseWriteUp(words(130)).ok).toBe(false);
  });
});
