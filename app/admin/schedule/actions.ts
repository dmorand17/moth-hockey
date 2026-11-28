"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { buildScheduledAt } from "@/lib/schedule-config";
import { shiftLeagueWeeks, startOfLeagueDay } from "@/lib/timezone";
import { ok, fail, type ActionResult } from "@/lib/action-result";

type Status = "scheduled" | "live" | "final";
type DecidedIn = "regulation" | "ot" | "shootout";

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

export async function createGame(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();
  if (!season) return fail("No active season.");

  const homeTeamId = String(formData.get("home_team_id") ?? "").trim();
  const awayTeamId = String(formData.get("away_team_id") ?? "").trim();
  const scheduledDate = String(formData.get("scheduled_date") ?? "").trim();
  const scheduledTime = String(formData.get("scheduled_time") ?? "").trim();
  // Fall back to the season's default rink when no location was entered.
  const location =
    (String(formData.get("location") ?? "").trim() || season.default_location) ?? null;

  if (!homeTeamId || !awayTeamId || !scheduledDate || !scheduledTime || homeTeamId === awayTeamId)
    return fail("Check all required fields (home team ≠ away team, valid date).");

  const { error } = await supabase.from("games").insert({
    season_id: season.id,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    scheduled_at: buildScheduledAt(scheduledDate, scheduledTime),
    location,
  });

  if (error) return fail(error.message);

  revalidatePath("/admin/schedule");
  return ok("Game created.");
}

export async function updateGame(formData: FormData): Promise<ActionResult> {
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
  // Teams are editable (e.g. reseating a playoff bracket). Empty = TBD (null).
  const homeTeamId = String(formData.get("home_team_id") ?? "").trim() || null;
  const awayTeamId = String(formData.get("away_team_id") ?? "").trim() || null;

  if (!id || !scheduledDate || !scheduledTime) return fail("Check all required fields (home team ≠ away team, valid date).");
  if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) return fail("Home and away team must be different.");

  const { error } = await supabase
    .from("games")
    .update({
      scheduled_at: buildScheduledAt(scheduledDate, scheduledTime),
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      location,
      status,
      home_score: status === "final" ? homeScore : 0,
      away_score: status === "final" ? awayScore : 0,
      decided_in: status === "final" ? decidedIn : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return fail(error.message);

  revalidatePath("/admin/schedule");
  return ok("Game updated.");
}

export async function deleteGame(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return fail("Check all required fields (home team ≠ away team, valid date).");

  const { error } = await supabase.from("games").delete().eq("id", id);

  if (error) return fail(error.message);

  revalidatePath("/admin/schedule");
  return ok("Game deleted.");
}

export async function skipWeek(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();
  const season = await getCurrentSeason();
  if (!season) return fail("No active season.");

  const skipDate = String(formData.get("skip_date") ?? "").trim(); // YYYY-MM-DD
  const reason = String(formData.get("reason") ?? "").trim();
  if (!skipDate || !reason) return fail("Check all required fields (home team ≠ away team, valid date).");

  // League-local start-of-day for the picked date, as an ISO instant for comparison.
  const fromIso = startOfLeagueDay(skipDate);

  // Guard against double-submit: if this week is already recorded as skipped,
  // don't shift games again.
  const { data: existingSkip } = await supabase
    .from("schedule_skips")
    .select("id")
    .eq("season_id", season.id)
    .eq("skip_date", skipDate)
    .maybeSingle();
  if (existingSkip) return fail("That week is already recorded as skipped.");

  // Push every still-scheduled game on/after that date out by a week.
  const shiftErr = await shiftScheduledGames(season.id, fromIso, 1);
  if (shiftErr) return fail(shiftErr);

  const { error: insErr } = await supabase
    .from("schedule_skips")
    .insert({ season_id: season.id, skip_date: skipDate, reason });
  if (insErr) return fail(insErr.message);

  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  return ok("Week skipped — later games moved out a week.");
}

export async function removeScheduleSkip(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);
  const supabase = await createSupabaseServerClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return fail("Check all required fields (home team ≠ away team, valid date).");

  const { data: skip, error: getErr } = await supabase
    .from("schedule_skips")
    .select("season_id, skip_date")
    .eq("id", id)
    .single();
  if (getErr) return fail(getErr.message);

  // Undo the skip: the games it pushed now sit a week after the skipped date,
  // so pull every still-scheduled game from there on back by a week.
  const fromIso = shiftLeagueWeeks(startOfLeagueDay(skip.skip_date), 1);
  const shiftErr = await shiftScheduledGames(skip.season_id, fromIso, -1);
  if (shiftErr) return fail(shiftErr);

  const { error } = await supabase.from("schedule_skips").delete().eq("id", id);
  if (error) return fail(error.message);

  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  return ok("Skip undone — later games moved back a week.");
}

/** Move every still-scheduled game at/after `fromIso` by `weeks`. Returns an error message or null. */
async function shiftScheduledGames(
  seasonId: string,
  fromIso: string,
  weeks: number,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: games, error: fetchErr } = await supabase
    .from("games")
    .select("id, scheduled_at")
    .eq("season_id", seasonId)
    .eq("status", "scheduled")
    .gte("scheduled_at", fromIso);
  if (fetchErr) return fetchErr.message;

  for (const g of games ?? []) {
    const { error: updErr } = await supabase
      .from("games")
      .update({
        scheduled_at: shiftLeagueWeeks(g.scheduled_at, weeks),
        updated_at: new Date().toISOString(),
      })
      .eq("id", g.id);
    if (updErr) return updErr.message;
  }
  return null;
}
