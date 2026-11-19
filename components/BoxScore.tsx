"use client";

import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import Link from "next/link";
import { TeamBadge } from "@/components/TeamBadge";
import { ResultChip } from "@/components/Chips";
import { Disclosure } from "@/components/Disclosure";
import type { TeamBox } from "@/lib/box-score";

type TeamRef = { id: string; name: string; slug: string; color: string };

const num = "text-right w-9 sm:w-11";

function SubBadge() {
  return (
    <span className="chip ml-2" title="Substitute">
      Sub
    </span>
  );
}

function Name({ id, name, jersey, isSub }: { id: string; name: string; jersey: number | null; isSub: boolean }) {
  return (
    <Link href={`/players/${id}`} className="inline-flex items-center min-h-[36px] text-ink hover:text-ice transition-colors">
      {jersey != null && <span className="tnum text-ink-faint w-7 shrink-0">{jersey}</span>}
      <span>{name}</span>
      {isSub && <SubBadge />}
    </Link>
  );
}

function TeamTable({ team, box }: { team: TeamRef; box: TeamBox }) {
  return (
    <div className="panel overflow-clip min-w-0">
      <div className="hidden lg:flex items-center px-3 sm:px-4 border-b border-rule">
        <TeamBadge name={team.name} slug={team.slug} color={team.color} size="md" />
      </div>

      <DataTable caption={`${team.name} skaters`} scroll framed={false}>
          <thead>
            <tr>
              <th scope="col" className="text-left pl-3 sm:pl-4">Skater</th>
              <th scope="col" className={num} title="Goals">G</th>
              <th scope="col" className={num} title="Assists">A</th>
              <th scope="col" className={num} title="Points">PTS</th>
              <th scope="col" className={`${num} col-dim hidden sm:table-cell`} title="Penalties">PEN</th>
              <th scope="col" className={`${num} col-dim hidden sm:table-cell`} title="Penalty shots taken">PS</th>
              <th scope="col" className={`${num} col-dim hidden sm:table-cell pr-3 sm:pr-4`} title="Penalty-shot goals">PSG</th>
            </tr>
          </thead>
          <tbody>
            {box.skaters.map((s) => (
              <tr key={s.playerId}>
                <td className="pl-3 sm:pl-4 whitespace-nowrap">
                  <Name id={s.playerId} name={s.name} jersey={s.jersey} isSub={s.isSub} />
                </td>
                <td className={`${num} ${s.g ? "text-ink" : "text-ink-faint"}`}>{s.g}</td>
                <td className={`${num} ${s.a ? "text-ink" : "text-ink-faint"}`}>{s.a}</td>
                <td className={`${num} font-bold ${s.pts ? "text-ink" : "text-ink-faint"}`}>{s.pts}</td>
                <td className={`${num} col-dim hidden sm:table-cell`}>{s.pen}</td>
                <td className={`${num} col-dim hidden sm:table-cell`}>{s.ps}</td>
                <td className={`${num} col-dim hidden sm:table-cell pr-3 sm:pr-4`}>{s.psg}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <th scope="row" className="text-left pl-3 sm:pl-4 py-2 bg-board-3 border-t border-rule-strong text-[14px] text-ink">
                Totals
              </th>
              {[box.totals.g, box.totals.a, box.totals.pts, box.totals.pen, box.totals.ps, box.totals.psg].map((v, i) => (
                <td
                  key={i}
                  className={`${num} px-2 py-2 tnum bg-board-3 border-t border-rule-strong ${
                    i < 3 ? "text-ink" : "text-ink-faint hidden sm:table-cell"
                  }`}
                >
                  {v}
                </td>
              ))}
            </tr>
          </tfoot>
      </DataTable>

      {box.goalies.length > 0 && (
        <DataTable caption={`${team.name} goalies`} scroll framed={false} className="border-t border-rule-strong">
            <thead>
              <tr>
                <th scope="col" className="text-left pl-3 sm:pl-4">Goalie</th>
                <th scope="col" className={num} title="Goals against">GA</th>
                <th scope="col" className={`${num} col-dim hidden sm:table-cell`} title="Penalty shots faced">PSF</th>
                <th scope="col" className={`${num} col-dim hidden sm:table-cell`} title="Penalty shots saved">PSV</th>
                <th scope="col" className="text-right w-14 pr-3 sm:pr-4">Result</th>
              </tr>
            </thead>
            <tbody>
              {box.goalies.map((g) => (
                <tr key={g.playerId}>
                  <td className="pl-3 sm:pl-4 whitespace-nowrap">
                    <Name id={g.playerId} name={g.name} jersey={g.jersey} isSub={g.isSub} />
                  </td>
                  <td className={`${num} text-ink`}>{g.ga}</td>
                  <td className={`${num} col-dim hidden sm:table-cell`}>{g.psf}</td>
                  <td className={`${num} col-dim hidden sm:table-cell`}>{g.psv}</td>
                  <td className="text-right pr-3 sm:pr-4">{g.result ? <ResultChip result={g.result} /> : "—"}</td>
                </tr>
              ))}
            </tbody>
        </DataTable>
      )}
    </div>
  );
}

// Per-team stat lines for a live or final game. Away first, matching the
// scoreboard's left-to-right order.
// Below lg the two teams share one slot, switched by an Away / Home toggle.
export function BoxScore({ box, home, away }: { box: { home: TeamBox; away: TeamBox }; home: TeamRef; away: TeamRef }) {
  const [side, setSide] = useState<"away" | "home">("away");
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Choose team" className="lg:hidden inline-flex rounded-md border border-rule-strong overflow-hidden">
        {(
          [
            ["away", away],
            ["home", home],
          ] as const
        ).map(([key, t], i) => {
          const active = side === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setSide(key)}
              className={`inline-flex items-center gap-2 min-h-[44px] px-4 text-[14px] font-semibold transition-colors ${
                active ? "bg-ice text-board" : "text-ink-dim hover:text-ink hover:bg-board-3"
              } ${i > 0 ? "border-l border-rule-strong" : ""}`}
            >
              <span aria-hidden className="swatch h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
              {t.name}
            </button>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={side === "away" ? "" : "hidden lg:block"}>
          <TeamTable team={away} box={box.away} />
        </div>
        <div className={side === "home" ? "" : "hidden lg:block"}>
          <TeamTable team={home} box={box.home} />
        </div>
      </div>
      <Disclosure label="Legend">
        Number before a name = jersey. Sub = substitute for this game. PEN = penalties committed · PS = penalty shots
        taken · PSG = penalty-shot goals (PEN/PS/PSG and PSF/PSV show on wider screens) · GA includes penalty-shot
        goals · PSF / PSV = penalty shots faced / saved.
      </Disclosure>
    </div>
  );
}
