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

  // Only allow availability for a game the player's team is actually in.
  const { data: gameRow } = await supabase
    .from("games")
    .select("season_id, home_team_id, away_team_id")
    .eq("id", gameId)
    .maybeSingle();
  if (!gameRow) return { ok: false, error: "Game not found." };

  const teamIds = [gameRow.home_team_id, gameRow.away_team_id].filter(
    (t): t is string => t != null,
  );
  if (teamIds.length === 0) {
    return { ok: false, error: "This game has no teams set yet." };
  }

  const { data: rosterRow } = await supabase
    .from("team_players")
    .select("team_id")
    .eq("player_id", player.id)
    .eq("season_id", gameRow.season_id)
    .in("team_id", teamIds)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "You're not on a team in this game." };
  }

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
  revalidatePath(`/games/${gameId}`);
  return { ok: true };
}
