import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamBadge } from "@/components/TeamBadge";
import { RosterCheckIn } from "@/components/RosterCheckIn";
import { LiveScoring } from "@/components/LiveScoring";
import { HideChrome } from "@/components/HideChrome";
import { InstallHint } from "@/components/InstallHint";
import { getSessionIfRole, requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/format";

type Params = Promise<{ gameId: string }>;

type Position = "forward" | "defense" | "goalie";

type GameRow = {
  id: string;
  scheduled_at: string;
  location: string | null;
  status: "scheduled" | "live" | "final";
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  period: number;
  clock_seconds: number;
  decided_in: "regulation" | "ot" | "shootout" | null;
  shootout_home_goals: number | null;
  shootout_away_goals: number | null;
  home_team: { id: string; name: string; slug: string; color: string };
  away_team: { id: string; name: string; slug: string; color: string };
};

export default async function ScoreGamePage({ params }: { params: Params }) {
  await requireRole(["admin", "scorekeeper"]);
  const { gameId } = await params;
  const supabase = await createSupabaseServerClient();

  // Two embedded relations to the same teams table confuse the typed client,
  // so cast through unknown — the runtime resolves the aliases just fine.
  const { data, error: gameErr } = await supabase
    .from("games")
    .select(
      "id, scheduled_at, location, status, season_id, home_team_id, away_team_id, " +
        "home_score, away_score, period, clock_seconds, " +
        "decided_in, shootout_home_goals, shootout_away_goals, " +
        "home_team:home_team_id(id, name, slug, color), " +
        "away_team:away_team_id(id, name, slug, color)",
    )
    .eq("id", gameId)
    .single();
  const game = data as unknown as GameRow | null;
  if (gameErr || !game) notFound();

  // status branch
  if (game.status === "scheduled") {
    return <CheckInView game={game} />;
  }
  if (game.status === "live") {
    return <LiveView game={game} />;
  }
  return <FinalStub game={game} />;
}

async function CheckInView({ game }: { game: GameRow }) {
  const supabase = await createSupabaseServerClient();

  // Pull the season roster for both teams so we can pre-fill the check-in.
  const { data: rosterRows, error } = await supabase
    .from("team_players")
    .select(
      "team_id, position, player:player_id(id, first_name, last_name)",
    )
    .eq("season_id", game.season_id)
    .in("team_id", [game.home_team_id, game.away_team_id]);
  if (error) throw error;

  type RosterRow = {
    team_id: string;
    position: Position;
    player: { id: string; first_name: string; last_name: string };
  };
  const rows = (rosterRows ?? []) as unknown as RosterRow[];

  const home = rows
    .filter((r) => r.team_id === game.home_team_id)
    .map((r) => ({ id: r.player.id, name: `${r.player.first_name} ${r.player.last_name}`, position: r.position }));
  const away = rows
    .filter((r) => r.team_id === game.away_team_id)
    .map((r) => ({ id: r.player.id, name: `${r.player.first_name} ${r.player.last_name}`, position: r.position }));

  // For "Add sub" search, every league player who is NOT already on either roster.
  const rosterIds = new Set(rows.map((r) => r.player.id));
  const { data: allPlayers } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .order("last_name");
  const addableSubs = (allPlayers ?? [])
    .filter((p) => !rosterIds.has(p.id))
    .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));

  return (
    <div className="space-y-5">
      <ScoreHeader game={game} subtitle="Pre-game check-in" />
      <RosterCheckIn
        gameId={game.id}
        homeTeam={{ id: game.home_team_id, name: game.home_team.name, color: game.home_team.color }}
        awayTeam={{ id: game.away_team_id, name: game.away_team.name, color: game.away_team.color }}
        homeRoster={home}
        awayRoster={away}
        addableSubs={addableSubs}
      />
    </div>
  );
}

