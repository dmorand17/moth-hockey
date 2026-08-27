import Image from "next/image";
import { GameRow } from "@/components/GameRow";
import { TeamBadge } from "@/components/TeamBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { getCurrentSeason, getStandings, getUpcomingGames, getRecentResults, getScoringLeaders } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { getSessionIfRole } from "@/lib/auth";

export default async function Home() {
  const season = await getCurrentSeason();
  if (!season) return <NoSeason isAdmin={!!(await getSessionIfRole(["admin"]))} />;

  const [standings, upcoming, recent, leaders] = await Promise.all([
    getStandings(season.id),
    getUpcomingGames(season.id, 3),
    getRecentResults(season.id, 3),
    getScoringLeaders(season.id),
  ]);

  const leader = standings[0];
  const totalGames = standings.reduce((s, r) => s + r.gp, 0) / 2;
  const totalGoals = standings.reduce((s, r) => s + r.gf, 0);
  const pointsLeader = leaders[0] ?? null;
  const goalLeader =
    [...leaders].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))[0] ?? null;

  return (
    <div className="space-y-6 sm:space-y-10">
      <h1 className="sr-only">M.O.T.H Hockey — {season.name}</h1>
      {/* BRAND BANNER */}
      <div className="rise mx-auto w-full max-w-3xl rounded-lg overflow-hidden border border-rule">
        <Image
          src="/moth-banner-strip.png"
          alt="M.O.T.H Hockey League — Mostly Over the Hill"
          width={1200}
          height={432}
          priority
          className="w-full h-auto"
        />
      </div>

      {/* SEASON HEADER + LEADERS */}
      <section className="rise space-y-4">
        <div className="eyebrow flex items-center gap-3">
          <span className="inline-block w-8 h-px bg-goal" />
          <span>{season.name} · Season in progress</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
          {leader && (
            <div
              className="scoreboard col-span-2 md:col-span-1 border-l-[3px] p-3 sm:p-4 flex items-center justify-between gap-3"
              style={{
                borderColor: leader.color,
                background: `linear-gradient(90deg, ${leader.color}26, transparent 60%)`,
              }}
            >
              <div className="min-w-0">
                <div className="eyebrow flex items-center gap-1.5" style={{ color: leader.color }}>
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-3.5 w-3.5 shrink-0">
                    <path d="M5 4h14v2a4 4 0 0 1-3 3.87A4 4 0 0 1 13 12.9V16h2a1 1 0 0 1 1 1v1H8v-1a1 1 0 0 1 1-1h2v-3.1A4 4 0 0 1 8 9.87 4 4 0 0 1 5 6Zm-2 2h1v0a5.98 5.98 0 0 0 1 3.32A3 3 0 0 1 3 8.83Zm18 0h-1a5.98 5.98 0 0 1-1 3.32A3 3 0 0 0 21 8.83Z" />
                  </svg>
                  Atop the table
                </div>
                <TeamBadge {...leader} size="lg" className="mt-1.5" />
              </div>
              <div className="text-right shrink-0">
                <div className="digit text-2xl sm:text-3xl text-ink leading-none">{leader.pts}</div>
                <div className="eyebrow mt-1">PTS · {leader.w}-{leader.l}-{leader.otl}</div>
              </div>
            </div>
          )}
          {pointsLeader ? (
              <LeaderTile
                label="Points leader"
                name={pointsLeader.name}
                team={pointsLeader.team}
                stat={`${pointsLeader.points} PTS`}
                sub={`${pointsLeader.goals}G · ${pointsLeader.assists}A`}
                accent="ice"
              />
            ) : (
              <StatTile label="Games played" value={String(totalGames)} accent="ice" />
            )}
            {goalLeader ? (
              <LeaderTile
                label="Top scorer"
                name={goalLeader.name}
                team={goalLeader.team}
                stat={`${goalLeader.goals} G`}
                accent="goal"
              />
            ) : (
              <StatTile label="Goals scored" value={String(totalGoals)} accent="goal" />
            )}
        </div>
      </section>

      {/* UPCOMING */}
      <section
        className="rise delay-1 rounded-r-lg border-l-[3px] pl-4 sm:pl-6 py-4 sm:py-5"
        style={{
          borderColor: "var(--ice)",
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--ice) 9%, transparent), transparent 34%)",
        }}
      >
        <SectionHeader eyebrow="01" title="Upcoming" linkHref="/schedule" linkLabel="All games" accent="ice" />
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
                kind={g.kind}
                playoff_round={g.playoff_round}
              />
            ))}
          </div>
        )}
      </section>

      {/* RECENT RESULTS */}
      <section
        className="rise delay-2 rounded-r-lg border-l-[3px] pl-4 sm:pl-6 py-4 sm:py-5"
        style={{
          borderColor: "#fbbf24",
          background:
            "linear-gradient(90deg, color-mix(in srgb, #fbbf24 9%, transparent), transparent 34%)",
        }}
      >
        <SectionHeader eyebrow="02" title="Recent Results" accent="gold" />
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
                kind={g.kind}
                playoff_round={g.playoff_round}
              />
            ))}
          </div>
        )}
      </section>

      {/* STANDINGS PREVIEW */}
      <section
        className="rise delay-3 rounded-r-lg border-l-[3px] pl-4 sm:pl-6 py-4 sm:py-5"
        style={{
          borderColor: "var(--goal)",
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--goal) 9%, transparent), transparent 34%)",
        }}
      >
        <SectionHeader eyebrow="03" title="The Table" linkHref="/standings" linkLabel="Full standings" />
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
                <th className="text-right">GF</th>
                <th className="text-right">GA</th>
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
                  <td className="text-right tnum text-ink-dim">{row.gf}</td>
                  <td className="text-right tnum text-ink-dim">{row.ga}</td>
                  <td className="text-right pr-5 digit text-lg text-ink">{row.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function LeaderTile({
  label,
  name,
  team,
  stat,
  sub,
  accent,
}: {
  label: string;
  name: string;
  team?: { name: string; slug: string; color: string } | null;
  stat: string;
  sub?: string;
  accent: "ice" | "goal";
}) {
  return (
    <div className="scoreboard p-3 sm:p-5 flex flex-col justify-between min-h-[88px] sm:min-h-[120px]">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 sm:mt-3">
        <div className="font-display text-[18px] sm:text-[22px] leading-none tracking-[0.04em] text-ink truncate">
          {name}
        </div>
        {team && (
          <div className="mt-1 flex items-center gap-1.5 min-w-0">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-[1px]"
              style={{ background: team.color }}
            />
            <span className="eyebrow text-ink-dim normal-case tracking-[0.06em] truncate">
              {team.name}
            </span>
          </div>
        )}
        <div className="mt-1.5 flex items-baseline gap-2">
          <span
            className={`digit text-xl sm:text-2xl ${accent === "goal" ? "text-goal" : "text-ice"}`}
          >
            {stat}
          </span>
          {sub && <span className="eyebrow text-ink-faint">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent: "ice" | "goal" }) {
  return (
    <div className="scoreboard p-3 sm:p-5 flex flex-col justify-between min-h-[88px] sm:min-h-[120px]">
      <div className="eyebrow">{label}</div>
      <div className={`digit text-3xl sm:text-4xl md:text-5xl mt-2 sm:mt-3 ${accent === "goal" ? "text-goal" : "text-ice"}`}>
        {value}
      </div>
    </div>
  );
}

