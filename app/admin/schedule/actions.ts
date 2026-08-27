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
  if (!season) back("error=no_season");

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

export async function skipWeek(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();
  if (!season) back("error=no_season");

  const skipDate = String(formData.get("skip_date") ?? "").trim(); // YYYY-MM-DD
  const reason = String(formData.get("reason") ?? "").trim();
  if (!skipDate || !reason) back("error=invalid_input");

  // Local start-of-day for the picked date, as an ISO instant for comparison.
  const [y, m, d] = skipDate.split("-").map(Number);
  const fromIso = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).toISOString();

  // Guard against double-submit: if this week is already recorded as skipped,
  // don't shift games again.
  const { data: existingSkip } = await supabase
    .from("schedule_skips")
    .select("id")
    .eq("season_id", season.id)
    .eq("skip_date", skipDate)
    .maybeSingle();
  if (existingSkip) back("error=already_skipped");

  // Push every still-scheduled game on/after that date out by 7 days.
  const { data: games, error: fetchErr } = await supabase
    .from("games")
    .select("id, scheduled_at")
    .eq("season_id", season.id)
    .eq("status", "scheduled")
    .gte("scheduled_at", fromIso);
  if (fetchErr) back(`error=${encodeURIComponent(fetchErr.message)}`);

  for (const g of games ?? []) {
    const next = new Date(
      new Date(g.scheduled_at).getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { error: updErr } = await supabase
      .from("games")
      .update({ scheduled_at: next, updated_at: new Date().toISOString() })
      .eq("id", g.id);
    if (updErr) back(`error=${encodeURIComponent(updErr.message)}`);
  }

  const { error: insErr } = await supabase
    .from("schedule_skips")
    .insert({ season_id: season.id, skip_date: skipDate, reason });
  if (insErr) back(`error=${encodeURIComponent(insErr.message)}`);

  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  redirect("/admin/schedule?saved=skipped");
}

export async function removeScheduleSkip(formData: FormData) {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) back("error=invalid_input");

  const { error } = await supabase.from("schedule_skips").delete().eq("id", id);
  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  redirect("/admin/schedule?saved=skip_removed");
}
