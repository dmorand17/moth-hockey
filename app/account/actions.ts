"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/format";

export async function updateProfile(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = formatPhone(String(formData.get("phone") ?? ""));

  const { error } = await supabase
    .from("user_profiles")
    .update({ full_name: fullName || null, phone: phone || null })
    .eq("user_id", userData.user.id);

  if (error) {
    redirect(`/account?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/account");
  redirect("/account?saved=1");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

// A linked player sets their availability for a game. status=null clears the
// row (back to "no response"). Writes are RLS-gated to the caller's own player.
export async function setAvailability(input: {
  gameId: string;
  status: "in" | "out" | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in." };

  const gameId = input.gameId.trim();
  if (!gameId) return { ok: false, error: "Missing game." };
  if (input.status !== null && input.status !== "in" && input.status !== "out") {
    return { ok: false, error: "Invalid status." };
  }

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!player) return { ok: false, error: "No player linked to your account." };

  if (input.status === null) {
    const { error } = await supabase
      .from("game_availability")
      .delete()
      .eq("game_id", gameId)
      .eq("player_id", player.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("game_availability").upsert(
      {
        game_id: gameId,
        player_id: player.id,
        status: input.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "game_id,player_id" },
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/account");
  return { ok: true };
}
