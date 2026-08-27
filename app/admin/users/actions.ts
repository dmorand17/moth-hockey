"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Role = Database["public"]["Enums"]["user_role"];

// team_captain is derived from team captaincy (managed on Teams), not set here.
const ASSIGNABLE_ROLES: Role[] = ["admin", "scorekeeper", "player"];

export async function updateUserRole(formData: FormData) {
  await requireRole(["admin"]);

  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;

  if (!userId || !ASSIGNABLE_ROLES.includes(role)) {
    redirect("/admin/users?error=invalid_input");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_roles")
    .update({ role })
    .eq("user_id", userId);

  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/users");
  redirect("/admin/users?saved=role");
}
