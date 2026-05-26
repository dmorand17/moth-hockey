import { createSupabaseServerClient } from "./supabase/server";

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

export async function getCurrentSeason() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .eq("is_current", true)
    .single();
  if (error) throw error;
  return data;
}

export type SeasonOption = {
  id: string;
  name: string;
  season_type: "spring" | "fall" | "winter";
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
  const [{ data: teams, error: tErr }, { data: games, error: gErr }] =
    await Promise.all([
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
    const decided = g.decided_in;
    if (homeWon) {
      home.w++; home.pts += 2;
      if (decided === "ot" || decided === "shootout") {
        away.otl++; away.pts += 1;
      } else {
        away.l++;
      }
    } else {
      away.w++; away.pts += 2;
      if (decided === "ot" || decided === "shootout") {
        home.otl++; home.pts += 1;
      } else {
        home.l++;
      }
    }
  }

  const result = Object.values(rows).map((r) => ({ ...r, diff: r.gf - r.ga }));
  // Tiebreakers: pts → wins → diff → gf
  result.sort((a, b) =>
    b.pts - a.pts ||
    b.w - a.w ||
    b.diff - a.diff ||
    b.gf - a.gf ||
    a.name.localeCompare(b.name),
  );
  return result;
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
