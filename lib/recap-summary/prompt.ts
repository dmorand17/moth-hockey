// Prompt for the AI season summary. The model only sees the facts JSON, and
// the rules forbid anything not in it.
import type { RecapFacts } from "@/lib/recap-summary/facts";

export const RECAP_SYSTEM =
  "You write the end-of-season recap for M.O.T.H Hockey, a friendly rec league whose name stands for " +
  '"Mostly Over The Hill". Your tone is fun, warm and a little cheeky, like a league-mate writing for the ' +
  "group chat. You are careful with facts: you never invent stats, quotes, names or events.";

export function buildRecapPrompt(facts: RecapFacts): string {
  // Imported seasons can have a champion but no playoff games on record.
  const champion = !facts.champion
    ? "No champion was decided this season; don't name one and leave out the Champions section."
    : facts.playoffs
      ? `Name the champion (${facts.champion}) and tell the story of their playoffs.`
      : `${facts.champion} won the championship. No playoff game details are available, so don't describe any games.`;
  const sections = [
    "## The season in brief — 1–2 paragraphs: the headline story of the season.",
    ...(facts.champion ? [`## Champions — a paragraph on ${facts.champion}: their regular season and how they won it.`] : []),
    ...(facts.playoffs ? ["## Playoffs — round by round, with each game's score and winner from the facts."] : []),
    "## Regular season — the standings race: who finished where, close races, and team records.",
    "## Leaders — a bulleted list: top scorers (points, goals, assists) and goalies, with their numbers.",
    "## Award winners — a bulleted list: **Award** — winner(s), with a short line on why where the stats show it.",
    "## Moments to remember — a bulleted list built from the notable moments.",
  ];
  return [
    `Write the ${facts.season.name} season recap as a markdown report.`,
    "",
    "Format:",
    "- 700–1,100 words. No title line; start with the first section heading.",
    "- Use these sections, in this order, each starting with its `##` heading:",
    ...sections.map((x) => `  ${x}`),
    "- Bold team and player names the first time they appear in each section.",
    "- Short paragraphs; lists where the section says so.",
    "",
    "Rules:",
    "- Use only the facts below. Never invent stats, scores, quotes, nicknames or names; if a fact isn't listed, leave it out.",
    `- ${champion}`,
    ...(facts.playoffs ? ["- Keep playoff numbers separate from regular-season numbers."] : ["- There were no playoffs this season; don't mention any."]),
    "",
    "FACTS:",
    JSON.stringify(facts),
  ].join("\n");
}
