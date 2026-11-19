"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Shows the first ~18rem of long content with a fade and a toggle. Short
// content renders in full with no button.
export function ReadMore({ children, more = "Read the full report", less = "Show less" }: { children: ReactNode; more?: string; less?: string }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const el = box.current;
    // A little slack so a report that barely overflows just shows in full.
    if (el) setLong(el.scrollHeight > el.clientHeight + 48);
  }, []);

  const collapsed = long && !open;
  return (
    <div>
      <div id={id} ref={box} className={`relative ${collapsed ? "max-h-[18rem] overflow-hidden" : ""}`}>
        {children}
        {collapsed && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-board-2 to-transparent" />}
      </div>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setOpen((o) => !o);
            // Collapsing a long report: bring its start back into view.
            if (open) box.current?.scrollIntoView({ block: "start", behavior: "smooth" });
          }}
          className="mt-2 inline-flex items-center gap-1.5 min-h-11 text-[14px] font-semibold text-ice hover:text-ink"
        >
          {open ? less : more}
          <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>
      )}
    </div>
  );
}
