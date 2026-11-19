"use client";

import { useMemo, useState } from "react";
import { GameList, GameRow } from "@/components/GameRow";

type TeamRef = { name: string; slug: string; color: string };

export type ScheduleGame = {
  id: string;
  scheduled_at: string;
  status: "scheduled" | "live" | "final";
  kind: "regular" | "playoff";
  playoff_round: "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final" | null;
  home_score: number;
  away_score: number;
  decided_in: "regulation" | "ot" | "shootout" | null;
  home_team: TeamRef | null;
  away_team: TeamRef | null;
};

export type ScheduleWeek = {
  date: string; // YYYY-MM-DD (local)
  games: ScheduleGame[];
  byes: string[]; // team names
  skipReason?: string;
};

function weekLabel(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const plays = (g: ScheduleGame, slug: string) => g.home_team?.slug === slug || g.away_team?.slug === slug;

// Season schedule grouped by game night, with a team filter and a jump link
// to the next unplayed night.
export function ScheduleView({ weeks, teams }: { weeks: ScheduleWeek[]; teams: TeamRef[] }) {
  const [team, setTeam] = useState<string>("all");
  const teamName = teams.find((t) => t.slug === team)?.name;

  const visible = useMemo(() => {
    if (team === "all") return weeks;
    return weeks
      .map((w) => ({ ...w, games: w.games.filter((g) => plays(g, team)) }))
      .filter((w) => w.games.length > 0 || (teamName && w.byes.includes(teamName)) || w.skipReason);
  }, [weeks, team, teamName]);

  // Next night with an unplayed game, and the most recent night with results.
  const nextDate = visible.find((w) => w.games.some((g) => g.status !== "final"))?.date;
  const latestDate = [...visible].reverse().find((w) => w.games.some((g) => g.status === "final"))?.date;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div role="group" aria-label="Filter by team" className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          {[{ name: "All teams", slug: "all", color: "" }, ...teams].map((t) => {
            const active = team === t.slug;
            return (
              <button
                key={t.slug}
                type="button"
                aria-pressed={active}
                onClick={() => setTeam(t.slug)}
                className={`shrink-0 inline-flex items-center gap-2 min-h-[44px] px-3.5 rounded-full border text-[14px] font-semibold whitespace-nowrap transition-colors ${
                  active ? "bg-ice text-board border-ice" : "border-rule-strong text-ink-dim hover:text-ink hover:bg-board-3"
                }`}
              >
                {t.color && <span aria-hidden className="swatch h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />}
                {t.name}
              </button>
            );
          })}
        </div>
        {nextDate && (
          <a
            href="#next-games"
            className="sm:ml-auto shrink-0 inline-flex items-center min-h-[44px] text-[14px] font-semibold text-ice hover:text-ink transition-colors"
          >
            Jump to next game <span aria-hidden className="ml-1">↓</span>
          </a>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-[14px] text-ink-faint">No games for {teamName ?? "this team"} yet.</p>
      ) : (
        visible.map((w) => {
          const isNext = w.date === nextDate;
          const isLatest = w.date === latestDate;
          const byes = teamName ? w.byes.filter((b) => b === teamName) : w.byes;
          return (
            <section key={w.date} id={isNext ? "next-games" : undefined} aria-labelledby={`wk-${w.date}`}>
              <div className="sticky top-[var(--header-h)] z-[3] -mx-4 px-4 sm:mx-0 sm:px-0 py-1.5 bg-board/95 backdrop-blur-sm flex items-center gap-2 flex-wrap">
                <h2 id={`wk-${w.date}`} className={`text-[15px] font-bold ${isNext ? "text-ice" : "text-ink"}`}>
                  {weekLabel(w.date)}
                </h2>
                {isNext && <span className="chip text-ice! border-ice/40!">Next up</span>}
                {isLatest && !isNext && <span className="chip">Latest results</span>}
                {byes.length > 0 && (
                  <span className="ml-auto text-[13px] text-ink-faint">
                    {teamName ? "Bye week" : `Bye: ${byes.join(", ")}`}
                  </span>
                )}
              </div>

              {w.skipReason && (
                <p className="mb-2 text-[14px] text-ink-dim">
                  <span className="font-semibold text-loss">Postponed</span> — {w.skipReason}
                </p>
              )}

              {w.games.length > 0 && (
                <GameList>
                  {w.games.map((g) => (
                    <GameRow
                      key={g.id}
                      id={g.id}
                      scheduled_at={g.scheduled_at}
                      status={g.status}
                      home_team={g.home_team}
                      away_team={g.away_team}
                      home_score={g.home_score}
                      away_score={g.away_score}
                      decided_in={g.decided_in}
                      kind={g.kind}
                      playoff_round={g.playoff_round}
                    />
                  ))}
                </GameList>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
