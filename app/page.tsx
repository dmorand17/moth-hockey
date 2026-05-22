import Link from "next/link";
import { GameRow } from "@/components/GameRow";
import { TeamBadge } from "@/components/TeamBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { getCurrentSeason, getStandings, getUpcomingGames, getRecentResults } from "@/lib/queries";

export default async function Home() {
  const season = await getCurrentSeason();
  const [standings, upcoming, recent] = await Promise.all([
    getStandings(season.id),
    getUpcomingGames(season.id, 3),
    getRecentResults(season.id, 3),
  ]);

  const leader = standings[0];
  const totalGames = standings.reduce((s, r) => s + r.gp, 0) / 2;
  const totalGoals = standings.reduce((s, r) => s + r.gf, 0);

  return (
    <div className="space-y-12">
      {/* HERO SCOREBOARD */}
      <section className="rise relative">
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-5">
          <div className="panel p-6 md:p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-goal/[0.06] rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-ice/[0.04] rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="eyebrow flex items-center gap-3 mb-4">
                <span className="inline-block w-8 h-px bg-goal" />
                <span>Season in progress</span>
              </div>
              <h1 className="font-display text-[56px] md:text-[88px] leading-[0.92] tracking-[0.02em] text-ink">
                SPRING<br />
                <span className="text-goal">2026</span>
              </h1>
              <p className="mt-4 max-w-md text-ink-dim text-[15px] leading-relaxed">
                Mostly Over The Hill hockey — beer-league stats, scoreboard-style.
                Penalty shots, no power plays, plenty of trash talk.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href="/standings" className="px-4 py-2.5 bg-goal text-board font-display tracking-[0.14em] text-[14px] hover:bg-goal-glow transition-colors">
                  STANDINGS →
                </Link>
                <Link href="/schedule" className="px-4 py-2.5 border border-rule-strong text-ink font-display tracking-[0.14em] text-[14px] hover:bg-board-3 transition-colors">
                  SCHEDULE
                </Link>
              </div>
            </div>
          </div>

          {/* Mini scoreboard stats */}
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
            <StatTile label="Games played" value={String(totalGames)} accent="ice" />
            <StatTile label="Goals scored" value={String(totalGoals)} accent="goal" />
            {leader && (
              <div className="scoreboard p-5 col-span-2 md:col-span-1">
                <div className="eyebrow mb-2">Atop the table</div>
                <TeamBadge {...leader} size="lg" />
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="digit text-3xl text-ink">{leader.pts}</span>
                  <span className="eyebrow">PTS · {leader.w}-{leader.l}-{leader.otl}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* STANDINGS PREVIEW */}
      <section className="rise delay-1">
        <SectionHeader eyebrow="01" title="The Table" linkHref="/standings" linkLabel="Full standings" />
        <div className="panel overflow-hidden">
          <table className="board-table">
            <thead>
              <tr>
                <th className="text-left w-10 pl-5">#</th>
                <th className="text-left">Team</th>
                <th className="text-right">GP</th>
                <th className="text-right hidden sm:table-cell">W</th>
                <th className="text-right hidden sm:table-cell">L</th>
                <th className="text-right hidden sm:table-cell">OTL</th>
                <th className="text-right hidden md:table-cell">GF</th>
                <th className="text-right hidden md:table-cell">GA</th>
                <th className="text-right pr-5">PTS</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={row.team_id}>
                  <td className="pl-5 digit text-ink-faint">{String(i + 1).padStart(2, "0")}</td>
                  <td><TeamBadge name={row.name} slug={row.slug} color={row.color} /></td>
                  <td className="text-right tnum text-ink-dim">{row.gp}</td>
                  <td className="text-right tnum text-ink-dim hidden sm:table-cell">{row.w}</td>
                  <td className="text-right tnum text-ink-dim hidden sm:table-cell">{row.l}</td>
                  <td className="text-right tnum text-ink-dim hidden sm:table-cell">{row.otl}</td>
                  <td className="text-right tnum text-ink-dim hidden md:table-cell">{row.gf}</td>
                  <td className="text-right tnum text-ink-dim hidden md:table-cell">{row.ga}</td>
                  <td className="text-right pr-5 digit text-lg text-ink">{row.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* UPCOMING */}
      <section className="rise delay-2">
        <SectionHeader eyebrow="02" title="Upcoming" linkHref="/schedule" linkLabel="All games" />
        {upcoming.length === 0 ? (
          <p className="eyebrow">No games on the schedule</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {upcoming.map((g) => (
              <GameRow
                key={g.id}
                id={g.id}
                scheduled_at={g.scheduled_at}
                status={g.status}
                home_team={g.home_team}
                away_team={g.away_team}
              />
            ))}
          </div>
        )}
      </section>

      {/* RECENT RESULTS */}
      <section className="rise delay-3">
        <SectionHeader eyebrow="03" title="Last on the ice" />
        {recent.length === 0 ? (
          <p className="eyebrow">No results yet — first puck drops soon.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {recent.map((g) => (
              <GameRow
                key={g.id}
                id={g.id}
                scheduled_at={g.scheduled_at}
                status="final"
                home_team={g.home_team}
                away_team={g.away_team}
                home_score={g.home_score}
                away_score={g.away_score}
                decided_in={g.decided_in}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent: "ice" | "goal" }) {
  return (
    <div className="scoreboard p-5 flex flex-col justify-between min-h-[120px]">
      <div className="eyebrow">{label}</div>
      <div className={`digit text-4xl md:text-5xl mt-3 ${accent === "goal" ? "text-goal" : "text-ice"}`}>
        {value}
      </div>
    </div>
  );
}

