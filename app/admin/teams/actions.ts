"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function back(qs: string): never {
  redirect(`/admin/teams?${qs}`);
}

export async function createTeam(formData: FormData) {
  await requireRole(["admin"]);

  const seasonId = String(formData.get("season_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();

  const slug = slugify(slugRaw || name);

  if (!seasonId || !name || !slug) {
    back("error=invalid_input");
  }
  if (!HEX_COLOR.test(color)) {
    back("error=invalid_color");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("teams")
    .insert({ season_id: seasonId, name, slug, color });

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/teams");
  redirect("/admin/teams?saved=created");
}

export async function updateTeam(formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();

  const slug = slugify(slugRaw || name);

  if (!id || !name || !slug) {
    back("error=invalid_input");
  }
  if (!HEX_COLOR.test(color)) {
    back("error=invalid_color");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("teams")
    .update({ name, slug, color })
    .eq("id", id);

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/teams");
  redirect("/admin/teams?saved=updated");
}

export async function assignTeamCaptain(formData: FormData) {
  await requireRole(["admin"]);

  const teamId = String(formData.get("team_id") ?? "");
  const seasonId = String(formData.get("season_id") ?? "");
  const targetPlayerId = String(formData.get("player_id") ?? "") || null;

  if (!teamId || !seasonId) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();

  // Captain is the is_captain roster label (one per team); team_captains and
  // the team_captain role are derived from it by DB triggers. Clear the team's
  // current captain, then mark the chosen roster row.
  const { error: clearErr } = await supabase
    .from("team_players")
    .update({ is_captain: false })
    .eq("team_id", teamId)
    .eq("season_id", seasonId)
    .eq("is_captain", true);

  if (clearErr) back(`error=${encodeURIComponent(clearErr.message)}`);

  if (targetPlayerId) {
    const { error: setErr } = await supabase
      .from("team_players")
      .update({ is_captain: true })
      .eq("team_id", teamId)
      .eq("season_id", seasonId)
      .eq("player_id", targetPlayerId);
    if (setErr) back(`error=${encodeURIComponent(setErr.message)}`);
  }

  revalidatePath("/admin/teams");
  revalidatePath("/admin/players");
  redirect("/admin/teams?saved=captain");
}
