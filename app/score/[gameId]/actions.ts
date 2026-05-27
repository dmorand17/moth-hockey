"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PENALTY_TYPES, type PenaltyType } from "./penalty-types";

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

// =============================================================================
// LIVE SCORING (Wave 3)
// =============================================================================

async function ensureLiveAccess(gameId: string) {
  await requireRole(["admin", "scorekeeper"]);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("games")
    .select("status, period, clock_seconds, home_team_id, away_team_id, home_score, away_score, shootout_home_goals, shootout_away_goals")
    .eq("id", gameId)
    .single();
  if (error) return { ok: false as const, error: error.message };
  if (data.status !== "live") {
    return { ok: false as const, error: `Game is ${data.status}; not editable.` };
  }
  return { ok: true as const, supabase, game: data };
}

// Set the clock to a specific seconds value. Used by manual +/- buttons in the UI.
export async function setClock(input: { gameId: string; clockSeconds: number }): Promise<ActionResult> {
  const guard = await ensureLiveAccess(input.gameId);
  if (!guard.ok) return guard;
  const clock = Math.max(0, Math.min(60 * 99, Math.floor(input.clockSeconds)));
  const { error } = await guard.supabase
    .from("games")
    .update({ clock_seconds: clock })
    .eq("id", input.gameId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/score/${input.gameId}`);
  revalidatePath(`/games/${input.gameId}`);
  return { ok: true };
}

// Advance to the next period. 1→2→3→4(OT)→5(SO).
// At each transition we reset the clock: regulation periods → season period
// length, OT → 5:00, shootout → 0 (no clock).
export async function advancePeriod(input: { gameId: string }): Promise<ActionResult> {
  const guard = await ensureLiveAccess(input.gameId);
  if (!guard.ok) return guard;
  const cur = guard.game.period;
  if (cur >= 5) return { ok: false, error: "Already at shootout." };
  const next = cur + 1;

  // Period clock seed.
  let clock = 0;
  if (next <= 3) {
    const { data: gameMeta, error: metaErr } = await guard.supabase
      .from("games")
      .select("season_id")
      .eq("id", input.gameId)
      .single();
    if (metaErr || !gameMeta) return { ok: false, error: metaErr?.message ?? "Game not found." };
    const { data: seasonRow } = await guard.supabase
      .from("seasons")
      .select("period_length_minutes")
      .eq("id", gameMeta.season_id)
      .single();
    clock = (seasonRow?.period_length_minutes ?? 17) * 60;
  } else if (next === 4) {
    clock = 5 * 60;
  } else {
    clock = 0;
  }

  const { error } = await guard.supabase
    .from("games")
    .update({ period: next, clock_seconds: clock })
    .eq("id", input.gameId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/score/${input.gameId}`);
  revalidatePath(`/games/${input.gameId}`);
  return { ok: true };
}

