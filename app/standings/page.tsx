import { TeamBadge } from "@/components/TeamBadge";
import { SectionHeader } from "@/components/SectionHeader";
import { getCurrentSeason, getStandings } from "@/lib/queries";

export default async function StandingsPage() {
  const season = await getCurrentSeason();
  const standings = await getStandings(season.id);

  return (
    <div className="space-y-8">
      <div className="rise">
        <SectionHeader
          eyebrow="The Table"
          title="Standings"
          subtitle={season.name}
          size="lg"
        />
      </div>

      <div className="rise delay-1 panel overflow-x-auto">
        <table className="board-table min-w-[640px]">
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

      <div className="rise delay-2 panel-bare p-5">
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
