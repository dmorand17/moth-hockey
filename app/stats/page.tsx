import {
  StatsExplorer,
  type StatsAppearance,
  type StatsEvent,
  type PrecomputedSkater,
  type PrecomputedGoalie,
} from "@/components/StatsExplorer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSeasons } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { groupAwards } from "@/lib/awards";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stats",
  description: "League leaders, skater and goalie stats, and award winners.",
};

type SearchParams = Promise<{ season?: string }>;

export default async function StatsPage({ searchParams }: { searchParams: SearchParams }) {
  const { season: seasonParam } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const seasons = await getSeasons();
  if (seasons.length === 0) return <NoSeason />;
  const season =
    seasons.find((s) => s.id === seasonParam) ??
    seasons.find((s) => s.is_current) ??
    seasons[0];

  const [teamsRes, awardsRes] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, slug, color")
      .eq("season_id", season.id)
      .order("name"),
    supabase
      .from("player_awards")
      .select("award_type, player:player_id(id, first_name, last_name)")
      .eq("season_id", season.id),
  ]);
  const teams = teamsRes.data ?? [];

  // Champion is a team award: its players get a trophy beside their team on
  // the stats rows (see championTeamIds below).
  const championPlayerIds = new Set(
    (awardsRes.data ?? []).filter((a) => a.award_type === "champion" && a.player).map((a) => a.player!.id),
  );
  const awardWinners = groupAwards(awardsRes.data ?? []);

  // ---- Past season: pre-aggregated totals (imported, or saved by finalize). ----
  if (!season.is_current) {
    const { data: statRows } = await supabase
      .from("season_player_stats")
      .select(
        "position, games_played, goals, assists, penalties, penalty_shots_taken, penalty_shots_made, goals_against, penalty_shots_faced, penalty_shots_saved, wins, losses, ot_losses, player:player_id(id, first_name, last_name), team:team_id(id, name, slug, color)",
      )
      .eq("season_id", season.id);

    // Champion is a team award; mark every player on the winning team so the
    // stats tables can show a small trophy beside that team.
    const championTeamIds = new Set<string>();
    for (const r of statRows ?? []) {
      if (r.player && r.team?.id && championPlayerIds.has(r.player.id)) {
        championTeamIds.add(r.team.id);
      }
    }

    const skaters: PrecomputedSkater[] = [];
    const goalies: PrecomputedGoalie[] = [];
    for (const r of statRows ?? []) {
      if (!r.player) continue;
      const name = `${r.player.first_name} ${r.player.last_name}`;
      const team = r.team
        ? { name: r.team.name, slug: r.team.slug, color: r.team.color }
        : undefined;
      const teamId = r.team?.id;
      const isChampion = !!teamId && championTeamIds.has(teamId);
      if (r.position === "goalie") {
        goalies.push({
          id: r.player.id,
          name,
          team,
          teamId,
          isChampion,
          gp: r.games_played,
          ga: r.goals_against ?? 0,
          ps_faced: r.penalty_shots_faced ?? 0,
          ps_saved: r.penalty_shots_saved ?? 0,
          w: r.wins,
          l: r.losses,
          otl: r.ot_losses,
        });
      } else {
        skaters.push({
          id: r.player.id,
          name,
          team,
          teamId,
          isChampion,
          position: r.position as "forward" | "defense",
          gp: r.games_played,
          goals: r.goals,
          assists: r.assists,
          points: r.goals + r.assists,
          penalties: r.penalties,
          ps_taken: r.penalty_shots_taken,
          ps_made: r.penalty_shots_made,
        });
      }
    }

    return (
      <div className="space-y-8 md:space-y-12">
        <StatsExplorer
          seasonName={season.name}
          seasons={seasons}
          selectedSeasonId={season.id}
          teams={teams}
          awardWinners={awardWinners}
          awardsPending={season.is_current}
          precomputed={{ skaters, goalies }}
        />
      </div>
    );
  }

  // ---- Current season: derive stats from live game events. ----
  const [{ data: rosters }, { data: appearancesRaw }, { data: events }, { data: gamesRaw }] =
    await Promise.all([
      supabase
        .from("team_players")
        .select(
          "position, jersey_number, player:player_id(id, first_name, last_name), team:team_id(id, name, slug, color), season:season_id(is_current)",
        )
        .eq("season_id", season.id),
      supabase
        .from("game_appearances")
        .select("game_id, player_id, team_id, game:game_id(season_id, status)"),
      supabase
        .from("game_events")
        .select(
          "type, team_id, player_id, assist1_player_id, assist2_player_id, penalty_shot_result, penalty_shot_taker_id, game_id",
        ),
      supabase
        .from("games")
        .select("id, season_id, status, home_team_id, home_score, away_score, decided_in")
        .eq("season_id", season.id)
        .eq("status", "final"),
    ]);

  // `kind` was added in migration 0002. Try a separate query and gracefully
  // degrade to "regular" for every game if the column doesn't exist yet.
  const kindByGameId = new Map<string, "regular" | "playoff">();
  try {
    const kindRes = await supabase
      .from("games")
      .select("id, kind")
      .eq("season_id", season.id);
    if (!kindRes.error && Array.isArray(kindRes.data)) {
      const rows = kindRes.data as unknown as Array<{ id: string; kind: "regular" | "playoff" | null }>;
      for (const row of rows) {
        kindByGameId.set(row.id, (row.kind ?? "regular") as "regular" | "playoff");
      }
    }
  } catch {
    // Column not migrated; default to regular below.
  }

  const games = (gamesRaw ?? []).map((g) => ({
    id: g.id,
    kind: kindByGameId.get(g.id) ?? ("regular" as const),
    home_team_id: g.home_team_id,
    home_score: g.home_score,
    away_score: g.away_score,
    decided_in: g.decided_in,
  }));
  const seasonFinalGameIds = new Set(games.map((g) => g.id));

  const appearances: StatsAppearance[] = (appearancesRaw ?? [])
    .filter((a) => a.game?.status === "final" && a.game?.season_id === season.id && seasonFinalGameIds.has(a.game_id))
    .map((a) => ({ game_id: a.game_id, player_id: a.player_id, team_id: a.team_id }));

  const eventsTrimmed: StatsEvent[] = (events ?? [])
    .filter((e) => seasonFinalGameIds.has(e.game_id))
    .map((e) => ({
      game_id: e.game_id,
      team_id: e.team_id,
      type: e.type,
      player_id: e.player_id,
      assist1_player_id: e.assist1_player_id,
      assist2_player_id: e.assist2_player_id,
      penalty_shot_taker_id: e.penalty_shot_taker_id,
      penalty_shot_result: e.penalty_shot_result,
    }));

  const roster = (rosters ?? [])
    .filter((r) => r.player)
    .map((r) => ({
      id: r.player!.id,
      name: `${r.player!.first_name} ${r.player!.last_name}`,
      position: r.position as "forward" | "defense" | "goalie",
      team: r.team
        ? { id: r.team.id, name: r.team.name, slug: r.team.slug, color: r.team.color }
        : undefined,
    }));

  return (
    <div className="space-y-8 md:space-y-12">
      <StatsExplorer
        seasonName={season.name}
        seasons={seasons}
        selectedSeasonId={season.id}
        teams={teams}
        awardWinners={awardWinners}
        awardsPending={season.is_current}
        games={games}
        roster={roster}
        appearances={appearances}
        events={eventsTrimmed}
      />
    </div>
  );
}
