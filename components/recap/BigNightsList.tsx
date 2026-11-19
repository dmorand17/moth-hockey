"use client";

import Link from "next/link";
import { useState } from "react";
import { visibleRows } from "@/lib/season-recap";

export type BigNightRow = { key: string; gameId: string; player: string; goals: number; detail: string };

// Big nights (4+ goal games): the top 5, with "Show all" for the rest.
export function BigNightsList({ rows }: { rows: BigNightRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = visibleRows(rows, expanded);
  return (
    <>
      <ul className="mt-1 divide-y divide-rule">
        {shown.map((n) => (
          <li key={n.key}>
            <Link href={`/games/${n.gameId}`} className="flex items-center justify-between gap-3 min-h-11 py-1.5 group">
              <span className="min-w-0">
                <span className="block text-[16px] font-semibold text-ink group-hover:text-ice">
                  {n.player} — <span className="tnum">{n.goals}</span> goals
                </span>
                <span className="block text-[13px] text-ink-faint tnum truncate">{n.detail}</span>
              </span>
              <span aria-hidden className="text-ink-faint group-hover:text-ice">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > 5 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 inline-flex items-center min-h-11 text-[14px] font-semibold text-ice hover:text-ink"
        >
          {expanded ? "Show fewer" : `Show all (${hidden + 5})`}
        </button>
      )}
    </>
  );
}
