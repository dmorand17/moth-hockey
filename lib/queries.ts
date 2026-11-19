import { createSupabaseServerClient } from "./supabase/server";
import { aggregateScoringLeaders, type LeaderGoalEvent, type LeaderRosterEntry, type ScoringLeader } from "./leaders";
import { boardSeasonWindow, buildThreads, pickTeams, type AuthorRow, type BoardSeason, type PostRow, type RosterRow, type Thread } from "./board";
import { groupAwards, type AwardWinnerGroup } from "./awards";
import { recapState, seasonSlug, type RecapSeason } from "./seasons";
import type { RecapGame } from "./season-recap";
import {
  championTeamId,
  type FinalizeAppearance,
  type FinalizeEvent,
  type FinalizeGame,
  type FinalizeRosterEntry,
  type SeasonTotals,
} from "./season-finalize";

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

// `through` (an ISO timestamp) limits the table to finals scheduled at or before
// it, so a recap can show the standings as they stood after that game.
export async function getStandings(seasonId: string, through?: string): Promise<StandingsRow[]> {
  const supabase = await createSupabaseServerClient();
  const finals = supabase
    .from("games")
    .select("home_team_id, away_team_id, home_score, away_score, status, decided_in")
    .eq("season_id", seasonId)
    .eq("status", "final")
    .eq("kind", "regular");
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
    through ? finals.lte("scheduled_at", through) : finals,
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

// Team that won the season's playoff final, or null if it hasn't been played.
export async function getChampionTeamId(seasonId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, kind, status, playoff_round, home_team_id, away_team_id, home_score, away_score, decided_in")
    .eq("season_id", seasonId)
    .eq("playoff_round", "final");
  if (error) throw error;
  return championTeamId((data ?? []) as FinalizeGame[]);
}

export type SeasonFinalizeInputs = {
  games: FinalizeGame[];
  roster: FinalizeRosterEntry[];
  appearances: FinalizeAppearance[];
  events: FinalizeEvent[];
};

// Everything lib/season-finalize needs for one season. Appearances and events
// are paged past PostgREST's 1000-row cap.
export async function getSeasonFinalizeInputs(seasonId: string): Promise<SeasonFinalizeInputs> {
  const supabase = await createSupabaseServerClient();
  const [{ data: games, error: gErr }, { data: roster, error: rErr }] = await Promise.all([
    supabase
      .from("games")
      .select("id, kind, status, playoff_round, home_team_id, away_team_id, home_score, away_score, decided_in")
      .eq("season_id", seasonId),
    supabase.from("team_players").select("player_id, team_id, position").eq("season_id", seasonId),
  ]);
  if (gErr) throw gErr;
  if (rErr) throw rErr;

  const gameIds = (games ?? []).map((g) => g.id);
  const PAGE = 1000;
  const appearances: FinalizeAppearance[] = [];
  const events: FinalizeEvent[] = [];
  if (gameIds.length > 0) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("game_appearances")
        .select("game_id, player_id, team_id")
        .in("game_id", gameIds)
        .order("game_id")
        .order("player_id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      appearances.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("game_events")
        .select("game_id, team_id, type, player_id, assist1_player_id, assist2_player_id, penalty_shot_taker_id, penalty_shot_result")
        .in("game_id", gameIds)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      events.push(...((data ?? []) as FinalizeEvent[]));
      if (!data || data.length < PAGE) break;
    }
  }

  return {
    games: (games ?? []) as FinalizeGame[],
    roster: (roster ?? []) as FinalizeRosterEntry[],
    appearances,
    events,
  };
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

export type { ScoringLeader } from "./leaders";

// Current-season scoring leaders from goal events across the season's games.
// Points earned while subbing for another team don't count (see
// aggregateScoringLeaders). Penalty-shot goals are tracked separately and
// excluded here.
export async function getScoringLeaders(seasonId: string): Promise<ScoringLeader[]> {
  const supabase = await createSupabaseServerClient();

  const { data: games } = await supabase
    .from("games")
    .select("id")
    .eq("season_id", seasonId);
  const gameIds = (games ?? []).map((g) => g.id);
  if (gameIds.length === 0) return [];

  const [{ data: events }, { data: rosters }] = await Promise.all([
    supabase
      .from("game_events")
      .select(
        "team_id, " +
          "scorer:player_id(id, first_name, last_name), " +
          "assist1:assist1_player_id(id, first_name, last_name), " +
          "assist2:assist2_player_id(id, first_name, last_name)",
      )
      .in("game_id", gameIds)
      .eq("type", "goal"),
    supabase
      .from("team_players")
      .select("player_id, team_id, team:team_id(name, slug, color)")
      .eq("season_id", seasonId),
  ]);

  return aggregateScoringLeaders(
    (events ?? []) as unknown as LeaderGoalEvent[],
    (rosters ?? []) as unknown as LeaderRosterEntry[],
  );
}

const POST_COLUMNS = "id, author_id, game_id, parent_id, body, created_at, edited_at";
const BOARD_PAGE_SIZE = 20;

// Replies + author names for a page of top-level posts.
async function hydrateThreads(top: PostRow[]): Promise<Thread[]> {
  if (top.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data: replies, error: repliesError } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
    .in("parent_id", top.map((p) => p.id));
  if (repliesError) throw repliesError;
  const all = [...top, ...(replies ?? [])];
  const userIds = [...new Set(all.map((p) => p.author_id))];
  const { data: authors, error: authorsError } = await supabase
    .from("players")
    .select("id, first_name, last_name, user_id")
    .in("user_id", userIds);
  if (authorsError) throw authorsError;
  const playerIds = (authors ?? []).map((a) => a.id);
  const { data: rosters, error: rostersError } = await supabase
    .from("team_players")
    .select("player_id, team:teams(name, slug, color), season:seasons(is_current, start_date)")
    .in("player_id", playerIds);
  if (rostersError) throw rostersError;
  const teams = pickTeams((rosters ?? []) as RosterRow[]);
  const withTeams: AuthorRow[] = (authors ?? []).map((a) => ({ ...a, team: teams.get(a.id) ?? null }));
  return buildThreads(top, (replies ?? []) as PostRow[], withTeams);
}

// Seasons for scoping the board (see boardSeasonWindow in lib/board.ts).
export async function getBoardSeasons(): Promise<BoardSeason[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("seasons").select("id, name, start_date, is_current");
  if (error) throw error;
  return data ?? [];
}

// Site board: newest 20 top-level posts older than `before` (an ISO timestamp
// cursor), optionally limited to a season window [from, to).
export async function getBoardPosts(
  opts: { before?: string; from?: string | null; to?: string | null } = {},
): Promise<{ threads: Thread[]; nextCursor: string | null }> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("posts")
    .select(POST_COLUMNS)
    .is("game_id", null)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(BOARD_PAGE_SIZE + 1);
  if (opts.before) query = query.lt("created_at", opts.before);
  if (opts.from) query = query.gte("created_at", opts.from);
  if (opts.to) query = query.lt("created_at", opts.to);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as PostRow[];
  const page = rows.slice(0, BOARD_PAGE_SIZE);
  return {
    threads: await hydrateThreads(page),
    nextCursor: rows.length > BOARD_PAGE_SIZE ? page[page.length - 1].created_at : null,
  };
}

