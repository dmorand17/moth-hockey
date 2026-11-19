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

// Awards are the one place gold appears besides leaders / first place. Every
// award shares one flat style; the glyph tells them apart. Headline awards
// (see HEADLINE_AWARDS) get a solid gold border.
const award = (star: string, headline = false): AwardStyle => ({
  bg: "var(--board-2)",
  border: headline ? "var(--gold)" : "rgba(251, 191, 36, 0.35)",
  fg: "var(--gold)",
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
