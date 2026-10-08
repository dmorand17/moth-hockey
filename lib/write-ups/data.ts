// Loads the rows behind a preview or recap and shapes them with the pure
// helpers in lib/matchup.ts. Takes the client as a parameter so the game page
// (request client, RLS) and the generator (service client) share one path.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getStandings, type StandingsRow } from "@/lib/queries";
import {
  availableGoalie,
  availableTopScorer,
  gameLineup,
  goalieSeasonRecord,
  headToHead as headToHeadFn,
  keyMatchup,
  projectMatchup,
  projectedRoster,
  seasonPlayerTotals,
  standingsPlace,
  teamForm,
  topScorers,
  type FinalGame,
  type GoalEvent,
  type Position,
  type RosterEntry,
  type SeasonAppearance,
  type SeasonGoal,
  type SeasonShot,
} from "@/lib/matchup";
import { resolvePosition } from "@/lib/box-score";
import type { PreviewSource, PreviewTeam, RecapGoal, RecapPenalty, RecapSource } from "@/lib/write-ups/prompt";

export type Db = SupabaseClient<Database>;

type Name = { first_name: string; last_name: string };
const full = (p: Name | null | undefined) => (p ? `${p.first_name} ${p.last_name}` : "Unknown");

/** Throws if the Supabase response carries an error; otherwise returns data (may be null). */
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T | null {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function loadGame(db: Db, gameId: string) {
  const { data, error } = await db
    .from("games")
    .select(
      "id, season_id, scheduled_at, status, home_team_id, away_team_id, home_score, away_score, decided_in, " +
        "shootout_home_goals, shootout_away_goals, " +
        "home_team:home_team_id(name), away_team:away_team_id(name), " +
        "season:season_id(period_length_minutes)",
    )
    .eq("id", gameId)
    .maybeSingle();
  if (error) throw new Error(`loadGame(${gameId}): games: ${error.message}`);
  const raw = data as unknown as {
    id: string; season_id: string; scheduled_at: string; status: string;
    home_team_id: string | null; away_team_id: string | null; home_score: number; away_score: number;
    decided_in: "regulation" | "ot" | "shootout" | null;
    shootout_home_goals: number | null; shootout_away_goals: number | null;
    home_team: { name: string }; away_team: { name: string };
    season: { period_length_minutes: number } | null;
  } | null;
  if (!raw || !raw.home_team_id || !raw.away_team_id) return null;
  const g = raw as unknown as {
    id: string; season_id: string; scheduled_at: string; status: string;
    home_team_id: string; away_team_id: string; home_score: number; away_score: number;
    decided_in: "regulation" | "ot" | "shootout" | null;
    shootout_home_goals: number | null; shootout_away_goals: number | null;
    home_team: { name: string }; away_team: { name: string };
    season: { period_length_minutes: number } | null;
  };
  return g;
}

function standingFor(rows: StandingsRow[], teamId: string): StandingsRow {
  return (
    rows.find((r) => r.team_id === teamId) ?? {
      team_id: teamId, name: "", slug: "", color: "", gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, diff: 0,
    }
  );
}

export async function loadPreviewSource(db: Db, gameId: string): Promise<PreviewSource | null> {
  const game = await loadGame(db, gameId);
  if (!game || game.status !== "scheduled") return null;

  const [standings, finalsRes, goalRowsRes, rosterRowsRes, availRowsRes, subRowsRes, teamRowsRes,
         seasonShotRowsRes, seasonAppRowsRes] =
    await Promise.all([
      getStandings(game.season_id),
      db.from("games")
        .select("id, scheduled_at, home_team_id, away_team_id, home_score, away_score, decided_in")
        .eq("season_id", game.season_id).eq("status", "final").eq("kind", "regular"),
      db.from("game_events")
        .select("game_id, team_id, player_id, period, clock_seconds, assist1_player_id, assist2_player_id, game:game_id!inner(season_id, status, kind)")
        .eq("type", "goal").eq("game.season_id", game.season_id).eq("game.status", "final").eq("game.kind", "regular"),
      db.from("team_players")
        .select("team_id, position, player:player_id(id, first_name, last_name)")
        // Whole season, not just these two teams: season goalie records fall back to
        // the roster position of players (e.g. subs) from other teams.
        .eq("season_id", game.season_id),
      db.from("game_availability").select("player_id, status").eq("game_id", gameId),
      db.from("game_subs").select("team_id, position, player_id, player:player_id(first_name, last_name)").eq("game_id", gameId),
      db.from("teams").select("id, name").eq("season_id", game.season_id),
      db.from("game_events")
        .select("team_id, game_id, penalty_shot_result, game:game_id!inner(season_id, status, kind)")
        .eq("type", "penalty").not("penalty_shot_result", "is", null)
        .eq("game.season_id", game.season_id).eq("game.status", "final").eq("game.kind", "regular"),
      db.from("game_appearances")
        .select("game_id, player_id, team_id, position, game:game_id!inner(season_id, status, kind)")
        .eq("game.season_id", game.season_id).eq("game.status", "final").eq("game.kind", "regular"),
    ]);
  const finals = must(finalsRes, `loadPreviewSource(${gameId}): games`);
  const goalRows = must(goalRowsRes, `loadPreviewSource(${gameId}): game_events`);
  const rosterRows = must(rosterRowsRes, `loadPreviewSource(${gameId}): team_players`);
  const availRows = must(availRowsRes, `loadPreviewSource(${gameId}): game_availability`);
  const subRows = must(subRowsRes, `loadPreviewSource(${gameId}): game_subs`);
  const teamRows = must(teamRowsRes, `loadPreviewSource(${gameId}): teams`);
  const seasonShotRows = must(seasonShotRowsRes, `loadPreviewSource(${gameId}): season_shots`);
  const seasonAppRows = must(seasonAppRowsRes, `loadPreviewSource(${gameId}): season_appearances`);

  const teamNames = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
  const games: FinalGame[] = (finals ?? []).flatMap((g) =>
    g.home_team_id && g.away_team_id
      ? [{ id: g.id, scheduledAt: g.scheduled_at, homeTeamId: g.home_team_id, awayTeamId: g.away_team_id,
           homeScore: g.home_score, awayScore: g.away_score, decidedIn: g.decided_in }]
      : [],
  );
  // SeasonGoal includes gameId; GoalEvent is a structural subset so seasonGoals is usable as GoalEvent[].
  const seasonGoals: SeasonGoal[] = (goalRows ?? []).flatMap((e) =>
    e.player_id && e.game_id
      ? [{ gameId: e.game_id, teamId: e.team_id, playerId: e.player_id, period: e.period,
           clockSeconds: e.clock_seconds, assist1Id: e.assist1_player_id, assist2Id: e.assist2_player_id }]
      : [],
  );
  const goals: GoalEvent[] = seasonGoals;

  const roster: RosterEntry[] = (rosterRows ?? []).flatMap((r) => {
    const p = r.player as unknown as ({ id: string } & Name) | null;
    return p ? [{ playerId: p.id, name: full(p), teamId: r.team_id, position: r.position as Position }] : [];
  });

  // Scorer names: rostered players first, then anyone else who scored (subs).
  const names = new Map(roster.map((r) => [r.playerId, r.name]));
  const missing = [...new Set(goals.map((g) => g.playerId))].filter((id) => !names.has(id));
  if (missing.length) {
    const extra = must(
      await db.from("players").select("id, first_name, last_name").in("id", missing),
      `loadPreviewSource(${gameId}): players`,
    );
    for (const p of extra ?? []) names.set(p.id, full(p));
  }
  const nameOf = (id: string) => names.get(id) ?? "Unknown";

  const status = new Map((availRows ?? []).map((a) => [a.player_id, a.status as "in" | "out"]));

  // Season data for standings, leaders, goalie records, head-to-head.
  const seasonShots: SeasonShot[] = (seasonShotRows ?? []).flatMap((e) =>
    e.game_id
      ? [{ gameId: e.game_id, committingTeamId: e.team_id, result: e.penalty_shot_result as "goal" | "saved" | null }]
      : [],
  );
  const rosterPositions = new Map(roster.map((r) => [r.playerId, r.position]));
  const seasonApps: SeasonAppearance[] = (seasonAppRows ?? []).flatMap((a) =>
    a.game_id && a.player_id
      ? [{
          gameId: a.game_id as string,
          playerId: a.player_id as string,
          teamId: a.team_id as string,
          position: resolvePosition(a.position as Position | null, undefined, rosterPositions.get(a.player_id as string)),
        }]
      : [],
  );
  const allTotals = seasonPlayerTotals(seasonGoals);

  const side = (teamId: string): PreviewTeam => {
    const form = teamForm(standingFor(standings, teamId), games, teamId, (id) => teamNames.get(id) ?? "Unknown");
    const scorers = topScorers(goals, teamId, nameOf);
    const teamRoster = roster.filter((r) => r.teamId === teamId);
    const rosteredGoalieEntry = teamRoster.find((r) => r.position === "goalie");
    const keyIds = new Set([...scorers.map((s) => s.playerId), ...(rosteredGoalieEntry ? [rosteredGoalieEntry.playerId] : [])]);
    const subsForTeam = (subRows ?? []).filter((s) => s.team_id === teamId);
    const subs = subsForTeam.map((s) => ({ name: full(s.player as unknown as Name), position: s.position as Position }));

    // Season leaders: team's rostered players, top 3 by points → goals → name.
    const teamPlayerIds = new Set(teamRoster.map((r) => r.playerId));
    const seasonLeaders = [...teamPlayerIds]
      .filter((id) => allTotals.has(id))
      .map((id) => ({ id, t: allTotals.get(id)! }))
      .sort((a, b) => {
        if (b.t.points !== a.t.points) return b.t.points - a.t.points;
        if (b.t.goals !== a.t.goals) return b.t.goals - a.t.goals;
        return nameOf(a.id).localeCompare(nameOf(b.id));
      })
      .slice(0, 3)
      .map(({ id, t }) => ({
        name: nameOf(id),
        goals: t.goals,
        assists: t.assists,
        points: t.points,
        leagueRankPoints: t.leagueRankPoints,
        leagueRankGoals: t.leagueRankGoals,
      }));

    // Expected goalie (same rule as availableGoalie) for season record.
    let expectedGoalieId: string | null = null;
    let expectedGoalieName: string | null = null;
    if (!rosteredGoalieEntry) {
      const subG = subsForTeam.find((s) => s.position as Position === "goalie");
      if (subG) {
        expectedGoalieId = (subG as unknown as { player_id: string | null }).player_id ?? null;
        expectedGoalieName = full(subG.player as unknown as Name);
      }
    } else if (status.get(rosteredGoalieEntry.playerId) !== "out") {
      expectedGoalieId = rosteredGoalieEntry.playerId;
      expectedGoalieName = rosteredGoalieEntry.name;
    } else {
      const subG = subsForTeam.find((s) => s.position as Position === "goalie");
      if (subG) {
        expectedGoalieId = (subG as unknown as { player_id: string | null }).player_id ?? null;
        expectedGoalieName = full(subG.player as unknown as Name);
      }
    }
    const goalieSeason =
      expectedGoalieId && expectedGoalieName
        ? {
            name: expectedGoalieName,
            ...goalieSeasonRecord(expectedGoalieId, games, seasonApps, seasonGoals, seasonShots),
          }
        : null;

    return {
      name: teamNames.get(teamId) ?? "Unknown",
      form,
      topScorers: scorers,
      roster: projectedRoster(teamRoster, status, subs, keyIds),
      standing: standingsPlace(standings, teamId),
      seasonLeaders,
      goalieSeason,
    };
  };

  const home = side(game.home_team_id);
  const away = side(game.away_team_id);

  // Compute available scorer/goalie per team respecting game_availability status.
  const teamSubs = (teamId: string) =>
    (subRows ?? [])
      .filter((s) => s.team_id === teamId)
      .map((s) => ({ name: full(s.player as unknown as Name), position: s.position as Position }));
  const homeRoster = roster.filter((r) => r.teamId === game.home_team_id);
  const awayRoster = roster.filter((r) => r.teamId === game.away_team_id);

  const h2hGames = headToHeadFn(games, game.home_team_id, game.away_team_id);
  const headToHead = h2hGames.map((g) => ({
    playedOn: g.scheduledAt,
    home: teamNames.get(g.homeTeamId) ?? "Unknown",
    away: teamNames.get(g.awayTeamId) ?? "Unknown",
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    decidedIn: g.decidedIn,
  }));

  return {
    scheduledAt: game.scheduled_at,
    home,
    away,
    projection: projectMatchup(home.form, away.form),
    keyMatchup: keyMatchup(
      { team: home.name, topScorer: availableTopScorer(home.topScorers, status), goalie: availableGoalie(homeRoster, status, teamSubs(game.home_team_id)), form: home.form },
      { team: away.name, topScorer: availableTopScorer(away.topScorers, status), goalie: availableGoalie(awayRoster, status, teamSubs(game.away_team_id)), form: away.form },
    ),
    headToHead,
  };
}

function penaltyLabel(type: string | null, other: string | null): string {
  if (type === "other") return other ?? "Penalty";
  if (!type) return "Penalty";
  return type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export async function loadRecapSource(db: Db, gameId: string): Promise<RecapSource | null> {
  const game = await loadGame(db, gameId);
  if (!game || game.status !== "final") return null;

  const [standings, eventRowsRes, appRowsRes, rosterRowsRes, subRowsRes,
         seasonFinalsRes, seasonGoalRowsRes, seasonShotRowsRes, seasonAppRowsRes] = await Promise.all([
    getStandings(game.season_id, game.scheduled_at),
    db.from("game_events")
      .select(
        "type, team_id, period, clock_seconds, penalty_type, penalty_type_other, penalty_shot_result, penalty_shot_taker_id, " +
          "scorer:player_id(first_name, last_name), a1:assist1_player_id(first_name, last_name), a2:assist2_player_id(first_name, last_name), " +
          "shooter:penalty_shot_taker_id(first_name, last_name), player_id",
      )
      .eq("game_id", gameId)
      .order("period")
      .order("clock_seconds", { ascending: false }),
    db.from("game_appearances").select("player_id, team_id, is_sub, position, player:player_id(first_name, last_name)").eq("game_id", gameId),
    db.from("team_players").select("player_id, position").eq("season_id", game.season_id),
    db.from("game_subs").select("player_id, position").eq("game_id", gameId),
    db.from("games")
      .select("id, scheduled_at, home_team_id, away_team_id, home_score, away_score, decided_in")
      .eq("season_id", game.season_id).eq("status", "final").eq("kind", "regular")
      .lte("scheduled_at", game.scheduled_at),
    db.from("game_events")
      .select("game_id, team_id, player_id, assist1_player_id, assist2_player_id, game:game_id!inner(season_id, status, kind, scheduled_at)")
      .eq("type", "goal").eq("game.season_id", game.season_id).eq("game.status", "final").eq("game.kind", "regular")
      .lte("game.scheduled_at", game.scheduled_at),
    db.from("game_events")
      .select("team_id, game_id, penalty_shot_result, game:game_id!inner(season_id, status, kind, scheduled_at)")
      .eq("type", "penalty").not("penalty_shot_result", "is", null)
      .eq("game.season_id", game.season_id).eq("game.status", "final").eq("game.kind", "regular")
      .lte("game.scheduled_at", game.scheduled_at),
    db.from("game_appearances")
      .select("game_id, player_id, team_id, position, game:game_id!inner(season_id, status, kind, scheduled_at)")
      .eq("game.season_id", game.season_id).eq("game.status", "final").eq("game.kind", "regular")
      .lte("game.scheduled_at", game.scheduled_at),
  ]);
  const eventRows = must(eventRowsRes, `loadRecapSource(${gameId}): game_events`);
  const appRows = must(appRowsRes, `loadRecapSource(${gameId}): game_appearances`);
  const rosterRows = must(rosterRowsRes, `loadRecapSource(${gameId}): team_players`);
  const subRows = must(subRowsRes, `loadRecapSource(${gameId}): game_subs`);
  const seasonFinals = must(seasonFinalsRes, `loadRecapSource(${gameId}): season_finals`);
  const seasonGoalRows = must(seasonGoalRowsRes, `loadRecapSource(${gameId}): season_goals`);
  const seasonShotRows = must(seasonShotRowsRes, `loadRecapSource(${gameId}): season_shots`);
  const seasonAppRows = must(seasonAppRowsRes, `loadRecapSource(${gameId}): season_appearances`);

  const teamName = (id: string) => (id === game.home_team_id ? game.home_team.name : game.away_team.name);
  const positionOf = new Map<string, Position>();
  for (const r of rosterRows ?? []) positionOf.set(r.player_id, r.position as Position);
  // A lined-up sub's chosen position wins over their own team's roster spot.
  for (const s of subRows ?? []) positionOf.set(s.player_id, s.position as Position);

  const apps = (appRows ?? []) as unknown as { player_id: string; team_id: string; is_sub: boolean; position: Position | null; player: Name | null }[];
  const subIds = new Set(apps.filter((a) => a.is_sub).map((a) => a.player_id));
  const lineup = (teamId: string) =>
    gameLineup(
      apps
        .filter((a) => a.team_id === teamId)
        .map((a) => ({
          name: full(a.player),
          position: resolvePosition(a.position, positionOf.get(a.player_id), undefined),
          isSub: a.is_sub,
        })),
    );

  type Ev = {
    type: "goal" | "penalty"; team_id: string; period: number; clock_seconds: number;
    penalty_type: string | null; penalty_type_other: string | null; player_id: string | null;
    penalty_shot_result: "goal" | "saved" | null; penalty_shot_taker_id: string | null;
    scorer: Name | null; a1: Name | null; a2: Name | null; shooter: Name | null;
  };
  const events = (eventRows ?? []) as unknown as Ev[];

  // Regular goals (type='goal' events).
  const regularGoals: RecapGoal[] = events
    .filter((e) => e.type === "goal")
    .map((e) => ({
      period: e.period,
      clockSeconds: e.clock_seconds,
      team: teamName(e.team_id),
      scorer: full(e.scorer),
      scorerIsSub: e.player_id ? subIds.has(e.player_id) : false,
      assists: [e.a1, e.a2].filter((a): a is Name => !!a).map(full),
      penaltyShot: false,
    }));

  // Penalty-shot goals: penalty events where shot resulted in a goal.
  // The shooting team is the OPPONENT of the committing team (e.team_id).
  const penaltyShotGoals: RecapGoal[] = events
    .filter((e) => e.type === "penalty" && e.penalty_shot_result === "goal" && e.penalty_shot_taker_id)
    .map((e) => ({
      period: e.period,
      clockSeconds: e.clock_seconds,
      team: teamName(e.team_id === game.home_team_id ? game.away_team_id : game.home_team_id),
      scorer: full(e.shooter),
      scorerIsSub: e.penalty_shot_taker_id ? subIds.has(e.penalty_shot_taker_id) : false,
      assists: [],
      penaltyShot: true,
    }));

  // Merge and sort: period asc, clock desc (higher remaining = earlier in period).
  const goals: RecapGoal[] = [...regularGoals, ...penaltyShotGoals].sort((a, b) => {
    if (a.period !== b.period) return a.period - b.period;
    return b.clockSeconds - a.clockSeconds;
  });

  const penalties: RecapPenalty[] = events
    .filter((e) => e.type === "penalty")
    .map((e) => ({
      period: e.period,
      clockSeconds: e.clock_seconds,
      team: teamName(e.team_id),
      player: full(e.scorer),
      penalty: penaltyLabel(e.penalty_type, e.penalty_type_other),
      shotResult: e.penalty_shot_result,
      shooter: e.shooter ? full(e.shooter) : null,
    }));

  const record = (teamId: string) => {
    const s = standingFor(standings, teamId);
    return `${s.w}-${s.l}-${s.otl}`;
  };

  const periodLengthSeconds = (game.season?.period_length_minutes ?? 17) * 60;

  const soHome = game.shootout_home_goals;
  const soAway = game.shootout_away_goals;
  const shootout =
    game.decided_in === "shootout" && soHome != null && soAway != null
      ? { homeGoals: soHome, awayGoals: soAway }
      : null;

  // Season context: standings, goalie records, player totals, head-to-head.
  const seasonGoals: SeasonGoal[] = (seasonGoalRows ?? []).flatMap((e) =>
    e.player_id && e.game_id
      ? [{
          gameId: e.game_id as string, teamId: e.team_id as string, playerId: e.player_id as string,
          period: 0, clockSeconds: 0,
          assist1Id: (e.assist1_player_id as string | null) ?? null,
          assist2Id: (e.assist2_player_id as string | null) ?? null,
        }]
      : [],
  );
  const seasonShots: SeasonShot[] = (seasonShotRows ?? []).flatMap((e) =>
    e.game_id
      ? [{ gameId: e.game_id as string, committingTeamId: e.team_id as string, result: e.penalty_shot_result as "goal" | "saved" | null }]
      : [],
  );
  const seasonRosterPos = new Map<string, Position>();
  for (const r of rosterRows ?? []) seasonRosterPos.set(r.player_id, r.position as Position);
  const seasonApps: SeasonAppearance[] = (seasonAppRows ?? []).flatMap((a) =>
    a.game_id && a.player_id
      ? [{
          gameId: a.game_id as string, playerId: a.player_id as string, teamId: a.team_id as string,
          position: resolvePosition(a.position as Position | null, undefined, seasonRosterPos.get(a.player_id as string)),
        }]
      : [],
  );
  const seasonFinaleGames: FinalGame[] = (seasonFinals ?? []).flatMap((g) =>
    g.home_team_id && g.away_team_id
      ? [{ id: g.id, scheduledAt: g.scheduled_at, homeTeamId: g.home_team_id, awayTeamId: g.away_team_id,
           homeScore: g.home_score, awayScore: g.away_score, decidedIn: g.decided_in }]
      : [],
  );
  const allTotals = seasonPlayerTotals(seasonGoals);

  const goaliesSeasonAfterFor = (teamId: string) => {
    const teamGoalies = apps.filter(
      (a) => a.team_id === teamId && resolvePosition(a.position, positionOf.get(a.player_id), undefined) === "goalie",
    );
    return teamGoalies.map((a) => ({
      name: full(a.player),
      ...goalieSeasonRecord(a.player_id, seasonFinaleGames, seasonApps, seasonGoals, seasonShots),
    }));
  };

  const thisGameGoals = seasonGoals.filter((g) => g.gameId === gameId);
  const scorerAssisterIds = new Set<string>();
  // Map player_id → the teamId of the goal event they scored/assisted on.
  const goalEventTeam = new Map<string, string>();
  for (const g of thisGameGoals) {
    scorerAssisterIds.add(g.playerId);
    goalEventTeam.set(g.playerId, g.teamId);
    if (g.assist1Id) { scorerAssisterIds.add(g.assist1Id); goalEventTeam.set(g.assist1Id, g.teamId); }
    if (g.assist2Id) { scorerAssisterIds.add(g.assist2Id); goalEventTeam.set(g.assist2Id, g.teamId); }
  }
  const gamePlayerNames = new Map<string, string>();
  for (const a of apps) if (a.player) gamePlayerNames.set(a.player_id, full(a.player));

  // Look up names for any scorer/assister not found in game_appearances (e.g. pure assister).
  const missingNames = [...scorerAssisterIds].filter((id) => !gamePlayerNames.has(id));
  if (missingNames.length) {
    const extra = must(
      await db.from("players").select("id, first_name, last_name").in("id", missingNames),
      `loadRecapSource(${gameId}): players`,
    );
    for (const p of extra ?? []) gamePlayerNames.set(p.id, full(p));
  }

  const seasonTotalsAfter = [...scorerAssisterIds]
    .filter((id) => allTotals.has(id) && gamePlayerNames.has(id))
    .map((id) => {
      const t = allTotals.get(id)!;
      return {
        name: gamePlayerNames.get(id)!,
        team: teamName(goalEventTeam.get(id)!),
        goals: t.goals,
        assists: t.assists,
        points: t.points,
        leagueRankPoints: t.leagueRankPoints,
        leagueRankGoals: t.leagueRankGoals,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const h2hGames = headToHeadFn(seasonFinaleGames, game.home_team_id, game.away_team_id);
  const headToHead = h2hGames.map((g) => ({
    playedOn: g.scheduledAt,
    home: teamName(g.homeTeamId),
    away: teamName(g.awayTeamId),
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    decidedIn: g.decidedIn,
  }));

  return {
    scheduledAt: game.scheduled_at,
    homeScore: game.home_score,
    awayScore: game.away_score,
    decidedIn: game.decided_in,
    periodLengthSeconds,
    home: {
      name: game.home_team.name,
      recordAfter: record(game.home_team_id),
      lineup: lineup(game.home_team_id),
      standingAfter: standingsPlace(standings, game.home_team_id),
      goaliesSeasonAfter: goaliesSeasonAfterFor(game.home_team_id),
    },
    away: {
      name: game.away_team.name,
      recordAfter: record(game.away_team_id),
      lineup: lineup(game.away_team_id),
      standingAfter: standingsPlace(standings, game.away_team_id),
      goaliesSeasonAfter: goaliesSeasonAfterFor(game.away_team_id),
    },
    goals,
    penalties,
    shootout,
    seasonTotalsAfter,
    headToHead,
  };
}
