"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import type { Database } from "@/lib/supabase/database.types";

type Role = Database["public"]["Enums"]["user_role"];

// team_captain is derived from team captaincy (managed on Teams), not set here.
const ASSIGNABLE_ROLES: Role[] = ["admin", "scorekeeper", "player"];

export async function updateUserRole(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;

  if (!userId || !ASSIGNABLE_ROLES.includes(role)) {
    return fail("Pick a valid role.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_roles")
    .update({ role })
    .eq("user_id", userId);

  if (error) return fail(error.message);

  revalidatePath("/admin/users");
  return ok("Role updated.");
}
