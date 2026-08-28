"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Item = { href: string; label: string; match?: string };

// Auth / role links (Admin, Scorekeeper, Account — or Log in) as a hamburger
// dropdown, keeping the header uncluttered. A single link (logged out) renders
// inline instead of behind a menu.
export function AuthMenu({ links }: { links: Item[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (item: Item) => {
    const base = item.match ?? item.href;
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  if (links.length === 1) {
    const l = links[0];
    return (
      <Link
        href={l.href}
        className="shrink-0 px-3 sm:px-4 font-display text-[12px] sm:text-[14px] tracking-[0.14em] uppercase text-ice hover:text-ink transition-colors inline-flex items-center min-h-[44px] whitespace-nowrap"
      >
        {l.label}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-ice hover:text-ink transition-colors"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          {open ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[180px] rounded-md border border-rule-strong bg-board-2 shadow-lg overflow-hidden z-20"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`block px-4 py-3 font-display text-[13px] tracking-[0.14em] uppercase transition-colors ${
                isActive(l)
                  ? "text-ink bg-board-3"
                  : "text-ice hover:text-ink hover:bg-board-3"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
