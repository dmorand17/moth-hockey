"use client";

import { useId, useState, type ReactNode } from "react";
import { SectionHeader } from "@/components/SectionHeader";

// A page section the viewer can collapse, toggled by a labeled button with
// aria-expanded / aria-controls. Open/closed state isn't remembered.
export function CollapsibleSection({
  eyebrow,
  title,
  subtitle,
  defaultOpen,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  defaultOpen: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className={className}>
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        action={
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-md border border-rule-strong text-[14px] font-semibold text-ink-dim hover:text-ink hover:bg-board-3 transition-colors"
          >
            {open ? "Hide" : "Show"}
            <span className="sr-only"> {title}</span>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
            </svg>
          </button>
        }
      />
      <div id={panelId} hidden={!open} className="space-y-4">
        {children}
      </div>
    </section>
  );
}
