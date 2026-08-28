import { createSupabaseServerClient } from "./supabase/server";

export type PointSystem = "2-1-0" | "3-2-1";
export type TieKey = "wins" | "diff" | "gf" | "ga" | "h2h";
const VALID_TIE_KEYS: TieKey[] = ["wins", "diff", "gf", "ga", "h2h"];

/** Points a team earns for one decided game under the season's point system. */
export function computeGamePoints(
  system: PointSystem,
  won: boolean,
  otOrSo: boolean,
): number {
  if (won) return system === "3-2-1" ? (otOrSo ? 2 : 3) : 2;
  return otOrSo ? 1 : 0;
}

export type SeasonRules = { system: PointSystem; tiebreakers: TieKey[] };

/** A season's configured point system + tiebreaker order, normalized the same
 *  way getStandings applies them (defaults: 3-2-1, wins → diff → gf). */
export async function getSeasonRules(seasonId: string): Promise<SeasonRules> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("seasons")
    .select("point_system, tiebreakers")
    .eq("id", seasonId)
    .single();
  const system: PointSystem = data?.point_system === "2-1-0" ? "2-1-0" : "3-2-1";
  const tiebreakers = ((data?.tiebreakers ?? ["wins", "diff", "gf"]) as string[]).filter(
    (k): k is TieKey => VALID_TIE_KEYS.includes(k as TieKey),
  );
  return { system, tiebreakers };
}

type TeamRef = { name: string; slug: string; color: string };
export type PlayoffRound = "sf1" | "sf2" | "final";
export type GameKind = "regular" | "playoff";
export type ScheduledGame = {
  id: string;
  scheduled_at: string;
  location: string | null;
  status: "scheduled" | "live" | "final";
  kind: GameKind;
  playoff_round: PlayoffRound | null;
  home_team: TeamRef | null;
  away_team: TeamRef | null;
};
export type ResultGame = {
  id: string;
  scheduled_at: string;
  home_score: number;
  away_score: number;
  decided_in: "regulation" | "ot" | "shootout" | null;
  kind: GameKind;
  playoff_round: PlayoffRound | null;
  home_team: TeamRef | null;
  away_team: TeamRef | null;
};

// Returns null when no season is marked current (e.g. a freshly-provisioned
// database). Callers render a "no active season" placeholder rather than crash.
export async function getCurrentSeason() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type SeasonOption = {
  id: string;
  name: string;
  season_type: "spring" | "summer" | "fall" | "winter";
  year: number;
  is_current: boolean;
};

// All seasons, most recent first — powers the season picker on stats/standings.
export async function getSeasons(): Promise<SeasonOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, season_type, year, is_current")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SeasonOption[];
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
};

