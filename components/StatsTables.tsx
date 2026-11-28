"use client";

import { useRef, useState, useMemo, type ReactNode } from "react";
import { DataTable } from "@/components/DataTable";
import Link from "next/link";
import { TeamTag } from "./TeamBadge";
import { paginate } from "@/lib/paginate";

type Team = { name: string; slug: string; color: string };

export type Skater = {
  id: string;
  name: string;
  team?: Team;
  isChampion?: boolean;
  gp: number;
  goals: number;
  assists: number;
  points: number;
  penalties: number;
  ps_taken: number;
  ps_made: number;
};

export type Goalie = {
  id: string;
  name: string;
  team?: Team;
  isChampion?: boolean;
  gp: number;
  // Null for imported (historical) seasons, which don't track game results.
  w: number | null;
  l: number | null;
  otl: number | null;
  ga: number;
  ps_faced: number;
  ps_saved: number;
};

type Direction = "asc" | "desc";

type Row = { id: string; name: string; team?: Team; isChampion?: boolean };

type Column<T> = {
  key: keyof T & string;
  label: string;
  title: string;
  defaultDir: Direction;
  /** Emphasized key stat (bold). */
  primary?: boolean;
  /** Secondary stat: dimmed, and hidden on mobile behind "More columns". */
  secondary?: boolean;
};

const skaterCols: Column<Skater>[] = [
  { key: "gp", label: "GP", title: "Games played", defaultDir: "desc" },
  { key: "goals", label: "G", title: "Goals", defaultDir: "desc" },
  { key: "assists", label: "A", title: "Assists", defaultDir: "desc" },
  { key: "points", label: "PTS", title: "Points", defaultDir: "desc", primary: true },
  { key: "penalties", label: "PEN", title: "Penalties committed", defaultDir: "desc", secondary: true },
  { key: "ps_taken", label: "PS", title: "Penalty shots taken", defaultDir: "desc", secondary: true },
  { key: "ps_made", label: "PSG", title: "Penalty-shot goals", defaultDir: "desc", secondary: true },
];

const goalieCols: Column<Goalie>[] = [
  { key: "gp", label: "GP", title: "Games played", defaultDir: "desc" },
  { key: "w", label: "W", title: "Wins", defaultDir: "desc" },
  { key: "l", label: "L", title: "Losses", defaultDir: "asc", secondary: true },
  { key: "otl", label: "OTL", title: "Overtime/shootout losses", defaultDir: "asc", secondary: true },
  { key: "ga", label: "GA", title: "Goals against", defaultDir: "asc" },
  { key: "ps_faced", label: "PSF", title: "Penalty shots faced", defaultDir: "desc", secondary: true },
  { key: "ps_saved", label: "PSV", title: "Penalty shots saved", defaultDir: "desc", primary: true },
];

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

// Gold / silver / bronze rank for the top three — only when the table is
// sorted by a stat (a leaderboard), not alphabetically.
const MEDAL = ["#fbbf24", "#c9d2de", "#d9925f"];
const MEDAL_NAME = ["first", "second", "third"];

function SortIcon({ active, dir }: { active: boolean; dir: Direction }) {
  return (
    <svg viewBox="0 0 10 14" aria-hidden className="h-3 w-2.5 shrink-0">
      <path d="M5 1 9 5H1Z" fill={active && dir === "asc" ? "var(--ice)" : "var(--rule-strong)"} />
      <path d="M5 13 1 9h8Z" fill={active && dir === "desc" ? "var(--ice)" : "var(--rule-strong)"} />
    </svg>
  );
}

