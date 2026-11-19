import Image from "next/image";
import { DataTable } from "@/components/DataTable";
import Link from "next/link";
import { GameCard, GameList, GameRow } from "@/components/GameRow";
import { ScrollFade } from "@/components/ScrollFade";
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
      <section className="rise flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 md:gap-8">
        <Image
          src="/moth-banner-strip.webp"
          alt="M.O.T.H Hockey League — Mostly Over the Hill"
          width={1200}
          height={432}
          priority
          sizes="(min-width: 640px) 400px, calc(100vw - 32px)"
          className="block w-full h-auto rounded-lg border border-rule sm:w-[400px] sm:shrink-0"
        />
        {/* Phones: title and games-played share one row to keep the hero short. */}
        <div className="min-w-0 flex items-baseline justify-between gap-3 sm:block">
          <p className="eyebrow hidden sm:block">Mostly Over The Hill Hockey League</p>
          <h1 className="font-display text-[28px] leading-8 sm:text-[40px] sm:leading-[44px] md:text-[56px] md:leading-[64px] tracking-[0.02em]">
            <span className="sr-only">M.O.T.H Hockey — </span>
            {season.name}
          </h1>
          <p className="text-[14px] leading-5 text-ink-faint whitespace-nowrap">
            <span className="hidden sm:inline">Season in progress · </span>
            {totalGames} {totalGames === 1 ? "game" : "games"} played
          </p>
        </div>
      </section>

      {/* PHONES: scores strip first — latest results, then upcoming */}
      {recent.length + upcoming.length > 0 && (
        <section className="md:hidden rise delay-1">
          <SectionHeader eyebrow="Latest & next" title="Scores" linkHref="/schedule" linkLabel="Schedule" />
          <ScrollFade className="-mx-4">
            <ul className="flex gap-3 px-4 pb-1">
              {[...recent.map((g) => ({ ...g, status: "final" as const })), ...upcoming].map((g) => (
                <li key={g.id}>
                  <GameCard
                    id={g.id}
                    scheduled_at={g.scheduled_at}
                    status={g.status}
                    home_team={g.home_team}
                    away_team={g.away_team}
                    home_score={"home_score" in g ? g.home_score : undefined}
                    away_score={"away_score" in g ? g.away_score : undefined}
                    decided_in={"decided_in" in g ? g.decided_in : undefined}
                    kind={g.kind}
                    playoff_round={g.playoff_round}
                  />
                </li>
              ))}
            </ul>
          </ScrollFade>
        </section>
      )}

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
                        <TeamBadge name={row.name} slug={row.slug} color={row.color} className="max-w-full" wrap />
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

          <section className="hidden md:block">
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

          <section className="hidden md:block">
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
            {/* One 3-up row: a player who leads several categories reads once per tile, compactly. */}
            <ul className="grid grid-cols-3 gap-2">
              {leaderRows.map(({ label, unit, key, player }) => (
                <li key={label}>
                  {player ? (
                    <Link
                      href={`/players/${player.player_id}`}
                      className="panel h-full p-3 flex flex-col gap-1 hover:bg-board-hover hover:border-rule-strong transition-colors"
                    >
                      <span className="eyebrow">{label}</span>
                      <span className="flex items-baseline gap-1">
                        <span className="digit text-[26px] leading-none text-gold">{player[key]}</span>
                        <span className="text-[12px] font-semibold text-ink-faint">{unit}</span>
                      </span>
                      <span className="text-[14px] font-semibold leading-5 text-ink line-clamp-2">{player.name}</span>
                      {player.team && (
                        <span className="flex items-start gap-1.5 text-[12px] leading-4 text-ink-faint min-w-0">
                          <span aria-hidden className="swatch mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: player.team.color }} />
                          <span>{player.team.name}</span>
                        </span>
                      )}
                    </Link>
                  ) : (
                    <div className="panel h-full p-3">
                      <span className="eyebrow">{label}</span>
                      <p className="mt-1 text-[13px] text-ink-faint">No leader yet</p>
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