// Record a goal. Increments the team's score atomically (read current, write back).
export async function recordGoal(input: {
  gameId: string;
  teamId: string;
  scorerId: string;
  assist1Id?: string | null;
  assist2Id?: string | null;
  period: number;
  clockSeconds: number;
}): Promise<ActionResult> {
  const guard = await ensureLiveAccess(input.gameId);
  if (!guard.ok) return guard;
  const { supabase, game } = guard;

  if (input.teamId !== game.home_team_id && input.teamId !== game.away_team_id) {
    return { ok: false, error: "Team is not in this game." };
  }
  if (!input.scorerId) return { ok: false, error: "Scorer required." };

  const { error: insertErr } = await supabase.from("game_events").insert({
    game_id: input.gameId,
    type: "goal",
    team_id: input.teamId,
    period: input.period,
    clock_seconds: input.clockSeconds,
    player_id: input.scorerId,
    assist1_player_id: input.assist1Id ?? null,
    assist2_player_id: input.assist2Id ?? null,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  const isHome = input.teamId === game.home_team_id;
  const update = isHome
    ? { home_score: game.home_score + 1 }
    : { away_score: game.away_score + 1 };
  const { error: updErr } = await supabase
    .from("games")
    .update(update)
    .eq("id", input.gameId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/score/${input.gameId}`);
  revalidatePath(`/games/${input.gameId}`);
  return { ok: true };
}

// Record a penalty + its resulting penalty shot. If the shot results in a
// goal, increment the SHOOTING team's score (which is the team OPPOSITE the
// committing team).
export async function recordPenalty(input: {
  gameId: string;
  committingTeamId: string;
  offenderId: string;
  penaltyType: PenaltyType;
  penaltyTypeOther?: string | null;
  shotTakerId: string;
  shotResult: "goal" | "saved";
  period: number;
  clockSeconds: number;
}): Promise<ActionResult> {
  const guard = await ensureLiveAccess(input.gameId);
  if (!guard.ok) return guard;
  const { supabase, game } = guard;

  if (
    input.committingTeamId !== game.home_team_id &&
    input.committingTeamId !== game.away_team_id
  ) {
    return { ok: false, error: "Team is not in this game." };
  }
  if (!PENALTY_TYPES.includes(input.penaltyType)) {
    return { ok: false, error: "Invalid penalty type." };
  }
  if (input.penaltyType === "other" && !input.penaltyTypeOther?.trim()) {
    return { ok: false, error: "Describe the penalty in the notes." };
  }

  const { error: insertErr } = await supabase.from("game_events").insert({
    game_id: input.gameId,
    type: "penalty",
    team_id: input.committingTeamId,
    period: input.period,
    clock_seconds: input.clockSeconds,
    player_id: input.offenderId,
    penalty_type: input.penaltyType,
    penalty_type_other:
      input.penaltyType === "other" ? (input.penaltyTypeOther ?? "").trim() : null,
    penalty_shot_result: input.shotResult,
    penalty_shot_taker_id: input.shotTakerId,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  // Penalty-shot goals count on the scoreboard.
  if (input.shotResult === "goal") {
    const shootingTeamIsHome = input.committingTeamId !== game.home_team_id;
    const update = shootingTeamIsHome
      ? { home_score: game.home_score + 1 }
      : { away_score: game.away_score + 1 };
    const { error: updErr } = await supabase
      .from("games")
      .update(update)
      .eq("id", input.gameId);
    if (updErr) return { ok: false, error: updErr.message };
  }

  revalidatePath(`/score/${input.gameId}`);
  revalidatePath(`/games/${input.gameId}`);
  return { ok: true };
}

// Adjust the shootout tally for one team. Used by the per-team +/− buttons
// during period 5. Does NOT touch home_score / away_score; the +1 for the
// winning team is applied at finalize time.
export async function adjustShootoutTally(input: {
  gameId: string;
  teamId: string;
  delta: 1 | -1;
}): Promise<ActionResult> {
  const guard = await ensureLiveAccess(input.gameId);
  if (!guard.ok) return guard;
  const { supabase, game } = guard;
  if (game.period !== 5) return { ok: false, error: "Not in shootout." };
  if (input.teamId !== game.home_team_id && input.teamId !== game.away_team_id) {
    return { ok: false, error: "Team is not in this game." };
  }
  const isHome = input.teamId === game.home_team_id;
  const cur = (isHome ? game.shootout_home_goals : game.shootout_away_goals) ?? 0;
  const next = Math.max(0, cur + input.delta);
  const update = isHome ? { shootout_home_goals: next } : { shootout_away_goals: next };
  const { error } = await supabase.from("games").update(update).eq("id", input.gameId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/score/${input.gameId}`);
  revalidatePath(`/games/${input.gameId}`);
  return { ok: true };
}

// Finalize a game. Determines decided_in from current period + score, applies
// any shootout +1 to the winning team, and flips status to 'final'. Refuses
// to finalize a tied regulation/OT game (must advance first) or a tied
// shootout. After finalize the game disappears from /score and lands on
// /standings + /stats + /games.
export async function finalizeGame(input: { gameId: string }): Promise<ActionResult> {
  const guard = await ensureLiveAccess(input.gameId);
  if (!guard.ok) return guard;
  const { supabase, game } = guard;

  let decidedIn: "regulation" | "ot" | "shootout";
  let homeScore = game.home_score;
  let awayScore = game.away_score;

  if (game.period <= 3) {
    if (game.home_score === game.away_score) {
      return { ok: false, error: "Game is tied. Advance to OT before finalizing." };
    }
    decidedIn = "regulation";
  } else if (game.period === 4) {
    if (game.home_score === game.away_score) {
      return { ok: false, error: "OT still tied. Go to shootout before finalizing." };
    }
    decidedIn = "ot";
  } else {
    const soHome = game.shootout_home_goals ?? 0;
    const soAway = game.shootout_away_goals ?? 0;
    if (soHome === soAway) {
      return { ok: false, error: "Shootout is tied. Adjust tallies before finalizing." };
    }
    decidedIn = "shootout";
    if (soHome > soAway) homeScore += 1;
    else awayScore += 1;
  }

  const { error } = await supabase
    .from("games")
    .update({
      status: "final",
      decided_in: decidedIn,
      home_score: homeScore,
      away_score: awayScore,
    })
    .eq("id", input.gameId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/score/${input.gameId}`);
  revalidatePath(`/games/${input.gameId}`);
  revalidatePath("/score");
  revalidatePath("/standings");
  revalidatePath("/stats");
  revalidatePath("/schedule");
  return { ok: true };
}

// Revert to the previous period. Only allowed when no events have been
// recorded in the current period — prevents orphaning stats.
export async function revertPeriod(input: { gameId: string }): Promise<ActionResult> {
  const guard = await ensureLiveAccess(input.gameId);
  if (!guard.ok) return guard;
  const { supabase, game } = guard;

  if (game.period <= 1) return { ok: false, error: "Already at period 1." };

  const { count, error: countErr } = await supabase
    .from("game_events")
    .select("id", { count: "exact", head: true })
    .eq("game_id", input.gameId)
    .eq("period", game.period);
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) > 0) {
    return { ok: false, error: "Can't go back — events are recorded in this period. Undo them first." };
  }

  const prev = game.period - 1;
  let clock = 0;
  if (prev <= 3) {
    const { data: gameMeta, error: metaErr } = await supabase
      .from("games")
      .select("season_id")
      .eq("id", input.gameId)
      .single();
    if (metaErr || !gameMeta) return { ok: false, error: metaErr?.message ?? "Game not found." };
    const { data: seasonRow } = await supabase
      .from("seasons")
      .select("period_length_minutes")
      .eq("id", gameMeta.season_id)
      .single();
    clock = (seasonRow?.period_length_minutes ?? 17) * 60;
  } else if (prev === 4) {
    clock = 5 * 60;
  }

  const { error } = await supabase
    .from("games")
    .update({ period: prev, clock_seconds: clock })
    .eq("id", input.gameId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/score/${input.gameId}`);
  revalidatePath(`/games/${input.gameId}`);
  return { ok: true };
}

// Undo a specific event by id. Reverses any score increment it caused.
export async function undoEvent(input: {
  gameId: string;
  eventId: string;
}): Promise<ActionResult> {
  const guard = await ensureLiveAccess(input.gameId);
  if (!guard.ok) return guard;
  const { supabase, game } = guard;

  const { data: ev, error: fetchErr } = await supabase
    .from("game_events")
    .select("id, type, team_id, penalty_shot_result")
    .eq("id", input.eventId)
    .eq("game_id", input.gameId)
    .single();
  if (fetchErr || !ev) return { ok: false, error: fetchErr?.message ?? "Event not found." };

  // Determine the score-bearing team for this event:
  //   goal           → ev.team_id (the scoring team)
  //   penalty + goal → opposite of ev.team_id (the team that took the shot)
  //   penalty + saved → no score change
  let scoringTeamId: string | null = null;
  if (ev.type === "goal") {
    scoringTeamId = ev.team_id;
  } else if (ev.type === "penalty" && ev.penalty_shot_result === "goal") {
    scoringTeamId = ev.team_id === game.home_team_id ? game.away_team_id : game.home_team_id;
  }

  const { error: delErr } = await supabase
    .from("game_events")
    .delete()
    .eq("id", input.eventId);
  if (delErr) return { ok: false, error: delErr.message };

  if (scoringTeamId) {
    const isHome = scoringTeamId === game.home_team_id;
    const update = isHome
      ? { home_score: Math.max(0, game.home_score - 1) }
      : { away_score: Math.max(0, game.away_score - 1) };
    const { error: updErr } = await supabase
      .from("games")
      .update(update)
      .eq("id", input.gameId);
    if (updErr) return { ok: false, error: updErr.message };
  }

  revalidatePath(`/score/${input.gameId}`);
  revalidatePath(`/games/${input.gameId}`);
  return { ok: true };
}
