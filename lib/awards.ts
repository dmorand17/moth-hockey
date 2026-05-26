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
  glow?: string;
};

export const AWARD_PALETTE: Record<string, AwardStyle> = {
  champion: {
    bg: "linear-gradient(180deg, rgba(255, 56, 56, 0.28) 0%, rgba(255, 56, 56, 0.16) 100%)",
    border: "rgba(255, 80, 80, 0.85)",
    fg: "#ffd9d9",
    star: "★",
    glow: "0 0 14px rgba(255, 56, 56, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
  },
  mvp: {
    bg: "linear-gradient(180deg, rgba(245, 158, 11, 0.30) 0%, rgba(245, 158, 11, 0.15) 100%)",
    border: "rgba(251, 191, 36, 0.85)",
    fg: "#fde7b4",
    star: "★",
    glow: "0 0 14px rgba(245, 158, 11, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.06)",
  },
  mvd: { bg: "rgba(124, 227, 240, 0.10)", border: "rgba(124, 227, 240, 0.45)", fg: "var(--ice)", star: "★" },
  vezina: { bg: "rgba(59, 130, 246, 0.12)", border: "rgba(96, 165, 250, 0.55)", fg: "#93c5fd", star: "▼" },
  sniper: { bg: "rgba(232, 121, 249, 0.12)", border: "rgba(232, 121, 249, 0.55)", fg: "#f0abfc", star: "◎" },
  most_hat_tricks: { bg: "rgba(45, 212, 191, 0.12)", border: "rgba(45, 212, 191, 0.55)", fg: "#5eead4", star: "♛" },
  playmaker: { bg: "rgba(34, 197, 94, 0.10)", border: "rgba(74, 222, 128, 0.50)", fg: "#86efac", star: "✦" },
  goon: { bg: "rgba(168, 85, 247, 0.10)", border: "rgba(192, 132, 252, 0.50)", fg: "#c084fc", star: "✪" },
};

export const DEFAULT_AWARD_STYLE: AwardStyle = {
  bg: "rgba(107, 114, 128, 0.12)",
  border: "rgba(107, 114, 128, 0.5)",
  fg: "var(--ink-dim)",
  star: "★",
};

export const HEADLINE_AWARDS = new Set(["champion", "mvp"]);
