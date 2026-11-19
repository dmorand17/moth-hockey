"use client";

import { useEffect, useMemo, useState } from "react";
import { ScrollFade } from "./ScrollFade";
import { usePathname, useRouter } from "next/navigation";
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

// Season schedule grouped by game night, with a team filter (kept in the URL
// as ?team=<slug> so it's shareable) and a jump link to the next unplayed
// night — or the latest played night once the season is over.
export function ScheduleView({
  weeks,
  teams,
  initialTeam,
}: {
  weeks: ScheduleWeek[];
  teams: TeamRef[];
  initialTeam: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [team, setTeamState] = useState<string>(initialTeam);
  const setTeam = (slug: string) => {
    setTeamState(slug);
    router.replace(slug === "all" ? pathname : `${pathname}?team=${encodeURIComponent(slug)}`, { scroll: false });
  };
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
  // The night to jump to and highlight.
  const focusDate = nextDate ?? latestDate;

  // Open at the latest results night (unless the URL already targets an
  // anchor). Runs on mount, i.e. on load and after a team filter change.
  useEffect(() => {
    if (window.location.hash || !latestDate) return;
    document.getElementById(latestDate === focusDate ? "focus-night" : `night-${latestDate}`)?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Phones: while the header is hidden (scrolling down) the team chips
          (48px) pin at the top with the night's date header (~30px) below;
          while it shows, the chips tuck under it and the date header sits
          right below the header. */}
      <div className="sticky top-[calc(var(--header-h)-var(--header-shown)*48px)] z-[4] -mx-4 bg-board/95 backdrop-blur-sm py-0.5 sm:static sm:mx-0 sm:bg-transparent sm:backdrop-blur-none sm:py-0">
        <ScrollFade className="px-4 sm:px-0">
          <div role="group" aria-label="Filter by team" className="flex gap-2 w-max sm:w-auto sm:flex-wrap">
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
        </ScrollFade>
      </div>
      {focusDate && (
        <a
          href="#focus-night"
          className="inline-flex items-center min-h-[44px] text-[14px] font-semibold text-ice hover:text-ink transition-colors"
        >
          {nextDate ? "Jump to next game" : "Jump to latest results"} <span aria-hidden className="ml-1">↓</span>
        </a>
      )}

      {visible.length === 0 ? (
        <p className="text-[14px] text-ink-faint">No games for {teamName ?? "this team"} yet.</p>
      ) : (
        visible.map((w) => {
          const isNext = w.date === nextDate;
          const isLatest = w.date === latestDate;
          const isFocus = w.date === focusDate;
          const byes = teamName ? w.byes.filter((b) => b === teamName) : w.byes;
          return (
            <section
              key={w.date}
              id={isFocus ? "focus-night" : `night-${w.date}`}
              aria-labelledby={`wk-${w.date}`}
              className="scroll-mt-[calc(var(--header-h)+56px)]! sm:scroll-mt-[calc(var(--header-h)+12px)]!"
            >
              <div className="sticky top-[calc(var(--header-h)+(1-var(--header-shown))*48px)] sm:top-[var(--header-h)] z-[3] -mx-4 px-4 sm:mx-0 sm:px-0 py-1 sm:py-1.5 bg-board/95 backdrop-blur-sm flex items-center gap-2 flex-wrap">
                <h2 id={`wk-${w.date}`} className={`text-[15px] font-bold ${isFocus ? "text-goal" : "text-ink"}`}>
                  {weekLabel(w.date)}
                </h2>
                {isNext && <span className="chip chip-live">Next up</span>}
                {isLatest && !isNext && <span className={`chip ${isFocus ? "chip-live" : ""}`}>Latest results</span>}
                {byes.length > 0 && (
                  <span className="ml-auto text-[13px] text-ink-faint">
                    {teamName ? "Bye week" : `Bye: ${byes.join(", ")}`}
                  </span>
                )}
              </div>

              {w.skipReason && (
                <p className="mb-2 text-[14px] text-ink-dim">
                  <span className="font-semibold text-ink">Postponed</span> — {w.skipReason}
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
