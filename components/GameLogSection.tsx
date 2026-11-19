"use client";

import { useState } from "react";
import Link from "next/link";
import { TeamBadge, TeamTag } from "@/components/TeamBadge";
import { ResultChip } from "@/components/Chips";
import { PlayoffChip } from "@/components/PlayoffChip";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/lib/format";

const PAGE_SIZE = 10;

export type GameLogRow = {
  game_id: string;
  scheduled_at: string;
  opponent: { id: string; name: string; slug: string; color: string };
  home_score: number;
  away_score: number;
  is_home: boolean;
  decided_in: "regulation" | "ot" | "shootout" | null;
  result: "W" | "L" | "OTL";
  is_sub: boolean;
  // Skater
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ps_taken: number;
  // Goalie
  ga: number;
  ps_faced: number;
  ps_saved: number;
  kind?: "regular" | "playoff";
  playoff_round?: "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final" | null;
};

export function GameLogSection({
  rows,
  isGoalie,
}: {
  rows: GameLogRow[];
  isGoalie: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;

  if (rows.length === 0) {
    return (
      <EmptyState title="No games yet">
        The game-by-game log appears once this player has played a finalized game.
      </EmptyState>
    );
  }

  const statCols: { label: string; title: string; get: (r: GameLogRow) => number; key?: boolean; dim?: boolean }[] = isGoalie
    ? [
        { label: "GA", title: "Goals against", get: (r) => r.ga },
        { label: "PSV", title: "Penalty shots saved", get: (r) => r.ps_saved, key: true },
        { label: "PSF", title: "Penalty shots faced", get: (r) => r.ps_faced, dim: true },
      ]
    : [
        { label: "G", title: "Goals", get: (r) => r.goals },
        { label: "A", title: "Assists", get: (r) => r.assists },
        { label: "PTS", title: "Points", get: (r) => r.points, key: true },
        { label: "PEN", title: "Penalties committed", get: (r) => r.penalties, dim: true },
      ];

  return (
    <div>
      <div className="panel overflow-clip">
        <table className="board-table striped dense sticky-head">
          <caption className="sr-only">Game log, most recent first</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left pl-3 sm:pl-4">Date</th>
              <th scope="col" className="text-left">Opp</th>
              <th scope="col" className="text-left">Result</th>
              {statCols.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  title={c.title}
                  className={`text-right w-10 sm:w-14 ${c.dim ? "col-dim hidden sm:table-cell" : ""} last:pr-3 sm:last:pr-4`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const myScore = row.is_home ? row.home_score : row.away_score;
              const oppScore = row.is_home ? row.away_score : row.home_score;
              return (
                <tr key={row.game_id}>
                  <td className="pl-3 sm:pl-4">
                    <Link
                      href={`/games/${row.game_id}`}
                      className="flex flex-col justify-center min-h-[44px] text-ink hover:text-ice transition-colors"
                    >
                      <span className="whitespace-nowrap text-[14px]">{formatDate(row.scheduled_at)}</span>
                      {(row.is_sub || row.kind === "playoff") && (
                        <span className="flex gap-1 mt-0.5">
                          {row.is_sub && (
                            <span className="chip" title="Played as a substitute">
                              Sub
                            </span>
                          )}
                          {row.kind === "playoff" && <PlayoffChip round={row.playoff_round} />}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td>
                    <span className="sm:hidden">
                      <TeamTag name={row.opponent.name} color={row.opponent.color} />
                    </span>
                    <span className="hidden sm:inline">
                      <TeamBadge {...row.opponent} size="sm" asChild />
                    </span>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <ResultChip result={row.result} />
                      <span className="tnum text-[14px] text-ink-dim">
                        {myScore}–{oppScore}
                      </span>
                    </span>
                  </td>
                  {statCols.map((c) => {
                    const v = c.get(row);
                    return (
                      <td
                        key={c.label}
                        className={`text-right last:pr-3 sm:last:pr-4 ${
                          c.dim
                            ? "col-dim hidden sm:table-cell"
                            : c.key
                              ? "font-bold text-ink"
                              : v > 0
                                ? "text-ink"
                                : "text-ink-faint"
                        }`}
                      >
                        {v}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 inline-flex items-center min-h-11 text-[14px] font-semibold text-ice hover:text-ink transition-colors"
        >
          {expanded ? "Show fewer" : `Show all ${rows.length} games`}
        </button>
      )}
    </div>
  );
}
