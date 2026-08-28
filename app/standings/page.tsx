import { TeamBadge } from "@/components/TeamBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { SeasonSelect } from "@/components/SeasonSelect";
import {
  getSeasons,
  getStandings,
  getHistoricalStandings,
  getSeasonRules,
  type PointSystem,
  type TieKey,
} from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";

type SearchParams = Promise<{ season?: string }>;

// Lowercase labels for the House Rules chip (matches the page's inline style).
const TIE_LABELS: Record<TieKey, string> = {
  wins: "wins",
  diff: "goal differential",
  gf: "goals for",
  ga: "goals against",
  h2h: "head-to-head",
};

function pointsSummary(system: PointSystem): { label: string; value: string }[] {
  return system === "3-2-1"
    ? [
        { label: "Reg. win:", value: "3 pts" },
        { label: "OT/SO win:", value: "2 pts" },
        { label: "OT/SO loss:", value: "1 pt" },
        { label: "Regulation loss:", value: "0" },
      ]
    : [
        { label: "Win:", value: "2 pts" },
        { label: "OT/SO loss:", value: "1 pt" },
        { label: "Regulation loss:", value: "0" },
      ];
}

export default async function StandingsPage({ searchParams }: { searchParams: SearchParams }) {
  const { season: seasonParam } = await searchParams;

  const seasons = await getSeasons();
  if (seasons.length === 0) return <NoSeason />;
  const season =
    seasons.find((s) => s.id === seasonParam) ??
    seasons.find((s) => s.is_current) ??
    seasons[0];

  const rules = await getSeasonRules(season.id);
  const points = pointsSummary(rules.system);
  const tieChain = ["points", ...rules.tiebreakers.map((k) => TIE_LABELS[k])].join(" → ");

  const header = (
    <div className="rise">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SectionHeader eyebrow="The Table" title="Standings" subtitle={season.name} size="lg" as="h1" />
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

        <div className="rise delay-1 panel overflow-x-auto">
          <table className="board-table striped min-w-[440px]">
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

      <div className="rise delay-1 panel overflow-x-auto">
        <table className="board-table striped min-w-[640px]">
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
            {points.map((p, i) => (
              <span key={p.label}>
                {i > 0 && " · "}
                <span className="text-ink">{p.label}</span> {p.value}
              </span>
            ))}
          </li>
          <li>
            <span className="text-ink">Tiebreakers:</span> {tieChain}
          </li>
        </ul>
      </div>
    </div>
  );
}
