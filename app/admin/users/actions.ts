"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Role = Database["public"]["Enums"]["user_role"];

const ROLES: Role[] = ["admin", "scorekeeper", "team_captain", "player"];

export async function updateUserRole(formData: FormData) {
  await requireRole(["admin"]);

  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;

  if (!userId || !ROLES.includes(role)) {
    redirect("/admin/users?error=invalid_input");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_roles")
    .update({ role })
    .eq("user_id", userId);

  if (error) {
    redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?saved=role");
}

export async function linkUserToPlayer(formData: FormData) {
  await requireRole(["admin"]);

  const userId = String(formData.get("user_id") ?? "");
  const playerIdRaw = String(formData.get("player_id") ?? "");
  // Empty string means "unlink"
  const targetPlayerId = playerIdRaw || null;

  if (!userId) {
    redirect("/admin/users?error=invalid_input");
  }

  const supabase = await createSupabaseServerClient();

  // Two-step update: first clear any existing player link for this user, then
  // set the new one. The unique index on players.user_id means we can't have
  // the same user pointing at two players, so an admin "switching" the link
  // requires unlinking the old row first.
  const { error: clearErr } = await supabase
    .from("players")
    .update({ user_id: null })
    .eq("user_id", userId);

  if (clearErr) {
    redirect(`/admin/users?error=${encodeURIComponent(clearErr.message)}`);
  }

  if (targetPlayerId) {
    const { error: linkErr } = await supabase
      .from("players")
      .update({ user_id: userId })
      .eq("id", targetPlayerId);

    if (linkErr) {
      redirect(`/admin/users?error=${encodeURIComponent(linkErr.message)}`);
    }
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?saved=link");
}
