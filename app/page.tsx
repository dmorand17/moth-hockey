import Image from "next/image";
import Link from "next/link";
import { GameList, GameRow } from "@/components/GameRow";
import { TeamBadge } from "@/components/TeamBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { getCurrentSeason, getStandings, getUpcomingGames, getRecentResults, getScoringLeaders } from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { getSessionIfRole } from "@/lib/auth";
import { HomeBoard } from "@/components/HomeBoard";

type SearchParams = Promise<{ before?: string; boardSeason?: string }>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const [season, { before, boardSeason }] = await Promise.all([getCurrentSeason(), searchParams]);
  if (!season) {
    return (
      <div className="space-y-8 md:space-y-12">
        <NoSeason isAdmin={!!(await getSessionIfRole(["admin"]))} />
        <HomeBoard before={before} boardSeason={boardSeason} />
      </div>
    );
  }

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
    <div className="space-y-8 md:space-y-12">
      {/* HERO */}
      <section className="rise flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <Image
          src="/moth-banner-strip.png"
          alt="M.O.T.H Hockey League — Mostly Over the Hill"
          width={1200}
          height={432}
          priority
          className="h-20 md:h-28 w-auto self-start rounded-lg border border-rule"
        />
        <div className="min-w-0">
          <p className="eyebrow">Mostly Over The Hill Hockey League</p>
          <h1 className="font-display text-[40px] leading-[44px] md:text-[56px] md:leading-[64px] tracking-[0.02em]">
            <span className="sr-only">M.O.T.H Hockey — </span>
            {season.name}
          </h1>
          <p className="text-[14px] leading-5 text-ink-faint">
            Season in progress · {totalGames} {totalGames === 1 ? "game" : "games"} played
          </p>
        </div>
      </section>

      {/* SNAPSHOT */}
      <section aria-labelledby="snapshot-heading" className="rise">
        <h2 id="snapshot-heading" className="sr-only">League snapshot</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {leader && (
            <div className="panel col-span-2 md:col-span-1 p-4 md:p-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="eyebrow flex items-center gap-1.5 text-gold!">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-3.5 w-3.5 shrink-0">
                    <path d="M5 4h14v2a4 4 0 0 1-3 3.87A4 4 0 0 1 13 12.9V16h2a1 1 0 0 1 1 1v1H8v-1a1 1 0 0 1 1-1h2v-3.1A4 4 0 0 1 8 9.87 4 4 0 0 1 5 6Zm-2 2h1v0a5.98 5.98 0 0 0 1 3.32A3 3 0 0 1 3 8.83Zm18 0h-1a5.98 5.98 0 0 1-1 3.32A3 3 0 0 0 21 8.83Z" />
                  </svg>
                  Top of the table
                </div>
                <TeamBadge {...leader} size="lg" className="mt-1" />
              </div>
              <div className="text-right shrink-0">
                <div className="digit text-[32px] leading-none text-ink">{leader.pts}</div>
                <div className="mt-1 text-[12px] text-ink-faint tnum">
                  PTS · {leader.w}-{leader.l}-{leader.otl}
                </div>
              </div>
            </div>
          )}
          {pointsLeader ? (
            <LeaderTile
              label="Points leader"
              href={`/players/${pointsLeader.player_id}`}
              name={pointsLeader.name}
              team={pointsLeader.team}
              value={pointsLeader.points}
              unit="PTS"
              sub={`${pointsLeader.goals} G · ${pointsLeader.assists} A`}
            />
          ) : (
            <StatTile label="Games played" value={String(totalGames)} />
          )}
          {goalLeader ? (
            <LeaderTile
              label="Goals leader"
              href={`/players/${goalLeader.player_id}`}
              name={goalLeader.name}
              team={goalLeader.team}
              value={goalLeader.goals}
              unit="G"
            />
          ) : (
            <StatTile label="Goals scored" value={String(totalGoals)} />
          )}
        </div>
      </section>

      {/* STANDINGS PREVIEW */}
      <section className="rise delay-1">
        <SectionHeader eyebrow="League table" title="Standings" linkHref="/standings" linkLabel="Full standings" />
        <div className="panel overflow-clip">
          <table className="board-table striped dense">
            <caption className="sr-only">{season.name} standings</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left w-10 pl-4">#</th>
                <th scope="col" className="text-left">Team</th>
                <th scope="col" className="text-right sm:w-14">GP</th>
                <th scope="col" className="text-right sm:w-14 sm:hidden">W-L-OTL</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">W</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">L</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">OTL</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">GF</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">GA</th>
                <th scope="col" className="text-right sm:w-14 pr-4">PTS</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={row.team_id}>
                  <td className={`pl-4 tnum ${i === 0 ? "text-gold font-bold" : "text-ink-faint"}`}>{i + 1}</td>
                  <td className="max-w-0 w-full">
                    <TeamBadge name={row.name} slug={row.slug} color={row.color} className="max-w-full" />
                  </td>
                  <td className="text-right tnum text-ink-dim">{row.gp}</td>
                  <td className="text-right tnum text-ink-dim whitespace-nowrap sm:hidden">
                    {row.w}-{row.l}-{row.otl}
                  </td>
                  <td className="text-right tnum text-ink-dim hidden sm:table-cell">{row.w}</td>
                  <td className="text-right tnum text-ink-dim hidden sm:table-cell">{row.l}</td>
                  <td className="text-right tnum text-ink-dim hidden sm:table-cell">{row.otl}</td>
                  <td className="text-right tnum text-ink-dim hidden sm:table-cell">{row.gf}</td>
                  <td className="text-right tnum text-ink-dim hidden sm:table-cell">{row.ga}</td>
                  <td className="text-right pr-4 tnum font-bold text-ink">{row.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* RESULTS + UPCOMING */}
      <div className="rise delay-2 grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHeader eyebrow="Latest" title="Recent results" linkHref="/schedule" linkLabel="Schedule" />
          {recent.length === 0 ? (
            <EmptyState compact title="No results yet — first puck drops soon." />
          ) : (
            <GameList>
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
                  showDate
                  stacked
                />
              ))}
            </GameList>
          )}
        </section>

        <section>
          <SectionHeader eyebrow="Next up" title="Upcoming" />
          {upcoming.length === 0 ? (
            <EmptyState compact title="No upcoming games." linkHref="/schedule" linkLabel="Full schedule" />
          ) : (
            <GameList>
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
                  showDate
                  stacked
                />
              ))}
            </GameList>
          )}
        </section>
      </div>

      {/* MESSAGE BOARD */}
      <HomeBoard before={before} boardSeason={boardSeason} />
    </div>
  );
}

