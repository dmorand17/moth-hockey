import { SectionHeader } from "@/components/SectionHeader";
import {
  StatsExplorer,
  type StatsAppearance,
  type StatsEvent,
} from "@/components/StatsExplorer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";

export default async function StatsPage() {
  const season = await getCurrentSeason();
  const supabase = await createSupabaseServerClient();

  const [{ data: rosters }, { data: appearancesRaw }, { data: events }, { data: gamesRaw }, { data: teamsRaw }] =
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
        .select("id, season_id, status")
        .eq("season_id", season.id)
        .eq("status", "final"),
      supabase
        .from("teams")
        .select("id, name, slug, color")
        .eq("season_id", season.id)
        .order("name"),
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

  const teams = teamsRaw ?? [];

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="rise">
        <SectionHeader
          eyebrow="The Numbers"
          title="Stats"
          subtitle={`${season.name} · league leaders`}
          size="lg"
        />
      </div>

      <StatsExplorer
        teams={teams}
        games={games}
        roster={roster}
        appearances={appearances}
        events={eventsTrimmed}
      />
    </div>
  );
}
