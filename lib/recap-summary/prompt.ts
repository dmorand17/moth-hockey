// Prompt for the AI season summary. The model only sees the facts JSON, and
// the rules forbid anything not in it.
import type { RecapFacts } from "@/lib/recap-summary/facts";

export const RECAP_SYSTEM =
  "You write the end-of-season recap for M.O.T.H Hockey, a friendly rec league whose name stands for " +
  '"Mostly Over The Hill". Your tone is fun, warm and a little cheeky, like a league-mate writing for the ' +
  "group chat. You are careful with facts: you never invent stats, quotes, names or events.";

export function buildRecapPrompt(facts: RecapFacts): string {
  const champion = facts.champion
    ? `Name the champion (${facts.champion}) and tell the story of their playoff run.`
    : "No champion was decided this season; don't name one.";
  const playoffs = facts.playoffs ? "Cover the playoffs separately from the regular season." : "There were no playoffs this season; don't mention any.";
  return [
    `Write the ${facts.season.name} season recap.`,
    "",
    "Rules:",
    "- 250–400 words, in 3–5 short paragraphs of markdown. No headings, no lists, no title.",
    "- Use only the facts below. Never invent stats, scores, quotes, nicknames or names; if a fact isn't listed, leave it out.",
    `- ${champion}`,
    `- ${playoffs}`,
    "- Mention the award winners.",
    "- Pick 2–3 storylines from the standings, leaders and notable moments.",
    "",
    "FACTS:",
    JSON.stringify(facts),
  ].join("\n");
}
