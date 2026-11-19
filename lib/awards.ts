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

export type AwardWinnerGroup = {
  type: string;
  label: string;
  winners: { id: string; name: string }[];
};

type AwardRow = {
  award_type: string;
  player: { id: string; first_name: string; last_name: string } | null;
};

// player_awards rows → display groups in AWARD_ORDER, winners sorted by name.
// Champion is a team award shown elsewhere (trophies, recap hero), so it's
// excluded here; unknown award types are skipped.
export function groupAwards(rows: AwardRow[]): AwardWinnerGroup[] {
  const byType = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) {
    if (!AWARD_LABELS[r.award_type] || !r.player || r.award_type === "champion") continue;
    const list = byType.get(r.award_type) ?? [];
    list.push({ id: r.player.id, name: `${r.player.first_name} ${r.player.last_name}` });
    byType.set(r.award_type, list);
  }
  return AWARD_ORDER.filter((t) => byType.has(t)).map((type) => ({
    type,
    label: AWARD_LABELS[type],
    winners: byType.get(type)!.sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

// Awards with a stat behind them, for the "N tied with V unit" line.
const TIE_STATS: Record<string, { key: "goals" | "assists" | "penalties"; one: string; many: string }> = {
  goon: { key: "penalties", one: "penalty", many: "penalties" },
  sniper: { key: "goals", one: "goal", many: "goals" },
  playmaker: { key: "assists", one: "assist", many: "assists" },
};

// "5 tied with 4 penalties" when every winner shares the award's stat value,
// otherwise "5 tied".
export function tieSummary(
  type: string,
  winnerIds: string[],
  totals: { player_id: string; goals: number; assists: number; penalties: number }[],
): string {
  const base = `${winnerIds.length} tied`;
  const stat = TIE_STATS[type];
  if (!stat) return base;
  const values = winnerIds.map((id) => totals.find((t) => t.player_id === id)?.[stat.key]);
  const v = values[0];
  if (!v || values.some((x) => x !== v)) return base;
  return `${base} with ${v} ${v === 1 ? stat.one : stat.many}`;
}
