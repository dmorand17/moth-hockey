import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamBadge } from "@/components/TeamBadge";
import { RosterCheckIn } from "@/components/RosterCheckIn";
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
    return <LiveStub game={game} />;
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

function LiveStub({ game }: { game: GameRow }) {
  return (
    <div className="space-y-5">
      <ScoreHeader game={game} subtitle="Live scoring · coming soon" />
      <p className="text-ink-dim">
        Game is live. The scoring UI ships in the next PR.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Link href={`/score/${game.id}/roster`} className="eyebrow text-ice hover:text-ink">
          Edit lineup →
        </Link>
        <Link href="/score" className="eyebrow text-ink-dim hover:text-ink">
          ← Back to games
        </Link>
      </div>
    </div>
  );
}

async function FinalStub({ game }: { game: GameRow }) {
  // Only admins can edit a final game's lineup. Surface the link conditionally.
  const adminSession = await getSessionIfRole(["admin"]);
  return (
    <div className="space-y-5">
      <ScoreHeader game={game} subtitle="Final" />
      <p className="text-ink-dim">This game is final. View it on the public boxscore.</p>
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
