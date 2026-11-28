// Season identity and lifecycle for the season recap (pure; no DB access).

export type RecapSeason = {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  is_current: boolean;
  finalized_at: string | null;
};

export type RecapState = "complete" | "in-progress" | "upcoming";

// Query string that keeps a page on the chosen season: empty for the current
// season (so its URLs stay clean), "?season=<id>" for any other.
export function seasonQuery(season: { id: string; is_current: boolean }): string {
  return season.is_current ? "" : `?season=${season.id}`;
}

// Compact season label for tight spots (the header picker):
// "Spring 2025" → "Spr '25", "Winter 2025-26" → "Win '25-26".
export function shortSeasonName(name: string): string {
  const [first, ...rest] = name.replace(/\b\d{2}(\d{2})\b/g, "'$1").split(" ");
  return [first.slice(0, 3), ...rest].join(" ");
}

// URL slug from the season name: "Winter 2025-26" → "winter-2025-26".
export function seasonSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Complete = finalized, or a non-current season that started before the
// current one (before today when no season is current). Seasons starting
// after that point are upcoming; the current, unfinalized season is in
// progress.
export function recapState(season: RecapSeason, all: RecapSeason[], today: string): RecapState {
  if (season.finalized_at) return "complete";
  if (season.is_current) return "in-progress";
  const cutoff = all.find((x) => x.is_current)?.start_date ?? today;
  return season.start_date < cutoff ? "complete" : "upcoming";
}

// The season /recap should open: the current season once it's complete,
// otherwise the most recent complete season, otherwise the in-progress
// current season. Never an upcoming season.
export function recapTarget(all: RecapSeason[], today: string): RecapSeason | null {
  const current = all.find((x) => x.is_current) ?? null;
  if (current && recapState(current, all, today) === "complete") return current;
  const complete = all
    .filter((x) => recapState(x, all, today) === "complete")
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return complete[0] ?? current;
}
