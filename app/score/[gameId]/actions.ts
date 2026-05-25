"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Position = "forward" | "defense" | "goalie";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Creates a one-off player to use as a sub. Returns the new player so the
// client can stage them into the check-in list. We do NOT create a
// `team_players` row — subs are league-wide players who happened to play in
// this game; their per-season roster (if any) is unaffected.
export async function createNewSub(input: {
  firstName: string;
  lastName: string;
  position: Position;
}): Promise<
  | { ok: true; player: { id: string; first_name: string; last_name: string; position: Position } }
  | { ok: false; error: string }
> {
  await requireRole(["admin", "scorekeeper"]);
  const first = input.firstName.trim();
  const last = input.lastName.trim();
  if (!first || !last) return { ok: false, error: "First and last name required." };
  if (!["forward", "defense", "goalie"].includes(input.position)) {
    return { ok: false, error: "Invalid position." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("players")
    .insert({ first_name: first, last_name: last })
    .select("id, first_name, last_name")
    .single();
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    player: { id: data.id, first_name: data.first_name, last_name: data.last_name, position: input.position },
  };
}

// Inserts game_appearances rows for every checked player and flips the game
// to live. Validates ≥1 goalie per team server-side (defence in depth).
export async function startGame(input: {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  // checkedIns are scoped per team because the same player could conceivably
  // sub for both teams in different games (here, only one team per game obviously).
  homeRoster: { playerId: string; position: Position; isSub: boolean }[];
  awayRoster: { playerId: string; position: Position; isSub: boolean }[];
}): Promise<ActionResult> {
  await requireRole(["admin", "scorekeeper"]);
  const supabase = await createSupabaseServerClient();

  const homeGoalies = input.homeRoster.filter((p) => p.position === "goalie").length;
  const awayGoalies = input.awayRoster.filter((p) => p.position === "goalie").length;
  if (homeGoalies < 1 || awayGoalies < 1) {
    return { ok: false, error: "Each team needs at least one goalie checked in." };
  }
  if (input.homeRoster.length === 0 || input.awayRoster.length === 0) {
    return { ok: false, error: "Each team needs at least one player checked in." };
  }

  // Look up the season's period length so we can seed clock_seconds correctly.
  const { data: gameRow, error: gameErr } = await supabase
    .from("games")
    .select("status, season_id")
    .eq("id", input.gameId)
    .single();
  if (gameErr) return { ok: false, error: gameErr.message };
  if (gameRow.status !== "scheduled") {
    return { ok: false, error: `Game is already ${gameRow.status}; can't start.` };
  }

  const { data: seasonRow, error: seasonErr } = await supabase
    .from("seasons")
    .select("period_length_minutes")
    .eq("id", gameRow.season_id)
    .single();
  if (seasonErr) return { ok: false, error: seasonErr.message };

  const appearances = [
    ...input.homeRoster.map((p) => ({
      game_id: input.gameId,
      team_id: input.homeTeamId,
      player_id: p.playerId,
      is_sub: p.isSub,
    })),
    ...input.awayRoster.map((p) => ({
      game_id: input.gameId,
      team_id: input.awayTeamId,
      player_id: p.playerId,
      is_sub: p.isSub,
    })),
  ];

  const { error: insertErr } = await supabase.from("game_appearances").insert(appearances);
  if (insertErr) return { ok: false, error: insertErr.message };

  const { error: updateErr } = await supabase
    .from("games")
    .update({
      status: "live",
      period: 1,
      clock_seconds: seasonRow.period_length_minutes * 60,
    })
    .eq("id", input.gameId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath(`/score/${input.gameId}`);
  revalidatePath("/score");
  return { ok: true };
}

// Edit the lineup mid-game (live) or post-game (admin only). Diffs the
// incoming roster against current game_appearances and applies the delta.
// Players with any game_events recorded for this game can't be removed
// (would orphan their stats). Adding new subs is always allowed.
export async function updateRoster(input: {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeRoster: { playerId: string; position: Position; isSub: boolean }[];
  awayRoster: { playerId: string; position: Position; isSub: boolean }[];
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();

  // Load the game first so we can pick the right auth gate.
  const { data: gameRow, error: gameErr } = await supabase
    .from("games")
    .select("status")
    .eq("id", input.gameId)
    .single();
  if (gameErr) return { ok: false, error: gameErr.message };

  if (gameRow.status === "final") {
    await requireRole(["admin"]);
  } else if (gameRow.status === "live") {
    await requireRole(["admin", "scorekeeper"]);
  } else {
    // status === "scheduled" — that's the start-game flow, not roster edit.
    return { ok: false, error: "Game hasn't started; use the check-in flow instead." };
  }

  const homeGoalies = input.homeRoster.filter((p) => p.position === "goalie").length;
  const awayGoalies = input.awayRoster.filter((p) => p.position === "goalie").length;
  if (homeGoalies < 1 || awayGoalies < 1) {
    return { ok: false, error: "Each team needs at least one goalie checked in." };
  }
  if (input.homeRoster.length === 0 || input.awayRoster.length === 0) {
    return { ok: false, error: "Each team needs at least one player checked in." };
  }

  // Current appearances and any events keyed by player_id for this game.
  const [{ data: currentApps, error: appsErr }, { data: events, error: evErr }] = await Promise.all([
    supabase
      .from("game_appearances")
      .select("player_id, team_id, is_sub")
      .eq("game_id", input.gameId),
    supabase
      .from("game_events")
      .select("player_id, assist1_player_id, assist2_player_id, penalty_shot_taker_id")
      .eq("game_id", input.gameId),
  ]);
  if (appsErr) return { ok: false, error: appsErr.message };
  if (evErr) return { ok: false, error: evErr.message };

  const involvedIds = new Set<string>();
  for (const e of events ?? []) {
    if (e.player_id) involvedIds.add(e.player_id);
    if (e.assist1_player_id) involvedIds.add(e.assist1_player_id);
    if (e.assist2_player_id) involvedIds.add(e.assist2_player_id);
    if (e.penalty_shot_taker_id) involvedIds.add(e.penalty_shot_taker_id);
  }

  const currentByKey = new Map<string, { team_id: string; is_sub: boolean }>();
  for (const a of currentApps ?? []) {
    currentByKey.set(`${a.team_id}:${a.player_id}`, { team_id: a.team_id, is_sub: a.is_sub });
  }

  const incoming = [
    ...input.homeRoster.map((p) => ({ team_id: input.homeTeamId, player_id: p.playerId, is_sub: p.isSub })),
    ...input.awayRoster.map((p) => ({ team_id: input.awayTeamId, player_id: p.playerId, is_sub: p.isSub })),
  ];
  const incomingKeys = new Set(incoming.map((a) => `${a.team_id}:${a.player_id}`));

  // Removals: in current but not incoming. Reject any whose player has events.
  const toRemove: { team_id: string; player_id: string }[] = [];
  for (const [key, row] of currentByKey) {
    if (incomingKeys.has(key)) continue;
    const playerId = key.split(":")[1];
    if (involvedIds.has(playerId)) {
      return {
        ok: false,
        error: `Can't remove a player who has events recorded. Undo their events first.`,
      };
    }
    toRemove.push({ team_id: row.team_id, player_id: playerId });
  }

  // Additions: in incoming but not current.
  const toAdd = incoming
    .filter((a) => !currentByKey.has(`${a.team_id}:${a.player_id}`))
    .map((a) => ({ ...a, game_id: input.gameId }));

  if (toRemove.length > 0) {
    // No bulk delete by composite key; loop is fine for ≲40 rows.
    for (const r of toRemove) {
      const { error: delErr } = await supabase
        .from("game_appearances")
        .delete()
        .eq("game_id", input.gameId)
        .eq("team_id", r.team_id)
        .eq("player_id", r.player_id);
      if (delErr) return { ok: false, error: delErr.message };
    }
  }

  if (toAdd.length > 0) {
    const { error: addErr } = await supabase.from("game_appearances").insert(toAdd);
    if (addErr) return { ok: false, error: addErr.message };
  }

  revalidatePath(`/score/${input.gameId}`);
  revalidatePath(`/score/${input.gameId}/roster`);
  revalidatePath("/score");
  return { ok: true };
}
