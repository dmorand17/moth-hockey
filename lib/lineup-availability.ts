// Writes the scorekeeper's check-in back to game_availability (#122): once a
// game starts, every rostered player is 'in' if they were checked in and
// 'out' if not. The check-in is what actually happened, so it overrides
// earlier self-reports in both directions. Subs aren't rostered and get no row.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export function availabilityFromLineup(
  rosterPlayerIds: string[],
  lineupPlayerIds: Set<string>,
): { playerId: string; status: "in" | "out" }[] {
  return rosterPlayerIds.map((playerId) => ({
    playerId,
    status: lineupPlayerIds.has(playerId) ? "in" : "out",
  }));
}

// Never throws: callers (startGame, updateRoster) must not fail puck drop or a
// lineup edit because of this.
export async function syncAvailabilityFromLineup(
  db: SupabaseClient<Database>,
  gameId: string,
): Promise<{ ok: true; written: number } | { ok: false; error: string }> {
  try {
    const { data: game, error: gameErr } = await db
      .from("games")
      .select("season_id, home_team_id, away_team_id")
      .eq("id", gameId)
      .single();
    if (gameErr || !game) return { ok: false, error: gameErr?.message ?? "game not found" };
    const teamIds = [game.home_team_id, game.away_team_id].filter((t): t is string => t != null);

    const [{ data: roster, error: rosterErr }, { data: lineup, error: lineupErr }] = await Promise.all([
      db.from("team_players").select("player_id").eq("season_id", game.season_id).in("team_id", teamIds),
      db.from("game_appearances").select("player_id").eq("game_id", gameId),
    ]);
    if (rosterErr) return { ok: false, error: `team_players: ${rosterErr.message}` };
    if (lineupErr) return { ok: false, error: `game_appearances: ${lineupErr.message}` };

    const rows = availabilityFromLineup(
      (roster ?? []).map((r) => r.player_id),
      new Set((lineup ?? []).map((a) => a.player_id)),
    );
    if (rows.length === 0) return { ok: true, written: 0 };

    const now = new Date().toISOString();
    const { error } = await db.from("game_availability").upsert(
      rows.map((r) => ({ game_id: gameId, player_id: r.playerId, status: r.status, updated_at: now })),
      { onConflict: "game_id,player_id" },
    );
    if (error) return { ok: false, error: `game_availability: ${error.message}` };
    return { ok: true, written: rows.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
