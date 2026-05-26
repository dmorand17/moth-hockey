import { GameRow } from "@/components/GameRow";
import { SectionHeader } from "@/components/SectionHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSeason } from "@/lib/queries";

type TeamRef = { name: string; slug: string; color: string };
type ScheduleGame = {
  id: string;
  scheduled_at: string;
  status: "scheduled" | "live" | "final";
  home_score: number;
  away_score: number;
  decided_in: "regulation" | "ot" | "shootout" | null;
  home_team: TeamRef;
  away_team: TeamRef;
};

export default async function SchedulePage() {
  const season = await getCurrentSeason();
  const supabase = await createSupabaseServerClient();

  const { data: gamesRaw } = await supabase
    .from("games")
    .select(
      "id, scheduled_at, status, home_score, away_score, decided_in, home_team:home_team_id(name, slug, color), away_team:away_team_id(name, slug, color)",
    )
    .eq("season_id", season.id)
    .order("scheduled_at");
  const games = (gamesRaw ?? []) as unknown as ScheduleGame[];

  const groups: Record<string, ScheduleGame[]> = {};
  for (const g of games) {
    const key = new Date(g.scheduled_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    (groups[key] ||= []).push(g);
  }

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="rise">
        <SectionHeader
          eyebrow="The Calendar"
          title="Schedule"
          subtitle={season.name}
          size="lg"
        />
      </div>

      {Object.entries(groups).map(([month, monthGames], i) => (
        <section key={month} className={`rise delay-${Math.min(i + 1, 4)}`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="eyebrow text-goal">{month}</span>
            <span className="flex-1 h-px bg-rule" />
            <span className="eyebrow">{monthGames.length} games</span>
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
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
