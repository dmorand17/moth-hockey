"use client";

import Link from "next/link";
import { useState } from "react";
import { visibleRows } from "@/lib/season-recap";

export type HatTrickChip = { playerId: string; name: string; count: number };

// Hat-trick scorers as wrapped name chips (×N for repeats); long lists show
// the first 10 with "Show all".
export function HatTrickChips({ chips }: { chips: HatTrickChip[] }) {
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = visibleRows(chips, expanded, 10);
  return (
    <>
      <ul className="mt-2 flex flex-wrap gap-2">
        {shown.map((p) => (
          <li key={p.playerId}>
            <Link
              href={`/players/${p.playerId}`}
              className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full border border-rule-strong bg-board-3 text-[14px] font-semibold text-ink hover:text-ice"
            >
              {p.name}
              {p.count > 1 && <span className="tnum text-ink-dim">×{p.count}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {chips.length > 10 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 inline-flex items-center min-h-11 text-[14px] font-semibold text-ice hover:text-ink"
        >
          {expanded ? "Show fewer" : `Show all (${hidden + 10})`}
        </button>
      )}
    </>
  );
}
