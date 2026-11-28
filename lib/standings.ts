/** Points a team earns for one decided game under the season's point system. */
export type PointSystem = "2-1-0" | "3-2-1";

/** Tie-break keys applied after points. `pim` is fewest penalty events (this
 *  league uses penalty shots, so each regular-season penalty counts as 1 PIM). */
export type TieKey = "pim" | "ga" | "gf" | "wins" | "diff" | "h2h";

export const VALID_TIE_KEYS: TieKey[] = ["pim", "ga", "gf", "wins", "diff", "h2h"];

/** Default order after points: fewest PIM, fewest GA, most GF. Name is always
 *  the last deterministic fallback and is not stored. */
export const DEFAULT_TIEBREAKERS: TieKey[] = ["pim", "ga", "gf"];

export function computeGamePoints(
  system: PointSystem,
  won: boolean,
  otOrSo: boolean,
): number {
  if (won) return system === "3-2-1" ? (otOrSo ? 2 : 3) : 2;
  return otOrSo ? 1 : 0;
}

export function normalizeTiebreakers(keys: string[] | null | undefined): TieKey[] {
  return (keys ?? DEFAULT_TIEBREAKERS).filter((k): k is TieKey =>
    VALID_TIE_KEYS.includes(k as TieKey),
  );
}

export type StandingsRow = {
  team_id: string;
  name: string;
  slug: string;
  color: string;
  gp: number;
  w: number;
  l: number;
  otl: number;
  pts: number;
  gf: number;
  ga: number;
  diff: number;
  pim: number;
};

export type StandingsTeamInput = {
  id: string;
  name: string;
  slug: string;
  color: string;
};

export type StandingsGameInput = {
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number;
  away_score: number;
  decided_in: "regulation" | "ot" | "shootout" | null;
};

export type StandingsPenaltyInput = {
  team_id: string;
};

/** Build and sort the standings table from regular-season finals, their
 *  penalty events, and the season's point system + tie-break order. */
export function buildStandings(
  teams: StandingsTeamInput[],
  games: StandingsGameInput[],
  penalties: StandingsPenaltyInput[],
  system: PointSystem,
  tieKeys: TieKey[],
): StandingsRow[] {
  const rows: Record<string, StandingsRow> = {};
  for (const t of teams) {
    rows[t.id] = {
      team_id: t.id,
      name: t.name,
      slug: t.slug,
      color: t.color,
      gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, diff: 0, pim: 0,
    };
  }

  for (const g of games) {
    if (!g.home_team_id || !g.away_team_id) continue;
    const home = rows[g.home_team_id];
    const away = rows[g.away_team_id];
    if (!home || !away) continue;
    home.gp++; away.gp++;
    home.gf += g.home_score; home.ga += g.away_score;
    away.gf += g.away_score; away.ga += g.home_score;

    const homeWon = g.home_score > g.away_score;
    const otOrSo = g.decided_in === "ot" || g.decided_in === "shootout";
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;
    winner.w++;
    winner.pts += computeGamePoints(system, true, otOrSo);
    loser.pts += computeGamePoints(system, false, otOrSo);
    if (otOrSo) loser.otl++;
    else loser.l++;
  }

  for (const p of penalties) {
    const row = rows[p.team_id];
    if (row) row.pim++;
  }

  const result = Object.values(rows).map((r) => ({ ...r, diff: r.gf - r.ga }));

  const num = (key: Exclude<TieKey, "h2h">, a: StandingsRow, b: StandingsRow): number => {
    switch (key) {
      case "pim": return a.pim - b.pim;
      case "ga": return a.ga - b.ga;
      case "gf": return b.gf - a.gf;
      case "wins": return b.w - a.w;
      case "diff": return b.diff - a.diff;
    }
  };
  const chain =
    (keys: Exclude<TieKey, "h2h">[]) =>
    (a: StandingsRow, b: StandingsRow): number => {
      for (const k of keys) {
        const c = num(k, a, b);
        if (c) return c;
      }
      return 0;
    };
  const byName = (a: StandingsRow, b: StandingsRow) => a.name.localeCompare(b.name);

  const hIdx = tieKeys.indexOf("h2h");
  const before = (hIdx === -1 ? tieKeys : tieKeys.slice(0, hIdx)).filter(
    (k) => k !== "h2h",
  ) as Exclude<TieKey, "h2h">[];
  const after = (hIdx === -1 ? [] : tieKeys.slice(hIdx + 1)).filter(
    (k) => k !== "h2h",
  ) as Exclude<TieKey, "h2h">[];

  if (hIdx === -1) {
    result.sort((a, b) => b.pts - a.pts || chain(before)(a, b) || byName(a, b));
    return result;
  }

  // Head-to-head: sort by points + pre-h2h criteria, group ties, resolve each
  // group by head-to-head points, then post-h2h criteria, then name.
  const cmpBefore = chain(before);
  result.sort((a, b) => b.pts - a.pts || cmpBefore(a, b));

  const groups: StandingsRow[][] = [];
  for (const row of result) {
    const g = groups[groups.length - 1];
    if (g && g[0].pts === row.pts && cmpBefore(g[0], row) === 0) g.push(row);
    else groups.push([row]);
  }

  const ordered: StandingsRow[] = [];
  for (const g of groups) {
    if (g.length === 1) {
      ordered.push(g[0]);
      continue;
    }
    const set = new Set(g.map((r) => r.team_id));
    const hp = new Map<string, number>(g.map((r) => [r.team_id, 0]));
    for (const gm of games) {
      if (!gm.home_team_id || !gm.away_team_id) continue;
      if (!set.has(gm.home_team_id) || !set.has(gm.away_team_id)) continue;
      const homeWon = gm.home_score > gm.away_score;
      const otOrSo = gm.decided_in === "ot" || gm.decided_in === "shootout";
      const winId = homeWon ? gm.home_team_id : gm.away_team_id;
      const loseId = homeWon ? gm.away_team_id : gm.home_team_id;
      hp.set(winId, (hp.get(winId) ?? 0) + computeGamePoints(system, true, otOrSo));
      hp.set(loseId, (hp.get(loseId) ?? 0) + computeGamePoints(system, false, otOrSo));
    }
    g.sort(
      (a, b) =>
        (hp.get(b.team_id) ?? 0) - (hp.get(a.team_id) ?? 0) ||
        chain(after)(a, b) ||
        byName(a, b),
    );
    ordered.push(...g);
  }
  return ordered;
}
