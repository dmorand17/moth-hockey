"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Horizontal scroller with a right-edge fade that hints at more content and
// disappears once you reach the end (data-end="true").
export function ScrollFade({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.dataset.end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 ? "true" : "false";
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className={`scroll-fade overflow-x-auto ${className}`}>
      {children}
    </div>
  );
}
