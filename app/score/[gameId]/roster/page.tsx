import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamBadge } from "@/components/TeamBadge";
import { RosterCheckIn } from "@/components/RosterCheckIn";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/format";

type Params = Promise<{ gameId: string }>;
type Position = "forward" | "defense" | "goalie";

export default async function ScoreGameRosterPage({ params }: { params: Params }) {
  const { gameId } = await params;
  const supabase = await createSupabaseServerClient();

  // Load the game first so we know which auth gate to apply.
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select(
      "id, scheduled_at, location, status, season_id, home_team_id, away_team_id, " +
        "home_team:home_team_id(id, name, slug, color), " +
        "away_team:away_team_id(id, name, slug, color)",
    )
    .eq("id", gameId)
    .single();
  if (gameErr || !game) notFound();

  // Scheduled games have a dedicated start-game flow at the parent route.
  if (game.status === "scheduled") {
    redirect(`/score/${gameId}`);
  }

  // Live: scorekeeper or admin. Final: admin only.
  if (game.status === "final") {
    await requireRole(["admin"]);
  } else {
    await requireRole(["admin", "scorekeeper"]);
  }

  // Season roster (the pre-fill for unchecked rows) and current appearances
  // (which players are actually in the lineup right now).
  const [
    { data: rosterRows, error: rosterErr },
    { data: appsRows, error: appsErr },
    { data: events, error: evErr },
    { data: allPlayers, error: allErr },
  ] = await Promise.all([
    supabase
      .from("team_players")
      .select("team_id, position, player:player_id(id, first_name, last_name)")
      .eq("season_id", game.season_id)
      .in("team_id", [game.home_team_id, game.away_team_id]),
    supabase
      .from("game_appearances")
      .select("team_id, is_sub, player:player_id(id, first_name, last_name)")
      .eq("game_id", gameId),
    supabase
      .from("game_events")
      .select("player_id, assist1_player_id, assist2_player_id, penalty_shot_taker_id")
      .eq("game_id", gameId),
    supabase.from("players").select("id, first_name, last_name").order("last_name"),
  ]);
  if (rosterErr) throw rosterErr;
  if (appsErr) throw appsErr;
  if (evErr) throw evErr;
  if (allErr) throw allErr;

  type RosterRow = {
    team_id: string;
    position: Position;
    player: { id: string; first_name: string; last_name: string };
  };
  type AppRow = {
    team_id: string;
    is_sub: boolean;
    player: { id: string; first_name: string; last_name: string };
  };
  const rRows = (rosterRows ?? []) as unknown as RosterRow[];
  const aRows = (appsRows ?? []) as unknown as AppRow[];

  // Subs may have a team_players row in another team for this season. Look those
  // up so we can show their actual position; otherwise default to forward.
  const subPlayerIds = aRows
    .filter((a) => a.is_sub)
    .map((a) => a.player.id);
  const subPositions = new Map<string, Position>();
  if (subPlayerIds.length > 0) {
    const { data: subTp, error: subTpErr } = await supabase
      .from("team_players")
      .select("player_id, position")
      .eq("season_id", game.season_id)
      .in("player_id", subPlayerIds);
    if (subTpErr) throw subTpErr;
    for (const row of (subTp ?? []) as { player_id: string; position: Position }[]) {
      subPositions.set(row.player_id, row.position);
    }
  }

  // Build per-team display lists. Start from the season roster, then append
  // any subs already in this game's appearances.
  const buildTeam = (teamId: string) => {
    const seasonRoster = rRows
      .filter((r) => r.team_id === teamId)
      .map((r) => ({
        id: r.player.id,
        name: `${r.player.first_name} ${r.player.last_name}`,
        position: r.position,
      }));
    const seasonIds = new Set(seasonRoster.map((p) => p.id));
    const subs = aRows
      .filter((a) => a.team_id === teamId && a.is_sub && !seasonIds.has(a.player.id))
      .map((a) => ({
        id: a.player.id,
        name: `${a.player.first_name} ${a.player.last_name}`,
        position: subPositions.get(a.player.id) ?? "forward",
      }));
    return [...seasonRoster, ...subs];
  };
  const home = buildTeam(game.home_team_id);
  const away = buildTeam(game.away_team_id);

  const initiallyChecked = aRows.map((a) => a.player.id);

  // Lock any player with at least one event of any kind.
  const involved = new Set<string>();
  for (const e of events ?? []) {
    if (e.player_id) involved.add(e.player_id);
    if (e.assist1_player_id) involved.add(e.assist1_player_id);
    if (e.assist2_player_id) involved.add(e.assist2_player_id);
    if (e.penalty_shot_taker_id) involved.add(e.penalty_shot_taker_id);
  }

  // Addable subs: every league player who isn't already in the build (roster + sub).
  const inLineup = new Set([...home.map((p) => p.id), ...away.map((p) => p.id)]);
  const addableSubs = (allPlayers ?? [])
    .filter((p) => !inLineup.has(p.id))
    .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));

  return (
    <div className="space-y-5">
      <div className="rise space-y-3">
        <SectionHeader
          eyebrow="Scorekeeper"
          title="Edit Lineup"
          subtitle={game.status === "live" ? "Live · update lineup" : "Final · admin edit"}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <TeamBadge {...game.away_team} asChild size="md" />
          <span className="eyebrow text-ink-faint">vs</span>
          <TeamBadge {...game.home_team} asChild size="md" />
        </div>
        <div className="eyebrow text-ink-dim">
          {formatDate(game.scheduled_at)} · {formatTime(game.scheduled_at)}
          {game.location ? ` · ${game.location}` : ""}
        </div>
        <Link href={`/score/${gameId}`} className="eyebrow text-ink-dim hover:text-ink">
          ← Back to game
        </Link>
      </div>

      <RosterCheckIn
        gameId={gameId}
        homeTeam={{ id: game.home_team_id, name: game.home_team.name, color: game.home_team.color }}
        awayTeam={{ id: game.away_team_id, name: game.away_team.name, color: game.away_team.color }}
        homeRoster={home}
        awayRoster={away}
        addableSubs={addableSubs}
        mode="update"
        initiallyChecked={initiallyChecked}
        lockedPlayerIds={[...involved]}
        redirectTo={`/score/${gameId}`}
      />
    </div>
  );
}
