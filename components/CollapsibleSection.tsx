import type { ReactNode } from "react";
import { SectionHeader } from "@/components/SectionHeader";

// A page section the viewer can collapse. Native <details>, so it works without
// JavaScript and is announced correctly by screen readers. Open/closed state
// isn't remembered between visits.
export function CollapsibleSection({
  eyebrow,
  title,
  subtitle,
  defaultOpen,
  closedHint,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  defaultOpen: boolean;
  // Show "Hidden · tap to show" while collapsed, for sections closed by default.
  closedHint?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className={`group ${className ?? ""}`}>
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <SectionHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
          {closedHint && (
            <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint group-open:hidden">
              Hidden · tap to show
            </p>
          )}
        </div>
        <span
          aria-hidden
          className="mt-1 sm:mt-2 text-[18px] text-ink-dim transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      {children}
    </details>
  );
}