async function LiveView({ game }: { game: GameRow }) {
  const supabase = await createSupabaseServerClient();

  type AppRow = {
    team_id: string;
    is_sub: boolean;
    player: { id: string; first_name: string; last_name: string };
  };
  type EventRow = {
    id: string;
    type: "goal" | "penalty";
    team_id: string;
    period: number;
    clock_seconds: number;
    penalty_type: string | null;
    penalty_type_other: string | null;
    penalty_shot_result: "goal" | "saved" | null;
    scorer: { id: string; first_name: string; last_name: string } | null;
    assist1: { id: string; first_name: string; last_name: string } | null;
    assist2: { id: string; first_name: string; last_name: string } | null;
    shooter: { id: string; first_name: string; last_name: string } | null;
  };

  const [
    { data: apps, error: appsErr },
    { data: tps, error: tpsErr },
    { data: evRaw, error: evErr },
  ] = await Promise.all([
    supabase
      .from("game_appearances")
      .select("team_id, is_sub, player:player_id(id, first_name, last_name)")
      .eq("game_id", game.id),
    supabase
      .from("team_players")
      .select("player_id, position")
      .eq("season_id", game.season_id)
      .in("team_id", [game.home_team_id, game.away_team_id]),
    supabase
      .from("game_events")
      .select(
        "id, type, team_id, period, clock_seconds, penalty_type, penalty_type_other, penalty_shot_result, " +
          "scorer:player_id(id, first_name, last_name), " +
          "assist1:assist1_player_id(id, first_name, last_name), " +
          "assist2:assist2_player_id(id, first_name, last_name), " +
          "shooter:penalty_shot_taker_id(id, first_name, last_name)",
      )
      .eq("game_id", game.id)
      .order("period", { ascending: false })
      .order("clock_seconds", { ascending: true })
      .order("created_at", { ascending: false }),
  ]);
  if (appsErr) throw appsErr;
  if (tpsErr) throw tpsErr;
  if (evErr) throw evErr;

  const aRows = (apps ?? []) as unknown as AppRow[];
  const evRows = (evRaw ?? []) as unknown as EventRow[];

  // Position lookup: a player who appears as is_sub may not have a team_players
  // row for either of these teams; fall back to "forward" so the picker still works.
  const posByPlayer = new Map<string, Position>();
  for (const t of (tps ?? []) as { player_id: string; position: Position }[]) {
    posByPlayer.set(t.player_id, t.position);
  }

  const buildRoster = (teamId: string) =>
    aRows
      .filter((a) => a.team_id === teamId)
      .map((a) => ({
        id: a.player.id,
        name: `${a.player.first_name} ${a.player.last_name}`,
        position: posByPlayer.get(a.player.id) ?? ("forward" as Position),
        isSub: a.is_sub,
      }));

  const homeRoster = buildRoster(game.home_team_id);
  const awayRoster = buildRoster(game.away_team_id);

  const events = evRows.map((e) => ({
    id: e.id,
    type: e.type,
    team_id: e.team_id,
    period: e.period,
    clock_seconds: e.clock_seconds,
    scorer_id: e.scorer?.id ?? null,
    scorer_name: e.scorer ? `${e.scorer.first_name} ${e.scorer.last_name}` : null,
    assist1_id: e.assist1?.id ?? null,
    assist1_name: e.assist1 ? `${e.assist1.first_name} ${e.assist1.last_name}` : null,
    assist2_id: e.assist2?.id ?? null,
    assist2_name: e.assist2 ? `${e.assist2.first_name} ${e.assist2.last_name}` : null,
    penalty_type: e.penalty_type,
    penalty_type_other: e.penalty_type_other,
    penalty_shot_result: e.penalty_shot_result,
    shooter_id: e.shooter?.id ?? null,
    shooter_name: e.shooter ? `${e.shooter.first_name} ${e.shooter.last_name}` : null,
  }));

  return (
    <div className="space-y-2">
      <HideChrome />
      <div className="flex items-center justify-between gap-3 -mt-1">
        <Link href="/score" className="eyebrow text-[10px] text-ink-faint hover:text-ink min-h-[36px] flex items-center">
          ← Games
        </Link>
        <Link
          href={`/score/${game.id}/roster`}
          className="eyebrow text-[10px] text-ink-faint hover:text-ice min-h-[36px] flex items-center"
        >
          Edit lineup →
        </Link>
      </div>
      <InstallHint />
      <LiveScoring
        game={{
          id: game.id,
          homeTeam: { id: game.home_team_id, name: game.home_team.name, color: game.home_team.color },
          awayTeam: { id: game.away_team_id, name: game.away_team.name, color: game.away_team.color },
          homeScore: game.home_score,
          awayScore: game.away_score,
          period: game.period,
          clockSeconds: game.clock_seconds,
          shootoutHomeGoals: game.shootout_home_goals ?? 0,
          shootoutAwayGoals: game.shootout_away_goals ?? 0,
        }}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
        events={events}
      />
    </div>
  );
}

