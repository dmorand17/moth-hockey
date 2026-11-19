import Image from "next/image";
import { DataTable } from "@/components/DataTable";
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

  const totalGames = standings.reduce((s, r) => s + r.gp, 0) / 2;
  const top = (key: "points" | "goals" | "assists") =>
    [...leaders].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name))[0] ?? null;
  const leaderRows = [
    { label: "Points", unit: "PTS", key: "points" as const },
    { label: "Goals", unit: "G", key: "goals" as const },
    { label: "Assists", unit: "A", key: "assists" as const },
  ].map((l) => ({ ...l, player: top(l.key) }));

  return (
    <div className="space-y-8 md:space-y-10">
      {/* HERO */}
      <section className="rise flex flex-col sm:flex-row sm:items-center gap-4 md:gap-8">
        <Image
          src="/moth-banner-strip.png"
          alt="M.O.T.H Hockey League — Mostly Over the Hill"
          width={1200}
          height={432}
          priority
          sizes="(min-width: 768px) 400px, (min-width: 640px) 334px, 267px"
          className="h-24 sm:h-30 md:h-36 w-auto self-start rounded-lg border border-rule"
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

      <div className="grid gap-8 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        {/* MAIN COLUMN */}
        <div className="space-y-8 md:space-y-10 min-w-0">
          <section className="rise delay-1">
            <SectionHeader eyebrow="League table" title="Standings" linkHref="/standings" linkLabel="Full standings" />
            <DataTable caption={`${season.name} standings`}>
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
                      <td className={`pl-4 ${i === 0 ? "text-gold font-bold" : "text-ink-faint"}`}>
                        {i + 1}
                        {i === 0 && <span className="sr-only"> (first place)</span>}
                      </td>
                      <td className="max-w-0 w-full">
                        <TeamBadge name={row.name} slug={row.slug} color={row.color} className="max-w-full" />
                      </td>
                      <td className="text-right text-ink-dim">{row.gp}</td>
                      <td className="text-right text-ink-dim whitespace-nowrap sm:hidden">
                        {row.w}-{row.l}-{row.otl}
                      </td>
                      <td className="text-right text-ink-dim hidden sm:table-cell">{row.w}</td>
                      <td className="text-right text-ink-dim hidden sm:table-cell">{row.l}</td>
                      <td className="text-right text-ink-dim hidden sm:table-cell">{row.otl}</td>
                      <td className="text-right text-ink-dim hidden sm:table-cell">{row.gf}</td>
                      <td className="text-right text-ink-dim hidden sm:table-cell">{row.ga}</td>
                      <td className="text-right pr-4 font-bold text-ink">{row.pts}</td>
                    </tr>
                  ))}
                </tbody>
            </DataTable>
          </section>

          <section className="rise delay-2">
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
                  />
                ))}
              </GameList>
            )}
          </section>

          <section className="rise delay-2">
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
                  />
                ))}
              </GameList>
            )}
          </section>
        </div>

        {/* SIDEBAR */}
        <aside className="space-y-8 md:space-y-10 min-w-0" aria-label="League leaders">
          <section className="rise delay-2">
            <SectionHeader eyebrow={season.name} title="League leaders" linkHref="/stats" linkLabel="All stats" />
            <ul className="panel overflow-clip divide-y divide-rule">
              {leaderRows.map(({ label, unit, key, player }) => (
                <li key={label}>
                  {player ? (
                    <Link
                      href={`/players/${player.player_id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-board-hover transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="eyebrow">{label}</div>
                        <div className="text-[16px] font-semibold leading-6 text-ink">{player.name}</div>
                        {player.team && (
                          <div className="flex items-center gap-1.5 text-[13px] text-ink-faint">
                            <span aria-hidden className="swatch h-2 w-2 rounded-full" style={{ background: player.team.color }} />
                            {player.team.name}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="digit text-[28px] leading-none text-gold">{player[key]}</div>
                        <div className="mt-1 text-[12px] font-semibold text-ink-faint">{unit}</div>
                      </div>
                    </Link>
                  ) : (
                    <div className="px-4 py-3">
                      <div className="eyebrow">{label}</div>
                      <div className="text-[14px] text-ink-faint">No leader yet</div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

        </aside>
      </div>

      {/* MESSAGE BOARD — full width so posts have room to breathe */}
      <HomeBoard before={before} boardSeason={boardSeason} />
    </div>
  );
}
