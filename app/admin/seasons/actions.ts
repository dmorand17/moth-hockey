"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildGameSlots,
  roundRobinPairs,
  type WeekdayIdx,
} from "@/lib/season-schedule";

type SeasonType = "spring" | "fall" | "winter";

function back(qs: string): never {
  redirect(`/admin/seasons?${qs}`);
}

function parseSeasonType(raw: string): SeasonType | null {
  if (raw === "spring" || raw === "fall" || raw === "winter") return raw;
  return null;
}

function parseWeekday(raw: string): WeekdayIdx | null {
  const n = parseInt(raw, 10);
  if (n >= 0 && n <= 6) return n as WeekdayIdx;
  return null;
}

function parseInt0(raw: string, fallback: number): number {
  const n = parseInt(raw, 10);
  return isNaN(n) ? fallback : n;
}

function revalidatePublicSeasonPaths() {
  revalidatePath("/");
  revalidatePath("/standings");
  revalidatePath("/schedule");
  revalidatePath("/teams");
  revalidatePath("/stats");
  revalidatePath("/admin/seasons");
}

export async function createSeason(formData: FormData) {
  await requireRole(["admin"]);

  const seasonType = parseSeasonType(String(formData.get("season_type") ?? ""));
  const year = parseInt0(String(formData.get("year") ?? ""), NaN);
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const periodLength = parseInt0(
    String(formData.get("period_length_minutes") ?? "17"),
    17,
  );
  const copyFrom = String(formData.get("copy_from_season_id") ?? "").trim();

  if (!seasonType || isNaN(year) || !name || !startDate || !endDate) {
    back("error=invalid_input");
  }

  const supabase = await createSupabaseServerClient();
  const { data: created, error } = await supabase
    .from("seasons")
    .insert({
      season_type: seasonType,
      year,
      name,
      start_date: startDate,
      end_date: endDate,
      period_length_minutes: periodLength,
      is_current: false,
    })
    .select("id")
    .single();

  if (error || !created) {
    back(`error=${encodeURIComponent(error?.message ?? "insert failed")}`);
  }

  if (copyFrom) {
    const { data: srcTeams } = await supabase
      .from("teams")
      .select("name, slug, color, logo_url")
      .eq("season_id", copyFrom);

    if (srcTeams && srcTeams.length > 0) {
      const rows = srcTeams.map((t) => ({
        season_id: created.id,
        name: t.name,
        slug: t.slug,
        color: t.color,
        logo_url: t.logo_url,
      }));
      const { error: teamErr } = await supabase.from("teams").insert(rows);
      if (teamErr) {
        back(`error=${encodeURIComponent(`teams copy: ${teamErr.message}`)}`);
      }
    }
  }

  revalidatePath("/admin/seasons");
  redirect("/admin/seasons?saved=created");
}

export async function activateSeason(formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();

  const { error: clearErr } = await supabase
    .from("seasons")
    .update({ is_current: false })
    .eq("is_current", true)
    .neq("id", id);
  if (clearErr) back(`error=${encodeURIComponent(clearErr.message)}`);

  const { error: setErr } = await supabase
    .from("seasons")
    .update({ is_current: true })
    .eq("id", id);
  if (setErr) back(`error=${encodeURIComponent(setErr.message)}`);

  revalidatePublicSeasonPaths();
  redirect("/admin/seasons?saved=activated");
}

export async function deleteSeason(formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();

  const { data: season, error: seasonErr } = await supabase
    .from("seasons")
    .select("id, is_current")
    .eq("id", id)
    .single();
  if (seasonErr || !season) back("error=invalid_input");
  if (season.is_current) back("error=cannot_delete_current");

  const { count } = await supabase
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("season_id", id);
  if ((count ?? 0) > 0) back("error=has_games");

  const { error: delErr } = await supabase.from("seasons").delete().eq("id", id);
  if (delErr) back(`error=${encodeURIComponent(delErr.message)}`);

  revalidatePath("/admin/seasons");
  redirect("/admin/seasons?saved=deleted");
}

export async function generateSchedule(formData: FormData) {
  await requireRole(["admin"]);

  const seasonId = String(formData.get("season_id") ?? "").trim();
  const weekday = parseWeekday(String(formData.get("weekday") ?? ""));
  const rounds = parseInt0(String(formData.get("rounds") ?? "1"), 1);
  const location = String(formData.get("location") ?? "").trim() || null;
  const times = formData.getAll("times").map((v) => String(v));

  if (!seasonId || weekday === null || rounds < 1 || times.length === 0) {
    back("error=invalid_input");
  }

  const supabase = await createSupabaseServerClient();

  const { data: season } = await supabase
    .from("seasons")
    .select("id, start_date")
    .eq("id", seasonId)
    .single();
  if (!season) back("error=invalid_input");

  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("season_id", seasonId)
    .order("name");

  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length < 2) back("error=not_enough_teams");

  // Wipe existing scheduled (not live/final) games before regenerating.
  const { error: clearErr } = await supabase
    .from("games")
    .delete()
    .eq("season_id", seasonId)
    .eq("status", "scheduled");
  if (clearErr) back(`error=${encodeURIComponent(clearErr.message)}`);

  const pairs = roundRobinPairs(teamIds, rounds);
  const slots = buildGameSlots(season.start_date, weekday, times, pairs.length);

  const rows = pairs.map(([home, away], i) => ({
    season_id: seasonId,
    home_team_id: home,
    away_team_id: away,
    scheduled_at: slots[i],
    location,
  }));

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("games").insert(rows);
    if (insErr) back(`error=${encodeURIComponent(insErr.message)}`);
  }

  revalidatePath("/admin/seasons");
  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  redirect(`/admin/seasons?saved=generated&n=${rows.length}`);
}
