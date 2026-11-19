// Pure season-finalize logic: roll a season's game events up into per-player
// season totals, find the champion, and propose stat-based award winners.
// No I/O — the admin finalize page/action loads rows and calls these.
//
// Totals mirror the live stats page (components/StatsExplorer.tsx): regular
// season, final games only, and appearances where a player subbed for a team
// other than their own roster team don't count.

export type Position = "forward" | "defense" | "goalie";

export type FinalizeGame = {
  id: string;
  kind: "regular" | "playoff";
  status: "scheduled" | "live" | "final";
  playoff_round: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number;
  away_score: number;
  decided_in: string | null;
};

export type FinalizeRosterEntry = { player_id: string; team_id: string; position: Position };
export type FinalizeAppearance = { game_id: string; player_id: string; team_id: string };
export type FinalizeEvent = {
  game_id: string;
  team_id: string;
  type: "goal" | "penalty";
  player_id: string | null;
  assist1_player_id: string | null;
  assist2_player_id: string | null;
  penalty_shot_taker_id: string | null;
  penalty_shot_result: "goal" | "saved" | null;
};

export type SeasonTotals = {
  player_id: string;
  team_id: string;
  position: Position;
  games_played: number;
  goals: number;
  assists: number;
  penalties: number;
  penalty_shots_taken: number;
  penalty_shots_made: number;
  // Goalie-only; null for skaters.
  goals_against: number | null;
  penalty_shots_faced: number | null;
  penalty_shots_saved: number | null;
  wins: number | null;
  losses: number | null;
  ot_losses: number | null;
};

// Awards finalize assigns. Champion is the whole winning roster; the rest are
// stat leaders (ties → co-winners).
export const FINALIZE_AWARDS = ["champion", "mvp", "mvd", "vezina", "sniper", "playmaker", "goon"] as const;
export type FinalizeAward = (typeof FINALIZE_AWARDS)[number];

export const AWARD_RULES: Record<FinalizeAward, string> = {
  champion: "Roster of the team that won the playoff final",
  mvp: "Most points",
  mvd: "Most points by a defenseman",
  vezina: "Lowest goals-against average (min. half the regular season)",
  sniper: "Most goals",
  playmaker: "Most assists",
  goon: "Most penalties",
};

export function computeSeasonTotals(
  games: FinalizeGame[],
  roster: FinalizeRosterEntry[],
  appearances: FinalizeAppearance[],
  events: FinalizeEvent[],
): SeasonTotals[] {
  const counted = new Map(
    games.filter((g) => g.kind === "regular" && g.status === "final").map((g) => [g.id, g]),
  );
  const rosterByPlayer = new Map(roster.map((r) => [r.player_id, r]));

  const gamesByPlayer = new Map<string, Set<string>>();
  for (const a of appearances) {
    if (!counted.has(a.game_id)) continue;
    if (rosterByPlayer.get(a.player_id)?.team_id !== a.team_id) continue;
    const set = gamesByPlayer.get(a.player_id) ?? new Set<string>();
    set.add(a.game_id);
    gamesByPlayer.set(a.player_id, set);
  }

  const eventsByGame = new Map<string, FinalizeEvent[]>();
  for (const e of events) {
    if (!counted.has(e.game_id)) continue;
    const list = eventsByGame.get(e.game_id) ?? [];
    list.push(e);
    eventsByGame.set(e.game_id, list);
  }

  const out: SeasonTotals[] = [];
  for (const r of roster) {
    const myGames = gamesByPlayer.get(r.player_id);
    if (!myGames || myGames.size === 0) continue;
    const isGoalie = r.position === "goalie";
    const t: SeasonTotals = {
      player_id: r.player_id,
      team_id: r.team_id,
      position: r.position,
      games_played: myGames.size,
      goals: 0,
      assists: 0,
      penalties: 0,
      penalty_shots_taken: 0,
      penalty_shots_made: 0,
      goals_against: isGoalie ? 0 : null,
      penalty_shots_faced: isGoalie ? 0 : null,
      penalty_shots_saved: isGoalie ? 0 : null,
      wins: isGoalie ? 0 : null,
      losses: isGoalie ? 0 : null,
      ot_losses: isGoalie ? 0 : null,
    };

    for (const gid of myGames) {
      for (const e of eventsByGame.get(gid) ?? []) {
        if (e.type === "goal") {
          if (e.player_id === r.player_id) t.goals++;
          if (e.assist1_player_id === r.player_id || e.assist2_player_id === r.player_id) t.assists++;
          if (isGoalie && e.team_id !== r.team_id) t.goals_against!++;
        } else {
          if (e.player_id === r.player_id) t.penalties++;
          if (e.penalty_shot_taker_id === r.player_id) {
            t.penalty_shots_taken++;
            if (e.penalty_shot_result === "goal") t.penalty_shots_made++;
          }
          if (isGoalie && e.team_id === r.team_id) {
            t.penalty_shots_faced!++;
            if (e.penalty_shot_result === "saved") t.penalty_shots_saved!++;
            else if (e.penalty_shot_result === "goal") t.goals_against!++;
          }
        }
      }
      if (isGoalie) {
        const g = counted.get(gid)!;
        const isHome = g.home_team_id === r.team_id;
        const mine = isHome ? g.home_score : g.away_score;
        const theirs = isHome ? g.away_score : g.home_score;
        if (mine > theirs) t.wins!++;
        else if (g.decided_in === "ot" || g.decided_in === "shootout") t.ot_losses!++;
        else t.losses!++;
      }
    }
    out.push(t);
  }
  return out;
}

