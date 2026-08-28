import { GameRow } from "@/components/GameRow";
import { SectionHeader } from "@/components/SectionHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { localDateKey, byeTeamNamesByDate } from "@/lib/season-schedule";

type TeamRef = { name: string; slug: string; color: string };
type ScheduleGame = {
  id: string;
  scheduled_at: string;
  status: "scheduled" | "live" | "final";
  kind: "regular" | "playoff";
  playoff_round: "sf1" | "sf2" | "final" | null;
  home_score: number;
  away_score: number;
  decided_in: "regulation" | "ot" | "shootout" | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team: TeamRef | null;
  away_team: TeamRef | null;
};

export default async function SchedulePage() {
  const season = await getCurrentSeason();
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
  const games = (gamesRaw ?? []) as unknown as ScheduleGame[];

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
  const gamesByDate = new Map<string, ScheduleGame[]>();
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

  const weekLabel = (isoDate: string) => {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="rise">
        <SectionHeader
          eyebrow="The Calendar"
          title="Schedule"
          subtitle={season.name}
          size="lg"
          as="h1"
        />
      </div>

      {weekDates.length === 0 ? (
        <p className="text-ink-dim text-sm panel-bare p-4">
          No games scheduled yet.
        </p>
      ) : (
        weekDates.map((date, i) => {
          const weekGames = gamesByDate.get(date) ?? [];
          const byes = byesByDate[date] ?? [];
          const skipReason = skipByDate.get(date);
          return (
            <section key={date} className={`rise delay-${Math.min(i + 1, 4)}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="eyebrow text-goal">{weekLabel(date)}</span>
                <span className="flex-1 h-px bg-rule" />
                {byes.length > 0 && (
                  <span className="eyebrow text-ink-faint">
                    Bye: {byes.join(", ")}
                  </span>
                )}
              </div>

              {skipReason && (
                <p className="mb-3 text-[13px] text-goal/80 panel-bare px-4 py-2.5">
                  <span className="eyebrow">Postponed</span> — {skipReason}
                </p>
              )}

              {weekGames.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {weekGames.map((g) => (
                    <GameRow
                      key={g.id}
                      id={g.id}
                      scheduled_at={g.scheduled_at}
                      status={g.status}
                      home_team={g.home_team}
                      away_team={g.away_team}
                      home_score={g.home_score}
                      away_score={g.away_score}
                      decided_in={g.decided_in}
                      kind={g.kind}
                      playoff_round={g.playoff_round}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
