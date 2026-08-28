"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStandings } from "@/lib/queries";
import {
  buildGameSlots,
  buildPlayoffSlots,
  roundRobinGames,
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

// A season's end can be given as an explicit end date OR as a number of weeks
// (which sets end = start + weeks×7 days). Weeks wins when both are provided.
// Returns null when neither yields a usable end date.
function resolveEndDate(
  startDate: string,
  endDate: string,
  weeksRaw: string,
): string | null {
  const weeks = parseInt(weeksRaw, 10);
  if (!isNaN(weeks) && weeks > 0) {
    const [y, m, d] = startDate.split("-").map(Number);
    const end = new Date(y, (m ?? 1) - 1, d ?? 1);
    end.setDate(end.getDate() + weeks * 7);
    const yyyy = end.getFullYear();
    const mm = String(end.getMonth() + 1).padStart(2, "0");
    const dd = String(end.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return endDate || null;
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
  const weeks = String(formData.get("weeks") ?? "").trim();
  const periodLength = parseInt0(
    String(formData.get("period_length_minutes") ?? "17"),
    17,
  );
  const copyFrom = String(formData.get("copy_from_season_id") ?? "").trim();

  if (!seasonType || isNaN(year) || !name || !startDate) {
    back("error=invalid_input");
  }
  const resolvedEnd = resolveEndDate(startDate, endDate, weeks);
  if (!resolvedEnd) back("error=need_end");

  const supabase = await createSupabaseServerClient();
  const { data: created, error } = await supabase
    .from("seasons")
    .insert({
      season_type: seasonType,
      year,
      name,
      start_date: startDate,
      end_date: resolvedEnd,
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

export async function updateSeasonDates(formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const weeks = String(formData.get("weeks") ?? "").trim();
  if (!id || !startDate) back("error=invalid_input");
  const resolvedEnd = resolveEndDate(startDate, endDate, weeks);
  if (!resolvedEnd) back("error=need_end");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("seasons")
    .update({ start_date: startDate, end_date: resolvedEnd })
    .eq("id", id);
  if (error) back(`error=${encodeURIComponent(error.message)}`);

  revalidatePublicSeasonPaths();
  redirect("/admin/seasons?saved=dates");
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

// Reset a season's schedule + results without deleting the season itself.
// Clears ALL games (any status; cascades events/appearances/availability),
// the computed season stats, and any skip notes. Teams and rosters are kept so
// the schedule can be regenerated. Used to wipe a demo season and start fresh.
export async function resetSeason(formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();

  const { error: gamesErr } = await supabase
    .from("games")
    .delete()
    .eq("season_id", id);
  if (gamesErr) back(`error=${encodeURIComponent(gamesErr.message)}`);

  const { error: statsErr } = await supabase
    .from("season_player_stats")
    .delete()
    .eq("season_id", id);
  if (statsErr) back(`error=${encodeURIComponent(statsErr.message)}`);

  const { error: skipErr } = await supabase
    .from("schedule_skips")
    .delete()
    .eq("season_id", id);
  if (skipErr) back(`error=${encodeURIComponent(skipErr.message)}`);

  revalidatePublicSeasonPaths();
  revalidatePath("/admin/schedule");
  redirect("/admin/seasons?saved=reset");
}

export async function generateSchedule(formData: FormData) {
  await requireRole(["admin"]);

  const seasonId = String(formData.get("season_id") ?? "").trim();
  const weekday = parseWeekday(String(formData.get("weekday") ?? ""));
  const weeks = parseInt0(String(formData.get("weeks") ?? "1"), 1);
  const location = String(formData.get("location") ?? "").trim() || null;
  const times = formData
    .getAll("times")
    .map((v) => String(v).trim())
    .filter((v) => v !== "");
  const withPlayoffs = String(formData.get("with_playoffs") ?? "") === "on";

  if (!seasonId || weekday === null || weeks < 1 || times.length === 0) {
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

  // One "week" = one game night of `times.length` slots. Fill exactly
  // weeks × slots games so the schedule spans exactly `weeks` calendar weeks.
  const pairs = roundRobinGames(teamIds, weeks * times.length);
  const slots = buildGameSlots(season.start_date, weekday, times, pairs.length);

  type GameInsert = {
    season_id: string;
    home_team_id: string | null;
    away_team_id: string | null;
    scheduled_at: string;
    location: string | null;
    kind: "regular" | "playoff";
    playoff_round?: "sf1" | "sf2" | "final" | null;
  };

  const rows: GameInsert[] = pairs.map(([home, away], i) => ({
    season_id: seasonId,
    home_team_id: home,
    away_team_id: away,
    scheduled_at: slots[i],
    location,
    kind: "regular",
  }));

  if (withPlayoffs) {
    const ps = buildPlayoffSlots(
      season.start_date,
      weekday,
      times,
      pairs.length,
    );
    rows.push(
      {
        season_id: seasonId,
        home_team_id: null,
        away_team_id: null,
        scheduled_at: ps.sf1,
        location,
        kind: "playoff",
        playoff_round: "sf1",
      },
      {
        season_id: seasonId,
        home_team_id: null,
        away_team_id: null,
        scheduled_at: ps.sf2,
        location,
        kind: "playoff",
        playoff_round: "sf2",
      },
      {
        season_id: seasonId,
        home_team_id: null,
        away_team_id: null,
        scheduled_at: ps.final,
        location,
        kind: "playoff",
        playoff_round: "final",
      },
    );
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("games").insert(rows);
    if (insErr) back(`error=${encodeURIComponent(insErr.message)}`);
  }

  revalidatePath("/admin/seasons");
  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  redirect(`/admin/seasons?saved=generated&n=${rows.length}`);
}

export async function seedPlayoffs(formData: FormData) {
  await requireRole(["admin"]);

  const seasonId = String(formData.get("season_id") ?? "").trim();
  if (!seasonId) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();

  // Pull the three playoff stubs (or partially-filled rows) for this season.
  const { data: stubs } = await supabase
    .from("games")
    .select(
      "id, playoff_round, status, home_team_id, away_team_id, home_score, away_score",
    )
    .eq("season_id", seasonId)
    .eq("kind", "playoff");
  const stubList = stubs ?? [];
  if (stubList.length === 0) back("error=no_playoff_stubs");

  const sf1 = stubList.find((s) => s.playoff_round === "sf1");
  const sf2 = stubList.find((s) => s.playoff_round === "sf2");
  const finalRow = stubList.find((s) => s.playoff_round === "final");

  // Standings are regular-season only after the lib/queries change.
  const standings = await getStandings(seasonId);
  if (standings.length < 4) back("error=not_enough_teams");

  const top4 = standings.slice(0, 4);
  const updates: Array<{ id: string; home_team_id: string; away_team_id: string }> = [];

  // SF1: #1 vs #4. Skip if already final (locked).
  if (sf1 && sf1.status !== "final") {
    updates.push({
      id: sf1.id,
      home_team_id: top4[0].team_id,
      away_team_id: top4[3].team_id,
    });
  }
  // SF2: #2 vs #3.
  if (sf2 && sf2.status !== "final") {
    updates.push({
      id: sf2.id,
      home_team_id: top4[1].team_id,
      away_team_id: top4[2].team_id,
    });
  }

  // Final: only fillable once both SFs are final.
  if (finalRow && finalRow.status !== "final" && sf1 && sf2) {
    if (sf1.status === "final" && sf2.status === "final") {
      const sf1Winner =
        sf1.home_score > sf1.away_score ? sf1.home_team_id : sf1.away_team_id;
      const sf2Winner =
        sf2.home_score > sf2.away_score ? sf2.home_team_id : sf2.away_team_id;
      // Higher seed (sf1 winner came from #1/#4 bracket vs sf2 from #2/#3) gets home.
      if (sf1Winner && sf2Winner) {
        updates.push({
          id: finalRow.id,
          home_team_id: sf1Winner,
          away_team_id: sf2Winner,
        });
      }
    }
  }

  for (const u of updates) {
    const { error } = await supabase
      .from("games")
      .update({
        home_team_id: u.home_team_id,
        away_team_id: u.away_team_id,
      })
      .eq("id", u.id);
    if (error) back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/seasons");
  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  redirect(`/admin/seasons?saved=seeded&n=${updates.length}`);
}
