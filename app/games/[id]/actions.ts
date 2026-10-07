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
    .select("season_id, home_team_id, away_team_id, status")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) return fail("Game not found.");
  if (game.status !== "scheduled" && session.role !== "admin") {
    return fail("This game has started — availability is locked.");
  }

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

type Position = "forward" | "defense" | "goalie";
const POSITIONS: Position[] = ["forward", "defense", "goalie"];

// Shared gate for sub management: admin, or the captain of `teamId` for this
// game's season, and only while the game is scheduled. Mirrors the game_subs
// RLS policy so callers get a readable error before the query is sent.
async function authorizeSubManager(gameId: string, teamId: string) {
  const deny = (error: string) => ({ ok: false as const, error });
  const session = await getAuthSession();
  if (!session) return deny("Not signed in.");
  if (session.role !== "admin" && session.role !== "team_captain") {
    return deny("Not authorized.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: game } = await supabase
    .from("games")
    .select("status, season_id, home_team_id, away_team_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) return deny("Game not found.");
  if (game.status !== "scheduled") return deny("Subs can only be changed before the game starts.");
  if (teamId !== game.home_team_id && teamId !== game.away_team_id) {
    return deny("That team isn't in this game.");
  }

  if (session.role === "team_captain") {
    const { data: captainRow } = await supabase
      .from("team_captains")
      .select("team_id")
      .eq("user_id", session.userId)
      .eq("season_id", game.season_id)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!captainRow) return deny("You can only add subs for your own team.");
  }

  return { ok: true as const, supabase, game, session };
}

// Line up an existing league player as a sub for one team.
export async function addGameSub(input: {
  gameId: string;
  teamId: string;
  playerId: string;
  position: Position;
}): Promise<ActionResult> {
  const { gameId, teamId, playerId, position } = input;
  if (!gameId || !teamId || !playerId) return fail("Missing required fields.");
  if (!POSITIONS.includes(position)) return fail("Invalid position.");

  const auth = await authorizeSubManager(gameId, teamId);
  if (!auth.ok) return auth;
  const { supabase, game, session } = auth;

  // A player rostered on either team is already in this game's check-in;
  // subbing them would put them on both sides and break startGame's insert.
  const { data: rostered } = await supabase
    .from("team_players")
    .select("team_id")
    .eq("player_id", playerId)
    .eq("season_id", game.season_id)
    .in("team_id", [game.home_team_id, game.away_team_id].filter((t): t is string => t != null))
    .maybeSingle();
  if (rostered) return fail("That player is already on a roster in this game.");

  const { error } = await supabase.from("game_subs").insert({
    game_id: gameId,
    team_id: teamId,
    player_id: playerId,
    position,
    added_by: session.userId,
  });
  if (error) {
    // 23505 = unique violation on (game_id, player_id).
    if (error.code === "23505") return fail("That player is already a sub in this game.");
    return fail(error.message);
  }

  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/score/${gameId}`);
  return ok();
}

// Create a brand-new player and line them up as a sub. Goes through the
// add_new_game_sub function so captains don't need INSERT rights on players.
export async function createGameSub(input: {
  gameId: string;
  teamId: string;
  firstName: string;
  lastName: string;
  position: Position;
}): Promise<ActionResult> {
  const { gameId, teamId, position } = input;
  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  if (!gameId || !teamId) return fail("Missing required fields.");
  if (!firstName || !lastName) return fail("First and last name are required.");
  if (!POSITIONS.includes(position)) return fail("Invalid position.");

  const auth = await authorizeSubManager(gameId, teamId);
  if (!auth.ok) return auth;

  const { error } = await auth.supabase.rpc("add_new_game_sub", {
    p_game_id: gameId,
    p_team_id: teamId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_position: position,
  });
  if (error) return fail(error.message);

  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/score/${gameId}`);
  return ok();
}

export async function removeGameSub(input: {
  gameId: string;
  playerId: string;
}): Promise<ActionResult> {
  const { gameId, playerId } = input;
  if (!gameId || !playerId) return fail("Missing required fields.");

  const supabase = await createSupabaseServerClient();
  const { data: sub } = await supabase
    .from("game_subs")
    .select("team_id")
    .eq("game_id", gameId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (!sub) return fail("That sub isn't lined up for this game.");

  const auth = await authorizeSubManager(gameId, sub.team_id);
  if (!auth.ok) return auth;

  const { error } = await auth.supabase
    .from("game_subs")
    .delete()
    .eq("game_id", gameId)
    .eq("player_id", playerId);
  if (error) return fail(error.message);

  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/score/${gameId}`);
  return ok();
}
