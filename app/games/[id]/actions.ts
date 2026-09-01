"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/auth";
import { ok, fail, type ActionResult } from "@/lib/action-result";

// Admin or captain sets availability for a specific player. RLS enforces the
// same boundaries at the DB layer; the application-level checks here give
// callers a clear error message before the query is even sent.
export async function setPlayerAvailability(input: {
  gameId: string;
  playerId: string;
  status: "in" | "out" | null;
}): Promise<ActionResult> {
  const session = await getAuthSession();
  if (!session) return fail("Not signed in.");
  if (session.role !== "admin" && session.role !== "team_captain") {
    return fail("Not authorized.");
  }

  const { gameId, playerId, status } = input;
  if (!gameId || !playerId) return fail("Missing required fields.");
  if (status !== null && status !== "in" && status !== "out") {
    return fail("Invalid status.");
  }

  const supabase = await createSupabaseServerClient();

  const { data: game } = await supabase
    .from("games")
    .select("season_id, home_team_id, away_team_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) return fail("Game not found.");

  if (session.role === "team_captain") {
    const teamIds = [game.home_team_id, game.away_team_id].filter(
      (t): t is string => t != null,
    );
    const { data: captainRow } = await supabase
      .from("team_captains")
      .select("team_id")
      .eq("user_id", session.userId)
      .eq("season_id", game.season_id)
      .in("team_id", teamIds)
      .maybeSingle();
    if (!captainRow) return fail("You're not a captain for a team in this game.");

    const { data: rosterRow } = await supabase
      .from("team_players")
      .select("player_id")
      .eq("team_id", captainRow.team_id)
      .eq("season_id", game.season_id)
      .eq("player_id", playerId)
      .maybeSingle();
    if (!rosterRow) return fail("Player is not on your team.");
  }

  if (status === null) {
    const { error } = await supabase
      .from("game_availability")
      .delete()
      .eq("game_id", gameId)
      .eq("player_id", playerId);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("game_availability").upsert(
      {
        game_id: gameId,
        player_id: playerId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "game_id,player_id" },
    );
    if (error) return fail(error.message);
  }

  revalidatePath(`/games/${gameId}`);
  return ok();
}
