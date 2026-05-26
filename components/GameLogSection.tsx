"use client";

import { useState } from "react";
import Link from "next/link";
import { TeamBadge } from "@/components/TeamBadge";
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
};

function ResultChip({ result }: { result: "W" | "L" | "OTL" }) {
  if (result === "W") return <span className="chip chip-final">W</span>;
  if (result === "L") return <span className="chip chip-live">L</span>;
  return (
    <span
      className="chip"
      style={{
        color: "#f59e0b",
        borderColor: "rgba(245,158,11,0.4)",
        background: "rgba(245,158,11,0.08)",
      }}
    >
      OTL
    </span>
  );
}

function MiniStat({
  label,
  value,
  accent = "text-ink-dim",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div>
      <div className="eyebrow text-[9px]">{label}</div>
      <div className={`digit text-[15px] tnum mt-0.5 ${accent}`}>{value}</div>
    </div>
  );
}

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
      <div className="panel-bare p-6 stripes">
        <div className="eyebrow mb-2 text-goal">No games yet</div>
        <p className="text-ink-dim text-[14px]">
          Game-by-game log will appear once this player has played a finalized
          game.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile: card list */}
      <div className="space-y-2 sm:hidden">
        {visible.map((row) => {
          const myScore = row.is_home ? row.home_score : row.away_score;
          const oppScore = row.is_home ? row.away_score : row.home_score;
          return (
            <Link
              key={row.game_id}
              href={`/games/${row.game_id}`}
              className="panel block p-3 hover:border-rule-strong transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-faint text-[12px]">
                      {formatDate(row.scheduled_at)}
                    </span>
                    {row.is_sub && (
                      <span className="eyebrow text-[9px] text-ink-faint">
                        SUB
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-ink-dim text-[12px]">vs</span>
                    <TeamBadge {...row.opponent} size="sm" />
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className="font-mono text-[13px] text-ink-dim">
                    {myScore}–{oppScore}
                  </span>
                  <ResultChip result={row.result} />
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-rule grid grid-cols-4 gap-2">
                {isGoalie ? (
                  <>
                    <MiniStat label="GA" value={row.ga} />
                    <MiniStat label="PSF" value={row.ps_faced} />
                    <MiniStat label="PSV" value={row.ps_saved} accent="text-ink" />
                  </>
                ) : (
                  <>
                    <MiniStat
                      label="G"
                      value={row.goals}
                      accent={row.goals > 0 ? "text-ink" : "text-ink-dim"}
                    />
                    <MiniStat label="A" value={row.assists} />
                    <MiniStat
                      label="PTS"
                      value={row.points}
                      accent={row.points > 0 ? "text-ink" : "text-ink-dim"}
                    />
                    <MiniStat label="PEN" value={row.penalties} />
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="panel hidden sm:block overflow-x-auto">
        <table className="board-table">
          <thead>
            <tr>
              <th className="text-left pl-5">Date</th>
              <th className="text-left">Opponent</th>
              <th className="text-center">Result</th>
              <th className="text-right">Score</th>
              {isGoalie ? (
                <>
                  <th className="text-right">GA</th>
                  <th className="text-right">PSF</th>
                  <th className="text-right pr-5">PSV</th>
                </>
              ) : (
                <>
                  <th className="text-right">G</th>
                  <th className="text-right">A</th>
                  <th className="text-right">PEN</th>
                  <th className="text-right pr-5">PTS</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const myScore = row.is_home ? row.home_score : row.away_score;
              const oppScore = row.is_home ? row.away_score : row.home_score;
              return (
                <tr key={row.game_id}>
                  <td className="pl-5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/games/${row.game_id}`}
                        className="text-ink-dim hover:text-ink transition-colors text-[13px]"
                      >
                        {formatDate(row.scheduled_at)}
                      </Link>
                      {row.is_sub && (
                        <span className="eyebrow text-[9px] text-ink-faint">
                          SUB
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <TeamBadge {...row.opponent} size="sm" />
                  </td>
                  <td className="text-center">
                    <ResultChip result={row.result} />
                  </td>
                  <td className="text-right tnum text-ink-dim text-[13px]">
                    {myScore}–{oppScore}
                  </td>
                  {isGoalie ? (
                    <>
                      <td className="text-right tnum text-ink-dim">{row.ga}</td>
                      <td className="text-right tnum text-ink-dim">
                        {row.ps_faced}
                      </td>
                      <td className="text-right pr-5 tnum text-ink">
                        {row.ps_saved}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="text-right tnum text-ink">{row.goals}</td>
                      <td className="text-right tnum text-ink-dim">
                        {row.assists}
                      </td>
                      <td className="text-right tnum text-ink-dim">
                        {row.penalties}
                      </td>
                      <td className="text-right pr-5 tnum text-ink">
                        {row.points}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 eyebrow hover:text-ink transition-colors min-h-11 px-2 -mx-2"
        >
          {expanded
            ? "Show fewer"
            : `Show all ${rows.length} games`}
        </button>
      )}
    </div>
  );
}
