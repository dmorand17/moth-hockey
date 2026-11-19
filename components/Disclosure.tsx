"use client";

import { useId, useState, type ReactNode } from "react";

// Small show/hide block (legends, "how it works" notes): a labeled button with
// aria-expanded / aria-controls and 14px content.
export function Disclosure({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 min-h-[44px] text-[14px] font-semibold text-ink-dim hover:text-ink transition-colors"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
          className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" />
        </svg>
        {label}
      </button>
      <div id={id} hidden={!open} className="pb-2 text-[14px] leading-5 text-ink-faint max-w-[75ch]">
        {children}
      </div>
    </div>
  );
}
