"use client";

import { Children, useState, type ReactNode } from "react";

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
        <button
          type="button"
          className="w-full min-h-11 text-[13px] text-ice hover:bg-board-3 transition-colors"
          onClick={() => setExpanded(true)}
        >
          Show {hidden} more
        </button>
      </li>
    </>
  );
}