function LeaderTile({
  label,
  href,
  name,
  team,
  value,
  unit,
  sub,
}: {
  label: string;
  href: string;
  name: string;
  team?: { name: string; slug: string; color: string } | null;
  value: number;
  unit: string;
  sub?: string;
}) {
  return (
    <Link href={href} className="panel p-4 md:p-5 flex flex-col gap-2 hover:bg-board-hover hover:border-rule-strong transition-colors">
      <div className="eyebrow">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="digit text-[32px] leading-none text-goal">{value}</span>
        <span className="text-[14px] font-semibold text-ink-dim">{unit}</span>
      </div>
      <div className="min-w-0">
        <div className="text-[16px] font-semibold leading-5 text-ink">{name}</div>
        {team && (
          <div className="mt-1 flex items-center gap-1.5 min-w-0">
            <span aria-hidden className="swatch h-2 w-2 shrink-0 rounded-full" style={{ background: team.color }} />
            <span className="text-[13px] text-ink-faint truncate">{team.name}</span>
          </div>
        )}
        {sub && <div className="mt-0.5 text-[13px] text-ink-faint tnum">{sub}</div>}
      </div>
    </Link>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4 md:p-5 flex flex-col gap-2">
      <div className="eyebrow">{label}</div>
      <div className="digit text-[32px] leading-none text-goal">{value}</div>
    </div>
  );
}
