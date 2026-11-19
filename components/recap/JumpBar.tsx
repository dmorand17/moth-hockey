"use client";

import { useEffect, useState } from "react";
import { ScrollFade } from "@/components/ScrollFade";

// Sticky jump links under the recap hero. Plain anchors, so /recap#playoffs
// works when shared; the chip for the section in view is marked current.
export function JumpBar({ links }: { links: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = links.map((l) => document.getElementById(l.id)).filter((el): el is HTMLElement => !!el);
    // A section is "in view" once its top passes the upper third of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [links]);

  if (links.length < 2) return null;
  return (
    <nav
      aria-label="Recap sections"
      className="sticky top-[max(env(safe-area-inset-top),calc(var(--header-h)*var(--header-shown)))] z-[4] -mx-4 sm:mx-0 bg-board/95 backdrop-blur-sm py-1.5 border-b border-rule"
    >
      <ScrollFade className="px-4 sm:px-0">
        <ul className="flex gap-2 w-max">
          {links.map((l) => {
            const current = active === l.id;
            return (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  aria-current={current ? "true" : undefined}
                  // The last section can't scroll to the top, so mark the tap directly.
                  onClick={() => setActive(l.id)}
                  className={`inline-flex items-center min-h-[44px] px-3.5 rounded-full border text-[14px] font-semibold whitespace-nowrap transition-colors ${
                    current ? "bg-ice text-board border-ice" : "border-rule-strong text-ink-dim hover:text-ink hover:bg-board-3"
                  }`}
                >
                  {l.label}
                </a>
              </li>
            );
          })}
        </ul>
      </ScrollFade>
    </nav>
  );
}
