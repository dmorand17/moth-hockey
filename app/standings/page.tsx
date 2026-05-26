import { TeamBadge } from "@/components/TeamBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { SeasonSelect } from "@/components/SeasonSelect";
import { getSeasons, getStandings, getHistoricalStandings } from "@/lib/queries";

type SearchParams = Promise<{ season?: string }>;

export default async function StandingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { season: seasonParam } = await searchParams;

  const seasons = await getSeasons();
  const season =
    seasons.find((s) => s.id === seasonParam) ??
    seasons.find((s) => s.is_current) ??
    seasons[0];

  const header = (
    <div className="rise">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SectionHeader eyebrow="The Table" title="Standings" subtitle={season.name} size="lg" />
        </div>
        <div className="mt-1 shrink-0">
          <SeasonSelect seasons={seasons} selectedId={season.id} />
        </div>
      </div>
    </div>
  );

  // Past seasons have no game results — show a goal-differential table derived
  // from aggregated stats instead of a W/L record.
  if (!season.is_current) {
    const rows = await getHistoricalStandings(season.id);

    if (rows.length === 0) {
      return (
        <div className="space-y-4 sm:space-y-8">
          {header}
          <div className="rise delay-1 panel-bare p-5 sm:p-6">
            <div className="eyebrow mb-2 text-goal">Historical season</div>
            <p className="text-[13.5px] text-ink-dim">
              No team standings on file for {season.name}. Individual player totals are still
              available on the <span className="text-ink">Stats</span> page.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4 sm:space-y-8">
        {header}

        {/* Mobile: stacked cards */}
        <div className="rise delay-1 space-y-2 sm:hidden">
          {rows.map((row, i) => (
            <div key={row.team_id} className="panel p-3 flex items-center gap-3">
              <span className="digit text-ink-faint w-7 shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <TeamBadge name={row.name} slug={row.slug} color={row.color} />
                  {row.is_champion && <span title="Champion">🏆</span>}
                </div>
                <div className="mt-1 flex items-center gap-3 text-[12px] text-ink-dim tnum whitespace-nowrap">
                  <span>{row.gp} GP</span>
                  <span>{row.gf} GF</span>
                  <span>{row.ga} GA</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className={`digit text-2xl ${row.diff > 0 ? "text-ice" : row.diff < 0 ? "text-goal" : "text-ink"}`}
                >
                  {row.diff > 0 ? "+" : ""}
                  {row.diff}
                </div>
                <div className="eyebrow text-[10px]">DIFF</div>
              </div>
            </div>
          ))}
        </div>

        <div className="rise delay-1 panel hidden sm:block overflow-x-auto">
          <table className="board-table">
            <thead>
              <tr>
                <th className="text-left w-12 pl-5">#</th>
                <th className="text-left">Team</th>
                <th className="text-right">GP</th>
                <th className="text-right">GF</th>
                <th className="text-right">GA</th>
                <th className="text-right pr-5">DIFF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.team_id}>
                  <td className="pl-5 digit text-ink-faint">{String(i + 1).padStart(2, "0")}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <TeamBadge name={row.name} slug={row.slug} color={row.color} />
                      {row.is_champion && <span title="Champion">🏆</span>}
                    </div>
                  </td>
                  <td className="text-right tnum text-ink-dim">{row.gp}</td>
                  <td className="text-right tnum text-ink">{row.gf}</td>
                  <td className="text-right tnum text-ink-dim">{row.ga}</td>
                  <td
                    className={`text-right pr-5 tnum digit text-xl ${
                      row.diff > 0 ? "text-ice" : row.diff < 0 ? "text-goal" : "text-ink-dim"
                    }`}
                  >
                    {row.diff > 0 ? "+" : ""}
                    {row.diff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rise delay-2 panel-bare p-4 sm:p-5">
          <div className="eyebrow mb-3 text-goal">Historical season</div>
          <ul className="space-y-1.5 text-[13.5px] text-ink-dim">
            <li>
              Game-by-game records (W/L/OTL) aren&apos;t tracked for past seasons. Teams are ranked by{" "}
              <span className="text-ink">goal differential</span> from aggregated player stats.
            </li>
            <li>
              <span className="text-ink">🏆</span> marks the season champion.
            </li>
          </ul>
        </div>
      </div>
    );
  }

  const standings = await getStandings(season.id);

  return (
    <div className="space-y-4 sm:space-y-8">
      {header}

      {/* Mobile: stacked cards with full record + diff */}
      <div className="rise delay-1 space-y-2 sm:hidden">
        {standings.map((row, i) => (
          <div key={row.team_id} className="panel p-3 flex items-center gap-3">
            <span className="digit text-ink-faint w-7 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <TeamBadge name={row.name} slug={row.slug} color={row.color} />
              <div className="mt-1 flex items-center gap-3 text-[12px] text-ink-dim tnum whitespace-nowrap">
                <span>{row.gp} GP</span>
                <span>{row.w}-{row.l}-{row.otl}</span>
                <span
                  className={
                    row.diff > 0 ? "text-ice" : row.diff < 0 ? "text-goal" : ""
                  }
                >
                  {row.diff > 0 ? "+" : ""}
                  {row.diff}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="digit text-2xl text-ink">{row.pts}</div>
              <div className="eyebrow text-[10px]">PTS</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rise delay-1 panel hidden sm:block overflow-x-auto">
        <table className="board-table">
          <thead>
            <tr>
              <th className="text-left w-12 pl-5">#</th>
              <th className="text-left">Team</th>
              <th className="text-right">GP</th>
              <th className="text-right">W</th>
              <th className="text-right">L</th>
              <th className="text-right">OTL</th>
              <th className="text-right">GF</th>
              <th className="text-right">GA</th>
              <th className="text-right">DIFF</th>
              <th className="text-right pr-5">PTS</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, i) => (
              <tr key={row.team_id}>
                <td className="pl-5 digit text-ink-faint">
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td>
                  <TeamBadge name={row.name} slug={row.slug} color={row.color} />
                </td>
                <td className="text-right tnum text-ink-dim">{row.gp}</td>
                <td className="text-right tnum text-ink">{row.w}</td>
                <td className="text-right tnum text-ink-dim">{row.l}</td>
                <td className="text-right tnum text-ink-dim">{row.otl}</td>
                <td className="text-right tnum text-ink-dim">{row.gf}</td>
                <td className="text-right tnum text-ink-dim">{row.ga}</td>
                <td
                  className={`text-right tnum ${
                    row.diff > 0 ? "text-ice" : row.diff < 0 ? "text-goal" : "text-ink-dim"
                  }`}
                >
                  {row.diff > 0 ? "+" : ""}
                  {row.diff}
                </td>
                <td className="text-right pr-5 digit text-xl text-ink">{row.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rise delay-2 panel-bare p-4 sm:p-5">
        <div className="eyebrow mb-3 text-goal">House rules</div>
        <ul className="space-y-1.5 text-[13.5px] text-ink-dim">
          <li>
            <span className="text-ink">Win:</span> 2 pts ·{" "}
            <span className="text-ink">OT/SO loss:</span> 1 pt ·{" "}
            <span className="text-ink">Regulation loss:</span> 0
          </li>
          <li>
            <span className="text-ink">Tiebreakers:</span> points → wins → goal differential → goals for
          </li>
        </ul>
      </div>
    </div>
  );
}
