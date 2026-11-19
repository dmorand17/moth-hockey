// Season recap computations (pure; no DB access). Regular season and playoffs
// are always computed separately — callers pass the `kind` they want.
import type { FinalizeEvent, FinalizeGame, SeasonTotals } from "@/lib/season-finalize";

type Kind = "regular" | "playoff";

export type RecapGame = FinalizeGame & {
  scheduled_at: string;
  shootout_home_goals: number | null;
  shootout_away_goals: number | null;
};

export type SeasonNumbers = {
  games: number;
  goals: number;
  goalsPerGame: number;
  overtime: number;
  shootouts: number;
  penalties: number;
};

export type Moment = {
  kind: "margin" | "high-scoring" | "hat-trick" | "points-game" | "win-streak";
  gameId: string | null;
  teamId: string | null;
  playerId: string | null;
  value: number;
  date: string;
};

const finalGames = (games: RecapGame[], kind: Kind) =>
  games
    .filter((g) => g.kind === kind && g.status === "final")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

// Winner by score; a shootout stored as a tied score falls back to the
// shootout tally. null when there's no decided winner.
function winnerOf(g: RecapGame): string | null {
  let home = g.home_score;
  let away = g.away_score;
  if (home === away) {
    home = g.shootout_home_goals ?? 0;
    away = g.shootout_away_goals ?? 0;
  }
  if (home === away) return null;
  return home > away ? g.home_team_id : g.away_team_id;
}

export function seasonNumbers(games: RecapGame[], events: FinalizeEvent[], kind: Kind): SeasonNumbers | null {
  const list = finalGames(games, kind);
  if (list.length === 0) return null;
  const ids = new Set(list.map((g) => g.id));
  const goals = list.reduce((n, g) => n + g.home_score + g.away_score, 0);
  return {
    games: list.length,
    goals,
    goalsPerGame: Math.round((goals / list.length) * 10) / 10,
    overtime: list.filter((g) => g.decided_in === "ot").length,
    shootouts: list.filter((g) => g.decided_in === "shootout").length,
    penalties: events.filter((e) => e.type === "penalty" && ids.has(e.game_id)).length,
  };
}

// First game wins ties because games are scanned in date order and only a
// strictly better value replaces the current best.
function best(list: RecapGame[], value: (g: RecapGame) => number): { game: RecapGame; value: number } | null {
  let top: { game: RecapGame; value: number } | null = null;
  for (const g of list) {
    const v = value(g);
    if (v > 0 && (!top || v > top.value)) top = { game: g, value: v };
  }
  return top;
}

export function notableMoments(games: RecapGame[], events: FinalizeEvent[], kind: Kind): Moment[] {
  const list = finalGames(games, kind);
  const out: Moment[] = [];
  const moment = (m: Omit<Moment, "date"> & { game: RecapGame }): Moment => {
    const { game, ...rest } = m;
    return { ...rest, date: game.scheduled_at };
  };

  const margin = best(list, (g) => Math.abs(g.home_score - g.away_score));
  if (margin) out.push(moment({ kind: "margin", game: margin.game, gameId: margin.game.id, teamId: winnerOf(margin.game), playerId: null, value: margin.value }));

  const high = best(list, (g) => g.home_score + g.away_score);
  if (high) out.push(moment({ kind: "high-scoring", game: high.game, gameId: high.game.id, teamId: null, playerId: null, value: high.value }));

  // Per-player, per-game goals and points (scorers + assisters).
  const byGame = new Map(list.map((g) => [g.id, g]));
  const goals = new Map<string, number>();
  const points = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const e of events) {
    if (e.type !== "goal" || !byGame.has(e.game_id)) continue;
    if (e.player_id) {
      bump(goals, `${e.game_id}|${e.player_id}`);
      bump(points, `${e.game_id}|${e.player_id}`);
    }
    for (const a of [e.assist1_player_id, e.assist2_player_id]) if (a) bump(points, `${e.game_id}|${a}`);
  }
  const split = (k: string) => k.split("|") as [string, string];
  const byDate = (a: [string, number], b: [string, number]) =>
    byGame.get(split(a[0])[0])!.scheduled_at.localeCompare(byGame.get(split(b[0])[0])!.scheduled_at);

  for (const [k, n] of [...goals].sort(byDate)) {
    if (n < 3) continue;
    const [gameId, playerId] = split(k);
    out.push(moment({ kind: "hat-trick", game: byGame.get(gameId)!, gameId, teamId: null, playerId, value: n }));
  }

  let topPoints: [string, number] | null = null;
  for (const entry of [...points].sort(byDate)) if (!topPoints || entry[1] > topPoints[1]) topPoints = entry;
  if (topPoints) {
    const [gameId, playerId] = split(topPoints[0]);
    out.push(moment({ kind: "points-game", game: byGame.get(gameId)!, gameId, teamId: null, playerId, value: topPoints[1] }));
  }

  // Longest win streak per team (3+), ending game = last win of the streak.
  const run = new Map<string, number>();
  const longest = new Map<string, { n: number; game: RecapGame }>();
  for (const g of list) {
    const w = winnerOf(g);
    for (const t of [g.home_team_id, g.away_team_id]) {
      if (!t) continue;
      const n = t === w ? (run.get(t) ?? 0) + 1 : 0;
      run.set(t, n);
      if (n > (longest.get(t)?.n ?? 0)) longest.set(t, { n, game: g });
    }
  }
  for (const [teamId, { n, game }] of longest) {
    if (n >= 3) out.push(moment({ kind: "win-streak", game, gameId: game.id, teamId, playerId: null, value: n }));
  }
  return out;
}

const points = (t: SeasonTotals) => t.goals + t.assists;

export function topSkaters(totals: SeasonTotals[], key: "points" | "goals" | "assists", n = 5): SeasonTotals[] {
  const value = (t: SeasonTotals) => (key === "points" ? points(t) : t[key]);
  return totals
    .filter((t) => t.position !== "goalie" && value(t) > 0)
    .sort((a, b) => value(b) - value(a) || b.goals - a.goals || a.player_id.localeCompare(b.player_id))
    .slice(0, n);
}

export function topGoalies(totals: SeasonTotals[], minGames: number, n = 5): SeasonTotals[] {
  const gaa = (t: SeasonTotals) => (t.goals_against ?? 0) / t.games_played;
  return totals
    .filter((t) => t.position === "goalie" && t.games_played >= minGames && t.games_played > 0)
    .sort((a, b) => gaa(a) - gaa(b) || (b.wins ?? 0) - (a.wins ?? 0) || a.player_id.localeCompare(b.player_id))
    .slice(0, n);
}

// Half the most final games any team played, rounded up (the Vezina rule).
export function goalieMinGames(games: RecapGame[], kind: Kind): number {
  const per = new Map<string, number>();
  for (const g of finalGames(games, kind)) {
    for (const t of [g.home_team_id, g.away_team_id]) if (t) per.set(t, (per.get(t) ?? 0) + 1);
  }
  return Math.ceil(Math.max(0, ...per.values()) / 2);
}

const ROUND_ORDER = ["qf1", "qf2", "qf3", "qf4", "sf1", "sf2", "final"];

// Final playoff games with both teams set, in bracket order.
export function playoffPath(games: RecapGame[]): RecapGame[] {
  return finalGames(games, "playoff")
    .filter((g) => g.home_team_id && g.away_team_id)
    .sort(
      (a, b) =>
        ROUND_ORDER.indexOf(a.playoff_round ?? "") - ROUND_ORDER.indexOf(b.playoff_round ?? "") ||
        a.scheduled_at.localeCompare(b.scheduled_at),
    );
}
