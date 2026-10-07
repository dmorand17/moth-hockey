// Loads the rows behind a preview or recap and shapes them with the pure
// helpers in lib/matchup.ts. Takes the client as a parameter so the game page
// (request client, RLS) and the generator (service client) share one path.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getStandings, type StandingsRow } from "@/lib/queries";
import {
  gameLineup,
  keyMatchup,
  projectMatchup,
  projectedRoster,
  teamForm,
  topScorers,
  type FinalGame,
  type GoalEvent,
  type Position,
  type RosterEntry,
} from "@/lib/matchup";
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
        "home_team:home_team_id(name), away_team:away_team_id(name)",
    )
    .eq("id", gameId)
    .maybeSingle();
  if (error) throw new Error(`loadGame(${gameId}): games: ${error.message}`);
  const raw = data as unknown as {
    id: string; season_id: string; scheduled_at: string; status: string;
    home_team_id: string | null; away_team_id: string | null; home_score: number; away_score: number;
    decided_in: "regulation" | "ot" | "shootout" | null;
    home_team: { name: string }; away_team: { name: string };
  } | null;
  if (!raw || !raw.home_team_id || !raw.away_team_id) return null;
  const g = raw as unknown as {
    id: string; season_id: string; scheduled_at: string; status: string;
    home_team_id: string; away_team_id: string; home_score: number; away_score: number;
    decided_in: "regulation" | "ot" | "shootout" | null;
    home_team: { name: string }; away_team: { name: string };
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
  const teamIds = [game.home_team_id, game.away_team_id];

  const [standings, finalsRes, goalRowsRes, rosterRowsRes, availRowsRes, subRowsRes, teamRowsRes] =
    await Promise.all([
      getStandings(game.season_id),
      db.from("games")
        .select("id, scheduled_at, home_team_id, away_team_id, home_score, away_score, decided_in")
        .eq("season_id", game.season_id).eq("status", "final").eq("kind", "regular"),
      db.from("game_events")
        .select("team_id, player_id, period, clock_seconds, assist1_player_id, assist2_player_id, game:game_id!inner(season_id, status, kind)")
        .eq("type", "goal").eq("game.season_id", game.season_id).eq("game.status", "final").eq("game.kind", "regular"),
      db.from("team_players")
        .select("team_id, position, player:player_id(id, first_name, last_name)")
        .eq("season_id", game.season_id).in("team_id", teamIds),
      db.from("game_availability").select("player_id, status").eq("game_id", gameId),
      db.from("game_subs").select("team_id, position, player:player_id(first_name, last_name)").eq("game_id", gameId),
      db.from("teams").select("id, name").eq("season_id", game.season_id),
    ]);
  const finals = must(finalsRes, `loadPreviewSource(${gameId}): games`);
  const goalRows = must(goalRowsRes, `loadPreviewSource(${gameId}): game_events`);
  const rosterRows = must(rosterRowsRes, `loadPreviewSource(${gameId}): team_players`);
  const availRows = must(availRowsRes, `loadPreviewSource(${gameId}): game_availability`);
  const subRows = must(subRowsRes, `loadPreviewSource(${gameId}): game_subs`);
  const teamRows = must(teamRowsRes, `loadPreviewSource(${gameId}): teams`);

  const teamNames = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
  const games: FinalGame[] = (finals ?? []).flatMap((g) =>
    g.home_team_id && g.away_team_id
      ? [{ id: g.id, scheduledAt: g.scheduled_at, homeTeamId: g.home_team_id, awayTeamId: g.away_team_id,
           homeScore: g.home_score, awayScore: g.away_score, decidedIn: g.decided_in }]
      : [],
  );
  const goals: GoalEvent[] = (goalRows ?? []).flatMap((e) =>
    e.player_id
      ? [{ teamId: e.team_id, playerId: e.player_id, period: e.period, clockSeconds: e.clock_seconds,
           assist1Id: e.assist1_player_id, assist2Id: e.assist2_player_id }]
      : [],
  );

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

  const side = (teamId: string): PreviewTeam => {
    const form = teamForm(standingFor(standings, teamId), games, teamId, (id) => teamNames.get(id) ?? "Unknown");
    const scorers = topScorers(goals, teamId, nameOf);
    const teamRoster = roster.filter((r) => r.teamId === teamId);
    const goalieId = teamRoster.find((r) => r.position === "goalie")?.playerId;
    const keyIds = new Set([...scorers.map((s) => s.playerId), ...(goalieId ? [goalieId] : [])]);
    const subs = (subRows ?? [])
      .filter((s) => s.team_id === teamId)
      .map((s) => ({ name: full(s.player as unknown as Name), position: s.position as Position }));
    return {
      name: teamNames.get(teamId) ?? "Unknown",
      form,
      topScorers: scorers,
      roster: projectedRoster(teamRoster, status, subs, keyIds),
    };
  };

  const home = side(game.home_team_id);
  const away = side(game.away_team_id);
  return {
    scheduledAt: game.scheduled_at,
    home,
    away,
    projection: projectMatchup(home.form, away.form),
    keyMatchup: keyMatchup(
      { team: home.name, topScorer: home.topScorers[0] ?? null, goalie: home.roster.rosteredGoalie, form: home.form },
      { team: away.name, topScorer: away.topScorers[0] ?? null, goalie: away.roster.rosteredGoalie, form: away.form },
    ),
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

  const [standings, eventRowsRes, appRowsRes, rosterRowsRes, subRowsRes] = await Promise.all([
    getStandings(game.season_id),
    db.from("game_events")
      .select(
        "type, team_id, period, clock_seconds, penalty_type, penalty_type_other, " +
          "scorer:player_id(first_name, last_name), a1:assist1_player_id(first_name, last_name), a2:assist2_player_id(first_name, last_name), player_id",
      )
      .eq("game_id", gameId)
      .order("period")
      .order("clock_seconds", { ascending: false }),
    db.from("game_appearances").select("player_id, team_id, is_sub, player:player_id(first_name, last_name)").eq("game_id", gameId),
    db.from("team_players").select("player_id, position").eq("season_id", game.season_id),
    db.from("game_subs").select("player_id, position").eq("game_id", gameId),
  ]);
  const eventRows = must(eventRowsRes, `loadRecapSource(${gameId}): game_events`);
  const appRows = must(appRowsRes, `loadRecapSource(${gameId}): game_appearances`);
  const rosterRows = must(rosterRowsRes, `loadRecapSource(${gameId}): team_players`);
  const subRows = must(subRowsRes, `loadRecapSource(${gameId}): game_subs`);

  const teamName = (id: string) => (id === game.home_team_id ? game.home_team.name : game.away_team.name);
  const positionOf = new Map<string, Position>();
  for (const r of rosterRows ?? []) positionOf.set(r.player_id, r.position as Position);
  // A lined-up sub's chosen position wins over their own team's roster spot.
  for (const s of subRows ?? []) positionOf.set(s.player_id, s.position as Position);

  const apps = (appRows ?? []) as unknown as { player_id: string; team_id: string; is_sub: boolean; player: Name | null }[];
  const subIds = new Set(apps.filter((a) => a.is_sub).map((a) => a.player_id));
  const lineup = (teamId: string) =>
    gameLineup(
      apps
        .filter((a) => a.team_id === teamId)
        .map((a) => ({ name: full(a.player), position: positionOf.get(a.player_id) ?? "forward", isSub: a.is_sub })),
    );

  type Ev = {
    type: "goal" | "penalty"; team_id: string; period: number; clock_seconds: number;
    penalty_type: string | null; penalty_type_other: string | null; player_id: string | null;
    scorer: Name | null; a1: Name | null; a2: Name | null;
  };
  const events = (eventRows ?? []) as unknown as Ev[];
  const goals: RecapGoal[] = events
    .filter((e) => e.type === "goal")
    .map((e) => ({
      period: e.period,
      clockSeconds: e.clock_seconds,
      team: teamName(e.team_id),
      scorer: full(e.scorer),
      scorerIsSub: e.player_id ? subIds.has(e.player_id) : false,
      assists: [e.a1, e.a2].filter((a): a is Name => !!a).map(full),
    }));
  const penalties: RecapPenalty[] = events
    .filter((e) => e.type === "penalty")
    .map((e) => ({
      period: e.period,
      clockSeconds: e.clock_seconds,
      team: teamName(e.team_id),
      player: full(e.scorer),
      penalty: penaltyLabel(e.penalty_type, e.penalty_type_other),
    }));

  const record = (teamId: string) => {
    const s = standingFor(standings, teamId);
    return `${s.w}-${s.l}-${s.otl}`;
  };

  return {
    scheduledAt: game.scheduled_at,
    homeScore: game.home_score,
    awayScore: game.away_score,
    decidedIn: game.decided_in,
    home: { name: game.home_team.name, recordAfter: record(game.home_team_id), lineup: lineup(game.home_team_id) },
    away: { name: game.away_team.name, recordAfter: record(game.away_team_id), lineup: lineup(game.away_team_id) },
    goals,
    penalties,
  };
}