// Per-game discussion: every top-level post for the game, newest first.
export async function getGamePosts(gameId: string): Promise<Thread[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
    .eq("game_id", gameId)
    .is("parent_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydrateThreads((data ?? []) as PostRow[]);
}


// ---- Season recap ----

export async function getRecapSeasons(): Promise<RecapSeason[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, start_date, is_current, finalized_at")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RecapSeason[];
}

type RecapTeam = { id: string; name: string; slug: string; color: string };

export type SeasonRecap = {
  season: RecapSeason;
  state: "complete" | "in-progress";
  hasGames: boolean;
  teams: Map<string, RecapTeam>;
  players: Map<string, { id: string; name: string }>;
  games: RecapGame[];
  inputs: SeasonFinalizeInputs;
  standings: StandingsRow[] | null;
  historical: HistoricalStandingsRow[] | null;
  championTeamId: string | null;
  awards: AwardWinnerGroup[];
  /** Saved season totals; set only when the season has no final games (imported seasons). */
  storedTotals: SeasonTotals[] | null;
  board: { threads: Thread[]; from: string | null; to: string | null };
};

// Everything the recap page shows for one season, or null for an unknown slug
// or an upcoming season. Sections are computed by lib/season-recap.
export async function getSeasonRecap(slug: string, today = new Date().toISOString().slice(0, 10)): Promise<SeasonRecap | null> {
  const seasons = await getRecapSeasons();
  const season = seasons.find((x) => seasonSlug(x.name) === slug);
  if (!season) return null;
  const state = recapState(season, seasons, today);
  if (state === "upcoming") return null;

  const supabase = await createSupabaseServerClient();
  const [{ data: games, error: gErr }, { data: teams, error: tErr }, { data: awardRows, error: aErr }, inputs, boardSeasons] =
    await Promise.all([
      supabase
        .from("games")
        .select(
          "id, kind, status, playoff_round, home_team_id, away_team_id, home_score, away_score, decided_in, scheduled_at, shootout_home_goals, shootout_away_goals",
        )
        .eq("season_id", season.id)
        .order("scheduled_at"),
      supabase.from("teams").select("id, name, slug, color").eq("season_id", season.id),
      supabase.from("player_awards").select("award_type, player:player_id(id, first_name, last_name)").eq("season_id", season.id),
      getSeasonFinalizeInputs(season.id),
      getBoardSeasons(),
    ]);
  if (gErr) throw gErr;
  if (tErr) throw tErr;
  if (aErr) throw aErr;

  const recapGames = (games ?? []) as RecapGame[];
  const hasGames = recapGames.some((g) => g.status === "final");

  let storedTotals: SeasonTotals[] | null = null;
  let storedPlayers: { id: string; first_name: string; last_name: string }[] = [];
  if (!hasGames) {
    const { data, error } = await supabase
      .from("season_player_stats")
      .select(
        "player_id, team_id, position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made, goals_against, penalty_shots_faced, penalty_shots_saved, wins, losses, ot_losses, player:player_id(id, first_name, last_name)",
      )
      .eq("season_id", season.id);
    if (error) throw error;
    const rows = (data ?? []) as unknown as (SeasonTotals & { player: { id: string; first_name: string; last_name: string } | null })[];
    storedTotals = rows;
    storedPlayers = rows.flatMap((r) => (r.player ? [r.player] : []));
  }

  const rosterIds = [...new Set(inputs.roster.map((r) => r.player_id))];
  const { data: rosterPlayers, error: pErr } =
    rosterIds.length > 0
      ? await supabase.from("players").select("id, first_name, last_name").in("id", rosterIds)
      : { data: [], error: null };
  if (pErr) throw pErr;
  const players = new Map(
    [...(rosterPlayers ?? []), ...storedPlayers].map((p) => [p.id, { id: p.id, name: `${p.first_name} ${p.last_name}` }]),
  );

  const window = boardSeasonWindow(boardSeasons, season.id);
  const [standings, historical, champ, board] = await Promise.all([
    hasGames ? getStandings(season.id) : Promise.resolve(null),
    hasGames ? Promise.resolve(null) : getHistoricalStandings(season.id),
    getChampionTeamId(season.id),
    window ? getBoardPosts({ from: window.from, to: window.to }) : Promise.resolve({ threads: [], nextCursor: null }),
  ]);

  return {
    season,
    state,
    hasGames,
    teams: new Map(((teams ?? []) as RecapTeam[]).map((t) => [t.id, t])),
    players,
    games: recapGames,
    inputs,
    standings,
    historical: historical && historical.length > 0 ? historical : null,
    championTeamId: champ ?? historical?.find((r) => r.is_champion)?.team_id ?? null,
    awards: groupAwards((awardRows ?? []) as unknown as Parameters<typeof groupAwards>[0]),
    storedTotals,
    board: { threads: board.threads, from: window?.from ?? null, to: window?.to ?? null },
  };
}
