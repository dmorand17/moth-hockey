"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