export async function getStandings(seasonId: string): Promise<StandingsRow[]> {
  const supabase = await createSupabaseServerClient();
  const [
    { data: season },
    { data: teams, error: tErr },
    { data: games, error: gErr },
  ] = await Promise.all([
    supabase
      .from("seasons")
      .select("point_system, tiebreakers")
      .eq("id", seasonId)
      .maybeSingle(),
    supabase.from("teams").select("id, name, slug, color").eq("season_id", seasonId),
    supabase
      .from("games")
      .select("home_team_id, away_team_id, home_score, away_score, status, decided_in")
      .eq("season_id", seasonId)
      .eq("status", "final")
      .eq("kind", "regular"),
  ]);
  if (tErr) throw tErr;
  if (gErr) throw gErr;

  const system: PointSystem = season?.point_system === "2-1-0" ? "2-1-0" : "3-2-1";
  const tieKeys: TieKey[] = (season?.tiebreakers ?? ["wins", "diff", "gf"]).filter(
    (k): k is TieKey => VALID_TIE_KEYS.includes(k as TieKey),
  );

  const rows: Record<string, StandingsRow> = {};
  for (const t of teams ?? []) {
    rows[t.id] = {
      team_id: t.id,
      name: t.name,
      slug: t.slug,
      color: t.color,
      gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, diff: 0,
    };
  }

  for (const g of games ?? []) {
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

  const result = Object.values(rows).map((r) => ({ ...r, diff: r.gf - r.ga }));

  const num = (key: Exclude<TieKey, "h2h">, a: StandingsRow, b: StandingsRow): number => {
    switch (key) {
      case "wins": return b.w - a.w;
      case "diff": return b.diff - a.diff;
      case "gf": return b.gf - a.gf;
      case "ga": return a.ga - b.ga;
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
    for (const gm of games ?? []) {
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

export type HistoricalStandingsRow = {
  team_id: string;
  name: string;
  slug: string;
  color: string;
  gp: number;
  gf: number;
  ga: number;
  diff: number;
  is_champion: boolean;
};

// Standings for a past season that has no game results, only aggregated
// season_player_stats. W/L/OTL/PTS can't be derived, so teams are ranked by
// goal differential (team goals for, from skater+goalie goals; goals against,
// from goalie goals_against). The champion is taken from player_awards.
export async function getHistoricalStandings(seasonId: string): Promise<HistoricalStandingsRow[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: teams, error: tErr }, { data: stats, error: sErr }, { data: awards, error: aErr }] =
    await Promise.all([
      supabase.from("teams").select("id, name, slug, color").eq("season_id", seasonId),
      supabase
        .from("season_player_stats")
        .select("player_id, team_id, goals, goals_against, games_played")
        .eq("season_id", seasonId),
      supabase
        .from("player_awards")
        .select("player_id")
        .eq("season_id", seasonId)
        .eq("award_type", "champion"),
    ]);
  if (tErr) throw tErr;
  if (sErr) throw sErr;
  if (aErr) throw aErr;

  const rows: Record<string, HistoricalStandingsRow> = {};
  for (const t of teams ?? []) {
    rows[t.id] = {
      team_id: t.id,
      name: t.name,
      slug: t.slug,
      color: t.color,
      gp: 0, gf: 0, ga: 0, diff: 0, is_champion: false,
    };
  }

  const championPlayers = new Set((awards ?? []).map((a) => a.player_id));
  for (const s of stats ?? []) {
    if (!s.team_id) continue;
    const row = rows[s.team_id];
    if (!row) continue;
    row.gf += s.goals ?? 0;
    row.ga += s.goals_against ?? 0;
    row.gp = Math.max(row.gp, s.games_played ?? 0);
    if (championPlayers.has(s.player_id)) row.is_champion = true;
  }

  const result = Object.values(rows).map((r) => ({ ...r, diff: r.gf - r.ga }));
  // Ranked by goal differential (the champion is only flagged, not pinned to #1).
  result.sort((a, b) =>
    b.diff - a.diff ||
    b.gf - a.gf ||
    a.name.localeCompare(b.name),
  );
  return result;
}

export async function getUpcomingGames(seasonId: string, limit = 3): Promise<ScheduledGame[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("games")
    .select(
      "id, scheduled_at, location, status, kind, playoff_round, home_team:home_team_id(name, slug, color), away_team:away_team_id(name, slug, color)",
    )
    .eq("season_id", seasonId)
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ScheduledGame[];
}

export async function getRecentResults(seasonId: string, limit = 5): Promise<ResultGame[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("games")
    .select(
      "id, scheduled_at, home_score, away_score, decided_in, kind, playoff_round, home_team:home_team_id(name, slug, color), away_team:away_team_id(name, slug, color)",
    )
    .eq("season_id", seasonId)
    .eq("status", "final")
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ResultGame[];
}

export type ScoringLeader = {
  player_id: string;
  name: string;
  goals: number;
  assists: number;
  points: number;
  team: { name: string; slug: string; color: string } | null;
};

// Current-season scoring leaders, computed from goal events across the season's
// games (a scorer gets +1 goal, each assister +1 assist; points = goals +
// assists). Penalty-shot goals are tracked separately and excluded here.
// Returns players with ≥1 point, sorted by points desc.
export async function getScoringLeaders(seasonId: string): Promise<ScoringLeader[]> {
  const supabase = await createSupabaseServerClient();

  const { data: games } = await supabase
    .from("games")
    .select("id")
    .eq("season_id", seasonId);
  const gameIds = (games ?? []).map((g) => g.id);
  if (gameIds.length === 0) return [];

  const { data: events } = await supabase
    .from("game_events")
    .select(
      "scorer:player_id(id, first_name, last_name), " +
        "assist1:assist1_player_id(id, first_name, last_name), " +
        "assist2:assist2_player_id(id, first_name, last_name)",
    )
    .in("game_id", gameIds)
    .eq("type", "goal");

  type Ref = { id: string; first_name: string; last_name: string } | null;
  const acc = new Map<string, ScoringLeader>();
  const bump = (p: Ref, g: number, a: number) => {
    if (!p) return;
    const cur =
      acc.get(p.id) ??
      { player_id: p.id, name: `${p.first_name} ${p.last_name}`, goals: 0, assists: 0, points: 0, team: null };
    cur.goals += g;
    cur.assists += a;
    cur.points = cur.goals + cur.assists;
    acc.set(p.id, cur);
  };
  for (const e of (events ?? []) as unknown as {
    scorer: Ref;
    assist1: Ref;
    assist2: Ref;
  }[]) {
    bump(e.scorer, 1, 0);
    bump(e.assist1, 0, 1);
    bump(e.assist2, 0, 1);
  }

  // Attach each leader's team for this season (players link to teams via
  // team_players). Done in one query rather than per-player.
  const playerIds = [...acc.keys()];
  if (playerIds.length > 0) {
    const { data: rosters } = await supabase
      .from("team_players")
      .select("player_id, team:team_id(name, slug, color)")
      .eq("season_id", seasonId)
      .in("player_id", playerIds);
    for (const r of (rosters ?? []) as unknown as {
      player_id: string;
      team: { name: string; slug: string; color: string } | null;
    }[]) {
      const cur = acc.get(r.player_id);
      if (cur && r.team) cur.team = r.team;
    }
  }

  return [...acc.values()].sort(
    (a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name),
  );
}
