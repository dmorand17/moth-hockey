import Link from "next/link";
import { recapState, seasonSlug } from "@/lib/seasons";
import { TeamBadge } from "@/components/TeamBadge";
import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { SeasonSelect } from "@/components/SeasonSelect";
import {
  getSeasons,
  getStandings,
  getHistoricalStandings,
  getChampionTeamId,
  getSeasonRules,
  getRecapSeasons,
  type PointSystem,
  type TieKey,
} from "@/lib/queries";
import { NoSeason } from "@/components/NoSeason";
import { Disclosure } from "@/components/Disclosure";
import { EmptyState } from "@/components/EmptyState";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Standings",
  description: "League table: wins, losses, overtime losses, PIM, goal differential and points.",
};

function Diff({ value }: { value: number }) {
  const tone = value > 0 ? "text-win" : value < 0 ? "text-loss" : "text-ink-faint";
  return <span className={tone}>{value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0"}</span>;
}

function Rank({ i }: { i: number }) {
  return (
    <span className={`tnum ${i === 0 ? "text-gold font-bold" : "text-ink-faint"}`}>
      {i + 1}
      {i === 0 && <span className="sr-only"> (first place)</span>}
    </span>
  );
}

const Champion = () => (
  <span title="Champion" className="text-gold">
    <span aria-hidden>🏆</span>
    <span className="sr-only">Champion</span>
  </span>
);

type SearchParams = Promise<{ season?: string }>;

// Lowercase labels for the House Rules chip (matches the page's inline style).
const TIE_LABELS: Record<TieKey, string> = {
  pim: "PIM",
  ga: "goals against",
  gf: "goals for",
  wins: "wins",
  diff: "goal differential",
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

  const [rules, recapSeasons] = await Promise.all([getSeasonRules(season.id), getRecapSeasons()]);
  const recapSeason = recapSeasons.find((x) => x.id === season.id);
  const recapHref =
    recapSeason && recapState(recapSeason, recapSeasons, new Date().toISOString().slice(0, 10)) !== "upcoming"
      ? `/seasons/${seasonSlug(season.name)}/recap`
      : null;
  const points = pointsSummary(rules.system);
  const tieChain = ["points", ...rules.tiebreakers.map((k) => TIE_LABELS[k])].join(" → ");

  const header = (
    <div className="rise">
      <SectionHeader
        eyebrow={season.name}
        title="Standings"
        size="lg"
        as="h1"
        action={
          <>
            <SeasonSelect seasons={seasons} selectedId={season.id} />
            {recapHref && (
              <Link
                href={recapHref}
                className="text-[14px] font-semibold text-ice hover:text-ink transition-colors inline-flex items-center min-h-11 whitespace-nowrap"
              >
                Recap <span aria-hidden className="ml-1">→</span>
              </Link>
            )}
          </>
        }
      />
    </div>
  );

  const standings = await getStandings(season.id);
  const hasResults = standings.some((r) => r.gp > 0);

  // Imported past seasons have no game results — show a goal-differential
  // table derived from aggregated stats instead of a W/L record.
  if (!season.is_current && !hasResults) {
    const rows = await getHistoricalStandings(season.id);

    if (rows.length === 0) {
      return (
        <div className="space-y-6 md:space-y-8">
          {header}
          <div className="rise delay-1">
            <EmptyState
              title={`No team standings on file for ${season.name}.`}
              linkHref={`/stats?season=${season.id}`}
              linkLabel="Player totals on the Stats page"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 md:space-y-8">
        {header}

        <DataTable caption={`${season.name} standings by goal differential`} className="rise delay-1">
            <thead>
              <tr>
                <th scope="col" className="text-left w-10 pl-4">#</th>
                <th scope="col" className="text-left">Team</th>
                <th scope="col" className="text-right sm:w-14">GP</th>
                <th scope="col" className="text-right sm:w-14">GF</th>
                <th scope="col" className="text-right sm:w-14">GA</th>
                <th scope="col" className="text-right sm:w-14 pr-4">DIFF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.team_id}>
                  <td className="pl-4"><Rank i={i} /></td>
                  <td className="max-w-0 w-full">
                    <div className="flex items-center gap-1.5">
                      <TeamBadge name={row.name} slug={row.slug} color={row.color} className="min-w-0" wrap />
                      {row.is_champion && <Champion />}
                    </div>
                  </td>
                  <td className="text-right tnum text-ink-dim">{row.gp}</td>
                  <td className="text-right tnum text-ink-dim">{row.gf}</td>
                  <td className="text-right tnum text-ink-dim">{row.ga}</td>
                  <td className="text-right pr-4 tnum font-bold"><Diff value={row.diff} /></td>
                </tr>
              ))}
            </tbody>
        </DataTable>

        <Disclosure label="How standings work" className="rise delay-2">
          <ul className="space-y-1.5 list-disc pl-5">
            <li>
              Game-by-game records (W/L/OTL) aren&apos;t tracked for past seasons. Teams are ranked by goal
              differential from aggregated player stats.
            </li>
            <li>🏆 marks the season champion.</li>
          </ul>
        </Disclosure>
      </div>
    );
  }

  const championId = await getChampionTeamId(season.id);

  return (
    <div className="space-y-6 md:space-y-8">
      {header}

      <DataTable caption={`${season.name} standings`} className="rise delay-1">
            <thead>
              <tr>
                <th scope="col" className="text-left w-8 pl-3 sm:pl-4">#</th>
                <th scope="col" className="text-left">Team</th>
                <th scope="col" className="text-right sm:w-14">GP</th>
                <th scope="col" className="text-right sm:w-14 sm:hidden">W-L-OTL</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">W</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">L</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">OTL</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">GF</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell">GA</th>
                <th scope="col" className="text-right sm:w-14 hidden sm:table-cell" title="Penalty minutes (each regular-season penalty counts as 1)">PIM</th>
                <th scope="col" className="text-right sm:w-14">DIFF</th>
                <th scope="col" className="text-right sm:w-14 pr-3 sm:pr-4">PTS</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={row.team_id}>
                  <td className="pl-3 sm:pl-4"><Rank i={i} /></td>
                  <td className="max-w-0 w-full">
                    <div className="flex items-center gap-1.5">
                      <TeamBadge name={row.name} slug={row.slug} color={row.color} className="min-w-0" wrap />
                      {row.team_id === championId && <Champion />}
                    </div>
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
                  <td className="text-right tnum text-ink-dim hidden sm:table-cell">{row.pim}</td>
                  <td className="text-right tnum font-semibold"><Diff value={row.diff} /></td>
                  <td className="text-right pr-3 sm:pr-4 tnum text-[17px] font-bold text-ink">{row.pts}</td>
                </tr>
              ))}
            </tbody>
      </DataTable>

      <Disclosure label="How standings work" className="rise delay-2">
        <ul className="space-y-1.5 list-disc pl-5">
          <li>
            {points.map((p, i) => (
              <span key={p.label}>
                {i > 0 && " · "}
                <span className="text-ink-dim">{p.label}</span> {p.value}
              </span>
            ))}
          </li>
          <li>
            <span className="text-ink-dim">Tiebreakers:</span> {tieChain}
          </li>
          <li>
            PIM is the number of penalties a team took in regular-season games. This league uses
            penalty shots, so each penalty counts as 1 PIM.
          </li>
          <li>DIFF = goal differential (GF − GA). Gold rank marks first place.</li>
          {championId && <li>🏆 marks the playoff champion.</li>}
        </ul>
      </Disclosure>
    </div>
  );
}
