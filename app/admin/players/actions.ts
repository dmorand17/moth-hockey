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
