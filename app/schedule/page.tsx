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

  const groups: Record<string, ScheduleGame[]> = {};
  for (const g of games) {
    const key = new Date(g.scheduled_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    (groups[key] ||= []).push(g);
  }

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

  // Group byes + postponements by the same "Month YYYY" key used for games.
  const dateLabel = (isoDate: string) => {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const byesByMonth: Record<string, string[]> = {};
  for (const [date, names] of Object.entries(byesByDate)) {
    const [y, m, d] = date.split("-").map(Number);
    const k = new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    (byesByMonth[k] ||= []).push(`${dateLabel(date)}: ${names.join(", ")}`);
  }

  const skipsByMonth: Record<string, string[]> = {};
  for (const s of skips ?? []) {
    const [y, m, d] = s.skip_date.split("-").map(Number);
    const k = new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    (skipsByMonth[k] ||= []).push(`${dateLabel(s.skip_date)}: ${s.reason}`);
  }

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

      {Object.entries(groups).map(([month, monthGames], i) => (
        <section key={month} className={`rise delay-${Math.min(i + 1, 4)}`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="eyebrow text-goal">{month}</span>
            <span className="flex-1 h-px bg-rule" />
            <span className="eyebrow">
              {monthGames.length} {monthGames.length === 1 ? "game" : "games"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {monthGames.map((g) => (
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
            {byesByMonth[month] && (
              <p className="mt-3 text-[12px] text-ink-faint">
                <span className="eyebrow text-ink-dim">Byes</span> — {byesByMonth[month].join(" · ")}
              </p>
            )}
            {skipsByMonth[month] && (
              <p className="mt-1 text-[12px] text-goal/80">
                <span className="eyebrow">Postponed</span> — {skipsByMonth[month].join(" · ")}
              </p>
            )}
        </section>
      ))}
    </div>
  );
}
