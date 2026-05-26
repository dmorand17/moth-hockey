"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { buildScheduledAt } from "@/lib/schedule-config";

type Status = "scheduled" | "live" | "final";
type DecidedIn = "regulation" | "ot" | "shootout";

function back(qs: string): never {
  redirect(`/admin/schedule?${qs}`);
}

function parseStatus(raw: string): Status {
  if (raw === "live" || raw === "final") return raw;
  return "scheduled";
}

function parseDecidedIn(raw: string): DecidedIn {
  if (raw === "ot" || raw === "shootout") return raw;
  return "regulation";
}

function parseScore(raw: string): number {
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

export async function createGame(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();

  const homeTeamId = String(formData.get("home_team_id") ?? "").trim();
  const awayTeamId = String(formData.get("away_team_id") ?? "").trim();
  const scheduledDate = String(formData.get("scheduled_date") ?? "").trim();
  const scheduledTime = String(formData.get("scheduled_time") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || null;

  if (!homeTeamId || !awayTeamId || !scheduledDate || !scheduledTime || homeTeamId === awayTeamId)
    back("error=invalid_input");

  const { error } = await supabase.from("games").insert({
    season_id: season.id,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    scheduled_at: buildScheduledAt(scheduledDate, scheduledTime),
    location,
  });

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/schedule");
  redirect("/admin/schedule?saved=created");
}

export async function updateGame(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const id = String(formData.get("id") ?? "").trim();
  const scheduledDate = String(formData.get("scheduled_date") ?? "").trim();
  const scheduledTime = String(formData.get("scheduled_time") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || null;
  const status = parseStatus(String(formData.get("status") ?? ""));
  const homeScore = parseScore(String(formData.get("home_score") ?? "0"));
  const awayScore = parseScore(String(formData.get("away_score") ?? "0"));
  const decidedIn = parseDecidedIn(String(formData.get("decided_in") ?? ""));

  if (!id || !scheduledDate || !scheduledTime) back("error=invalid_input");

  const { error } = await supabase
    .from("games")
    .update({
      scheduled_at: buildScheduledAt(scheduledDate, scheduledTime),
      location,
      status,
      home_score: status === "final" ? homeScore : 0,
      away_score: status === "final" ? awayScore : 0,
      decided_in: status === "final" ? decidedIn : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/schedule");
  redirect("/admin/schedule?saved=updated");
}

export async function deleteGame(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) back("error=invalid_input");

  const { error } = await supabase.from("games").delete().eq("id", id);

  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/schedule");
  redirect("/admin/schedule?saved=deleted");
}
