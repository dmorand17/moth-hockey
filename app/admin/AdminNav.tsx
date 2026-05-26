"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const ADMIN_NAV = [
  { href: "/admin/players", label: "Players" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/rosters", label: "Rosters" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/content", label: "Content" },
];

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the menu when the route changes (e.g. after picking a section).
  // Render-time reset avoids a setState-in-effect cascade.
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  const current =
    ADMIN_NAV.find((n) => isActive(pathname, n.href)) ?? ADMIN_NAV[0];

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 min-h-11 px-3 rounded border border-rule hover:border-ice bg-board-2 text-ink transition-colors"
      >
        <span className="text-[16px] leading-none">☰</span>
        <span className="font-display text-[14px] tracking-[0.14em] uppercase">
          {current.label}
        </span>
        <span
          className={`text-ink-faint text-[10px] transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded border border-rule bg-board-2 shadow-lg overflow-hidden"
          >
            {ADMIN_NAV.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center w-full px-4 min-h-11 font-display text-[14px] tracking-[0.14em] uppercase transition-colors border-l-2 ${
                    active
                      ? "text-ink bg-ice/10 border-ice"
                      : "text-ink-dim hover:text-ink hover:bg-board-3 border-transparent"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
