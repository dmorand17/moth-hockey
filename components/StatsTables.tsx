"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { TeamBadge } from "./TeamBadge";

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
  ga: number;
  ps_faced: number;
  ps_saved: number;
};

type SkaterKey = "name" | "team" | "gp" | "goals" | "assists" | "points" | "penalties" | "ps_taken" | "ps_made";
type GoalieKey = "name" | "team" | "gp" | "ga" | "ps_faced" | "ps_saved";

type Direction = "asc" | "desc";

const skaterCols: { key: SkaterKey; label: string; align: "left" | "right"; defaultDir: Direction; numeric: boolean }[] = [
  { key: "name", label: "Player", align: "left", defaultDir: "asc", numeric: false },
  { key: "team", label: "Team", align: "left", defaultDir: "asc", numeric: false },
  { key: "gp", label: "GP", align: "right", defaultDir: "desc", numeric: true },
  { key: "goals", label: "G", align: "right", defaultDir: "desc", numeric: true },
  { key: "assists", label: "A", align: "right", defaultDir: "desc", numeric: true },
  { key: "points", label: "PTS", align: "right", defaultDir: "desc", numeric: true },
  { key: "penalties", label: "PEN", align: "right", defaultDir: "desc", numeric: true },
  { key: "ps_taken", label: "PS", align: "right", defaultDir: "desc", numeric: true },
  { key: "ps_made", label: "PSG", align: "right", defaultDir: "desc", numeric: true },
];

const goalieCols: { key: GoalieKey; label: string; align: "left" | "right"; defaultDir: Direction; numeric: boolean }[] = [
  { key: "name", label: "Goalie", align: "left", defaultDir: "asc", numeric: false },
  { key: "team", label: "Team", align: "left", defaultDir: "asc", numeric: false },
  { key: "gp", label: "GP", align: "right", defaultDir: "desc", numeric: true },
  { key: "ga", label: "GA", align: "right", defaultDir: "asc", numeric: true },
  { key: "ps_faced", label: "PSF", align: "right", defaultDir: "desc", numeric: true },
  { key: "ps_saved", label: "PSV", align: "right", defaultDir: "desc", numeric: true },
];

function compare<T>(a: T, b: T): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function arrow(active: boolean, dir: Direction) {
  if (!active) return <span className="text-ink-faint/60 ml-1">↕</span>;
  return <span className="text-ice ml-1">{dir === "desc" ? "↓" : "↑"}</span>;
}

