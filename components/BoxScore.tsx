import Link from "next/link";
import { TeamBadge } from "@/components/TeamBadge";
import type { TeamBox } from "@/lib/box-score";

type TeamRef = { id: string; name: string; slug: string; color: string };

const num = "text-right tnum";

function TeamTable({ team, box }: { team: TeamRef; box: TeamBox }) {
  return (
    <div
      className="panel p-3 sm:p-4 space-y-3 min-w-0"
      style={{ borderLeftColor: team.color, borderLeftWidth: 3, borderLeftStyle: "solid" }}
    >
      <TeamBadge name={team.name} slug={team.slug} color={team.color} size="sm" />

      <div className="overflow-x-auto">
        <table className="board-table stats-table w-full text-[14px]">
          <thead>
            <tr>
              <th className="text-left">#</th>
              <th className="text-left">Skater</th>
              <th className={num}>G</th>
              <th className={num}>A</th>
              <th className={num}>PTS</th>
              <th className={num}>PEN</th>
              <th className={num}>PS</th>
              <th className={num}>PSG</th>
            </tr>
          </thead>
          <tbody>
            {box.skaters.map((s) => (
              <tr key={s.playerId}>
                <td className="tnum text-ink-dim">{s.jersey ?? "—"}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/players/${s.playerId}`} className="hover:text-ink transition-colors">
                    {s.name}
                  </Link>
                  {s.isSub && <span className="chip ml-2 text-[10px]">SUB</span>}
                </td>
                <td className={num}>{s.g}</td>
                <td className={num}>{s.a}</td>
                <td className={`${num} text-ink`}>{s.pts}</td>
                <td className={num}>{s.pen}</td>
                <td className={num}>{s.ps}</td>
                <td className={num}>{s.psg}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td />
              <td>Totals</td>
              <td className={num}>{box.totals.g}</td>
              <td className={num}>{box.totals.a}</td>
              <td className={num}>{box.totals.pts}</td>
              <td className={num}>{box.totals.pen}</td>
              <td className={num}>{box.totals.ps}</td>
              <td className={num}>{box.totals.psg}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {box.goalies.length > 0 && (
        <div className="overflow-x-auto">
          <table className="board-table w-full text-[14px]">
            <thead>
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">Goalie</th>
                <th className={num}>GA</th>
                <th className={num}>PSF</th>
                <th className={num}>PSV</th>
                <th className={num}>Result</th>
              </tr>
            </thead>
            <tbody>
              {box.goalies.map((g) => (
                <tr key={g.playerId}>
                  <td className="tnum text-ink-dim">{g.jersey ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    <Link href={`/players/${g.playerId}`} className="hover:text-ink transition-colors">
                      {g.name}
                    </Link>
                    {g.isSub && <span className="chip ml-2 text-[10px]">SUB</span>}
                  </td>
                  <td className={num}>{g.ga}</td>
                  <td className={num}>{g.psf}</td>
                  <td className={num}>{g.psv}</td>
                  <td className={num}>{g.result ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Per-team stat lines for a live or final game. Away first, matching the
// scoreboard's left-to-right order.
export function BoxScore({ box, home, away }: { box: { home: TeamBox; away: TeamBox }; home: TeamRef; away: TeamRef }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamTable team={away} box={box.away} />
        <TeamTable team={home} box={box.home} />
      </div>
      <p className="text-[12px] text-ink-faint">
        PEN = penalties committed · PS = penalty shots taken · PSG = penalty-shot goals · GA includes penalty-shot goals ·
        PSF / PSV = penalty shots faced / saved
      </p>
    </div>
  );
}
