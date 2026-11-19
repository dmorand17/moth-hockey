// Shared award metadata: human labels, display order, and badge styling.
// Used by the player profile (BadgeShelf) and the stats-page award winners.

export const AWARD_LABELS: Record<string, string> = {
  champion: "Champion",
  mvp: "MVP",
  mvd: "MVD",
  goon: "Goon",
  sniper: "Sniper",
  playmaker: "Playmaker",
  vezina: "Vezina",
  most_hat_tricks: "Most Hat Tricks",
};

// Most prestigious first.
export const AWARD_ORDER = [
  "champion",
  "mvp",
  "mvd",
  "vezina",
  "sniper",
  "most_hat_tricks",
  "playmaker",
  "goon",
];

export type AwardStyle = {
  bg: string;
  border: string;
  fg: string;
  star: string;
};

// Award styling: neutral cards with the glyph in gold. Headline awards
// (see HEADLINE_AWARDS) also get a gold border and label so they stand out.
const award = (star: string, headline = false): AwardStyle => ({
  bg: "var(--board-2)",
  border: headline ? "var(--gold)" : "var(--rule)",
  fg: headline ? "var(--gold)" : "var(--ink-dim)",
  star,
});

export const AWARD_PALETTE: Record<string, AwardStyle> = {
  champion: award("★", true),
  mvp: award("★", true),
  mvd: award("★"),
  vezina: award("▼"),
  sniper: award("◎"),
  most_hat_tricks: award("♛"),
  playmaker: award("✦"),
  goon: award("✪"),
};

export const DEFAULT_AWARD_STYLE: AwardStyle = award("★");

export const HEADLINE_AWARDS = new Set(["champion", "mvp"]);
