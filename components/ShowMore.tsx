"use client";

import { Children, useState, type ReactNode } from "react";

const btn =
  "min-h-[40px] px-3 text-[12px] font-semibold uppercase tracking-[0.08em] rounded-[2px] border border-rule bg-board-3 text-ink-dim hover:border-rule-strong hover:text-ink disabled:opacity-50";

// Renders the first `visible` children, with a button to reveal the rest.
export function ShowMore({ visible, children }: { visible: number; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const hidden = items.length - visible;
  if (expanded || hidden <= 0) return <>{items}</>;
  return (
    <>
      {items.slice(0, visible)}
      <li>
        <button type="button" className={btn} onClick={() => setExpanded(true)}>
          Show {hidden} more
        </button>
      </li>
    </>
  );
}
