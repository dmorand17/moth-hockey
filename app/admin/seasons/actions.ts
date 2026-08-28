"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStandings } from "@/lib/queries";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import {
  buildGameSlots,
  firstRoundSeeds,
  playoffFeeders,
  playoffRoundsFor,
  playoffSlots,
  roundRobinGames,
  type PlayoffRound,
  type WeekdayIdx,
} from "@/lib/season-schedule";

type SeasonType = "spring" | "summer" | "fall" | "winter";

function parseSeasonType(raw: string): SeasonType | null {
  if (raw === "spring" || raw === "summer" || raw === "fall" || raw === "winter")
    return raw;
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

// A season's end is derived from its regular-season length: end = start +
// weeks×7 days. Weeks is the single source of truth. Returns null when weeks
// is missing or not a positive number.
function resolveEndDate(startDate: string, weeksRaw: string): string | null {
  const weeks = parseInt(weeksRaw, 10);
  if (isNaN(weeks) || weeks <= 0) return null;
  const [y, m, d] = startDate.split("-").map(Number);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1);
  end.setDate(end.getDate() + weeks * 7);
  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, "0");
  const dd = String(end.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function revalidatePublicSeasonPaths() {
  revalidatePath("/");
  revalidatePath("/standings");
  revalidatePath("/schedule");
  revalidatePath("/teams");
  revalidatePath("/stats");
  revalidatePath("/admin/seasons");
}

export async function createSeason(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const seasonType = parseSeasonType(String(formData.get("season_type") ?? ""));
  const year = parseInt0(String(formData.get("year") ?? ""), NaN);
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const weeks = String(formData.get("weeks") ?? "").trim();
  const periodLength = parseInt0(
    String(formData.get("period_length_minutes") ?? "17"),
    17,
  );
  const pointSystemRaw = String(formData.get("point_system") ?? "").trim();
  const point_system = pointSystemRaw === "2-1-0" ? "2-1-0" : "3-2-1";

  if (!seasonType || isNaN(year) || !name || !startDate) {
    return fail("Check all required fields.");
  }
  const resolvedEnd = resolveEndDate(startDate, weeks);
  if (!resolvedEnd) return fail("Set the number of regular season weeks.");

  const supabase = await createSupabaseServerClient();
  const { data: created, error } = await supabase
    .from("seasons")
    .insert({
      season_type: seasonType,
      year,
      name,
      start_date: startDate,
      end_date: resolvedEnd,
      regular_weeks: parseInt(weeks, 10),
      period_length_minutes: periodLength,
      point_system,
      is_current: false,
    })
    .select("id")
    .single();

  if (error || !created) {
    return fail(error?.message ?? "insert failed");
  }

  revalidatePath("/admin/seasons");
  return ok("Season created.");
}

// Copy team rows (name, slug, color, logo) from another season into this one.
// Rosters/captains are per-season and are NOT copied. Used from the season's
// Teams section instead of a create-time carryover.
export async function copyTeamsInto(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const seasonId = String(formData.get("season_id") ?? "").trim();
  const sourceId = String(formData.get("source_season_id") ?? "").trim();
  if (!seasonId || !sourceId || seasonId === sourceId) {
    return fail("Check all required fields.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: srcTeams } = await supabase
    .from("teams")
    .select("name, slug, color, logo_url")
    .eq("season_id", sourceId);

  if (!srcTeams || srcTeams.length === 0) return fail("That season has no teams to copy.");

  const { error } = await supabase.from("teams").insert(
    srcTeams.map((t) => ({
      season_id: seasonId,
      name: t.name,
      slug: t.slug,
      color: t.color,
      logo_url: t.logo_url,
    })),
  );
  if (error) {
    if (error.code === "23505") return fail("Some of those team names already exist in this season.");
    return fail(error.message);
  }

  revalidatePublicSeasonPaths();
  return ok("Teams copied.");
}

export async function updateSeasonDates(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const weeks = String(formData.get("weeks") ?? "").trim();
  if (!id || !startDate) return fail("Check all required fields.");
  const resolvedEnd = resolveEndDate(startDate, weeks);
  if (!resolvedEnd) return fail("Set the number of regular season weeks.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("seasons")
    .update({
      start_date: startDate,
      end_date: resolvedEnd,
      regular_weeks: parseInt(weeks, 10),
    })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidatePublicSeasonPaths();
  return ok("Dates updated.");
}

export async function activateSeason(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return fail("Check all required fields.");

  const supabase = await createSupabaseServerClient();

  const { error: clearErr } = await supabase
    .from("seasons")
    .update({ is_current: false })
    .eq("is_current", true)
    .neq("id", id);
  if (clearErr) return fail(clearErr.message);

  const { error: setErr } = await supabase
    .from("seasons")
    .update({ is_current: true })
    .eq("id", id);
  if (setErr) return fail(setErr.message);

  revalidatePublicSeasonPaths();
  return ok("Season activated.");
}

export async function deleteSeason(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return fail("Check all required fields.");

  const supabase = await createSupabaseServerClient();

  const { data: season, error: seasonErr } = await supabase
    .from("seasons")
    .select("id, is_current")
    .eq("id", id)
    .single();
  if (seasonErr || !season) return fail("Check all required fields.");
  if (season.is_current) return fail("Cannot delete the current season. Activate another first.");

  const { count } = await supabase
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("season_id", id);
  if ((count ?? 0) > 0) return fail("Delete or move games before deleting the season.");

  const { error: delErr } = await supabase.from("seasons").delete().eq("id", id);
  if (delErr) return fail(delErr.message);

  revalidatePath("/admin/seasons");
  return ok("Season deleted.");
}

// Reset a season's schedule + results without deleting the season itself.
// Clears ALL games (any status; cascades events/appearances/availability),
// the computed season stats, and any skip notes. Teams and rosters are kept so
// the schedule can be regenerated. Used to wipe a demo season and start fresh.
export async function resetSeason(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return fail("Check all required fields.");

  const supabase = await createSupabaseServerClient();

  const { error: gamesErr } = await supabase
    .from("games")
    .delete()
    .eq("season_id", id);
  if (gamesErr) return fail(gamesErr.message);

  const { error: statsErr } = await supabase
    .from("season_player_stats")
    .delete()
    .eq("season_id", id);
  if (statsErr) return fail(statsErr.message);

  const { error: skipErr } = await supabase
    .from("schedule_skips")
    .delete()
    .eq("season_id", id);
  if (skipErr) return fail(skipErr.message);

  revalidatePublicSeasonPaths();
  revalidatePath("/admin/schedule");
  return ok("Season reset — all games and results cleared.");
}

export async function generateSchedule(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const seasonId = String(formData.get("season_id") ?? "").trim();
  const weekday = parseWeekday(String(formData.get("weekday") ?? ""));
  const weeks = parseInt0(String(formData.get("weeks") ?? "1"), 1);
  const location = String(formData.get("location") ?? "").trim() || null;
  const times = formData
    .getAll("times")
    .map((v) => String(v).trim())
    .filter((v) => v !== "");
  const playoffRounds = Math.max(0, Math.min(3, parseInt0(String(formData.get("playoff_rounds") ?? "2"), 2)));
  if (!seasonId || weekday === null || weeks < 1 || times.length === 0) {
    return fail("Check all required fields.");
  }

  const supabase = await createSupabaseServerClient();

  const { data: season } = await supabase
    .from("seasons")
    .select("id, start_date")
    .eq("id", seasonId)
    .single();
  if (!season) return fail("Check all required fields.");

  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("season_id", seasonId)
    .order("name");

  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length < 2) return fail("Need at least 2 teams in this season to generate a schedule.");

  // Wipe existing scheduled (not live/final) games before regenerating.
  const { error: clearErr } = await supabase
    .from("games")
    .delete()
    .eq("season_id", seasonId)
    .eq("status", "scheduled");
  if (clearErr) return fail(clearErr.message);

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
    playoff_round?: "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final" | null;
  };

  const rows: GameInsert[] = pairs.map(([home, away], i) => ({
    season_id: seasonId,
    home_team_id: home,
    away_team_id: away,
    scheduled_at: slots[i],
    location,
    kind: "regular",
  }));

  // Optionally reserve playoff nights after the regular season as TBD-vs-TBD
  // stubs, so the bracket dates show on the schedule immediately. The
  // "Update Playoff Matchups" action seeds the teams from standings later.
  const bracket = playoffRoundsFor(playoffRounds);
  if (bracket.length > 0) {
    const ptimes = playoffSlots(season.start_date, weekday, times, pairs.length, bracket.length);
    bracket.forEach((round, i) =>
      rows.push({
        season_id: seasonId,
        home_team_id: null,
        away_team_id: null,
        scheduled_at: ptimes[i],
        location,
        kind: "playoff",
        playoff_round: round,
      }),
    );
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("games").insert(rows);
    if (insErr) return fail(insErr.message);
  }

  // Sync the season's length to what we just scheduled: regular_weeks from the
  // form, and end_date extended to cover the playoff nights (each week holds
  // times.length slots, so playoffs span ceil(games / slots) extra weeks).
  const playoffWeeks =
    bracket.length > 0 ? Math.ceil(bracket.length / times.length) : 0;
  await supabase
    .from("seasons")
    .update({
      regular_weeks: weeks,
      end_date: resolveEndDate(season.start_date, String(weeks + playoffWeeks)),
    })
    .eq("id", seasonId);

  revalidatePath("/admin/seasons");
  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  return ok(`Generated ${rows.length} games.`);
}

export async function updateStandingsRules(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const pointSystem = String(formData.get("point_system") ?? "").trim();
  const tiebreakers = formData
    .getAll("tiebreakers")
    .map(String)
    .filter((k) => ["wins", "diff", "gf", "ga", "h2h"].includes(k));

  if (!id || (pointSystem !== "2-1-0" && pointSystem !== "3-2-1")) {
    return fail("Check all required fields.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("seasons")
    .update({ point_system: pointSystem, tiebreakers })
    .eq("id", id);
  if (error) return fail(error.message);

  revalidatePublicSeasonPaths();
  return ok("Standings rules updated.");
}

export async function generatePlayoffs(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const seasonId = String(formData.get("season_id") ?? "").trim();
  if (!seasonId) return fail("Check all required fields.");

  const supabase = await createSupabaseServerClient();

  const { data: season } = await supabase
    .from("seasons")
    .select("id, start_date")
    .eq("id", seasonId)
    .single();
  if (!season) return fail("Check all required fields.");

  const { data: regGames } = await supabase
    .from("games")
    .select("scheduled_at, status")
    .eq("season_id", seasonId)
    .eq("kind", "regular")
    .order("scheduled_at");
  const regular = regGames ?? [];

  const { data: existingPlayoffs } = await supabase
    .from("games")
    .select("id, playoff_round, status, home_team_id, away_team_id, home_score, away_score")
    .eq("season_id", seasonId)
    .eq("kind", "playoff");
  let playoffs = existingPlayoffs ?? [];

  // Can't start playoffs until the regular season is complete.
  if (
    playoffs.length === 0 &&
    (regular.length === 0 || regular.some((g) => g.status !== "final"))
  ) {
    return fail("Finish all regular-season games before generating playoffs.");
  }

  // Infer rounds from existing playoff game round values.
  const roundsOf = (rs: string[]) =>
    rs.some((r) => r.startsWith("qf")) ? 3 : rs.some((r) => r.startsWith("sf")) ? 2 : rs.includes("final") ? 1 : 0;
  const rounds = roundsOf(playoffs.map((p) => p.playoff_round ?? ""));
  if (rounds === 0) return fail("Check all required fields.");

  const need = 2 ** rounds;
  const standings = await getStandings(seasonId);
  if (standings.length < need) return fail("Not enough teams in the standings for that bracket.");

  const order = playoffRoundsFor(rounds);

  // Create any missing stubs, dated after the regular season.
  const existingRounds = new Set(playoffs.map((p) => p.playoff_round));
  const missingRounds = order.filter((r) => !existingRounds.has(r));
  if (missingRounds.length > 0) {
    if (regular.length === 0) return fail("Finish all regular-season games before generating playoffs.");
    const hhmm = (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    const times = Array.from(new Set(regular.map((g) => hhmm(g.scheduled_at)))).sort();
    const weekday = new Date(regular[0].scheduled_at).getDay() as WeekdayIdx;
    const allSlots = playoffSlots(season.start_date, weekday, times, regular.length, order.length);
    const slotsByRound = new Map(order.map((r, i) => [r, allSlots[i]]));
    const { data: inserted, error: insErr } = await supabase
      .from("games")
      .insert(
        missingRounds.map((r) => ({
          season_id: seasonId,
          home_team_id: null,
          away_team_id: null,
          scheduled_at: slotsByRound.get(r)!,
          kind: "playoff" as const,
          playoff_round: r,
        })),
      )
      .select("id, playoff_round, status, home_team_id, away_team_id, home_score, away_score");
    if (insErr) return fail(insErr.message);
    playoffs = [...playoffs, ...(inserted ?? [])];
  }

  const seeds = firstRoundSeeds(rounds);
  const feeders = playoffFeeders(rounds);
  const byRound = new Map(playoffs.map((p) => [p.playoff_round, p]));
  const updates: { id: string; home_team_id: string | null; away_team_id: string | null }[] = [];

  // Round 1: seed from standings (skip games already final).
  seeds.forEach(([hi, ai], i) => {
    const g = byRound.get(order[i]);
    if (g && g.status !== "final")
      updates.push({ id: g.id, home_team_id: standings[hi - 1].team_id, away_team_id: standings[ai - 1].team_id });
  });

  // Later rounds: fill from feeders once both are final. Higher seed (feeder listed first) is home.
  const winner = (g: { home_team_id: string | null; away_team_id: string | null; home_score: number | null; away_score: number | null }) =>
    (g.home_score ?? 0) >= (g.away_score ?? 0) ? g.home_team_id : g.away_team_id;
  for (const [round, [a, b]] of Object.entries(feeders)) {
    const g = byRound.get(round as PlayoffRound);
    const ga = byRound.get(a), gb = byRound.get(b);
    if (g && g.status !== "final" && ga?.status === "final" && gb?.status === "final") {
      const wa = winner(ga), wb = winner(gb);
      if (wa && wb) updates.push({ id: g.id, home_team_id: wa, away_team_id: wb });
    }
  }

  for (const u of updates) {
    const { error } = await supabase
      .from("games")
      .update({ home_team_id: u.home_team_id, away_team_id: u.away_team_id })
      .eq("id", u.id);
    if (error) return fail(error.message);
  }

  revalidatePath("/admin/seasons");
  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  return ok("Playoffs generated / advanced.");
}

// ── Team actions ─────────────────────────────────────────────

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createTeam(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const seasonId = String(formData.get("season_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();

  const slug = slugify(slugRaw || name);

  if (!seasonId || !name || !slug) {
    return fail("Check all required fields.");
  }
  if (!HEX_COLOR.test(color)) {
    return fail("Color must be a hex like #ef4444.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("teams")
    .insert({ season_id: seasonId, name, slug, color });

  if (error) {
    return fail(error.message);
  }

  revalidatePublicSeasonPaths();
  return ok("Team created.");
}

export async function updateTeam(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();

  // Slug tracks the name so renames update the public /teams/<slug> URL too.
  const slug = slugify(name);

  if (!id || !name || !slug) {
    return fail("Check all required fields.");
  }
  if (!HEX_COLOR.test(color)) {
    return fail("Color must be a hex like #ef4444.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("teams")
    .update({ name, slug, color })
    .eq("id", id);

  if (error) {
    return fail(error.message);
  }

  revalidatePublicSeasonPaths();
  return ok("Team updated.");
}

export async function assignTeamCaptain(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);

  const teamId = String(formData.get("team_id") ?? "");
  const seasonId = String(formData.get("season_id") ?? "");
  const targetPlayerId = String(formData.get("player_id") ?? "") || null;

  if (!teamId || !seasonId) return fail("Check all required fields.");

  const supabase = await createSupabaseServerClient();

  // Captain is the is_captain roster label (one per team); team_captains and
  // the team_captain role are derived from it by DB triggers. Clear the team's
  // current captain, then mark the chosen roster row.
  const { error: clearErr } = await supabase
    .from("team_players")
    .update({ is_captain: false })
    .eq("team_id", teamId)
    .eq("season_id", seasonId)
    .eq("is_captain", true);

  if (clearErr) return fail(clearErr.message);

  if (targetPlayerId) {
    const { error: setErr } = await supabase
      .from("team_players")
      .update({ is_captain: true })
      .eq("team_id", teamId)
      .eq("season_id", seasonId)
      .eq("player_id", targetPlayerId);
    if (setErr) return fail(setErr.message);
  }

  revalidatePublicSeasonPaths();
  revalidatePath("/admin/players");
  return ok("Captain updated.");
}