function StatTable<T extends Row>({
  rows,
  cols,
  initialSort,
  noun,
  caption,
  empty,
  pageSize,
}: {
  rows: T[];
  cols: Column<T>[];
  initialSort: keyof T & string;
  noun: string;
  caption: string;
  empty: string;
  /** Show this many rows per page (all rows when omitted). */
  pageSize?: number;
}) {
  const [sortKey, setSortKey] = useState<string>(initialSort);
  const [dir, setDir] = useState<Direction>("desc");
  const [moreCols, setMoreCols] = useState(false);
  const [pageReq, setPageState] = useState(1);
  const top = useRef<HTMLDivElement>(null);
  // Changing page brings the table's first row back into view.
  const setPage = (n: number) => {
    setPageState(n);
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start" }));
  };

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortKey === "team" ? a.team?.name : sortKey === "name" ? a.name : a[sortKey as keyof T];
      const bv = sortKey === "team" ? b.team?.name : sortKey === "name" ? b.name : b[sortKey as keyof T];
      const c = compare(av, bv);
      return dir === "desc" ? -c : c;
    });
    return copy;
  }, [rows, sortKey, dir]);

  const view = pageSize ? paginate(sorted, pageReq, pageSize) : { rows: sorted, page: 1, pages: 1 };
  const offset = pageSize ? (view.page - 1) * pageSize : 0;

  const sortBy = (key: string, defaultDir: Direction) => {
    setPageState(1);
    if (sortKey === key) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setDir(defaultDir);
    }
  };

  const isLeaderboard = sortKey !== "name" && sortKey !== "team";
  const hasSecondary = cols.some((c) => c.secondary);
  // Career tables (all-time) carry no team; drop the column there.
  const showTeam = rows.some((r) => r.team);
  // Secondary columns: hidden on mobile unless "More columns" is on.
  const secondaryVis = moreCols ? "" : "hidden sm:table-cell";

  const th = (key: string, label: ReactNode, title: string, defaultDir: Direction, cls: string, align: "left" | "right") => {
    const active = sortKey === key;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"}
        className={`${cls} !p-0 ${align === "right" ? "text-right" : "text-left"}`}
      >
        <button
          type="button"
          onClick={() => sortBy(key, defaultDir)}
          title={`Sort by ${title}`}
          className={`inline-flex items-center gap-1 min-h-[44px] w-full px-2 uppercase tracking-[0.06em] hover:text-ink transition-colors ${
            align === "right" ? "justify-end" : "justify-start"
          } ${active ? "text-ice" : ""}`}
        >
          {label}
          <SortIcon active={active} dir={dir} />
        </button>
      </th>
    );
  };

  return (
    <div ref={top} style={{ scrollMarginTop: "calc(var(--header-h) + 12px)" }}>
      {/* Mobile sort chips */}
      <div className="sm:hidden mb-3 flex items-center gap-2 overflow-x-auto pb-1" role="group" aria-label={`Sort ${noun}`}>
        <span className="eyebrow shrink-0">Sort</span>
        {cols
          .filter((c) => !c.secondary || moreCols)
          .map((c) => {
            const active = sortKey === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => sortBy(c.key, c.defaultDir)}
                className={`shrink-0 inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-3 rounded-full border text-[14px] font-semibold transition-colors ${
                  active ? "bg-ice text-board border-ice" : "border-rule-strong text-ink-dim hover:text-ink"
                }`}
              >
                {c.label}
                {active && <span aria-label={dir === "desc" ? "descending" : "ascending"}>{dir === "desc" ? "↓" : "↑"}</span>}
              </button>
            );
          })}
      </div>

      <DataTable caption={`${caption}. Column headers sort the table.`} scroll={moreCols} dense={false}>
          <thead>
            <tr>
              <th scope="col" className="text-left w-10 pl-3 sm:pl-4">#</th>
              {th("name", noun === "goalies" ? "Goalie" : "Player", "name", "asc", "", "left")}
              {showTeam && th("team", "Team", "team", "asc", "hidden sm:table-cell w-20", "left")}
              {cols.map((c) =>
                th(c.key, c.label, c.title, c.defaultDir, `${c.secondary ? `${secondaryVis} col-dim` : ""} w-11 sm:w-14`, "right"),
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={cols.length + (showTeam ? 3 : 2)} className="px-4 py-5 text-[14px] text-ink-faint">
                  {empty}
                </td>
              </tr>
            ) : (
              view.rows.map((r, idx) => {
                const i = offset + idx;
                const medal = isLeaderboard && i < 3 ? i : null;
                return (
                  <tr key={r.id}>
                    <td className="pl-3 sm:pl-4 tnum">
                      {medal !== null ? (
                        <span className="font-bold" style={{ color: MEDAL[medal] }}>
                          {i + 1}
                          <span className="sr-only"> ({MEDAL_NAME[medal]})</span>
                        </span>
                      ) : (
                        <span className="text-ink-faint">{i + 1}</span>
                      )}
                    </td>
                    <td className="!py-1">
                      <Link
                        href={`/players/${r.id}`}
                        className="flex flex-col justify-center min-h-[44px] hover:text-ice transition-colors"
                      >
                        <span className="text-ink leading-5">{r.name}</span>
                        {r.team && (
                          <span className="sm:hidden mt-0.5 inline-flex items-center gap-1.5">
                            <TeamTag name={r.team.name} color={r.team.color} />
                            {r.isChampion && <Trophy />}
                          </span>
                        )}
                      </Link>
                    </td>
                    {showTeam && (
                      <td className="hidden sm:table-cell">
                        {r.team && (
                          <span className="inline-flex items-center gap-1.5">
                            <TeamTag name={r.team.name} color={r.team.color} />
                            {r.isChampion && <Trophy />}
                          </span>
                        )}
                      </td>
                    )}
                    {cols.map((c) => {
                      const v = r[c.key as keyof T] as number | null;
                      return (
                        <td
                          key={c.key}
                          className={`text-right pr-2 ${
                            c.secondary ? `${secondaryVis} col-dim` : c.primary ? "font-bold text-ink" : "text-ink-dim"
                          } ${sortKey === c.key && !c.primary ? "text-ink" : ""}`}
                        >
                          {v ?? "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
      </DataTable>
      {view.pages > 1 && (
        <nav aria-label={`${noun} pages`} className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage(view.page - 1)}
            disabled={view.page === 1}
            className="min-h-[44px] min-w-[44px] px-4 rounded-md border border-rule-strong text-[14px] font-semibold text-ink hover:bg-board-3 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          >
            <span aria-hidden>←</span> Prev
          </button>
          <span className="text-[14px] text-ink-faint" aria-live="polite">
            Page {view.page} of {view.pages} · {sorted.length} {noun}
          </span>
          <button
            type="button"
            onClick={() => setPage(view.page + 1)}
            disabled={view.page === view.pages}
            className="min-h-[44px] min-w-[44px] px-4 rounded-md border border-rule-strong text-[14px] font-semibold text-ink hover:bg-board-3 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          >
            Next <span aria-hidden>→</span>
          </button>
        </nav>
      )}
      {hasSecondary && (
        <button
          type="button"
          aria-pressed={moreCols}
          onClick={() => setMoreCols((m) => !m)}
          className="sm:hidden mt-2 inline-flex items-center min-h-[44px] text-[14px] font-semibold text-ice hover:text-ink transition-colors"
        >
          {moreCols ? "Fewer columns" : `More columns (${cols.filter((c) => c.secondary).map((c) => c.label).join(", ")})`}
        </button>
      )}
    </div>
  );
}

function Trophy() {
  return (
    <span title="Season champion">
      <span aria-hidden>🏆</span>
      <span className="sr-only">Season champion</span>
    </span>
  );
}

export function SkaterTable({ rows, pageSize }: { rows: Skater[]; pageSize?: number }) {
  return (
    <StatTable
      pageSize={pageSize}
      rows={rows}
      cols={skaterCols}
      initialSort="points"
      noun="skaters"
      caption="Skater stats"
      empty="No skater stats yet."
    />
  );
}

export function GoalieTable({ rows, pageSize }: { rows: Goalie[]; pageSize?: number }) {
  return (
    <StatTable
      pageSize={pageSize}
      rows={rows}
      cols={goalieCols}
      initialSort="ps_saved"
      noun="goalies"
      caption="Goalie stats"
      empty="No goalies on file."
    />
  );
}
