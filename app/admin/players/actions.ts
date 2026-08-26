"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Role = Database["public"]["Enums"]["user_role"];

const ROLES: Role[] = ["admin", "scorekeeper", "team_captain", "player"];

function back(qs: string): never {
  redirect(`/admin/players?${qs}`);
}

export async function createPlayer(formData: FormData) {
  await requireRole(["admin"]);

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();

  if (!firstName || !lastName) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("players")
    .insert({ first_name: firstName, last_name: lastName });

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/players");
  redirect("/admin/players?saved=created");
}

export async function updatePlayer(formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();

  if (!id || !firstName || !lastName) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("players")
    .update({ first_name: firstName, last_name: lastName })
    .eq("id", id);

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/players");
  redirect("/admin/players?saved=updated");
}

export async function updateUserRole(formData: FormData) {
  await requireRole(["admin"]);

  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;

  if (!userId || !ROLES.includes(role)) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_roles")
    .update({ role })
    .eq("user_id", userId);

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/players");
  redirect("/admin/players?saved=role");
}

export async function deletePlayer(input: {
  playerId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const { playerId } = input;

  const [{ count: eventsCount }, { count: appCount }] = await Promise.all([
    supabase
      .from("game_events")
      .select("id", { count: "exact", head: true })
      .or(
        `player_id.eq.${playerId},assist1_player_id.eq.${playerId},assist2_player_id.eq.${playerId},penalty_shot_taker_id.eq.${playerId}`,
      ),
    supabase
      .from("game_appearances")
      .select("game_id", { count: "exact", head: true })
      .eq("player_id", playerId),
  ]);

  if ((eventsCount ?? 0) > 0 || (appCount ?? 0) > 0) {
    return { ok: false, error: "Player has game history — use Merge instead." };
  }

  const { error } = await supabase.from("players").delete().eq("id", playerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/players");
  return { ok: true };
}

const sumNullable = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

export async function mergePlayer(input: {
  keepId: string;
  duplicateId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const { keepId, duplicateId } = input;

  if (keepId === duplicateId) return { ok: false, error: "Cannot merge a player into themselves." };

  // 1. Merge season_player_stats
  const [{ data: dupStats }, { data: keepStats }] = await Promise.all([
    supabase.from("season_player_stats").select("*").eq("player_id", duplicateId),
    supabase.from("season_player_stats").select("*").eq("player_id", keepId),
  ]);

  const keepSeasons = new Set((keepStats ?? []).map((r) => r.season_id));

  for (const dup of dupStats ?? []) {
    if (keepSeasons.has(dup.season_id)) {
      const keepRow = (keepStats ?? []).find((r) => r.season_id === dup.season_id)!;
      const { error } = await supabase
        .from("season_player_stats")
        .update({
          goals: keepRow.goals + dup.goals,
          assists: keepRow.assists + dup.assists,
          games_played: keepRow.games_played + dup.games_played,
          penalties: keepRow.penalties + dup.penalties,
          penalty_shots_taken: keepRow.penalty_shots_taken + dup.penalty_shots_taken,
          penalty_shots_made: keepRow.penalty_shots_made + dup.penalty_shots_made,
          goals_against: sumNullable(keepRow.goals_against, dup.goals_against),
          penalty_shots_faced: sumNullable(keepRow.penalty_shots_faced, dup.penalty_shots_faced),
          penalty_shots_saved: sumNullable(keepRow.penalty_shots_saved, dup.penalty_shots_saved),
        })
        .eq("player_id", keepId)
        .eq("season_id", dup.season_id);
      if (error) return { ok: false, error: error.message };

      const { error: delErr } = await supabase
        .from("season_player_stats")
        .delete()
        .eq("player_id", duplicateId)
        .eq("season_id", dup.season_id);
      if (delErr) return { ok: false, error: delErr.message };
    } else {
      const { error } = await supabase
        .from("season_player_stats")
        .update({ player_id: keepId })
        .eq("player_id", duplicateId)
        .eq("season_id", dup.season_id);
      if (error) return { ok: false, error: error.message };
    }
  }

  // 2. Update all game_events player columns
  const eventCols = [
    { update: { player_id: keepId }, filter: "player_id" },
    { update: { assist1_player_id: keepId }, filter: "assist1_player_id" },
    { update: { assist2_player_id: keepId }, filter: "assist2_player_id" },
    { update: { penalty_shot_taker_id: keepId }, filter: "penalty_shot_taker_id" },
  ] as const;
  for (const { update, filter } of eventCols) {
    const { error } = await supabase
      .from("game_events")
      .update(update)
      .eq(filter, duplicateId);
    if (error) return { ok: false, error: error.message };
  }

  // 3. Merge game_appearances (skip if keep already appeared in that game)
  const [{ data: keepApps }, { data: dupApps }] = await Promise.all([
    supabase.from("game_appearances").select("game_id").eq("player_id", keepId),
    supabase.from("game_appearances").select("game_id").eq("player_id", duplicateId),
  ]);
  const keepGameIds = new Set((keepApps ?? []).map((a) => a.game_id));

  for (const app of dupApps ?? []) {
    if (keepGameIds.has(app.game_id)) {
      const { error } = await supabase
        .from("game_appearances")
        .delete()
        .eq("player_id", duplicateId)
        .eq("game_id", app.game_id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("game_appearances")
        .update({ player_id: keepId })
        .eq("player_id", duplicateId)
        .eq("game_id", app.game_id);
      if (error) return { ok: false, error: error.message };
    }
  }

  // 4. Merge team_players (skip if keep already on that team+season)
  const [{ data: keepRoster }, { data: dupRoster }] = await Promise.all([
    supabase.from("team_players").select("team_id, season_id").eq("player_id", keepId),
    supabase.from("team_players").select("team_id, season_id").eq("player_id", duplicateId),
  ]);
  const keepTeamSeasons = new Set(
    (keepRoster ?? []).map((r) => `${r.team_id}:${r.season_id}`),
  );

  for (const row of dupRoster ?? []) {
    if (keepTeamSeasons.has(`${row.team_id}:${row.season_id}`)) {
      const { error } = await supabase
        .from("team_players")
        .delete()
        .eq("player_id", duplicateId)
        .eq("team_id", row.team_id)
        .eq("season_id", row.season_id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("team_players")
        .update({ player_id: keepId })
        .eq("player_id", duplicateId)
        .eq("team_id", row.team_id)
        .eq("season_id", row.season_id);
      if (error) return { ok: false, error: error.message };
    }
  }

  // 5. Re-target player_awards
  const { error: awardsErr } = await supabase
    .from("player_awards")
    .update({ player_id: keepId })
    .eq("player_id", duplicateId);
  if (awardsErr) return { ok: false, error: awardsErr.message };

  // 6. Handle user_id: move dup's linked account to keep if keep has none
  const [{ data: dupPlayer }, { data: keepPlayer }] = await Promise.all([
    supabase.from("players").select("user_id").eq("id", duplicateId).single(),
    supabase.from("players").select("user_id").eq("id", keepId).single(),
  ]);
  const dupUserId = dupPlayer?.user_id ?? null;
  const keepUserId = keepPlayer?.user_id ?? null;

  if (dupUserId) {
    // Unlink dup first (unique constraint requires clearing before re-pointing)
    const { error: unlinkErr } = await supabase
      .from("players")
      .update({ user_id: null })
      .eq("id", duplicateId);
    if (unlinkErr) return { ok: false, error: unlinkErr.message };

    // Move link to keep only if keep has no account yet
    if (!keepUserId) {
      const { error: relinkErr } = await supabase
        .from("players")
        .update({ user_id: dupUserId })
        .eq("id", keepId);
      if (relinkErr) return { ok: false, error: relinkErr.message };
    }
  }

  // 7. Delete duplicate player (cascades clean any remaining orphan rows)
  const { error: deleteErr } = await supabase.from("players").delete().eq("id", duplicateId);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  revalidatePath("/admin/players");
  return { ok: true };
}

export async function linkUserToPlayer(formData: FormData) {
  await requireRole(["admin"]);

  const userId = String(formData.get("user_id") ?? "");
  const playerIdRaw = String(formData.get("player_id") ?? "");
  // Empty string means "unlink"
  const targetPlayerId = playerIdRaw || null;

  if (!userId) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();

  // Two-step update: first clear any existing player link for this user, then
  // set the new one. The unique index on players.user_id means we can't have
  // the same user pointing at two players, so an admin "switching" the link
  // requires unlinking the old row first.
  const { error: clearErr } = await supabase
    .from("players")
    .update({ user_id: null })
    .eq("user_id", userId);

  if (clearErr) back(`error=${encodeURIComponent(clearErr.message)}`);

  if (targetPlayerId) {
    const { error: linkErr } = await supabase
      .from("players")
      .update({ user_id: userId })
      .eq("id", targetPlayerId);

    if (linkErr) back(`error=${encodeURIComponent(linkErr.message)}`);
  }

  revalidatePath("/admin/players");
  redirect("/admin/players?saved=link");
}

// Parse pasted player names, one per line. A line containing a comma is
// "Last, First"; otherwise "First Last..." (first token = first name, the
// rest = last name). Lines that don't yield both a first and last name are
// counted as invalid, not imported.
// Not exported: a "use server" module may only export async server actions.
function parsePlayerNames(text: string): {
  valid: { first: string; last: string }[];
  invalidCount: number;
} {
  const valid: { first: string; last: string }[] = [];
  let invalidCount = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue; // skip blank lines
    let first = "";
    let last = "";
    if (line.includes(",")) {
      const idx = line.indexOf(",");
      last = line.slice(0, idx).trim();
      first = line.slice(idx + 1).trim();
    } else {
      const m = line.match(/^(\S+)\s+(.+)$/);
      if (m) {
        first = m[1].trim();
        last = m[2].trim();
      }
    }
    if (first && last) valid.push({ first, last });
    else invalidCount++;
  }
  return { valid, invalidCount };
}

// Bulk-create players from pasted names. Skips names that already exist
// (case-insensitive first+last) and repeats within the paste. Redirects back
// with a summary (added / duplicates skipped / invalid lines).
export async function importPlayers(formData: FormData) {
  await requireRole(["admin"]);

  const { valid, invalidCount } = parsePlayerNames(
    String(formData.get("names") ?? ""),
  );
  if (valid.length === 0) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();
  // High limit so dedup sees the whole pool (PostgREST defaults to 1000 rows).
  const { data: existing, error: fetchErr } = await supabase
    .from("players")
    .select("first_name, last_name")
    .limit(10000);
  if (fetchErr) back(`error=${encodeURIComponent(fetchErr.message)}`);

  // NUL separator so a multi-word first name can't collide with another split.
  const key = (f: string, l: string) =>
    `${f.toLowerCase()}\u0000${l.toLowerCase()}`;
  const seen = new Set<string>();
  for (const p of existing ?? []) seen.add(key(p.first_name, p.last_name));

  const rows: { first_name: string; last_name: string }[] = [];
  let dup = 0;
  for (const { first, last } of valid) {
    const k = key(first, last);
    if (seen.has(k)) {
      dup++;
      continue;
    }
    seen.add(k);
    rows.push({ first_name: first, last_name: last });
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("players").insert(rows);
    if (insErr) back(`error=${encodeURIComponent(insErr.message)}`);
  }

  revalidatePath("/admin/players");
  redirect(
    `/admin/players?saved=imported&added=${rows.length}&dup=${dup}&bad=${invalidCount}`,
  );
}