export function SkaterTable({ rows }: { rows: Skater[] }) {
  const [sortKey, setSortKey] = useState<SkaterKey>("points");
  const [dir, setDir] = useState<Direction>("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortKey === "team" ? a.team?.name : a[sortKey];
      const bv = sortKey === "team" ? b.team?.name : b[sortKey];
      const c = compare(av, bv);
      return dir === "desc" ? -c : c;
    });
    return copy;
  }, [rows, sortKey, dir]);

  const onSort = (key: SkaterKey, defaultDir: Direction) => {
    if (sortKey === key) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setDir(defaultDir);
    }
  };

  return (
    <>
      {/* Mobile: stacked rows, sort via dropdown */}
      <div className="sm:hidden">
        <MobileSortControls
          value={sortKey}
          dir={dir}
          options={skaterCols.filter((c) => c.numeric)}
          onChange={(k, d) => {
            setSortKey(k as SkaterKey);
            setDir(d);
          }}
        />
        <div className="space-y-2">
          {sorted.length === 0 ? (
            <div className="panel px-5 py-4 eyebrow">No stats yet</div>
          ) : (
            sorted.map((s, i) => (
              <Link
                key={s.id}
                href={`/players/${s.id}`}
                className="panel p-3 flex items-center gap-3 min-h-[44px] hover:border-rule-strong transition-colors"
              >
                <span className="digit text-ink-faint w-7 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{s.name}</span>
                  <div className="mt-0.5 flex items-center gap-2.5 text-[12px] text-ink-dim tnum">
                    {s.team && <TeamBadge {...s.team} size="sm" asChild />}
                    {s.isChampion && <span title="Season champion">🏆</span>}
                    <span>
                      {s.gp}GP · {s.goals}G · {s.assists}A · {s.penalties}P
                    </span>
                  </div>
                </div>
                <span className="digit text-2xl text-ink shrink-0 tnum">
                  {sortKey === "points" || !["goals", "assists", "penalties", "gp", "ps_taken", "ps_made"].includes(sortKey)
                    ? s.points
                    : (s[sortKey as keyof Skater] as number)}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Desktop sortable table */}
      <div className="panel hidden sm:block overflow-x-auto">
        <table className="board-table">
          <thead>
            <tr>
              <th className="text-left pl-5 w-12">#</th>
              {skaterCols.map((c) => (
                <th key={c.key} className={c.align === "right" ? "text-right" : "text-left"}>
                  <button
                    type="button"
                    onClick={() => onSort(c.key, c.defaultDir)}
                    className="inline-flex items-center font-display tracking-[0.18em] uppercase hover:text-ink transition-colors cursor-pointer"
                  >
                    {c.label}
                    {arrow(sortKey === c.key, dir)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={skaterCols.length + 1} className="pl-5 py-6 eyebrow">No stats yet</td>
              </tr>
            ) : (
              sorted.map((s, i) => (
                <tr key={s.id}>
                  <td className="pl-5 digit text-ink-faint">{String(i + 1).padStart(2, "0")}</td>
                  <td className="!p-0">
                    <Link
                      href={`/players/${s.id}`}
                      className="flex items-center min-h-[44px] px-2 -mx-2 hover:text-ink transition-colors"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td>
                    {s.team && (
                      <span className="inline-flex items-center gap-1.5">
                        <TeamBadge {...s.team} size="sm" />
                        {s.isChampion && <span title="Season champion">🏆</span>}
                      </span>
                    )}
                  </td>
                  <td className="text-right tnum text-ink-dim">{s.gp}</td>
                  <td className="text-right tnum text-ink">{s.goals}</td>
                  <td className="text-right tnum text-ink-dim">{s.assists}</td>
                  <td className="text-right tnum digit text-lg text-ink">{s.points}</td>
                  <td className="text-right tnum text-ink-dim">{s.penalties}</td>
                  <td className="text-right tnum text-ink-dim">{s.ps_taken}</td>
                  <td className="text-right pr-5 tnum text-ink-dim">{s.ps_made}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function GoalieTable({ rows }: { rows: Goalie[] }) {
  const [sortKey, setSortKey] = useState<GoalieKey>("ps_saved");
  const [dir, setDir] = useState<Direction>("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortKey === "team" ? a.team?.name : a[sortKey];
      const bv = sortKey === "team" ? b.team?.name : b[sortKey];
      const c = compare(av, bv);
      return dir === "desc" ? -c : c;
    });
    return copy;
  }, [rows, sortKey, dir]);

  const onSort = (key: GoalieKey, defaultDir: Direction) => {
    if (sortKey === key) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setDir(defaultDir);
    }
  };

  return (
    <>
      <div className="sm:hidden">
        <MobileSortControls
          value={sortKey}
          dir={dir}
          options={goalieCols.filter((c) => c.numeric)}
          onChange={(k, d) => {
            setSortKey(k as GoalieKey);
            setDir(d);
          }}
        />
        <div className="space-y-2">
          {sorted.length === 0 ? (
            <div className="panel px-5 py-4 eyebrow">No goalies on file</div>
          ) : (
            sorted.map((g, i) => (
              <Link
                key={g.id}
                href={`/players/${g.id}`}
                className="panel p-3 flex items-center gap-3 min-h-[44px] hover:border-rule-strong transition-colors"
              >
                <span className="digit text-ink-faint w-7 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{g.name}</span>
                  <div className="mt-0.5 flex items-center gap-2.5 text-[12px] text-ink-dim tnum">
                    {g.team && <TeamBadge {...g.team} size="sm" asChild />}
                    {g.isChampion && <span title="Season champion">🏆</span>}
                    <span>{g.gp}GP · {g.ga}GA · {g.ps_faced}PSF</span>
                  </div>
                </div>
                <span className="digit text-2xl text-ink shrink-0 tnum">
                  {(g[sortKey as keyof Goalie] as number) ?? 0}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="panel hidden sm:block overflow-x-auto">
        <table className="board-table">
          <thead>
            <tr>
              <th className="text-left pl-5 w-12">#</th>
              {goalieCols.map((c) => (
                <th key={c.key} className={c.align === "right" ? "text-right" : "text-left"}>
                  <button
                    type="button"
                    onClick={() => onSort(c.key, c.defaultDir)}
                    className="inline-flex items-center font-display tracking-[0.18em] uppercase hover:text-ink transition-colors cursor-pointer"
                  >
                    {c.label}
                    {arrow(sortKey === c.key, dir)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={goalieCols.length + 1} className="pl-5 py-6 eyebrow">No goalies on file</td>
              </tr>
            ) : (
              sorted.map((g, i) => (
                <tr key={g.id}>
                  <td className="pl-5 digit text-ink-faint">{String(i + 1).padStart(2, "0")}</td>
                  <td className="!p-0">
                    <Link
                      href={`/players/${g.id}`}
                      className="flex items-center min-h-[44px] px-2 -mx-2 hover:text-ink transition-colors"
                    >
                      {g.name}
                    </Link>
                  </td>
                  <td>
                    {g.team && (
                      <span className="inline-flex items-center gap-1.5">
                        <TeamBadge {...g.team} size="sm" />
                        {g.isChampion && <span title="Season champion">🏆</span>}
                      </span>
                    )}
                  </td>
                  <td className="text-right tnum text-ink-dim">{g.gp}</td>
                  <td className="text-right tnum text-ink-dim">{g.ga}</td>
                  <td className="text-right tnum text-ink-dim">{g.ps_faced}</td>
                  <td className="text-right pr-5 tnum digit text-lg text-ink">{g.ps_saved}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MobileSortControls<K extends string>({
  value,
  dir,
  options,
  onChange,
}: {
  value: K;
  dir: Direction;
  options: { key: K; label: string; defaultDir: Direction }[];
  onChange: (key: K, dir: Direction) => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <label className="eyebrow">Sort</label>
      <select
        value={value}
        onChange={(e) => {
          const next = options.find((o) => o.key === e.target.value);
          if (next) onChange(next.key, next.defaultDir);
        }}
        className="bg-board-2 border border-rule-strong text-ink text-[12px] font-mono uppercase tracking-[0.12em] px-2 py-1 rounded-[2px] flex-1 min-w-0 min-h-11"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          const cur = options.find((o) => o.key === value);
          if (cur) onChange(value, dir === "desc" ? "asc" : "desc");
        }}
        className="min-w-11 min-h-11 px-2 py-1 border border-rule-strong text-[12px] font-mono uppercase text-ink-dim hover:text-ink transition-colors"
        aria-label={`Sort ${dir === "desc" ? "descending" : "ascending"}`}
      >
        {dir === "desc" ? "↓" : "↑"}
      </button>
    </div>
  );
}