async function FinalStub({ game }: { game: GameRow }) {
  // Only admins can edit a final game's lineup. Surface the link conditionally.
  const adminSession = await getSessionIfRole(["admin"]);
  const decidedSuffix =
    game.decided_in && game.decided_in !== "regulation"
      ? `/${game.decided_in.toUpperCase()}`
      : "";
  return (
    <div className="space-y-5">
      <ScoreHeader game={game} subtitle={`Final${decidedSuffix}`} />
      <div className="panel-bare p-4">
        <div className="grid grid-cols-3 items-center gap-3">
          <div className="flex flex-col items-start min-w-0">
            <span
              className="font-display text-[13px] tracking-[0.1em] uppercase truncate"
              style={{ color: game.away_team.color }}
            >
              {game.away_team.name}
            </span>
            <span className="digit text-[40px] leading-none mt-1">{game.away_score}</span>
            {game.decided_in === "shootout" && (
              <span className="eyebrow text-[10px] text-ink-faint mt-1">
                SO {game.shootout_away_goals ?? 0}
              </span>
            )}
          </div>
          <div className="flex flex-col items-center">
            <span className="eyebrow text-[10px] text-ink-faint">FINAL{decidedSuffix}</span>
          </div>
          <div className="flex flex-col items-end min-w-0">
            <span
              className="font-display text-[13px] tracking-[0.1em] uppercase truncate"
              style={{ color: game.home_team.color }}
            >
              {game.home_team.name}
            </span>
            <span className="digit text-[40px] leading-none mt-1">{game.home_score}</span>
            {game.decided_in === "shootout" && (
              <span className="eyebrow text-[10px] text-ink-faint mt-1">
                SO {game.shootout_home_goals ?? 0}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Link href={`/games/${game.id}`} className="eyebrow text-ice hover:text-ink">
          Boxscore →
        </Link>
        {adminSession && (
          <Link href={`/score/${game.id}/roster`} className="eyebrow text-ink-dim hover:text-ink">
            Edit lineup
          </Link>
        )}
        <Link href="/score" className="eyebrow text-ink-dim hover:text-ink">
          ← Back to games
        </Link>
      </div>
    </div>
  );
}

function ScoreHeader({ game, subtitle }: { game: GameRow; subtitle: string }) {
  return (
    <div className="rise space-y-3">
      <SectionHeader eyebrow="Scorekeeper" title="Score a Game" subtitle={subtitle} />
      <div className="flex items-center gap-2 flex-wrap">
        <TeamBadge {...game.away_team} asChild size="md" />
        <span className="eyebrow text-ink-faint">vs</span>
        <TeamBadge {...game.home_team} asChild size="md" />
      </div>
      <div className="eyebrow text-ink-dim">
        {formatDate(game.scheduled_at)} · {formatTime(game.scheduled_at)}
        {game.location ? ` · ${game.location}` : ""}
      </div>
    </div>
  );
}