// Winner of the playoff final, or null if it hasn't been played to a result.
export function championTeamId(games: FinalizeGame[]): string | null {
  const final = games.find((g) => g.kind === "playoff" && g.playoff_round === "final");
  if (!final || final.status !== "final") return null;
  if (final.home_score === final.away_score) return null;
  return final.home_score > final.away_score ? final.home_team_id : final.away_team_id;
}

// Reasons the season can't be finalized yet; empty when it's ready.
export function finalizeBlockers(games: FinalizeGame[]): string[] {
  const blockers: string[] = [];
  const unfinished = games.filter((g) => g.status !== "final").length;
  if (unfinished > 0) {
    blockers.push(`${unfinished} game${unfinished === 1 ? " is" : "s are"} not final yet.`);
  }
  if (!games.some((g) => g.kind === "playoff" && g.playoff_round === "final")) {
    blockers.push("No playoff final is scheduled.");
  } else if (unfinished === 0 && !championTeamId(games)) {
    blockers.push("The playoff final has no winner.");
  }
  return blockers;
}

// All players tied for the top value (ignores zeroes; lower = better when asc).
function leaders<T>(rows: T[], value: (r: T) => number | null, id: (r: T) => string, asc = false): string[] {
  let best: number | null = null;
  let ids: string[] = [];
  for (const r of rows) {
    const v = value(r);
    if (v == null || (!asc && v <= 0)) continue;
    if (best === null || (asc ? v < best : v > best)) {
      best = v;
      ids = [id(r)];
    } else if (v === best) {
      ids.push(id(r));
    }
  }
  return ids;
}

export function proposeAwards(
  totals: SeasonTotals[],
  roster: FinalizeRosterEntry[],
  games: FinalizeGame[],
): Record<FinalizeAward, string[]> {
  const champ = championTeamId(games);
  const skaters = totals.filter((t) => t.position !== "goalie");
  const id = (t: SeasonTotals) => t.player_id;
  const points = (t: SeasonTotals) => t.goals + t.assists;

  // Vezina minimum: half the regular-season games a team played (most of any team).
  const teamGames = new Map<string, number>();
  for (const g of games) {
    if (g.kind !== "regular" || g.status !== "final") continue;
    for (const tid of [g.home_team_id, g.away_team_id]) {
      if (tid) teamGames.set(tid, (teamGames.get(tid) ?? 0) + 1);
    }
  }
  const minGp = Math.ceil(Math.max(0, ...teamGames.values()) / 2);
  const eligibleGoalies = totals.filter((t) => t.position === "goalie" && t.games_played >= minGp);

  return {
    champion: champ ? roster.filter((r) => r.team_id === champ).map((r) => r.player_id) : [],
    mvp: leaders(skaters, points, id),
    mvd: leaders(skaters.filter((t) => t.position === "defense"), points, id),
    vezina: leaders(eligibleGoalies, (t) => (t.goals_against ?? 0) / t.games_played, id, true),
    sniper: leaders(skaters, (t) => t.goals, id),
    playmaker: leaders(skaters, (t) => t.assists, id),
    goon: leaders(totals, (t) => t.penalties, id),
  };
}
