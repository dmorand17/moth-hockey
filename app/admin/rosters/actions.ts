"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";

type Position = "forward" | "defense" | "goalie";

function back(qs: string): never {
  redirect(`/admin/rosters?${qs}`);
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

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/rosters");
  redirect("/admin/rosters?saved=added");
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

  revalidatePath("/admin/rosters");
  redirect("/admin/rosters?saved=updated");
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

  revalidatePath("/admin/rosters");
  redirect("/admin/rosters?saved=removed");
}
