"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";

type Position = "forward" | "defense" | "goalie";

function back(qs: string): never {
  redirect(`/admin/teams?${qs}`);
}

function parseJersey(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  return isNaN(n) ? null : n;
}

function parsePosition(raw: string): Position {
  const v = raw.trim();
  if (v === "defense" || v === "goalie") return v;
  return "forward";
}

export async function addToRoster(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();
  if (!season) back("error=no_season");

  const teamId = String(formData.get("team_id") ?? "").trim();
  const playerId = String(formData.get("player_id") ?? "").trim();
  const position = parsePosition(String(formData.get("position") ?? ""));
  const jerseyNumber = parseJersey(String(formData.get("jersey_number") ?? ""));

  if (!teamId || !playerId) back("error=invalid_input");

  const { error } = await supabase.from("team_players").insert({
    team_id: teamId,
    player_id: playerId,
    season_id: season.id,
    position,
    jersey_number: jerseyNumber,
  });

  if (error) {
    // Unique (player_id, season_id) violation — already on a team this season.
    if (error.code === "23505") back("error=already_rostered");
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/teams");
  redirect("/admin/teams?saved=added");
}

export async function updateRosterEntry(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const teamId = String(formData.get("team_id") ?? "").trim();
  const playerId = String(formData.get("player_id") ?? "").trim();
  const position = parsePosition(String(formData.get("position") ?? ""));
  const jerseyNumber = parseJersey(String(formData.get("jersey_number") ?? ""));

  if (!teamId || !playerId) back("error=invalid_input");

  const { error } = await supabase
    .from("team_players")
    .update({ position, jersey_number: jerseyNumber })
    .eq("team_id", teamId)
    .eq("player_id", playerId);

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/teams");
  redirect("/admin/teams?saved=roster_updated");
}

// Batch roster save: applies additions, removals, and position/jersey updates
// in one round-trip. Returns ActionResult without redirecting so the client
// component can stay mounted and update its own saved-state reference.
export async function saveRosterChanges(input: {
  teamId: string;
  toAdd: { player_id: string; position: Position; jersey_number: number | null }[];
  toRemove: { player_id: string }[];
  toUpdate: { player_id: string; position: Position; jersey_number: number | null }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();
  if (!season) return { ok: false, error: "no_season" };

  for (const r of input.toRemove) {
    const { error } = await supabase
      .from("team_players")
      .delete()
      .eq("team_id", input.teamId)
      .eq("player_id", r.player_id);
    if (error) return { ok: false, error: error.message };
  }

  if (input.toAdd.length > 0) {
    const { error } = await supabase.from("team_players").insert(
      input.toAdd.map((r) => ({
        team_id: input.teamId,
        player_id: r.player_id,
        season_id: season.id,
        position: r.position,
        jersey_number: r.jersey_number,
      })),
    );
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "One or more of those players are already on another team this season.",
        };
      }
      return { ok: false, error: error.message };
    }
  }

  for (const u of input.toUpdate) {
    const { error } = await supabase
      .from("team_players")
      .update({ position: u.position, jersey_number: u.jersey_number })
      .eq("team_id", input.teamId)
      .eq("player_id", u.player_id);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/teams");
  return { ok: true };
}

export async function removeFromRoster(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const teamId = String(formData.get("team_id") ?? "").trim();
  const playerId = String(formData.get("player_id") ?? "").trim();

  if (!teamId || !playerId) back("error=invalid_input");

  const { error } = await supabase
    .from("team_players")
    .delete()
    .eq("team_id", teamId)
    .eq("player_id", playerId);

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/teams");
  redirect("/admin/teams?saved=removed");
}
