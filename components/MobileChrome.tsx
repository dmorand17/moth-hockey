"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { headerVisible } from "@/lib/scroll-header";

const MOBILE = "(max-width: 767px)";

// Hides the sticky site header on downward scroll and shows it on upward
// scroll (phones only). Sticky bars below it read --header-h, so they move up
// with it instead of leaving a gap.
export function MobileHeaderController() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("body > header");
    const root = document.documentElement;
    const mq = window.matchMedia(MOBILE);
    if (!header) return;

    let prevY = window.scrollY;
    let visible = true;
    let frame = 0;

    const apply = (next: boolean) => {
      if (next === visible) return;
      visible = next;
      header.dataset.hidden = next ? "false" : "true";
      if (next) root.style.removeProperty("--header-h");
      else root.style.setProperty("--header-h", "0px");
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (mq.matches && !header.contains(document.activeElement)) apply(headerVisible(prevY, y, visible));
        prevY = y;
      });
    };
    // Keyboard users tabbing into the header always see it.
    const onFocus = () => apply(true);
    const onMq = () => {
      if (!mq.matches) apply(true);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    header.addEventListener("focusin", onFocus);
    mq.addEventListener("change", onMq);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      header.removeEventListener("focusin", onFocus);
      mq.removeEventListener("change", onMq);
      apply(true);
    };
  }, []);
  return null;
}

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-6 w-6">
    {d}
  </svg>
);

const TABS = [
  { href: "/", label: "Home", exact: true, icon: icon(<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />) },
  {
    href: "/standings",
    label: "Standings",
    icon: icon(
      <>
        <path d="M4 5h16M4 12h16M4 19h16" />
        <path d="M8 5v14" />
      </>,
    ),
  },
  {
    href: "/schedule",
    label: "Schedule",
    icon: icon(
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>,
    ),
  },
  { href: "/stats", label: "Stats", icon: icon(<path d="M5 20V11M12 20V5M19 20v-6M3 20h18" />) },
];

type AuthLink = { href: string; label: string };

const isActive = (pathname: string, href: string, exact?: boolean) =>
  exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

// Fixed bottom tab bar for phones (<768px). "More" opens a sheet with the
// remaining destinations and the same account links the header menu has.
export function BottomNav({ authLinks }: { authLinks: AuthLink[] }) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const moreLinks = [{ href: "/teams", label: "Teams" }, { href: "/about", label: "About" }, ...authLinks];
  const moreActive = moreLinks.some((l) => isActive(pathname, l.href));
  const close = () => dialog.current?.close();

  const item =
    "relative flex flex-col items-center justify-center gap-0.5 h-14 text-[12px] font-semibold transition-colors";
  const activeBar = "before:absolute before:top-0 before:inset-x-4 before:h-[2px] before:bg-ice";

  return (
    <>
      <nav
        data-bottom-nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-rule bg-board/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5">
          {TABS.map((t) => {
            const active = isActive(pathname, t.href, t.exact);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`${item} ${active ? `text-ice ${activeBar}` : "text-ink-dim hover:text-ink"}`}
                >
                  {t.icon}
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => dialog.current?.showModal()}
              className={`${item} w-full ${moreActive ? `text-ice ${activeBar}` : "text-ink-dim hover:text-ink"}`}
            >
              {icon(
                <>
                  <circle cx="5" cy="12" r="1.2" />
                  <circle cx="12" cy="12" r="1.2" />
                  <circle cx="19" cy="12" r="1.2" />
                </>,
              )}
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* Native modal dialog: Escape, focus trap and focus restore come free. */}
      <dialog
        ref={dialog}
        aria-label="More"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="md:hidden m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/60"
      >
        <div className="rounded-t-xl border-t border-rule-strong bg-board-2 px-4 pt-2 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-rule-strong" />
          <ul className="divide-y divide-rule">
            {moreLinks.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between min-h-[52px] text-[16px] font-semibold ${
                      active ? "text-ice" : "text-ink"
                    }`}
                  >
                    {l.label}
                    <span aria-hidden className="text-ink-faint">
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={close}
            className="mt-3 w-full min-h-[48px] rounded-md border border-rule-strong text-[15px] font-semibold text-ink-dim hover:text-ink"
          >
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
