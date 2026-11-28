import type { Metadata } from "next";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { ScheduleView, type ScheduleGame, type ScheduleWeek } from "@/components/ScheduleView";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSelectedSeason } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { localDateKey, byeTeamNamesByDate } from "@/lib/season-schedule";

export const metadata: Metadata = {
  title: "Schedule",
  description: "Every game night this season: results, upcoming games and bye weeks.",
};

type GameRowData = ScheduleGame & { home_team_id: string | null; away_team_id: string | null };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; season?: string }>;
}) {
  const { team: teamParam, season: seasonParam } = await searchParams;
  const season = await getSelectedSeason(seasonParam);
  if (!season) return <NoSeason />;
  const supabase = await createSupabaseServerClient();

  const [{ data: gamesRaw }, { data: teams }, { data: skips }] = await Promise.all([
    supabase
      .from("games")
      .select(
        "id, scheduled_at, status, kind, playoff_round, home_score, away_score, decided_in, home_team_id, away_team_id, home_team:home_team_id(name, slug, color), away_team:away_team_id(name, slug, color)",
      )
      .eq("season_id", season.id)
      .order("scheduled_at"),
    supabase.from("teams").select("id, name").eq("season_id", season.id),
    supabase
      .from("schedule_skips")
      .select("skip_date, reason")
      .eq("season_id", season.id)
      .order("skip_date"),
  ]);
  const games = (gamesRaw ?? []) as unknown as GameRowData[];

  // Bye team(s) per regular-season game night.
  const byesByDate = byeTeamNamesByDate(
    (teams ?? []).map((t) => ({ id: t.id, name: t.name })),
    games
      .filter((g) => g.kind === "regular")
      .map((g) => ({
        localDate: localDateKey(g.scheduled_at),
        homeTeamId: g.home_team_id,
        awayTeamId: g.away_team_id,
      })),
  );

  // Group games by game night (local date = one week of play).
  const gamesByDate = new Map<string, GameRowData[]>();
  for (const g of games) {
    const k = localDateKey(g.scheduled_at);
    const arr = gamesByDate.get(k);
    if (arr) arr.push(g);
    else gamesByDate.set(k, [g]);
  }

  const skipByDate = new Map<string, string>();
  for (const s of skips ?? []) skipByDate.set(s.skip_date, s.reason);

  // Every week that has games or was skipped, oldest first.
  const weekDates = Array.from(
    new Set([...gamesByDate.keys(), ...skipByDate.keys()]),
  ).sort();

  const weeks: ScheduleWeek[] = weekDates.map((date) => ({
    date,
    games: gamesByDate.get(date) ?? [],
    byes: byesByDate[date] ?? [],
    skipReason: skipByDate.get(date),
  }));

  // Filter chips: every team that appears on the schedule, alphabetical.
  const teamMap = new Map<string, { name: string; slug: string; color: string }>();
  for (const g of games) {
    for (const t of [g.home_team, g.away_team]) if (t) teamMap.set(t.slug, t);
  }
  const teamList = [...teamMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="rise">
        <SectionHeader eyebrow={season.name} title="Schedule" size="lg" as="h1" />
      </div>

      {weekDates.length === 0 ? (
        <EmptyState title="No games scheduled yet." />
      ) : (
        // Keyed on the param so back/forward (a new ?team) remounts with it.
        <ScheduleView
          key={teamParam ?? "all"}
          weeks={weeks}
          teams={teamList}
          initialTeam={teamParam && teamMap.has(teamParam) ? teamParam : "all"}
        />
      )}
    </div>
  );
}
