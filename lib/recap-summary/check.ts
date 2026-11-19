// Checks on the AI season summary: shape of the model output, and numbers in
// the text that don't appear anywhere in the facts it was given.
import type { RecapFacts } from "@/lib/recap-summary/facts";

const MIN_WORDS = 150;
const MAX_WORDS = 500;

export function parseRecapSummary(text: string): { ok: true; markdown: string } | { ok: false; reason: string } {
  const markdown = text
    .trim()
    .replace(/^```[a-z]*\n?|\n?```$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!markdown) return { ok: false, reason: "empty output" };
  const count = markdown.split(/\s+/).length;
  if (count < MIN_WORDS || count > MAX_WORDS) {
    return { ok: false, reason: `summary is ${count} words (want ${MIN_WORDS}-${MAX_WORDS})` };
  }
  return { ok: true, markdown };
}

const NUMBER = /\d+(?:\.\d+)?/g;

// Digits only: number words ("three goals") aren't checked.
export function numbersNotInFacts(markdown: string, facts: RecapFacts): string[] {
  const known = new Set(JSON.stringify(facts).match(NUMBER) ?? []);
  return [...new Set(markdown.match(NUMBER) ?? [])].filter((n) => !known.has(n));
}
