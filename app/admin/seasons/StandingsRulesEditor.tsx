"use client";

import { useState } from "react";

const TIE_LABELS: Record<string, string> = {
  wins: "Wins",
  diff: "Goal differential",
  gf: "Goals for",
  ga: "Goals against (fewest)",
  h2h: "Head-to-head",
};
const ALL_KEYS = ["wins", "diff", "gf", "ga", "h2h"];

export function StandingsRulesEditor({
  action,
  seasonId,
  tiebreakers,
}: {
  action: (formData: FormData) => void | Promise<void>;
  seasonId: string;
  tiebreakers: string[];
}) {
  const [order, setOrder] = useState<string[]>(
    tiebreakers.filter((k) => ALL_KEYS.includes(k)),
  );
  const available = ALL_KEYS.filter((k) => !order.includes(k));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const rowBtn =
    "px-2 min-h-8 border border-rule rounded text-ink-dim hover:text-ink hover:border-rule-strong transition-colors disabled:opacity-30 disabled:hover:text-ink-dim";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={seasonId} />
      {order.map((k) => (
        <input key={k} type="hidden" name="tiebreakers" value={k} />
      ))}

      <div className="space-y-1.5">
        <span className="eyebrow text-ink-dim">Tie-breakers (applied after points)</span>
        <ol className="space-y-1">
          <li className="text-[12px] text-ink-faint font-mono px-2 py-1">
            1. Points (fixed)
          </li>
          {order.map((k, i) => (
            <li
              key={k}
              className="flex items-center gap-2 panel-bare rounded px-2 py-1"
            >
              <span className="font-mono text-[12px] text-ink w-32">
                {i + 2}. {TIE_LABELS[k]}
              </span>
              <button type="button" className={rowBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                ↑
              </button>
              <button type="button" className={rowBtn} onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="Move down">
                ↓
              </button>
              <button type="button" className={rowBtn} onClick={() => setOrder(order.filter((x) => x !== k))} aria-label="Remove">
                ✕
              </button>
            </li>
          ))}
        </ol>
        {available.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {available.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setOrder([...order, k])}
                className="eyebrow px-2 py-1 min-h-8 border border-rule rounded text-ink-dim hover:text-ice hover:border-ice/50 transition-colors"
              >
                + {TIE_LABELS[k]}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
      >
        SAVE RULES
      </button>
    </form>
  );
}
